/**
 * Stripe → Cyncro. Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET
 * before touching anything; unsigned or stale deliveries are rejected.
 * Point Stripe at https://<your-domain>/api/webhooks/stripe with events:
 * checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed.
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { handleStripeEvent, stripeConfig, verifyStripeSignature } from "@/lib/core/billing";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const { webhookSecret } = stripeConfig();
    if (!webhookSecret) return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not set on this deployment." }, { status: 503 });
    const body = await request.text();
    if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), webhookSecret))) return Response.json({ error: "Bad signature." }, { status: 400 });
    const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, unknown> } };
    // Stripe retries; make the same event a no-op the second time.
    const seen = await coreDb().prepare("SELECT id FROM stripe_events WHERE id=?").bind(event.id).first();
    if (seen) return Response.json({ received: true, duplicate: true });
    const outcome = await handleStripeEvent(event);
    await coreDb().prepare("INSERT INTO stripe_events (id, type, outcome, created_at) VALUES (?,?,?,?)").bind(event.id, event.type, outcome, new Date().toISOString()).run();
    return Response.json({ received: true, outcome });
  } catch (error) { console.error("webhook.stripe_failed", error); return Response.json({ error: "Webhook processing failed." }, { status: 500 }); }
}
