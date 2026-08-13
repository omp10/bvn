import { Router } from "express";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { naiveEtaMinutes } from "../../lib/geo.js";
import { Attendance } from "../../models/attendance.model.js";
import { RouteChangeRequest } from "../../models/routeChangeRequest.model.js";
import { School } from "../../models/school.model.js";
import { Student } from "../../models/student.model.js";
import { TransportRoute } from "../../models/route.model.js";
import { Trip } from "../../models/trip.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { getLivePosition } from "../../lib/redis.js";

export const parentRouter = Router();
parentRouter.use(authenticate, requireRole("parent"), requireActiveSchool);

/**
 * Ownership check layered on top of tenant scoping: the plugin proves the child
 * belongs to this school, parentId proves they belong to this parent.
 */
const ownChild = (id: string) =>
  Student.findOne({ _id: id, parentId: requireContext().userId, active: true });

parentRouter.get(
  "/children",
  handler(async (_req, res) => {
    const children = await Student.find({ parentId: requireContext().userId, active: true })
      .populate("vehicleId", "busNumber vehicleNumber capacity photoUrl")
      .populate("routeId", "name number type stops")
      .lean();
    res.json(children);
  })
);

/** Everything the parent dashboard shows for one child, in one request. */
parentRouter.get(
  "/children/:id/live",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const child = await ownChild(req.params.id);
    if (!child) throw notFound("child not found");
    if (!child.vehicleId) return res.json({ status: "no_bus_assigned" });

    const [vehicle, trip] = await Promise.all([
      Vehicle.findById(child.vehicleId).populate("driverId attendantId", "name phone").lean(),
      Trip.findOne({ vehicleId: child.vehicleId, status: "running" }).lean(),
    ]);

    if (!trip) {
      return res.json({ status: "not_started", vehicle, driver: vehicle?.driverId ?? null });
    }

    const [mark, route, school] = await Promise.all([
      Attendance.findOne({ tripId: trip._id, studentId: child._id }).sort({ at: -1 }).lean(),
      trip.routeId ? TransportRoute.findById(trip.routeId).select("stops name").lean() : null,
      School.findById(requireContext().schoolId).select("settings").lean(),
    ]);

    const stops = route?.stops ?? [];
    const myStopId = trip.type === "morning" ? child.pickupStopId : child.dropStopId;
    const myStop = stops.find((s) => String(s._id) === String(myStopId));
    const nextStop = stops[trip.currentStopIndex ?? 0] ?? null;

    // ETA computed here, once, from the position the bus already reported. The
    // parent's phone never calls a maps API — that is what keeps the bill sane
    // when 500 parents watch the same bus.
    // Redis holds the freshest fix; the trip document is the fallback.
    const position = (await getLivePosition(String(trip._id))) ?? trip.lastPosition;
    const fix =
      position?.lat != null && position?.lng != null
        ? { lat: position.lat, lng: position.lng }
        : null;
    const etaMinutes =
      fix && myStop
        ? naiveEtaMinutes(fix, { lat: myStop.lat, lng: myStop.lng }, position?.speedKmph ?? undefined)
        : null;

    const staleAfter = Date.now() - 3 * 60_000;
    res.json({
      status: "running",
      trip: {
        id: trip._id,
        type: trip.type,
        startedAt: trip.startedAt,
        timeline: trip.timeline,
      },
      /* FRD §19.6 lists "Delayed" as a trip status. It is kept as a property of
         a running trip rather than a fourth status value — see the trip model. */
      delayMinutes: trip.delayMinutes ?? 0,
      // Two independent signals: behind the timetable, or flagged by the job
      // for running far too long / going quiet. Either one means "delayed".
      delayed: Boolean(trip.delayed) || (trip.delayMinutes ?? 0) >= 10,
      vehicle,
      driver: vehicle?.driverId ?? null,
      position: position ?? null,
      // Silence is not the same as "the bus is here" — say when the fix is old.
      gpsStale: !position?.at || new Date(position.at).getTime() < staleAfter,
      nextStop,
      myStop: myStop ?? null,
      stopsRemaining: Math.max(0, stops.length - (trip.currentStopIndex ?? 0)),
      etaMinutes,
      childStatus: mark?.event ?? null,
      settings: school?.settings ?? null,
    });
  })
);

