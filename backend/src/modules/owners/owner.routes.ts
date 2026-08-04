import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { requireContext } from "../../lib/context.js";
import { idParam, password, phone, validate, z } from "../../lib/validate.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle, VEHICLE_STATUSES, DOCUMENT_TYPES } from "../../models/vehicle.model.js";
import { allSchools, anySchool } from "../../models/plugins/tenant.js";

/**
 * Fleet owners span schools by nature, so every read here uses the explicit
 * cross-school bypass — always paired with an ownerId filter that narrows it to
 * their own vehicles and their own drivers.
 */
export const ownerRouter = Router();
ownerRouter.use(authenticate, requireRole("owner"));

const myVehicles = () => allSchools(Vehicle.find({ ownerId: requireContext().userId }));

ownerRouter.get(
  "/dashboard",
  handler(async (_req, res) => {
    const ownerId = requireContext().userId;
    const vehicles = await myVehicles().lean();
    const drivers = await allSchools(User.find({ ownerId, role: "driver" })).countDocuments();

    const soon = new Date(Date.now() + 30 * 86_400_000);
    res.json({
      total: vehicles.length,
      available: vehicles.filter((v) => v.status === "available").length,
      assigned: vehicles.filter((v) => v.status === "assigned").length,
      running: vehicles.filter((v) => v.status === "running").length,
      maintenance: vehicles.filter((v) => v.status === "maintenance").length,
      drivers,
      maintenanceDue: vehicles.filter((v) => v.nextMaintenanceDueAt && v.nextMaintenanceDueAt <= soon).length,
      documentsExpiring: vehicles.filter((v) =>
        (v.documents ?? []).some((d) => d.expiresOn && d.expiresOn <= soon)
      ).length,
    });
  })
);

ownerRouter.get(
  "/vehicles",
  validate({ query: z.object({ status: z.enum(VEHICLE_STATUSES).optional() }) }),
  handler(async (req, res) => {
    const status = (req.query as { status?: string }).status;
    const filter = { ownerId: requireContext().userId, ...(status ? { status } : {}) };
    res.json(
      await allSchools(Vehicle.find(filter))
        .populate("schoolId", "name code city")
        .populate(anySchool("driverId", "name phone"))
        .sort({ vehicleNumber: 1 })
        .lean()
    );
  })
);

ownerRouter.post(
  "/vehicles",
  validate({
    body: z.object({
      vehicleNumber: z.string().trim().min(4).toUpperCase(),
      type: z.enum(["bus", "minibus", "van"]).default("bus"),
      capacity: z.number().int().min(1).max(100),
      name: z.string().trim().optional(),
    }),
  }),
  handler(async (req, res) => {
    try {
      // No schoolId: an unassigned vehicle belongs to no tenant until the super
      // admin places it with a school.
      const vehicle = await Vehicle.create({
        ...req.body,
        ownerId: requireContext().userId,
        status: "available",
      });
      await audit(req, "vehicle.register", "Vehicle", vehicle._id);
      res.status(201).json(vehicle);
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict("that vehicle number is already registered");
      throw err;
    }
  })
);

ownerRouter.patch(
  "/vehicles/:id/status",
  validate({
    params: idParam,
    body: z.object({ status: z.enum(["available", "maintenance", "offline"]) }),
  }),
  handler(async (req, res) => {
    const vehicle = await allSchools(
      Vehicle.findOne({ _id: req.params.id, ownerId: requireContext().userId })
    );
    if (!vehicle) throw notFound("vehicle not found");

    // A running bus is mid-trip with children aboard; only the driver ends that.
    if (vehicle.status === "running") throw badRequest("this vehicle is on a trip");
    // Pulling a vehicle out from under a school mid-assignment is a support call,
    // not a dropdown.
    if (vehicle.schoolId && req.body.status === "available")
      throw badRequest("this vehicle is assigned to a school — contact the platform to release it");

    vehicle.status = req.body.status;
    await vehicle.save();
    await audit(req, "vehicle.status", "Vehicle", vehicle._id);
    res.json(vehicle);
  })
);

