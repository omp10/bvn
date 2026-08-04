import { badRequest, isDuplicateKey, notFound } from "../../lib/errors.js";
import { distanceMeters, type Point } from "../../lib/geo.js";
import { Position } from "../../models/position.model.js";
import { School } from "../../models/school.model.js";
import { Student } from "../../models/student.model.js";
import { TransportRoute } from "../../models/route.model.js";
import { Trip } from "../../models/trip.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { emitToSchool, emitToTrip } from "../../realtime/socket.js";
import { clearLivePosition, setLivePosition } from "../../lib/redis.js";
import { messages, notify } from "../notifications/notification.service.js";
import { latestByTime, stopProgress, type Stop } from "./trip.progress.js";

export const todayKey = (d = new Date()): string => d.toISOString().slice(0, 10);

type TripType = "morning" | "evening";

/**
 * Starts a trip, idempotently.
 *
 * A driver on a patchy connection will tap Start Trip more than once. The
 * partial unique index on (vehicleId, tripDate, type) where status is running
 * turns the second insert into a duplicate-key error, which we resolve to the
 * trip that already exists. Without this, attendance, notifications and reports
 * quietly fork across two trip documents for the same journey.
 */
export async function startTrip(driverId: string, type: TripType, schoolId: string, selfieUrl?: string) {
  const vehicle = await Vehicle.findOne({ driverId });
  if (!vehicle) throw badRequest("no bus is assigned to you");
  if (vehicle.status === "maintenance") throw badRequest("this bus is marked under maintenance");

  // Checked before the trip exists, so a refused start leaves nothing behind.
  const school = await School.findById(schoolId).select("settings").lean();
  if (school?.settings?.requireDriverSelfie !== false && !selfieUrl) {
    throw badRequest("take your check-in photo before starting the trip");
  }
  // Only ever our own uploaded path — never an arbitrary URL from the client.
  if (selfieUrl && !/^\/uploads\/photos\/[\w.-]+$/.test(selfieUrl)) {
    throw badRequest("invalid check-in photo");
  }

  const key = { vehicleId: vehicle._id, tripDate: todayKey(), type };

  try {
    const trip = await Trip.create({
      ...key,
      driverId,
      attendantId: vehicle.attendantId,
      routeId: vehicle.routeId,
      status: "running",
      startedAt: new Date(),
      startSelfieUrl: selfieUrl,
      selfieAt: selfieUrl ? new Date() : undefined,
      timeline: [{ event: "trip_started", at: new Date() }],
    });

    await Vehicle.updateOne({ _id: vehicle._id }, { status: "running" });

    const students = await Student.find({ vehicleId: vehicle._id, active: true })
      .select("parentId")
      .lean();
    const label = vehicle.busNumber ?? vehicle.vehicleNumber;

    await notify({
      userIds: students.map((s) => s.parentId),
      ...messages.tripStarted(label),
      type: "trip_started",
      data: { tripId: String(trip._id), vehicleId: String(vehicle._id) },
      schoolId,
    });

    emitToSchool(schoolId, "trip:started", { tripId: String(trip._id), vehicleId: String(vehicle._id) });
    return { trip, created: true };
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    // The retry that lost the race gets the trip the winner created.
    const existing = await Trip.findOne({ ...key, status: "running" });
    if (!existing) throw err;
    return { trip: existing, created: false };
  }
}

/** Ending an already-ended trip is a no-op that returns the same document. */
export async function endTrip(tripId: string, driverId: string, schoolId: string) {
  const trip = await Trip.findOne({ _id: tripId, driverId });
  if (!trip) throw notFound("trip not found");

  if (trip.status !== "running") return { trip, changed: false };

  trip.status = "completed";
  trip.endedAt = new Date();
  trip.timeline.push({ event: "trip_completed", at: trip.endedAt } as never);
  await trip.save();

  await Vehicle.updateOne({ _id: trip.vehicleId }, { status: "assigned" });
  await clearLivePosition(String(trip._id));

  const vehicle = await Vehicle.findById(trip.vehicleId).select("busNumber vehicleNumber").lean();
  const students = await Student.find({ vehicleId: trip.vehicleId, active: true }).select("parentId").lean();

  await notify({
    userIds: students.map((s) => s.parentId),
    ...messages.tripCompleted(vehicle?.busNumber ?? vehicle?.vehicleNumber ?? "The bus"),
    type: "trip_completed",
    data: { tripId: String(trip._id) },
    schoolId,
  });

  emitToSchool(schoolId, "trip:ended", { tripId: String(trip._id) });
  emitToTrip(String(trip._id), "trip:ended", { tripId: String(trip._id) });
  return { trip, changed: true };
}

export type IncomingPoint = {
  lat: number;
  lng: number;
  at: Date;
  speedKmph?: number;
  heading?: number;
  accuracy?: number;
};

