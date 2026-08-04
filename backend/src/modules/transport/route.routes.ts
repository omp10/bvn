import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requirePermission, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { idParam, validate, z } from "../../lib/validate.js";
import { TransportRoute, ROUTE_TYPES } from "../../models/route.model.js";
import { Student } from "../../models/student.model.js";
import { Vehicle } from "../../models/vehicle.model.js";

export const routeRouter = Router();
routeRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);
// Reads need routes:view; anything that changes data needs routes:manage.
routeRouter.get("*", requirePermission("routes:view"));
routeRouter.post("*", requirePermission("routes:manage"));
routeRouter.patch("*", requirePermission("routes:manage"));
routeRouter.delete("*", requirePermission("routes:manage"));

const stopBody = z.object({
  _id: z.string().optional(),
  name: z.string().trim().min(1),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  sequence: z.number().int().min(1),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM").optional(),
  dropTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM").optional(),
});

const routeBody = z.object({
  name: z.string().trim().min(2),
  number: z.string().trim().optional(),
  type: z.enum(ROUTE_TYPES).default("morning"),
  startPoint: z.string().trim().optional(),
  endPoint: z.string().trim().optional(),
  distanceKm: z.number().min(0).optional(),
  stops: z.array(stopBody).default([]),
});

routeRouter.get(
  "/",
  handler(async (_req, res) => {
    const routes = await TransportRoute.find().sort({ name: 1 }).lean();

    // Students and buses per route — what the office looks at before changing one.
    const [studentCounts, vehicles] = await Promise.all([
      Student.aggregate([
        { $match: { routeId: { $ne: null }, active: true } },
        { $group: { _id: "$routeId", count: { $sum: 1 } } },
      ]),
      Vehicle.find({ routeId: { $ne: null } }).select("busNumber routeId").lean(),
    ]);
    const byRoute = new Map(studentCounts.map((c: { _id: unknown; count: number }) => [String(c._id), c.count]));

    res.json(
      routes.map((r) => ({
        ...r,
        studentCount: byRoute.get(String(r._id)) ?? 0,
        buses: vehicles.filter((v) => String(v.routeId) === String(r._id)).map((v) => v.busNumber),
      }))
    );
  })
);

routeRouter.get(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const route = await TransportRoute.findOne({ _id: req.params.id }).lean();
    if (!route) throw notFound("route not found");
    res.json(route);
  })
);

routeRouter.post(
  "/",
  validate({ body: routeBody }),
  handler(async (req, res) => {
    try {
      // The schema re-sequences stops on write, so gaps or duplicates in the
      // order sent by the client are normalised rather than rejected.
      const route = await TransportRoute.create(req.body);
      await audit(req, "route.create", "TransportRoute", route._id);
      res.status(201).json(route);
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict("a route with that name already exists");
      throw err;
    }
  })
);

routeRouter.patch(
  "/:id",
  validate({ params: idParam, body: routeBody.partial() }),
  handler(async (req, res) => {
    const route = await TransportRoute.findOne({ _id: req.params.id });
    if (!route) throw notFound("route not found");

    // Removing a stop that students are assigned to would strand them, so the
    // assignment has to be moved first.
    if (req.body.stops) {
      const keptIds = new Set(
        req.body.stops.map((s: { _id?: string }) => s._id).filter(Boolean).map(String)
      );
      const removed = route.stops.filter((s) => !keptIds.has(String(s._id))).map((s) => s._id);

      if (removed.length) {
        const affected = await Student.countDocuments({
          $or: [{ pickupStopId: { $in: removed } }, { dropStopId: { $in: removed } }],
        });
        if (affected)
          throw badRequest(`${affected} student(s) are assigned to a stop you are removing`);
      }
    }

    Object.assign(route, req.body);
    await route.save();
    await audit(req, "route.update", "TransportRoute", route._id);
    res.json(route);
  })
);

routeRouter.delete(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const students = await Student.countDocuments({ routeId: req.params.id, active: true });
    if (students) throw badRequest(`${students} student(s) are still on this route`);

    const buses = await Vehicle.countDocuments({ routeId: req.params.id });
    if (buses) throw badRequest("a bus is still assigned to this route");

    const result = await TransportRoute.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) throw notFound("route not found");
    await audit(req, "route.delete", "TransportRoute", req.params.id);
    res.json({ ok: true });
  })
);
