import { Schema, model } from "mongoose";

export const REGISTRATION_TYPES = ["school", "owner", "driver"] as const;
export const REGISTRATION_STATUSES = ["pending", "approved", "rejected"] as const;

/**
 * A self-service application to join the platform.
 *
 * Deliberately *not* an account. Anyone can apply, but the super admin decides
 * — the FRD has schools being onboarded and owners being approved by the
 * platform, and a bus full of children is not the place to let a stranger
 * register themselves into an operational role. Approval is what creates the
 * real User (and, for a school, the School itself).
 *
 * Not tenant-scoped: an applicant has no school yet, and a driver may apply
 * naming a school code that the platform still has to verify.
 */
const registrationSchema = new Schema(
  {
    type: { type: String, enum: REGISTRATION_TYPES, required: true, index: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: "pending", index: true },

    // Everyone provides these.
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String, trim: true },
    /** Hashed on the way in — a pending application never holds a plain password. */
    passwordHash: { type: String, required: true, select: false },

    // School applications.
    schoolName: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    address: String,
    state: { type: String, trim: true },
    studentCount: Number,
    busCount: Number,

    // Fleet owner applications.
    companyName: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    vehicleCount: Number,

    // Driver applications.
    licenseNumber: { type: String, trim: true },
    licenseExpiry: Date,
    experienceYears: Number,
    /** Optional: the school they already drive for, verified on approval. */
    schoolCode: { type: String, trim: true, uppercase: true },

    note: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
    /** What approval created, so the trail is not lost. */
    createdUserId: { type: Schema.Types.ObjectId, ref: "User" },
    createdSchoolId: { type: Schema.Types.ObjectId, ref: "School" },
  },
  { timestamps: true }
);

// One open application per phone number — resubmitting updates rather than
// filling the queue with duplicates of the same person.
registrationSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
registrationSchema.index({ status: 1, createdAt: -1 });

export const Registration = model("Registration", registrationSchema);
