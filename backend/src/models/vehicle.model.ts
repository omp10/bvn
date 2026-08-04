import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const VEHICLE_STATUSES = ["available", "assigned", "running", "maintenance", "offline"] as const;
export const DOCUMENT_TYPES = ["rc", "insurance", "fitness", "pollution", "permit"] as const;

const documentSchema = new Schema(
  {
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    number: String,
    url: String,
    issuedOn: Date,
    /** Indexed on the parent so expiry sweeps are cheap. */
    expiresOn: Date,
  },
  { _id: true, timestamps: true }
);

/**
 * One collection for every vehicle on the platform, whether it belongs to a
 * fleet owner or to the school directly. `schoolId` is what makes it a school's
 * bus; an owner's unassigned vehicle simply has none yet, which is why the
 * tenant field is optional here while queries stay scoped.
 */
const vehicleSchema = new Schema(
  {
    // required:false — an owner's vehicle has no school until it is assigned.
    ...tenantField(false),
    vehicleNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    /** School-facing label, e.g. "Bus 4". Only meaningful once assigned. */
    busNumber: { type: String, trim: true },
    name: String,
    type: { type: String, enum: ["bus", "minibus", "van"], default: "bus" },
    capacity: { type: Number, required: true, min: 1, max: 100 },

    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, enum: VEHICLE_STATUSES, default: "available", index: true },

    driverId: { type: Schema.Types.ObjectId, ref: "User" },
    attendantId: { type: Schema.Types.ObjectId, ref: "User" },
    routeId: { type: Schema.Types.ObjectId, ref: "TransportRoute" },

    documents: [documentSchema],

    photos: [String],
    lastMaintenanceAt: Date,
    nextMaintenanceDueAt: Date,

    /** Set when the super admin assigns an owner's vehicle to a school. */
    assignedAt: Date,
    assignmentEndsAt: Date,
  },
  { timestamps: true }
);

vehicleSchema.plugin(tenantPlugin);
vehicleSchema.index({ schoolId: 1, status: 1 });
vehicleSchema.index({ "documents.expiresOn": 1 });

// A school's bus numbers must be unique within that school, but "Bus 1" exists
// at every school on the platform.
vehicleSchema.index(
  { schoolId: 1, busNumber: 1 },
  { unique: true, partialFilterExpression: { busNumber: { $type: "string" } } }
);

export const Vehicle = model("Vehicle", vehicleSchema);
