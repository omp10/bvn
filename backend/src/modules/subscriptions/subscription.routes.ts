import { Router } from "express";
import { createOrder, razorpayConfigured, verifyPaymentSignature, verifyWebhookSignature } from "../../lib/razorpay.js";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, notFound, unauthorized } from "../../lib/errors.js";
import { idParam, paginationQuery, validate, z } from "../../lib/validate.js";
import { requireContext } from "../../lib/context.js";
import { Invoice, INVOICE_STATUSES } from "../../models/invoice.model.js";
import { Plan } from "../../models/plan.model.js";
import { School, PLAN_KEYS } from "../../models/school.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { activatePlan, expiringSchools, markInvoicePaid } from "./subscription.service.js";

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate, requireRole("super_admin"));

/* ── Plan master ────────────────────────────────────────────────────── */
subscriptionRouter.get(
  "/plans",
  handler(async (_req, res) => res.json(await Plan.find().sort({ durationDays: 1 }).lean()))
);

subscriptionRouter.patch(
  "/plans/:id",
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(1).optional(),
      durationDays: z.number().int().min(1).optional(),
      priceInPaise: z.number().int().min(0).optional(),
      maxBuses: z.number().int().min(0).optional(),
      maxStudents: z.number().int().min(0).optional(),
      features: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) throw notFound("plan not found");
    await audit(req, "plan.update", "Plan", plan._id);
    res.json(plan);
  })
);

/* ── Assigning and renewing ─────────────────────────────────────────── */
subscriptionRouter.post(
  "/schools/:id/subscribe",
  validate({ params: idParam, body: z.object({ plan: z.enum(PLAN_KEYS) }) }),
  handler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");

    const result = await activatePlan(school, req.body.plan);
    await audit(req, "subscription.activate", "School", school._id, undefined, { plan: req.body.plan });
    res.json(result);
  })
);

/* ── Invoices ───────────────────────────────────────────────────────── */
subscriptionRouter.get(
  "/invoices",
  validate({
    query: paginationQuery.extend({
      status: z.enum(INVOICE_STATUSES).optional(),
      schoolId: z.string().optional(),
    }),
  }),
  handler(async (req, res) => {
    const { page, limit, status, schoolId } = req.query as never as {
      page: number; limit: number; status?: string; schoolId?: string;
    };
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (schoolId) filter.schoolId = schoolId;

    const [items, total] = await Promise.all([
      allSchools(Invoice.find(filter))
        .populate("schoolId", "name code")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      allSchools(Invoice.find(filter)).countDocuments(),
    ]);
    res.json({ items, total, page, limit });
  })
);

/** Manual settlement — bank transfers and cheques exist. */
subscriptionRouter.post(
  "/invoices/:id/mark-paid",
  validate({ params: idParam, body: z.object({ reference: z.string().optional() }) }),
  handler(async (req, res) => {
    const invoice = await markInvoicePaid(req.params.id, req.body.reference);
    if (!invoice) throw notFound("invoice not found");
    await audit(req, "invoice.markPaid", "Invoice", invoice._id);
    res.json(invoice);
  })
);

subscriptionRouter.get(
  "/expiring",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  handler(async (req, res) => {
    const days = Number((req.query as never as { days: number }).days);
    res.json(await expiringSchools(days).select("name code status subscription").lean());
  })
);

/**
 * Razorpay webhook. Mounted separately in app.ts because it is unauthenticated
 * and must run before the JSON body parser rewrites the raw payload — the
 * signature is computed over the exact bytes Razorpay sent.
 *
 * ponytail: verifies the signature and settles the invoice; no SDK involved.
 * Bring in the Razorpay SDK only when order creation moves server-side.
 */
export const razorpayWebhookRouter = Router();

razorpayWebhookRouter.post(
  "/razorpay",
  handler(async (req, res) => {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    verifyWebhookSignature(raw, req.get("x-razorpay-signature") ?? "");

    const event = JSON.parse(raw.toString("utf8") || "{}");
    if (event.event !== "payment.captured") return res.json({ ok: true, ignored: event.event });

    const payment = event.payload?.payment?.entity ?? {};
    const invoiceId = payment.notes?.invoiceId;
    if (!invoiceId) return res.json({ ok: true, ignored: "no invoiceId in notes" });

    // markInvoicePaid is idempotent, so a redelivered webhook changes nothing.
    await markInvoicePaid(invoiceId, payment.id);
    res.json({ ok: true });
  })
);

/** Read-only view of their own billing for school admins. */
export const schoolBillingRouter = Router();
schoolBillingRouter.use(authenticate, requireRole("school_admin"));

/**
 * Starts a checkout for one of this school's own pending invoices.
 *
 * The amount comes from the invoice on the server — never from the browser —
 * so a tampered request cannot pay ₹1 for a yearly plan.
 */
schoolBillingRouter.post(
  "/invoices/:id/pay",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id, status: "pending" });
    if (!invoice) throw notFound("no pending invoice with that id");

    const school = await School.findById(requireContext().schoolId).select("name").lean();
    const order = await createOrder({
      amountInPaise: invoice.amountInPaise,
      invoiceId: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      schoolName: school?.name ?? "School",
    });

    invoice.razorpayOrderId = order.id;
    await invoice.save();

    res.json({
      orderId: order.id,
      amountInPaise: invoice.amountInPaise,
      currency: order.currency,
      keyId: order.keyId,
      invoiceNo: invoice.invoiceNo,
      schoolName: school?.name,
    });
  })
);

/**
 * The browser's callback after checkout. Belt and braces alongside the webhook:
 * whichever arrives first settles the invoice, and markInvoicePaid is idempotent
 * so the second one changes nothing.
 */
schoolBillingRouter.post(
  "/invoices/:id/confirm",
  validate({
    params: idParam,
    body: z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    }),
  }),
  handler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id });
    if (!invoice) throw notFound("invoice not found");
    // The signature covers the order id, so it must be the one we issued.
    if (invoice.razorpayOrderId !== req.body.razorpay_order_id)
      throw badRequest("that payment belongs to a different order");

    verifyPaymentSignature({
      orderId: req.body.razorpay_order_id,
      paymentId: req.body.razorpay_payment_id,
      signature: req.body.razorpay_signature,
    });

    const settled = await markInvoicePaid(invoice._id, req.body.razorpay_payment_id);
    res.json(settled);
  })
);

schoolBillingRouter.get(
  "/",
  handler(async (_req, res) => {
    const { schoolId } = requireContext();
    const school = await School.findById(schoolId).select("status subscription").lean();
    const invoices = await Invoice.find().sort({ createdAt: -1 }).limit(24).lean();
    res.json({
      subscription: school?.subscription,
      status: school?.status,
      invoices,
      // The screen hides the Pay button rather than offering one that errors.
      paymentsEnabled: razorpayConfigured(),
    });
  })
);
