import { api } from "./api";

/**
 * Razorpay Checkout.
 *
 * The script is loaded on demand rather than in index.html: most people who use
 * this app never see a payment screen, and a third-party script on every page
 * load is a cost — and a tracking surface — for no benefit.
 */
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

let loader: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  // One shared promise, so two clicks do not inject two script tags.
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null; // let a later attempt retry
      reject(new Error("Could not reach the payment provider. Check your connection."));
    };
    document.body.appendChild(script);
  });

  return loader;
}

type OrderResponse = {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
  invoiceNo: string;
  schoolName?: string;
};

/**
 * Opens checkout for one invoice and settles it on success.
 *
 * The amount and order both come from the server — nothing about the price is
 * decided here. The signature returned by checkout is verified server-side
 * before the invoice is marked paid, so a doctored callback achieves nothing.
 */
export async function payInvoice(invoiceId: string): Promise<void> {
  const order = await api<OrderResponse>(`/school/billing/invoices/${invoiceId}/pay`, { body: {} });
  await loadCheckout();

  if (!window.Razorpay) throw new Error("Payment provider failed to load.");

  await new Promise<void>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountInPaise,
      currency: order.currency,
      name: "BalVahini",
      description: `Subscription ${order.invoiceNo}`,
      theme: { color: "#1155a5" },
      handler: (response: Record<string, string>) => {
        api(`/school/billing/invoices/${invoiceId}/confirm`, { body: response })
          .then(() => resolve())
          .catch(reject);
      },
      modal: {
        // Closing the window is a normal thing to do, not an error — the invoice
        // simply stays pending, and the webhook still settles a late payment.
        ondismiss: () => reject(new Error("Payment cancelled.")),
      },
    });

    checkout.open();
  });
}