parentRouter.get(
  "/children/:id/history",
  validate({ params: idParam, query: z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }) }),
  handler(async (req, res) => {
    const child = await ownChild(req.params.id);
    if (!child) throw notFound("child not found");

    const days = Number((req.query as never as { days: number }).days);
    const marks = await Attendance.find({
      studentId: child._id,
      at: { $gte: new Date(Date.now() - days * 86_400_000) },
    })
      .sort({ at: -1 })
      .lean();

    // Grouped by day, which is how a parent reads it.
    const byDay = new Map<string, typeof marks>();
    for (const mark of marks) {
      const key = new Date(mark.at).toISOString().slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), mark]);
    }

    res.json([...byDay.entries()].map(([date, events]) => ({ date, events })));
  })
);

/* ── Route change requests ──────────────────────────────────────────── */
parentRouter.get(
  "/routes",
  handler(async (_req, res) => {
    res.json(await TransportRoute.find({ active: true }).select("name number type stops").lean());
  })
);

parentRouter.post(
  "/children/:id/route-change",
  validate({
    params: idParam,
    body: z.object({
      requestedRouteId: objectId,
      requestedPickupStopId: objectId.optional(),
      requestedDropStopId: objectId.optional(),
      reason: z.string().trim().max(500).optional(),
    }),
  }),
  handler(async (req, res) => {
    const child = await ownChild(req.params.id);
    if (!child) throw notFound("child not found");

    const route = await TransportRoute.findOne({ _id: req.body.requestedRouteId, active: true });
    if (!route) throw badRequest("that route is not available");

    const stopIds = new Set(route.stops.map((s) => String(s._id)));
    for (const key of ["requestedPickupStopId", "requestedDropStopId"] as const) {
      if (req.body[key] && !stopIds.has(String(req.body[key])))
        throw badRequest("that stop is not on the requested route");
    }

    try {
      const request = await RouteChangeRequest.create({
        studentId: child._id,
        requestedBy: requireContext().userId,
        currentRouteId: child.routeId,
        ...req.body,
      });
      res.status(201).json(request);
    } catch (err) {
      // The partial unique index allows one open request per student.
      if (isDuplicateKey(err)) throw conflict("a request for this child is already awaiting approval");
      throw err;
    }
  })
);

parentRouter.get(
  "/route-changes",
  handler(async (_req, res) => {
    res.json(
      await RouteChangeRequest.find({ requestedBy: requireContext().userId })
        .populate("studentId", "name")
        .populate("currentRouteId requestedRouteId", "name number")
        .sort({ createdAt: -1 })
        .lean()
    );
  })
);

/** Numbers a parent needs while the bus is out. */
parentRouter.get(
  "/emergency-contacts",
  handler(async (_req, res) => {
    const ctx = requireContext();
    const [school, children] = await Promise.all([
      School.findById(ctx.schoolId).select("name phone email").lean(),
      Student.find({ parentId: ctx.userId, active: true }).select("vehicleId").lean(),
    ]);

    const vehicleIds = children.map((c) => c.vehicleId).filter(Boolean);
    const vehicles = await Vehicle.find({ _id: { $in: vehicleIds } })
      .populate("driverId attendantId", "name phone")
      .select("busNumber driverId attendantId")
      .lean();

    const transportOffice = await User.findOne({ role: "school_admin" }).select("name phone").lean();

    res.json({
      school: { name: school?.name, phone: school?.phone },
      transportOffice,
      buses: vehicles.map((v) => ({
        busNumber: v.busNumber,
        driver: v.driverId,
        attendant: v.attendantId,
      })),
      helpline: "112",
    });
  })
);
