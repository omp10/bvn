import { invoiceNumber } from "../../lib/codes.js";
import { notFound } from "../../lib/errors.js";
import { Invoice } from "../../models/invoice.model.js";
import { Plan } from "../../models/plan.model.js";
import { School } from "../../models/school.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

type PlanKey = "trial" | "monthly" | "quarterly" | "yearly";

/**
 * Puts a school on a plan and raises the invoice for the period.
 *
 * Renewals extend from the current expiry rather than from today, so a school
 * that renews early does not lose the days it already paid for.
 */
export async function activatePlan(
  // Structural, not a Mongoose document type — this also accepts a .lean() read.
  school: { _id: unknown; subscription?: { expiresAt?: Date | null } | null },
  planKey: PlanKey
) {
  const plan = await Plan.findOne({ key: planKey, active: true });
  if (!plan) throw notFound(`plan ${planKey} is not available`);

  const now = new Date();
  const expiresAt = school.subscription?.expiresAt;
  const currentExpiry = expiresAt ? new Date(expiresAt) : null;
  const periodStart = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const periodEnd = new Date(periodStart.getTime() + plan.durationDays * 86_400_000);

  const doc = await School.findByIdAndUpdate(
    school._id,
    {
      status: planKey === "trial" ? "trial" : "active",
      "subscription.plan": planKey,
      "subscription.startedAt": now,
      "subscription.expiresAt": periodEnd,
      "subscription.reminderSentAt": null,
    },
    { new: true }
  );

  // A free trial is not billed, so no invoice is raised for it.
  const invoice =
    plan.priceInPaise > 0
      ? await Invoice.create({
          schoolId: school._id,
          invoiceNo: invoiceNumber(now),
          planKey,
          amountInPaise: plan.priceInPaise,
          periodStart,
          periodEnd,
          status: "pending",
        })
      : null;

  return { school: doc, invoice };
}

/** Marks an invoice paid exactly once, even if a webhook is delivered twice. */
export async function markInvoicePaid(invoiceId: unknown, razorpayPaymentId?: string) {
  const invoice = await allSchools(
    Invoice.findOneAndUpdate(
      { _id: invoiceId, status: "pending" },
      { status: "paid", paidAt: new Date(), ...(razorpayPaymentId ? { razorpayPaymentId } : {}) },
      { new: true }
    )
  );

  // Already paid: return the existing record rather than erroring, so a retried
  // webhook is a no-op instead of a support ticket.
  if (!invoice) return allSchools(Invoice.findById(invoiceId));

  await School.findByIdAndUpdate(invoice.schoolId, {
    status: "active",
    "subscription.expiresAt": invoice.periodEnd,
  });

  return invoice;
}

/**
 * Schools whose subscription lapses within `days`. Drives the renewal reminder
 * and, once past zero, the expiry sweep.
 */
export const expiringSchools = (days: number) =>
  School.find({
    status: { $in: ["active", "trial"] },
    "subscription.expiresAt": { $lte: new Date(Date.now() + days * 86_400_000) },
  });
