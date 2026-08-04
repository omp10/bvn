import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const ROUTE_CHANGE_STATUSES = ["pending", "approved", "rejected"] as const;

/** A parent asking to move their child to a different route or stop. */
const routeChangeRequestSchema = new Schema(
  {
    ...tenantField(),
    // Indexed by the partial unique index below, not here.
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    currentRouteId: { type: Schema.Types.ObjectId, ref: "TransportRoute" },
    requestedRouteId: { type: Schema.Types.ObjectId, ref: "TransportRoute", required: true },
    requestedPickupStopId: Schema.Types.ObjectId,
    requestedDropStopId: Schema.Types.ObjectId,
    reason: String,

    status: { type: String, enum: ROUTE_CHANGE_STATUSES, default: "pending", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
  },
  { timestamps: true }
);

routeChangeRequestSchema.plugin(tenantPlugin);
// One open request per student — a parent cannot queue five and confuse the office.
routeChangeRequestSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const RouteChangeRequest = model("RouteChangeRequest", routeChangeRequestSchema);
