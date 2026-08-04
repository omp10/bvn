import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { conflict, handler, notFound } from "../../lib/errors.js";
import QRCode from "qrcode";
import { randomSchoolCode, randomToken } from "../../lib/codes.js";
import { hashPassword } from "../../lib/password.js";
import { idParam, paginationQuery, password, phone, validate, z } from "../../lib/validate.js";
import { env } from "../../config/env.js";
import { School, SCHOOL_STATUSES } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { Student } from "../../models/student.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { Trip } from "../../models/trip.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { activatePlan } from "../subscriptions/subscription.service.js";

export const schoolRouter = Router();
schoolRouter.use(authenticate, requireRole("super_admin"));

/* The super admin has no schoolId, so every tenant-scoped read below must go
   through allSchools() explicitly. Without it the plugin throws — which is the
   design: cross-school access is visible at the call site, never accidental. */

const createSchoolBody = z.object({
  name: z.string().trim().min(2),
  contactPerson: z.string().trim().optional(),
  phone: phone.optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  plan: z.enum(["trial", "monthly", "quarterly", "yearly"]).default("trial"),
  admin: z.object({
    name: z.string().trim().min(2),
    phone,
    email: z.string().email().optional(),
    password,
  }),
});

schoolRouter.get(
  "/",
  validate({
    query: paginationQuery.extend({
      status: z.enum(SCHOOL_STATUSES).optional(),
      q: z.string().trim().optional(),
    }),
  }),
  handler(async (req, res) => {
    const { page, limit, status, q } = req.query as never as {
      page: number; limit: number; status?: string; q?: string;
    };

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (q) filter.$or = [{ name: new RegExp(q, "i") }, { code: new RegExp(q, "i") }];

    const [items, total] = await Promise.all([
      School.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      School.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  })
);

schoolRouter.post(
  "/",
  validate({ body: createSchoolBody }),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchoolBody>;

    // Phones are unique platform-wide, so check before creating the school and
    // leaving an orphan behind.
    if (await allSchools(User.findOne({ phone: body.admin.phone })))
      throw conflict("that mobile number is already registered");

    const school = await School.create({
      name: body.name,
      code: await uniqueSchoolCode(),
      inviteToken: randomToken(),
      contactPerson: body.contactPerson,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      state: body.state,
      status: body.plan === "trial" ? "trial" : "active",
      branding: { appName: body.name },
    });

    await activatePlan(school, body.plan);

    await User.create({
      name: body.admin.name,
      phone: body.admin.phone,
      email: body.admin.email,
      role: "school_admin",
      schoolId: school._id,
      passwordHash: await hashPassword(body.admin.password),
    });

    await audit(req, "school.create", "School", school._id, undefined, school.toObject());
    res.status(201).json(school);
  })
);

schoolRouter.get(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id).lean();
    if (!school) throw notFound("school not found");

    const schoolId = school._id;
    const [students, vehicles, drivers, parents, runningTrips] = await Promise.all([
      allSchools(Student.find({ schoolId })).countDocuments(),
      allSchools(Vehicle.find({ schoolId })).countDocuments(),
      allSchools(User.find({ schoolId, role: "driver" })).countDocuments(),
      allSchools(User.find({ schoolId, role: "parent" })).countDocuments(),
      allSchools(Trip.find({ schoolId, status: "running" })).countDocuments(),
    ]);

    res.json({ school, counts: { students, vehicles, drivers, parents, runningTrips } });
  })
);

schoolRouter.patch(
  "/:id",
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).optional(),
      contactPerson: z.string().trim().optional(),
      phone: phone.optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      settings: z
        .object({
          trackingIntervalSec: z.number().int().min(5).max(60).optional(),
          approachingRadiusMeters: z.number().int().min(200).max(5000).optional(),
        })
        .optional(),
    }),
  }),
  handler(async (req, res) => {
    const before = await School.findById(req.params.id).lean();
    if (!before) throw notFound("school not found");

    const school = await School.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await audit(req, "school.update", "School", req.params.id, before, school?.toObject());
    res.json(school);
  })
);

