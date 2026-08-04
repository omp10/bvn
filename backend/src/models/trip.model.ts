import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";
import { ROUTE_TYPES } from "./route.model.js";

export const TRIP_STATUSES = ["running", "completed", "cancelled"] as const;

export const TIMELINE_EVENTS = [
  "trip_started",
  "stop_reached",
  "school_arrived",
  "return_started",
  "trip_completed",
] as const;

const timelineSchema = new Schema(
  {
    event: { type: String, enum: TIMELINE_EVENTS, required: true },
    stopId: Schema.Types.ObjectId,
    stopName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const tripSchema = new Schema(
  {
    ...tenantField(),
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    attendantId: { type: Schema.Types.ObjectId, ref: "User" },
    routeId: { type: Schema.Types.ObjectId, ref: "TransportRoute" },

    type: { type: String, enum: ROUTE_TYPES, required: true },
    status: { type: String, enum: TRIP_STATUSES, default: "running", index: true },
    /** Set by the scheduler when a trip overruns or its GPS goes quiet. */
    delayed: { type: Boolean, default: false },
    /** True when the scheduler ended it because the driver forgot to. */
    autoClosed: { type: Boolean, default: false },

    /** "2026-07-29" — a plain day key keeps the idempotency index simple. */
    tripDate: { type: String, required: true, index: true },

    startedAt: { type: Date, default: Date.now },
    endedAt: Date,

    /** Denormalised so the live map does not join the positions collection. */
    lastPosition: {
      lat: Number,
      lng: Number,
      speedKmph: Number,
      at: Date,
    },

    /** Index into the route's stops, so "next stop" is a lookup not a search. */
    currentStopIndex: { type: Number, default: 0 },
    /**
     * Stops whose "bus approaching" alert has already gone out. Without this the
     * alert re-fires on every position update while the bus is inside the
     * radius — roughly six pushes a minute to every waiting parent.
     */
    approachNotifiedStopIds: [Schema.Types.ObjectId],
    timeline: [timelineSchema],

    stats: {
      pickedUp: { type: Number, default: 0 },
      dropped: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      distanceKm: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

tripSchema.plugin(tenantPlugin);

/**
 * Idempotent Start Trip. A driver double-tapping on a flaky connection collides
 * with this index instead of creating a second trip, which is what keeps
 * attendance, notifications and reports from forking across two documents.
 * Partial, so yesterday's completed trips do not block today's.
 */
tripSchema.index(
  { vehicleId: 1, tripDate: 1, type: 1 },
  { unique: true, partialFilterExpression: { status: "running" } }
);
tripSchema.index({ schoolId: 1, status: 1, tripDate: -1 });

export const Trip = model("Trip", tripSchema);
