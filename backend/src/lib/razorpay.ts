import { createHmac, timingSafeEqual } from "node:crypto";
import { badRequest, unauthorized } from "./errors.js";

/**
 * Razorpay over plain REST.
 *
 * The SDK wraps two HTTP calls and an HMAC, none of which is worth a dependency
 * and a version to keep current. Keys are read at call time rather than at
 * import so the server still boots — and every other feature still works —
 * without payments configured.
 */
const API = "https://api.razorpay.com/v1";

const credentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, auth: Buffer.from(`${keyId}:${keySecret}`).toString("base64") };
};

export const razorpayConfigured = () => credentials() !== null;

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

/**
 * Creates an order for an invoice.
 *
 * `receipt` carries our invoice number and `notes.invoiceId` our id, so the
 * webhook can settle the right invoice without trusting anything the browser
 * sends back.
 */
export async function createOrder(input: {
  amountInPaise: number;
  invoiceId: string;
  invoiceNo: string;
  schoolName: string;
}): Promise<RazorpayOrder & { keyId: string }> {
  const creds = credentials();
  if (!creds) throw badRequest("payments are not configured on this server");

  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Basic ${creds.auth}` },
    body: JSON.stringify({
      amount: input.amountInPaise, // Razorpay speaks paise, same as we do
      currency: "INR",
      receipt: input.invoiceNo,
      notes: { invoiceId: input.invoiceId, school: input.schoolName },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) {
    throw badRequest(body.error?.description ?? "could not create the payment order");
  }

  // keyId is public — the browser checkout needs it. keySecret never leaves here.
  return { ...(body as RazorpayOrder), keyId: creds.keyId };
}

/**
 * Verifies the handshake the browser returns after checkout.
 *
 * Signature is HMAC-SHA256 of "orderId|paymentId" with the key secret, compared
 * in constant time. Without this check anyone could POST a made-up payment id
 * and mark an invoice paid.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): void {
  const creds = credentials();
  if (!creds) throw badRequest("payments are not configured on this server");

  const expected = createHmac("sha256", creds.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  const given = Buffer.from(input.signature);
  const mine = Buffer.from(expected);
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
    throw unauthorized("payment signature did not verify");
  }
}

/** Same construction, different secret and payload — used by the webhook. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): void {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw badRequest("razorpay webhook is not configured");

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature);
  const mine = Buffer.from(expected);
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
    throw unauthorized("bad signature");
  }
}
