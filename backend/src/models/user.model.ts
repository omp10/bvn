import { Schema, model } from "mongoose";
import { ROLES } from "../lib/context.js";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const USER_STATUSES = ["active", "on_leave", "inactive"] as const;

/**
 * Every human on the platform. One collection because the differences between a
 * driver and a parent are a handful of optional fields, not a different shape.
 *
 * Tenant-scoped with required:false — super admins and fleet owners have no
 * school. Login looks a user up by globally unique phone and therefore has to
 * go through allSchools() explicitly.
 */
const userSchema = new Schema(
  {
    // required:false — super admins and fleet owners belong to no single school.
    ...tenantField(false),
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: USER_STATUSES, default: "active" },

    /** Custom permission set (FRD 27). Only meaningful for school-side staff. */
    roleId: { type: Schema.Types.ObjectId, ref: "Role", index: true },

    /** Drivers supplied by a fleet owner keep the link to their employer. */
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },

    photoUrl: String,
    address: String,
    aadhaar: { type: String, select: false },

    // Driver-specific. Licence expiry is monitored, so it is indexed.
    licenseNumber: String,
    licenseExpiry: { type: Date, index: true },
    experienceYears: Number,

    // Fleet-owner-specific.
    companyName: String,
    gstNumber: String,
    panNumber: { type: String, select: false },

    /** Parent relationship to their children, e.g. "father". */
    relationship: String,

    /** FCM registration tokens, one per device. */
    pushTokens: [String],

    /** Refresh-token ids that are still valid. Signing out clears them. */
    sessions: { type: [String], select: false, default: [] },

    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.plugin(tenantPlugin);

// The listing screens all filter by school and role together.
userSchema.index({ schoolId: 1, role: 1, status: 1 });

userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.sessions;
    delete ret.aadhaar;
    delete ret.panNumber;
    return ret;
  },
});

export const User = model("User", userSchema);
