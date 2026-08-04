import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

export const SALARY_STATUSES = ["pending", "paid", "cancelled"] as const;

/**
 * Monthly pay for a driver or attendant (FRD 9.5).
 *
 * Amounts are in paise, like every other money field here — no floats anywhere
 * near payroll.
 */
const salarySchema = new Schema(
  {
    ...tenantField(),
    staffId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** "2026-07" — the month this payment covers. */
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },

    baseAmountInPaise: { type: Number, required: true, min: 0 },
    allowancesInPaise: { type: Number, default: 0, min: 0 },
    deductionsInPaise: { type: Number, default: 0, min: 0 },
    /** Stored rather than computed on read, so a payslip never changes retroactively. */
    netAmountInPaise: { type: Number, required: true, min: 0 },

    status: { type: String, enum: SALARY_STATUSES, default: "pending", index: true },
    paidOn: Date,
    paymentRef: String,
    note: String,
  },
  { timestamps: true }
);

salarySchema.plugin(tenantPlugin);
// One salary record per person per month — a re-submitted form updates rather
// than paying somebody twice.
salarySchema.index({ schoolId: 1, staffId: 1, period: 1 }, { unique: true });

export const Salary = model("Salary", salarySchema);

export const netOf = (base: number, allowances = 0, deductions = 0) =>
  Math.max(0, base + allowances - deductions);
