import type { RequestHandler } from "express";
import { runWithContext, requireContext, type Role } from "../lib/context.js";
import { hasPermission } from "../lib/permissions.js";
import { bearerFrom, verifyAccessToken } from "../lib/jwt.js";
import { forbidden, handler, unauthorized } from "../lib/errors.js";
import { isSchoolOperational, School } from "../models/school.model.js";
import { allSchools } from "../models/plugins/tenant.js";
import { User } from "../models/user.model.js";

/**
 * Verifies the access token and opens the tenant scope for the rest of the
 * request. Everything downstream — handlers and the Mongoose tenant plugin
 * alike — reads the school from here, and it comes from the signed token only,
 * never from a header, query string or body the client controls.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = bearerFrom(req.headers.authorization);
  if (!token) return next(unauthorized("missing bearer token"));

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    return next(err);
  }

  // Every field of the claim is carried through — dropping `permissions` here
  // silently makes every restricted account unrestricted.
  runWithContext(
    {
      userId: claims.userId,
      role: claims.role,
      schoolId: claims.schoolId,
      roleId: claims.roleId,
      permissions: claims.permissions,
    },
    () => next()
  );
};

/** Mount after authenticate(); reads the scope it opened. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (_req, _res, next) => {
    const ctx = requireContext();
    if (!roles.includes(ctx.role)) return next(forbidden(`requires ${roles.join(" or ")}`));
    next();
  };

/**
 * Business rule: no school touches the platform without a live subscription.
 * Checked per request because a subscription can lapse mid-session and a
 * 15-minute access token would otherwise keep working until it expired.
 *
 * ponytail: one extra read per request. Cache the school in Redis with a short
 * TTL when this shows up in the latency numbers.
 */
export const requireActiveSchool: RequestHandler = handler(async (_req, _res, next) => {
  const { schoolId } = requireContext();
  if (!schoolId) return next(forbidden("no school in scope"));

  const school = await School.findById(schoolId).lean();
  if (!school) return next(forbidden("school not found"));
  if (!isSchoolOperational(school))
    return next(forbidden(`school ${school.status === "suspended" ? "suspended" : "subscription expired"}`));

  next();
});

/**
 * Screen-level authorisation for school staff (FRD 27).
 *
 * A school_admin with no custom role has `permissions: undefined` — they own the
 * school outright and pass everything. A user on a custom role passes only what
 * that role grants. Super admin is never gated by a school's own role list.
 */
export const requirePermission =
  (permission: string): RequestHandler =>
  (_req, _res, next) => {
    const ctx = requireContext();
    if (ctx.role === "super_admin" || ctx.permissions === undefined) return next();
    if (!hasPermission(ctx.permissions, permission))
      return next(forbidden(`your role does not allow ${permission.replace(":", " ")}`));
    next();
  };

/**
 * Rejects tokens belonging to a user who has since been deactivated or deleted.
 * Applied to write-heavy routers rather than everything, so read screens stay
 * on a single query.
 */
export const requireActiveUser: RequestHandler = handler(async (_req, _res, next) => {
  const { userId } = requireContext();
  const user = await allSchools(User.findById(userId)).select("status");
  if (!user) return next(unauthorized("account no longer exists"));
  if (user.status === "inactive") return next(forbidden("account disabled"));
  next();
});
