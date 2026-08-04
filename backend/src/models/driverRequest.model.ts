import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const DRIVER_REQUEST_STATUSES = [
  "pending",
  "assigned",
  "completed",
  "cancelled",
  "rejected",
] as const;

/**
 * A school asking the platform for drivers — the same shape as a vehicle
 * request, for the case where the school has buses but nobody to drive them.
 *
 * Filled from the pool of approved drivers who have no school yet.
 */
const driverRequestSchema = new Schema(
  {
    ...tenantField(),
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    driverCount: { type: Number, required: true, min: 1, max: 20, default: 1 },
    minExperienceYears: { type: Number, min: 0, max: 40, default: 0 },
    /** Which bus they are wanted for, when the school already knows. */
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    neededFrom: Date,
    note: String,

    status: { type: String, enum: DRIVER_REQUEST_STATUSES, default: "pending", index: true },

    assignedDriverIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
  },
  { timestamps: true }
);

driverRequestSchema.plugin(tenantPlugin);
driverRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

export const DriverRequest = model("DriverRequest", driverRequestSchema);
