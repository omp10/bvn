import { Router } from "express";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { trackingLimiter } from "../../middleware/rateLimit.js";
import { badRequest, handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, paginationQuery, validate, z } from "../../lib/validate.js";
import { Attendance } from "../../models/attendance.model.js";
import { Position } from "../../models/position.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { School } from "../../models/school.model.js";
import { endTrip, recordPositions, startTrip, todayKey } from "./trip.service.js";
import { getLivePositions } from "../../lib/redis.js";

/* ── Driver ─────────────────────────────────────────────────────────── */
export const driverRouter = Router();
driverRouter.use(authenticate, requireRole("driver"), requireActiveSchool);

driverRouter.get(
  "/my-bus",
  handler(async (_req, res) => {
    const { userId } = requireContext();
    const vehicle = await Vehicle.findOne({ driverId: userId })
      .populate("routeId", "name number type stops distanceKm")
      .populate("attendantId", "name phone");
    if (!vehicle) throw notFound("no bus is assigned to you");

    const [students, activeTrip] = await Promise.all([
      Student.countDocuments({ vehicleId: vehicle._id, active: true }),
      Trip.findOne({ vehicleId: vehicle._id, status: "running" }),
    ]);

    const school = await School.findById(requireContext().schoolId).select("settings").lean();
    res.json({
      vehicle,
      studentCount: students,
      activeTrip,
      requireSelfie: school?.settings?.requireDriverSelfie !== false,
    });
  })
);

/**
 * The driver's own roster, with today's marks.
 *
 * The attendant has had this all along at /staff/attendance/roster, but that
 * route is role-locked to staff — so a driver on a bus with no attendant could
 * mark attendance (the attendance handler already accepts the trip's driver)
 * yet had no way to see who was on board. This closes that.
 */
driverRouter.get(
  "/students",
  handler(async (_req, res) => {
    const vehicle = await Vehicle.findOne({ driverId: requireContext().userId })
      .populate("routeId", "name stops")
      .lean();
    if (!vehicle) throw notFound("no bus is assigned to you");

    const trip = await Trip.findOne({ vehicleId: vehicle._id, status: "running" }).lean();
    const students = await Student.find({ vehicleId: vehicle._id, active: true })
      .sort({ class: 1, name: 1 })
      .lean();

    const marks = trip ? await Attendance.find({ tripId: trip._id }).lean() : [];

    const stops = (vehicle.routeId as { stops?: { _id: unknown; name: string }[] } | null)?.stops ?? [];
    const stopName = (id: unknown) => stops.find((s) => String(s._id) === String(id))?.name ?? null;

    res.json({
      trip: trip ? { _id: trip._id, type: trip.type } : null,
      students: students.map((s) => ({
        _id: s._id,
        name: s.name,
        class: s.class,
        section: s.section,
        rollNo: s.rollNo,
        photoUrl: s.photoUrl ?? null,
        pickupStop: stopName(s.pickupStopId),
        dropStop: stopName(s.dropStopId),
        events: marks.filter((m) => String(m.studentId) === String(s._id)).map((m) => m.event),
      })),
    });
  })
);

driverRouter.post(
  "/trips/start",
  validate({
    body: z.object({
      type: z.enum(["morning", "evening"]),
      selfieUrl: z.string().optional(),
    }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const { trip, created } = await startTrip(ctx.userId, req.body.type, ctx.schoolId!, req.body.selfieUrl);
    // 200 rather than 201 on the retry, so the app can tell the two apart if it
    // cares — but either way it gets a usable trip.
    res.status(created ? 201 : 200).json(trip);
  })
);

driverRouter.post(
  "/trips/:id/end",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const { trip } = await endTrip(req.params.id, ctx.userId, ctx.schoolId!);
    res.json(trip);
  })
);

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  at: z.coerce.date(),
  speedKmph: z.number().min(0).max(200).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracy: z.number().min(0).optional(),
});

