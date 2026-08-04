import { Schema, model, type InferSchemaType } from "mongoose";

export const SCHOOL_STATUSES = ["trial", "active", "suspended", "expired"] as const;
export const PLAN_KEYS = ["trial", "monthly", "quarterly", "yearly"] as const;

/** The tenant itself. Never tenant-scoped — only the super admin manages these. */
const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Parents type this to register; it is the tenant boundary made visible. */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    /** Rotatable secret behind the QR code and invitation link. */
    inviteToken: { type: String, required: true, index: true },

    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: String,
    city: { type: String, trim: true },
    state: { type: String, trim: true },

    status: { type: String, enum: SCHOOL_STATUSES, default: "trial", index: true },

    subscription: {
      plan: { type: String, enum: PLAN_KEYS, default: "trial" },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, index: true },
      /** Set when a renewal reminder goes out, so it is not sent twice. */
      reminderSentAt: Date,
    },

    branding: {
      logoUrl: String,
      themeColor: { type: String, default: "#1d4ed8" },
      appName: String,
      emailFrom: String,
    },

    /** The school gate. Needed to record arrival and the return journey. */
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },

    settings: {
      /** How often the driver app reports position, in seconds. */
      trackingIntervalSec: { type: Number, default: 10, min: 5, max: 60 },
      /** Distance at which the "bus approaching your stop" alert fires. */
      approachingRadiusMeters: { type: Number, default: 800, min: 200, max: 5000 },
    },
  },
  { timestamps: true }
);

export const School = model("School", schoolSchema);

export type SchoolDoc = InferSchemaType<typeof schoolSchema>;

/**
 * Business rule: a school is usable only while its subscription is live.
 * A plain function rather than a schema method so it also works on .lean()
 * results, which is most of the places that ask.
 */
export function isSchoolOperational(school: {
  status: string;
  subscription?: { expiresAt?: Date | null } | null;
}): boolean {
  if (school.status === "suspended" || school.status === "expired") return false;
  const expiry = school.subscription?.expiresAt;
  return !expiry || new Date(expiry).getTime() > Date.now();
}
