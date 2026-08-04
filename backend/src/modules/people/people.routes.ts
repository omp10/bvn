import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { idParam, password, phone, validate, z } from "../../lib/validate.js";
import { requireContext } from "../../lib/context.js";
import { User, USER_STATUSES } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { Student } from "../../models/student.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

/**
 * Drivers, attendants and parents for one school. Drivers and attendants share
 * a shape and a lifecycle, so they share a router built once and mounted twice
 * rather than copied.
 */
export const peopleRouter = Router();
peopleRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

const baseFields = {
  name: z.string().trim().min(2),
  phone,
  email: z.string().email().optional(),
  address: z.string().optional(),
  aadhaar: z.string().trim().length(12).optional(),
  photoUrl: z.string().url().optional(),
};

const driverFields = {
  licenseNumber: z.string().trim().min(4),
  licenseExpiry: z.coerce.date(),
  experienceYears: z.number().int().min(0).max(60).optional(),
};

for (const [path, role] of [["drivers", "driver"], ["attendants", "staff"]] as const) {
  peopleRouter.get(
    `/${path}`,
    validate({ query: z.object({ status: z.enum(USER_STATUSES).optional() }) }),
    handler(async (req, res) => {
      const status = (req.query as { status?: string }).status;
      const people = await User.find({ role, ...(status ? { status } : {}) })
        .sort({ name: 1 })
        .lean();

      // Which bus each person is on, resolved in one extra query rather than
      // one per person.
      const field = role === "driver" ? "driverId" : "attendantId";
      const vehicles = await Vehicle.find({ [field]: { $in: people.map((p) => p._id) } })
        .select(`busNumber vehicleNumber ${field}`)
        .lean();
      const byPerson = new Map(vehicles.map((v) => [String(v[field]), v]));

      res.json(people.map((p) => ({ ...p, assignedVehicle: byPerson.get(String(p._id)) ?? null })));
    })
  );

  peopleRouter.post(
    `/${path}`,
    validate({
      body: z.object({
        ...baseFields,
        password,
        ...(role === "driver" ? driverFields : {}),
      }),
    }),
    handler(async (req, res) => {
      // Phones are unique across the whole platform, so this has to look past
      // the tenant scope.
      if (await allSchools(User.findOne({ phone: req.body.phone })))
        throw conflict("that mobile number is already registered");

      const { password: plain, ...rest } = req.body;
      const person = await User.create({
        ...rest,
        role,
        schoolId: requireContext().schoolId,
        passwordHash: await hashPassword(plain),
      });

      await audit(req, `${role}.create`, "User", person._id);
      res.status(201).json(person);
    })
  );

  peopleRouter.patch(
    `/${path}/:id`,
    validate({
      params: idParam,
      body: z.object({
        name: z.string().trim().min(2).optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        status: z.enum(USER_STATUSES).optional(),
        licenseNumber: z.string().trim().min(4).optional(),
        licenseExpiry: z.coerce.date().optional(),
        experienceYears: z.number().int().min(0).max(60).optional(),
      }),
    }),
    handler(async (req, res) => {
      const person = await User.findOneAndUpdate({ _id: req.params.id, role }, req.body, { new: true });
      if (!person) throw notFound("not found");
      await audit(req, `${role}.update`, "User", person._id);
      res.json(person);
    })
  );

  peopleRouter.delete(
    `/${path}/:id`,
    validate({ params: idParam }),
    handler(async (req, res) => {
      const field = role === "driver" ? "driverId" : "attendantId";
      if (await Vehicle.exists({ [field]: req.params.id }))
        throw badRequest("remove them from their bus first");

      // Deactivated, not deleted: their name still appears on past trips and in
      // the audit log, and those records must not lose it.
      const person = await User.findOneAndUpdate(
        { _id: req.params.id, role },
        { status: "inactive", sessions: [] },
        { new: true }
      );
      if (!person) throw notFound("not found");
      await audit(req, `${role}.deactivate`, "User", person._id);
      res.json({ ok: true });
    })
  );
}

/** Licences about to lapse — an expired licence grounds the bus. */
peopleRouter.get(
  "/drivers/licences/expiring",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  handler(async (req, res) => {
    const days = Number((req.query as never as { days: number }).days);
    res.json(
      await User.find({
        role: "driver",
        status: { $ne: "inactive" },
        licenseExpiry: { $lte: new Date(Date.now() + days * 86_400_000) },
      })
        .select("name phone licenseNumber licenseExpiry")
        .sort({ licenseExpiry: 1 })
        .lean()
    );
  })
);

/* ── Parents ────────────────────────────────────────────────────────── */
peopleRouter.get(
  "/parents",
  handler(async (_req, res) => {
    const parents = await User.find({ role: "parent" }).sort({ name: 1 }).lean();
    const children = await Student.find({ parentId: { $in: parents.map((p) => p._id) } })
      .select("name class section parentId")
      .lean();

    res.json(
      parents.map((p) => ({
        ...p,
        children: children.filter((c) => String(c.parentId) === String(p._id)),
      }))
    );
  })
);

peopleRouter.patch(
  "/parents/:id",
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).optional(),
      email: z.string().email().optional(),
      relationship: z.string().trim().optional(),
      status: z.enum(USER_STATUSES).optional(),
    }),
  }),
  handler(async (req, res) => {
    const parent = await User.findOneAndUpdate({ _id: req.params.id, role: "parent" }, req.body, { new: true });
    if (!parent) throw notFound("parent not found");
    await audit(req, "parent.update", "User", parent._id);
    res.json(parent);
  })
);
