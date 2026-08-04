import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const ROUTE_TYPES = ["morning", "evening"] as const;

/** Stops are embedded: they are always read with their route and never queried alone. */
const stopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: String,
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    /** Order along the route, 1-based. */
    sequence: { type: Number, required: true, min: 1 },
    /** "07:15" — local wall-clock time, not a Date. */
    pickupTime: String,
    dropTime: String,
  },
  { _id: true }
);

const routeSchema = new Schema(
  {
    ...tenantField(),
    name: { type: String, required: true, trim: true },
    number: { type: String, trim: true },
    type: { type: String, enum: ROUTE_TYPES, default: "morning" },
    startPoint: String,
    endPoint: String,
    distanceKm: Number,
    stops: {
      type: [stopSchema],
      // Stops are re-sequenced on every write so a client cannot leave holes or
      // duplicates in the order the driver and parents rely on.
      set: (stops: { sequence: number }[]) =>
        [...(stops ?? [])]
          .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
          .map((stop, i) => ({ ...stop, sequence: i + 1 })),
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

routeSchema.plugin(tenantPlugin);
routeSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export const TransportRoute = model("TransportRoute", routeSchema);
