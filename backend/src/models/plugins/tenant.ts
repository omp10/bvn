import { Schema, Types, type Aggregate, type Query } from "mongoose";
import { currentSchoolId } from "../../lib/context.js";

/**
 * Multi-tenant isolation.
 *
 * Every query on a tenant schema is rewritten to include the current school,
 * taken from the signed JWT, so `Student.find()` can only ever return this
 * school's students. Forgetting the filter is not possible; the failure mode is
 * an empty result or a thrown error, never another school's data.
 *
 * Cross-school reads exist — super admin, fleet owners — and must opt out
 * explicitly through allSchools(), which is loud at the call site.
 *
 * Two parts, deliberately separate:
 *   tenantField()  the schoolId path, spread into the schema definition so it
 *                  is visible when reading the model and typed like any other
 *                  field (a plugin adding it at runtime is invisible to TS)
 *   tenantPlugin() the query hooks that enforce it
 */

export const tenantField = (required = true) =>
  ({
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required,
      index: true,
    },
  }) as const;

const QUERY_HOOKS = [
  "count",
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
] as const;

export function tenantPlugin(schema: Schema) {
  for (const hook of QUERY_HOOKS) {
    // The cast picks one overload; every name in QUERY_HOOKS is query middleware.
    schema.pre(hook as "find", function (this: Query<unknown, unknown>) {
      if (this.getOptions().skipTenant) return;
      const schoolId = currentSchoolId();
      // No tenant and no explicit bypass means a code path forgot to say which
      // it wanted. Refusing is the only safe answer — returning everything is a
      // leak, and returning nothing hides the bug.
      if (!schoolId) {
        throw new Error(
          `tenant scope missing on ${this.model.modelName} — ` +
            `wrap in allSchools() if a cross-school read is intended`
        );
      }
      this.where({ schoolId });
    });
  }

  schema.pre("aggregate", function (this: Aggregate<unknown>) {
    if ((this.options as { skipTenant?: boolean }).skipTenant) return;
    const schoolId = currentSchoolId();
    if (!schoolId) throw new Error("tenant scope missing on aggregate");
    // Aggregation pipelines get no automatic casting — a string schoolId here
    // matches nothing and silently returns an empty result.
    this.pipeline().unshift({ $match: { schoolId: new Types.ObjectId(schoolId) } });
  });

  // Must be "validate", not "save": Mongoose registers its own validation as a
  // pre-save hook when the schema is built, which is before this plugin runs.
  // Hooks fire in registration order, so a stamp on "save" lands after required
  // validation has already rejected the empty schoolId.
  const stamp = function (this: { schoolId?: unknown }) {
    if (!this.schoolId) this.schoolId = currentSchoolId();
  };
  schema.pre("validate", stamp);
  // Belt and braces for save({ validateBeforeSave: false }), which skips the above.
  schema.pre("save", stamp);

  // insertMany runs neither save nor validate hooks, so stamp the school here
  // too. Declaring `next` opts into callback style, so it MUST be called —
  // otherwise every insertMany hangs forever waiting on it.
  schema.pre("insertMany", function (next, docs: { schoolId?: unknown }[]) {
    const schoolId = currentSchoolId();
    for (const doc of docs) if (!doc.schoolId) doc.schoolId = schoolId;
    next();
  });
}

/**
 * The one sanctioned way to read across schools. Every call site is a place a
 * reviewer should stop and check that some other filter — ownerId, an explicit
 * schoolId — narrows the result.
 *
 *   allSchools(Vehicle.find({ ownerId }))
 */
export const allSchools = <T extends Query<unknown, unknown>>(query: T): T =>
  query.setOptions({ skipTenant: true }) as T;

/**
 * Cross-school populate.
 *
 * populate() issues a *separate* query, which allSchools() on the parent does
 * not cover — so populating a tenant-scoped model from a super-admin or
 * fleet-owner route throws unless the bypass is repeated here.
 *
 *   allSchools(Vehicle.find({ ownerId })).populate(anySchool("driverId", "name"))
 */
export const anySchool = (path: string, select?: string) => ({
  path,
  select,
  options: { skipTenant: true },
});

/** Same escape hatch for aggregations. */
export const allSchoolsAggregate = <T extends Aggregate<unknown>>(agg: T): T =>
  agg.option({ skipTenant: true } as never) as T;
