import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requirePermission, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { Vehicle, VEHICLE_STATUSES, DOCUMENT_TYPES } from "../../models/vehicle.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { User } from "../../models/user.model.js";
import { notify } from "../notifications/notification.service.js";
import { requireContext } from "../../lib/context.js";

/** The school's view of its buses. Every query is scoped by the tenant plugin. */
export const fleetRouter = Router();
fleetRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);
// Reads need buses:view; anything that changes data needs buses:manage.
fleetRouter.get("*", requirePermission("buses:view"));
fleetRouter.post("*", requirePermission("buses:manage"));
fleetRouter.patch("*", requirePermission("buses:manage"));
fleetRouter.delete("*", requirePermission("buses:manage"));

fleetRouter.get(
  "/",
  validate({ query: z.object({ status: z.enum(VEHICLE_STATUSES).optional() }) }),
  handler(async (req, res) => {
    const filter = (req.query as { status?: string }).status
      ? { status: (req.query as { status?: string }).status }
      : {};
    res.json(
      await Vehicle.find(filter)
        .populate("driverId attendantId", "name phone licenseExpiry")
        .populate("routeId", "name number")
        .sort({ busNumber: 1 })
        .lean()
    );
  })
);

fleetRouter.post(
  "/",
  validate({
    body: z.object({
      busNumber: z.string().trim().min(1),
      vehicleNumber: z.string().trim().min(4).toUpperCase(),
      name: z.string().trim().optional(),
      type: z.enum(["bus", "minibus", "van"]).default("bus"),
      capacity: z.number().int().min(1).max(100),
    }),
  }),
  handler(async (req, res) => {
    try {
      // No ownerId: a bus the school owns outright. Owner-supplied vehicles
      // arrive through the vehicle request flow instead.
      const vehicle = await Vehicle.create({ ...req.body, status: "assigned" });
      await audit(req, "vehicle.create", "Vehicle", vehicle._id);
      res.status(201).json(vehicle);
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict("that vehicle number or bus number already exists");
      throw err;
    }
  })
);

fleetRouter.patch(
  "/:id",
  validate({
    params: idParam,
    body: z.object({
      busNumber: z.string().trim().min(1).optional(),
      name: z.string().trim().optional(),
      capacity: z.number().int().min(1).max(100).optional(),
      status: z.enum(["assigned", "maintenance", "offline"]).optional(),
      routeId: objectId.nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    // A running bus is mid-trip; its status belongs to the driver, not the office.
    const vehicle = await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("bus not found");
    if (req.body.status && vehicle.status === "running")
      throw badRequest("this bus is on a trip — end the trip before changing its status");

    Object.assign(vehicle, req.body);
    await vehicle.save();
    await audit(req, "vehicle.update", "Vehicle", vehicle._id);
    res.json(vehicle);
  })
);

/** Assign or replace the driver and attendant. */
fleetRouter.post(
  "/:id/crew",
  validate({
    params: idParam,
    body: z.object({
      driverId: objectId.nullable().optional(),
      attendantId: objectId.nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    const vehicle = await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("bus not found");

    const previousDriver = vehicle.driverId ? String(vehicle.driverId) : null;

    for (const [field, role] of [["driverId", "driver"], ["attendantId", "staff"]] as const) {
      const value = req.body[field];
      if (value === undefined) continue;
      if (value === null) {
        vehicle[field] = undefined;
        continue;
      }

      // Scoped lookup: an id from another school resolves to nothing.
      const person = await User.findOne({ _id: value, role, status: { $ne: "inactive" } });
      if (!person) throw badRequest(`that ${role} does not belong to this school`);

      if (role === "driver") {
        if (!person.licenseNumber) throw badRequest("this driver has no licence on record");
        if (person.licenseExpiry && person.licenseExpiry < new Date())
          throw badRequest("this driver's licence has expired");
      }

      // One person, one bus — otherwise two trips could start under one driver.
      const clash = await Vehicle.findOne({ [field]: value, _id: { $ne: vehicle._id } });
      if (clash) throw conflict(`already assigned to ${clash.busNumber ?? clash.vehicleNumber}`);

      vehicle[field] = person._id;
    }

    await vehicle.save();
    await audit(req, "vehicle.crew", "Vehicle", vehicle._id);

    // Parents are told when the person driving their child changes.
    if (previousDriver && String(vehicle.driverId) !== previousDriver) {
      const students = await Student.find({ vehicleId: vehicle._id }).select("parentId").lean();
      await notify({
        userIds: students.map((s) => s.parentId),
        type: "driver_changed",
        title: "Driver changed",
        body: `A new driver has been assigned to ${vehicle.busNumber ?? vehicle.vehicleNumber}.`,
        data: { vehicleId: String(vehicle._id) },
        schoolId: requireContext().schoolId,
      });
    }

    res.json(await vehicle.populate("driverId attendantId", "name phone"));
  })
);

/* ── Vehicle documents ──────────────────────────────────────────────── */
fleetRouter.post(
  "/:id/documents",
  validate({
    params: idParam,
    body: z.object({
      type: z.enum(DOCUMENT_TYPES),
      number: z.string().trim().optional(),
      url: z.string().url().optional(),
      issuedOn: z.coerce.date().optional(),
      expiresOn: z.coerce.date().optional(),
    }),
  }),
  handler(async (req, res) => {
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id },
      { $push: { documents: req.body } },
      { new: true }
    );
    if (!vehicle) throw notFound("bus not found");
    await audit(req, "vehicle.addDocument", "Vehicle", vehicle._id, undefined, req.body);
    res.status(201).json(vehicle.documents);
  })
);

/** Documents expiring soon — the compliance screen the office actually needs. */
fleetRouter.get(
  "/documents/expiring",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  handler(async (req, res) => {
    const days = Number((req.query as never as { days: number }).days);
    const cutoff = new Date(Date.now() + days * 86_400_000);

    const vehicles = await Vehicle.find({ "documents.expiresOn": { $lte: cutoff } })
      .select("busNumber vehicleNumber documents")
      .lean();

    // Flattened here rather than in an aggregation: the list is small and this
    // is far easier to read six months from now.
    const expiring = vehicles.flatMap((v) =>
      (v.documents ?? [])
        .filter((d) => d.expiresOn && d.expiresOn <= cutoff)
        .map((d) => ({
          vehicleId: v._id,
          busNumber: v.busNumber,
          vehicleNumber: v.vehicleNumber,
          type: d.type,
          expiresOn: d.expiresOn,
        }))
    );
    res.json(expiring.sort((a, b) => +new Date(a.expiresOn!) - +new Date(b.expiresOn!)));
  })
);

fleetRouter.delete(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const running = await Trip.exists({ vehicleId: req.params.id, status: "running" });
    if (running) throw badRequest("this bus is on a trip");

    const students = await Student.countDocuments({ vehicleId: req.params.id });
    if (students) throw badRequest(`${students} student(s) are still assigned to this bus`);

    const result = await Vehicle.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) throw notFound("bus not found");
    await audit(req, "vehicle.delete", "Vehicle", req.params.id);
    res.json({ ok: true });
  })
);
