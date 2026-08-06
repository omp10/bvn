import { Router } from "express";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { objectId, validate, z } from "../../lib/validate.js";
import { Attendance, ATTENDANCE_EVENTS } from "../../models/attendance.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { emitToSchool, emitToTrip } from "../../realtime/socket.js";
import { messages, notify } from "../notifications/notification.service.js";

export const attendanceRouter = Router();
/* Drivers as well as attendants.
 *
 * The mark handler has always accepted whichever of the two is on the trip —
 * plenty of buses run without an attendant — but the router refused drivers
 * before the request ever reached it, so a driver marking a child got
 * "requires staff". Widening the role is safe because authorisation is not the
 * role: every handler below proves the caller is the crew on *that* trip. */
attendanceRouter.use(authenticate, requireRole("staff", "driver"), requireActiveSchool);

/** Only the driver or the attendant on this trip may touch its attendance. */
const assertCrew = (trip: { driverId?: unknown; attendantId?: unknown }) => {
  const { userId } = requireContext();
  if (String(trip.driverId) !== userId && String(trip.attendantId) !== userId)
    throw badRequest("you are not the crew on this trip");
};

/** The attendant's bus, its running trip, and the roster with today's marks. */
attendanceRouter.get(
  "/roster",
  handler(async (_req, res) => {
    const { userId } = requireContext();
    const vehicle = await Vehicle.findOne({ attendantId: userId })
      .populate("routeId", "name stops")
      .populate("driverId", "name phone");
    if (!vehicle) throw notFound("no bus is assigned to you");

    const trip = await Trip.findOne({ vehicleId: vehicle._id, status: "running" });
    const students = await Student.find({ vehicleId: vehicle._id, active: true })
      .sort({ class: 1, name: 1 })
      .lean();

    const marks = trip ? await Attendance.find({ tripId: trip._id }).lean() : [];

    res.json({
      vehicle,
      trip,
      students: students.map((s) => ({
        ...s,
        events: marks.filter((m) => String(m.studentId) === String(s._id)).map((m) => m.event),
      })),
    });
  })
);

/**
 * Mark boarding, drop or absence.
 *
 * Idempotent through the unique index on (tripId, studentId, event): an
 * attendant double-tapping on a moving bus, or a request retried after a
 * timeout, resolves to the original record. Without it the parent gets two
 * "boarded safely" pushes and the trip stats count the child twice.
 */
attendanceRouter.post(
  "/",
  validate({
    body: z.object({
      tripId: objectId,
      studentId: objectId,
      event: z.enum(ATTENDANCE_EVENTS),
      stopId: objectId.optional(),
    }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const { tripId, studentId, event, stopId } = req.body;

    // Both lookups run inside the tenant scope, so ids from another school
    // simply do not resolve.
    const [trip, student] = await Promise.all([
      Trip.findOne({ _id: tripId, status: "running" }),
      Student.findOne({ _id: studentId, active: true }),
    ]);
    if (!trip) throw notFound("no running trip");
    if (!student) throw notFound("student not found");
    assertCrew(trip);
    if (String(student.vehicleId) !== String(trip.vehicleId))
      throw badRequest("that student is not on this bus");

    let mark;
    let firstTime = true;
    try {
      mark = await Attendance.create({ tripId, studentId, event, stopId, markedBy: ctx.userId });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      firstTime = false;
      mark = await Attendance.findOne({ tripId, studentId, event });
    }

    // Only the first mark moves counters and wakes the parent's phone.
    if (firstTime) {
      const counter =
        event === "boarded" ? "stats.pickedUp" : event === "dropped" ? "stats.dropped" : "stats.absent";
      await Trip.updateOne({ _id: tripId }, { $inc: { [counter]: 1 } });

      if (event !== "absent") {
        const vehicle = await Vehicle.findById(trip.vehicleId).select("busNumber vehicleNumber").lean();
        const label = vehicle?.busNumber ?? vehicle?.vehicleNumber ?? "the bus";
        await notify({
          userIds: [student.parentId],
          ...(event === "boarded" ? messages.childBoarded(student.name, label) : messages.childDropped(student.name)),
          type: event === "boarded" ? "child_boarded" : "child_dropped",
          data: { tripId: String(tripId), studentId: String(studentId) },
          schoolId: ctx.schoolId,
        });
      }

      emitToTrip(String(tripId), "attendance:marked", { studentId: String(studentId), event });
      emitToSchool(ctx.schoolId!, "attendance:marked", { tripId: String(tripId), studentId: String(studentId), event });
    }

    res.status(firstTime ? 201 : 200).json(mark);
  })
);

/** Corrects a mistaken mark — an attendant tapping the wrong child happens. */
attendanceRouter.delete(
  "/:tripId/:studentId/:event",
  validate({
    params: z.object({ tripId: objectId, studentId: objectId, event: z.enum(ATTENDANCE_EVENTS) }),
  }),
  handler(async (req, res) => {
    const { tripId, studentId, event } = req.params as never as {
      tripId: string; studentId: string; event: string;
    };

    const trip = await Trip.findOne({ _id: tripId, status: "running" });
    if (!trip) throw badRequest("the trip has ended — ask the office to correct this");
    // Was missing: any staff member could delete another bus's marks.
    assertCrew(trip);

    const removed = await Attendance.findOneAndDelete({ tripId, studentId, event });
    if (!removed) throw notFound("no such mark");

    const counter =
      event === "boarded" ? "stats.pickedUp" : event === "dropped" ? "stats.dropped" : "stats.absent";
    await Trip.updateOne({ _id: tripId }, { $inc: { [counter]: -1 } });

    res.json({ ok: true });
  })
);
