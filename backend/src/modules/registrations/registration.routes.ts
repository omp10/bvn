import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { authLimiter } from "../../middleware/rateLimit.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { randomSchoolCode, randomToken } from "../../lib/codes.js";
import { requireContext } from "../../lib/context.js";
import { idParam, paginationQuery, password, phone, validate, z } from "../../lib/validate.js";
import { ALL_PERMISSIONS } from "../../lib/permissions.js";
import { Registration, REGISTRATION_STATUSES, REGISTRATION_TYPES } from "../../models/registration.model.js";
import { Role } from "../../models/role.model.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { activatePlan } from "../subscriptions/subscription.service.js";
import { notify } from "../notifications/notification.service.js";

/* ── Public: anyone can apply ───────────────────────────────────────── */

export const registerRouter = Router();

const base = {
  name: z.string().trim().min(2).max(80),
  phone,
  email: z.string().email().optional(),
  city: z.string().trim().max(60).optional(),
  password,
  note: z.string().trim().max(400).optional(),
};

/** Applications are open to the world, so they are rate limited like auth. */
const apply = (type: (typeof REGISTRATION_TYPES)[number], shape: z.ZodRawShape) =>
  registerRouter.post(
    `/${type}`,
    authLimiter,
    validate({ body: z.object({ ...base, ...shape }) }),
    handler(async (req, res) => {
      // A phone that already has an account cannot apply again — that is a
      // sign-in, or a password reset.
      if (await allSchools(User.findOne({ phone: req.body.phone })))
        throw conflict("that mobile number already has an account — sign in instead");

      const { password: plain, ...rest } = req.body;

      try {
        const application = await Registration.create({
          ...rest,
          type,
          passwordHash: await hashPassword(plain),
        });

        // Tell the platform someone is waiting.
        const admins = await allSchools(User.find({ role: "super_admin" })).select("_id").lean();
        await notify({
          userIds: admins.map((a) => a._id),
          type: "announcement",
          title: `New ${type} registration`,
          body: `${req.body.schoolName ?? req.body.companyName ?? req.body.name} has applied to join.`,
          data: { registrationId: String(application._id) },
        });

        res.status(201).json({
          ok: true,
          id: application._id,
          message: "Thanks — your application is with our team. We'll be in touch shortly.",
        });
      } catch (err) {
        if (isDuplicateKey(err))
          throw conflict("an application from this number is already awaiting review");
        throw err;
      }
    })
  );

apply("school", {
  schoolName: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  state: z.string().trim().max(60).optional(),
  studentCount: z.coerce.number().int().min(0).max(100000).optional(),
  busCount: z.coerce.number().int().min(0).max(1000).optional(),
});

apply("owner", {
  companyName: z.string().trim().max(120).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  vehicleCount: z.coerce.number().int().min(0).max(1000).optional(),
});

apply("driver", {
  licenseNumber: z.string().trim().min(4).max(40),
  licenseExpiry: z.coerce.date(),
  experienceYears: z.coerce.number().int().min(0).max(50).optional(),
  // Optional: a driver already working for a school can name its code, and the
  // platform verifies it on approval rather than trusting it here.
  schoolCode: z.string().trim().length(6).optional(),
});

/** Lets an applicant check where they stand without an account. */
registerRouter.post(
  "/status",
  authLimiter,
  validate({ body: z.object({ phone }) }),
  handler(async (req, res) => {
    const application = await Registration.findOne({ phone: req.body.phone })
      .sort({ createdAt: -1 })
      .select("type status createdAt reviewNote")
      .lean();
    if (!application) throw notFound("no application found for that number");
    res.json(application);
  })
);

/* ── Platform: review the queue ─────────────────────────────────────── */

export const registrationAdminRouter = Router();
registrationAdminRouter.use(authenticate, requireRole("super_admin"));