driverRouter.post(
  "/trips/:id/positions",
  trackingLimiter,
  validate({
    params: idParam,
    // A batch, because the app buffers points while offline and flushes them all
    // at once when the signal comes back.
    body: z.object({ points: z.array(pointSchema).min(1).max(500) }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const future = new Date(Date.now() + 5 * 60_000);
    const points = req.body.points.filter((p: { at: Date }) => p.at <= future);
    if (!points.length) throw badRequest("all points are timestamped in the future");

    const result = await recordPositions(req.params.id, ctx.userId, points, ctx.schoolId!);
    res.json({ ok: true, accepted: result.accepted });
  })
);

driverRouter.get(
  "/trips",
  validate({ query: paginationQuery }),
  handler(async (req, res) => {
    const { page, limit } = req.query as never as { page: number; limit: number };
    const filter = { driverId: requireContext().userId };
    const [items, total] = await Promise.all([
      Trip.find(filter)
        .populate("vehicleId", "busNumber vehicleNumber")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Trip.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  })
);

/* ── School admin: live fleet, history, replay ──────────────────────── */
export const tripRouter = Router();
tripRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

tripRouter.get(
  "/live",
  handler(async (_req, res) => {
    const trips = await Trip.find({ status: "running" })
      .populate("vehicleId", "busNumber vehicleNumber capacity")
      .populate("driverId", "name phone")
      .populate("routeId", "name stops")
      .lean();

    // One Redis round trip for the whole fleet, falling back to the copy stored
    // on the trip when Redis is absent.
    const cached = await getLivePositions(trips.map((t) => String(t._id)));
    const stale = Date.now() - 3 * 60_000;

    res.json(
      trips.map((t) => {
        const lastPosition = cached[String(t._id)] ?? t.lastPosition;
        return {
          ...t,
          lastPosition,
          // A bus whose last fix is three minutes old is not "live" — say so
          // rather than showing a stale dot as if it were current.
          gpsStale: !lastPosition?.at || new Date(lastPosition.at).getTime() < stale,
          delayed: Boolean(t.delayed) || (t.delayMinutes ?? 0) >= 10,
        };
      })
    );
  })
);

tripRouter.get(
  "/",
  validate({
    query: paginationQuery.extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      vehicleId: objectId.optional(),
      status: z.enum(["running", "completed", "cancelled"]).optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query as never as {
      page: number; limit: number; date?: string; vehicleId?: string; status?: string;
    };
    const filter: Record<string, unknown> = { tripDate: q.date ?? todayKey() };
    if (q.vehicleId) filter.vehicleId = q.vehicleId;
    if (q.status) filter.status = q.status;

    const [items, total] = await Promise.all([
      Trip.find(filter)
        .populate("vehicleId", "busNumber vehicleNumber")
        .populate("driverId", "name phone")
        .sort({ startedAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Trip.countDocuments(filter),
    ]);
    res.json({ items, total, page: q.page, limit: q.limit });
  })
);

tripRouter.get(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const trip = await Trip.findOne({ _id: req.params.id })
      .populate("vehicleId", "busNumber vehicleNumber")
      .populate("driverId attendantId", "name phone")
      .populate("routeId", "name stops")
      .lean();
    if (!trip) throw notFound("trip not found");

    const attendance = await Attendance.find({ tripId: trip._id })
      .populate("studentId", "name class section")
      .lean();
    res.json({ trip, attendance });
  })
);

/**
 * Route replay. A 90-minute trip at one fix every 10 seconds is about 540
 * points — small enough to send as-is, so there is no simplification pass here.
 * If a school ever runs 4-hour trips, sample server-side before adding a
 * geometry library.
 */
tripRouter.get(
  "/:id/replay",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const trip = await Trip.findOne({ _id: req.params.id }).select("_id startedAt endedAt").lean();
    if (!trip) throw notFound("trip not found");

    const points = await Position.find({ tripId: trip._id })
      .select("lat lng at speedKmph -_id")
      .sort({ at: 1 })
      .lean();

    res.json({ tripId: trip._id, startedAt: trip.startedAt, endedAt: trip.endedAt, points });
  })
);