/**
 * Accepts a batch of GPS fixes.
 *
 * The driver app buffers points while offline and flushes them on reconnect, so
 * this has to cope with out-of-order arrivals and re-uploads of points it has
 * already seen. The unique index on (tripId, at, lat, lng) does the dedupe;
 * ordered:false lets the rest of the batch land around the duplicates.
 */
export async function recordPositions(tripId: string, driverId: string, points: IncomingPoint[], schoolId: string) {
  const trip = await Trip.findOne({ _id: tripId, driverId, status: "running" });
  if (!trip) throw notFound("no running trip");

  const rows = points.map((p) => ({ ...p, tripId: trip._id, vehicleId: trip.vehicleId, schoolId }));
  try {
    await Position.insertMany(rows, { ordered: false });
  } catch (err) {
    // Duplicates are the expected outcome of a buffer replay, not a failure.
    if (!isDuplicateKey(err)) throw err;
  }

  const newest = latestByTime(points);
  if (!newest) return { accepted: 0, trip };

  const previous = trip.lastPosition;
  const position: Point = { lat: newest.lat, lng: newest.lng };

  // Odometer, computed from consecutive fixes. Good enough for a trip summary
  // and it costs nothing; a Directions call per point would cost plenty.
  if (previous?.lat != null && previous?.lng != null) {
    const moved = distanceMeters({ lat: previous.lat, lng: previous.lng }, position);
    // Ignore GPS jitter while parked, and teleports from a bad fix.
    if (moved > 15 && moved < 5000 && trip.stats) trip.stats.distanceKm += moved / 1000;
  }

  trip.lastPosition = { ...position, speedKmph: newest.speedKmph, at: newest.at };

  // Redis is the hot read path: every watching parent and the office dashboard
  // ask for this constantly, and none of them should wait on Mongo for it.
  await setLivePosition(String(trip._id), {
    ...position,
    speedKmph: newest.speedKmph,
    at: new Date(newest.at).toISOString(),
  });

  await applyStopProgress(trip, position, newest.speedKmph, schoolId);
  await trip.save();

  // One broadcast to every watcher of this trip — parents never poll Google,
  // and the school's live map updates from the same event.
  emitToTrip(String(trip._id), "trip:position", {
    tripId: String(trip._id),
    ...position,
    at: newest.at,
    speedKmph: newest.speedKmph,
  });
  emitToSchool(schoolId, "fleet:position", {
    tripId: String(trip._id),
    vehicleId: String(trip.vehicleId),
    ...position,
    at: newest.at,
  });

  return { accepted: points.length, trip };
}

/** Fires stop-reached and approaching events for the trip's route. */
async function applyStopProgress(
  trip: InstanceType<typeof Trip>,
  position: Point,
  speedKmph: number | undefined,
  schoolId: string
) {
  if (!trip.routeId) return;

  const route = await TransportRoute.findById(trip.routeId).select("stops").lean();
  if (!route?.stops?.length) return;

  const school = await School.findById(schoolId).select("settings").lean();
  const radius = school?.settings?.approachingRadiusMeters ?? 800;

  const stops = route.stops as unknown as Stop[];
  const progress = stopProgress(stops, trip.currentStopIndex ?? 0, position, radius, speedKmph);
  trip.currentStopIndex = progress.currentStopIndex;

  if (progress.reached) {
    trip.timeline.push({
      event: "stop_reached",
      stopId: progress.reached._id,
      stopName: progress.reached.name,
      at: new Date(),
    } as never);
    emitToTrip(String(trip._id), "trip:stop_reached", { stopName: progress.reached.name });
  }

  if (progress.approaching) {
    const { stop, etaMinutes } = progress.approaching;

    // Once per stop per trip. The bus sits inside the approach radius for
    // several minutes, and this runs on every fix.
    const alreadyWarned = trip.approachNotifiedStopIds?.some((id) => String(id) === String(stop._id));
    if (alreadyWarned) return;
    trip.approachNotifiedStopIds.push(stop._id as never);

    // Only the parents waiting at this stop are told, not the whole bus.
    const field = trip.type === "morning" ? "pickupStopId" : "dropStopId";
    const students = await Student.find({ vehicleId: trip.vehicleId, active: true, [field]: stop._id })
      .select("parentId")
      .lean();

    if (students.length) {
      const vehicle = await Vehicle.findById(trip.vehicleId).select("busNumber vehicleNumber").lean();
      await notify({
        userIds: students.map((s) => s.parentId),
        ...messages.busApproaching(vehicle?.busNumber ?? vehicle?.vehicleNumber ?? "The bus", etaMinutes),
        type: "bus_approaching",
        data: { tripId: String(trip._id), stopId: String(stop._id), etaMinutes },
        schoolId,
      });
    }
  }
}
