import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const EMERGENCY_TYPES = ["breakdown", "medical", "accident", "other"] as const;
export const EMERGENCY_STATUSES = ["open", "acknowledged", "resolved"] as const;

const emergencySchema = new Schema(
  {
    ...tenantField(),
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: EMERGENCY_TYPES, required: true },
    note: String,
    lat: Number,
    lng: Number,

    status: { type: String, enum: EMERGENCY_STATUSES, default: "open", index: true },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: Date,
    resolvedAt: Date,
    resolutionNote: String,

    /**
     * Client-supplied key that makes raising an alert idempotent. Unlike start
     * trip, a second breakdown on the same trip is legitimate, so this cannot be
     * a state constraint — the app sends a fresh key per tap of the button and
     * reuses it across retries.
     */
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true }
);

emergencySchema.plugin(tenantPlugin);
emergencySchema.index({ schoolId: 1, idempotencyKey: 1 }, { unique: true });
emergencySchema.index({ schoolId: 1, status: 1, createdAt: -1 });

export const Emergency = model("Emergency", emergencySchema);