/** Branding is its own endpoint because it is a distinct screen and audit trail. */
schoolRouter.patch(
  "/:id/branding",
  validate({
    params: idParam,
    body: z.object({
      logoUrl: z.string().url().optional(),
      themeColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      appName: z.string().trim().min(1).optional(),
      emailFrom: z.string().email().optional(),
    }),
  }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");

    const before = { ...school.branding };
    Object.assign(school.branding ?? {}, req.body);
    school.markModified("branding");
    await school.save();

    await audit(req, "school.branding", "School", school._id, before, school.branding);
    res.json(school.branding);
  })
);

schoolRouter.post(
  "/:id/status",
  validate({ params: idParam, body: z.object({ status: z.enum(SCHOOL_STATUSES), reason: z.string().optional() }) }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");

    const before = school.status;
    school.status = req.body.status;
    await school.save();

    // Suspension immediately locks out every user of the school on their next
    // request — requireActiveSchool re-reads this on each call.
    await audit(req, "school.status", "School", school._id, { status: before }, { status: school.status, reason: req.body.reason });
    res.json({ id: school._id, status: school.status });
  })
);

/** Regenerates the QR/invite secret without changing the code parents already know. */
schoolRouter.post(
  "/:id/rotate-invite",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { inviteToken: randomToken() },
      { new: true }
    );
    if (!school) throw notFound("school not found");
    await audit(req, "school.rotateInvite", "School", school._id);
    res.json(inviteFor(school));
  })
);

/**
 * The data behind the QR code. The image itself is rendered client-side — a
 * server-side PNG encoder would be a dependency for something a 3KB browser
 * library already does.
 */
schoolRouter.get(
  "/:id/invite",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");
    res.json(inviteFor(school));
  })
);

/**
 * The QR code itself, as SVG. Parents scan this instead of typing the code.
 * SVG rather than PNG so it stays crisp on a printed circular at any size.
 */
schoolRouter.get(
  "/:id/qr.svg",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");

    const svg = await QRCode.toString(inviteFor(school).inviteUrl, {
      type: "svg",
      margin: 1,
      width: 320,
      color: { dark: "#1155a5", light: "#ffffff" },
    });

    res.type("image/svg+xml").send(svg);
  })
);

schoolRouter.get(
  "/:id/admins",
  validate({ params: idParam }),
  handler(async (req, res) => {
    res.json(
      await allSchools(User.find({ schoolId: req.params.id, role: "school_admin" })).lean()
    );
  })
);

schoolRouter.post(
  "/:id/admins",
  validate({
    params: idParam,
    body: z.object({ name: z.string().trim().min(2), phone, email: z.string().email().optional(), password }),
  }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");
    if (await allSchools(User.findOne({ phone: req.body.phone })))
      throw conflict("that mobile number is already registered");

    const admin = await User.create({
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      role: "school_admin",
      schoolId: school._id,
      passwordHash: await hashPassword(req.body.password),
    });
    await audit(req, "school.addAdmin", "User", admin._id);
    res.status(201).json(admin);
  })
);

/**
 * Soft delete. A hard delete would have to cascade across nine collections and
 * destroy the audit trail — suspension is what "removed from the platform"
 * actually means in practice.
 */
schoolRouter.delete(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const school = await School.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true });
    if (!school) throw notFound("school not found");
    await audit(req, "school.delete", "School", school._id);
    res.json({ ok: true, status: school.status });
  })
);

function inviteFor(school: { code: string; inviteToken: string }) {
  // env.appUrl, never the request host: this link is scanned by a parent and
  // must open the web app, not the API.
  const origin = env.appUrl;
  return {
    code: school.code,
    // Parents scan this; the app reads the code and pre-fills the join screen.
    inviteUrl: `${origin}/join/${school.code}?t=${school.inviteToken}`,
    qrPayload: JSON.stringify({ code: school.code, token: school.inviteToken }),
  };
}

async function uniqueSchoolCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomSchoolCode();
    if (!(await School.exists({ code }))) return code;
  }
  throw new Error("could not generate a unique school code");
}
