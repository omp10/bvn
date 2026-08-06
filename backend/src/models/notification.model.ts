import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const NOTIFICATION_TYPES = [
  "trip_started",
  "bus_left_stop",
  "bus_approaching",
  "child_boarded",
  "school_arrived",
  "child_entered_school",
  "child_left_on_bus",
  "child_unaccounted",
  "overspeed",
  "return_started",
  "child_dropped",
  "trip_completed",
  "trip_delayed",
  "route_changed",
  "driver_changed",
  "vehicle_changed",
  "emergency",
  "subscription",
  "announcement",
] as const;

export const NOTIFICATION_CHANNELS = ["push", "whatsapp", "sms"] as const;

const notificationSchema = new Schema(
  {
    // required:false — platform announcements have no school.
    ...tenantField(false),
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    /** Ids the app needs to deep-link, e.g. { tripId, studentId }. */
    data: { type: Schema.Types.Mixed, default: {} },

    channels: { type: [String], enum: NOTIFICATION_CHANNELS, default: ["push"] },
    deliveredAt: Date,
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.plugin(tenantPlugin);
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model("Notification", notificationSchema);