registrationAdminRouter.get(
  "/",
  validate({
    query: paginationQuery.extend({
      status: z.enum(REGISTRATION_STATUSES).optional(),
      type: z.enum(REGISTRATION_TYPES).optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query as never as { page: number; limit: number; status?: string; type?: string };
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;

    const [items, total, pending] = await Promise.all([
      Registration.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      Registration.countDocuments(filter),
      Registration.countDocuments({ status: "pending" }),
    ]);
    res.json({ items, total, pending, page: q.page, limit: q.limit });
  })
);

/**
 * Approval is what actually creates the account.
 *
 * The password the applicant chose was hashed when they applied, so it carries
 * straight over — they sign in with what they already know, and the platform
 * never held it in the clear.
 */
registrationAdminRouter.post(
  "/:id/approve",
  validate({
    params: idParam,
    body: z.object({
      plan: z.enum(["trial", "monthly", "quarterly", "yearly"]).default("trial"),
      note: z.string().trim().max(300).optional(),
    }),
  }),
  handler(async (req, res) => {
    const application = await Registration.findOne({ _id: req.params.id, status: "pending" })
      .select("+passwordHash");
    if (!application) throw badRequest("this application has already been reviewed");

    // Re-check now, not at apply time — someone may have been created since.
    if (await allSchools(User.findOne({ phone: application.phone })))
      throw conflict("that mobile number now has an account; reject this application");

    let user;
    let school;

    if (application.type === "school") {
      school = await School.create({
        name: application.schoolName ?? application.name,
        code: await uniqueSchoolCode(),
        inviteToken: randomToken(),
        contactPerson: application.contactPerson ?? application.name,
        phone: application.phone,
        email: application.email,
        address: application.address,
        city: application.city,
        state: application.state,
        status: req.body.plan === "trial" ? "trial" : "active",
        branding: { appName: application.schoolName ?? application.name },
      });
      await activatePlan(school, req.body.plan);

      user = await User.create({
        name: application.contactPerson ?? application.name,
        phone: application.phone,
        email: application.email,
        role: "school_admin",
        schoolId: school._id,
        passwordHash: application.passwordHash,
      });

      // Every school gets the built-in full-access role, as the seed does.
      await Role.create({
        schoolId: school._id,
        name: "School Administrator",
        description: "Full access to everything in this school.",
        permissions: ALL_PERMISSIONS,
        system: true,
      });
    } else if (application.type === "owner") {
      user = await User.create({
        name: application.name,
        phone: application.phone,
        email: application.email,
        companyName: application.companyName,
        gstNumber: application.gstNumber,
        address: application.address,
        role: "owner",
        passwordHash: application.passwordHash,
      });
    } else {
      // A driver may name the school they already work for; it is verified
      // here rather than trusted from the application form.
      let schoolId;
      if (application.schoolCode) {
        const named = await School.findOne({ code: application.schoolCode });
        if (!named) throw badRequest(`no school with code ${application.schoolCode}`);
        schoolId = named._id;
      }

      user = await User.create({
        name: application.name,
        phone: application.phone,
        email: application.email,
        role: "driver",
        // No school = available in the platform pool for a driver request.
        schoolId,
        licenseNumber: application.licenseNumber,
        licenseExpiry: application.licenseExpiry,
        experienceYears: application.experienceYears,
        passwordHash: application.passwordHash,
      });
    }

    application.status = "approved";
    application.reviewedBy = requireContext().userId as never;
    application.reviewedAt = new Date();
    application.reviewNote = req.body.note;
    application.createdUserId = user._id as never;
    if (school) application.createdSchoolId = school._id as never;
    await application.save();

    await notify({
      userIds: [user._id],
      type: "announcement",
      title: "Welcome to BalVahini",
      body: "Your registration has been approved. Sign in with the mobile number and password you chose.",
      schoolId: school?._id,
    });

    await audit(req, "registration.approve", "Registration", application._id, undefined, {
      type: application.type,
      userId: String(user._id),
    });

    res.json({
      ok: true,
      type: application.type,
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role },
      school: school ? { id: school._id, name: school.name, code: school.code } : null,
    });
  })
);

registrationAdminRouter.post(
  "/:id/reject",
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(1).max(300) }) }),
  handler(async (req, res) => {
    const application = await Registration.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      {
        status: "rejected",
        reviewedBy: requireContext().userId,
        reviewedAt: new Date(),
        reviewNote: req.body.note,
      },
      { new: true }
    );
    if (!application) throw badRequest("this application has already been reviewed");

    await audit(req, "registration.reject", "Registration", application._id);
    res.json({ ok: true });
  })
);

async function uniqueSchoolCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomSchoolCode();
    if (!(await School.exists({ code }))) return code;
  }
  throw new Error("could not generate a unique school code");
}

