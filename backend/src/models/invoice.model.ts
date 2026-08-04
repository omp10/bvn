import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";
import { PLAN_KEYS } from "./school.model.js";

export const INVOICE_STATUSES = ["pending", "paid", "failed", "cancelled"] as const;

const invoiceSchema = new Schema(
  {
    ...tenantField(),
    invoiceNo: { type: String, required: true, unique: true },
    planKey: { type: String, enum: PLAN_KEYS, required: true },
    amountInPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: INVOICE_STATUSES, default: "pending", index: true },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // Razorpay identifiers. The payment id is unique-when-present so replaying a
    // webhook cannot mark two invoices paid from one payment.
    razorpayOrderId: String,
    razorpayPaymentId: String,

    paidAt: Date,
  },
  { timestamps: true }
);

invoiceSchema.plugin(tenantPlugin);
invoiceSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }
);

export const Invoice = model("Invoice", invoiceSchema);