ownerRouter.post(
  "/vehicles/:id/documents",
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
    const vehicle = await allSchools(
      Vehicle.findOneAndUpdate(
        { _id: req.params.id, ownerId: requireContext().userId },
        { $push: { documents: req.body } },
        { new: true }
      )
    );
    if (!vehicle) throw notFound("vehicle not found");
    res.status(201).json(vehicle.documents);
  })
);

ownerRouter.post(
  "/vehicles/:id/maintenance",
  validate({
    params: idParam,
    body: z.object({ performedOn: z.coerce.date(), nextDueOn: z.coerce.date().optional(), note: z.string().optional() }),
  }),
  handler(async (req, res) => {
    const vehicle = await allSchools(
      Vehicle.findOneAndUpdate(
        { _id: req.params.id, ownerId: requireContext().userId },
        { lastMaintenanceAt: req.body.performedOn, nextMaintenanceDueAt: req.body.nextDueOn },
        { new: true }
      )
    );
    if (!vehicle) throw notFound("vehicle not found");
    await audit(req, "vehicle.maintenance", "Vehicle", vehicle._id, undefined, req.body);
    res.json(vehicle);
  })
);

/* ── The owner's own drivers ────────────────────────────────────────── */
ownerRouter.get(
  "/drivers",
  handler(async (_req, res) => {
    res.json(
      await allSchools(User.find({ ownerId: requireContext().userId, role: "driver" }))
        .populate("schoolId", "name")
        .lean()
    );
  })
);

ownerRouter.post(
  "/drivers",
  validate({
    body: z.object({
      name: z.string().trim().min(2),
      phone,
      password,
      licenseNumber: z.string().trim().min(4),
      licenseExpiry: z.coerce.date(),
    }),
  }),
  handler(async (req, res) => {
    if (await allSchools(User.findOne({ phone: req.body.phone })))
      throw conflict("that mobile number is already registered");

    const { password: plain, ...rest } = req.body;
    // No schoolId until the vehicle they drive is assigned to one.
    const driver = await User.create({
      ...rest,
      role: "driver",
      ownerId: requireContext().userId,
      passwordHash: await hashPassword(plain),
    });
    res.status(201).json(driver);
  })
);

/** Assign one of the owner's drivers to one of their vehicles. */
ownerRouter.post(
  "/vehicles/:id/driver",
  validate({ params: idParam, body: z.object({ driverId: z.string().nullable() }) }),
  handler(async (req, res) => {
    const ownerId = requireContext().userId;
    const vehicle = await allSchools(Vehicle.findOne({ _id: req.params.id, ownerId }));
    if (!vehicle) throw notFound("vehicle not found");

    if (req.body.driverId === null) {
      vehicle.driverId = undefined;
    } else {
      const driver = await allSchools(
        User.findOne({ _id: req.body.driverId, ownerId, role: "driver" })
      );
      if (!driver) throw badRequest("that driver is not on your fleet");
      if (driver.licenseExpiry && driver.licenseExpiry < new Date())
        throw badRequest("that driver's licence has expired");

      // A driver assigned to a school's vehicle inherits that school, which is
      // what lets them sign in and see their bus.
      if (vehicle.schoolId && String(driver.schoolId) !== String(vehicle.schoolId)) {
        driver.schoolId = vehicle.schoolId;
        await driver.save();
      }
      vehicle.driverId = driver._id;
    }

    await vehicle.save();
    await audit(req, "vehicle.driver", "Vehicle", vehicle._id);
    res.json(vehicle);
  })
);

ownerRouter.get(
  "/schools",
  handler(async (_req, res) => {
    const ids = await myVehicles().distinct("schoolId");
    res.json(await School.find({ _id: { $in: ids.filter(Boolean) } }).select("name code city phone").lean());
  })
);
