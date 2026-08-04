import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

// "absent" is marked in advance by the attendant; "missed_pickup" is recorded
// when the bus left the stop without a child who was expected.
export const ATTENDANCE_EVENTS = ["boarded", "dropped", "absent", "missed_pickup"] as const;

const attendanceSchema = new Schema(
  {
    ...tenantField(),
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    event: { type: String, enum: ATTENDANCE_EVENTS, required: true },
    stopId: Schema.Types.ObjectId,
    at: { type: Date, default: Date.now },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.plugin(tenantPlugin);

/**
 * Idempotent marking. An attendant tapping twice on a moving bus, or a request
 * retried after a timeout, collapses onto the original record instead of
 * double-counting the child and sending the parent two notifications.
 */
attendanceSchema.index({ tripId: 1, studentId: 1, event: 1 }, { unique: true });
attendanceSchema.index({ studentId: 1, at: -1 });

export const Attendance = model("Attendance", attendanceSchema);
