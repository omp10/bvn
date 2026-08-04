import { Schema, model } from "mongoose";
import { PLAN_KEYS } from "./school.model.js";

/** Subscription master. Editable by the super admin, not hardcoded in pricing logic. */
const planSchema = new Schema(
  {
    key: { type: String, enum: PLAN_KEYS, required: true, unique: true },
    name: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1 },
    /** Whole rupees — no floats anywhere near money. */
    priceInPaise: { type: Number, required: true, min: 0 },
    maxBuses: { type: Number, default: 0 }, // 0 = unlimited
    maxStudents: { type: Number, default: 0 },
    features: [String],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Plan = model("Plan", planSchema);

export const DEFAULT_PLANS = [
  { key: "trial", name: "Trial", durationDays: 14, priceInPaise: 0, maxBuses: 3, maxStudents: 100 },
  { key: "monthly", name: "Monthly", durationDays: 30, priceInPaise: 499000 },
  { key: "quarterly", name: "Quarterly", durationDays: 90, priceInPaise: 1349000 },
  { key: "yearly", name: "Yearly", durationDays: 365, priceInPaise: 4999000 },
] as const;
