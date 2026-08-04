import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const REQUEST_STATUSES = [
  "pending",
  "approved",
  "assigned",
  "active",
  "completed",
  "cancelled",
  "rejected",
] as const;

/** A school asking the platform for extra buses from the fleet-owner pool. */
const vehicleRequestSchema = new Schema(
  {
    ...tenantField(),
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    seatingCapacity: { type: Number, required: true, min: 1 },
    vehicleCount: { type: Number, required: true, min: 1, default: 1 },
    routeId: { type: Schema.Types.ObjectId, ref: "TransportRoute" },
    startsOn: Date,
    endsOn: Date,
    specialRequirements: String,

    status: { type: String, enum: REQUEST_STATUSES, default: "pending", index: true },

    /** Filled as the super admin works the request. */
    assignedVehicleIds: [{ type: Schema.Types.ObjectId, ref: "Vehicle" }],
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
  },
  { timestamps: true }
);

vehicleRequestSchema.plugin(tenantPlugin);
vehicleRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

export const VehicleRequest = model("VehicleRequest", vehicleRequestSchema);
