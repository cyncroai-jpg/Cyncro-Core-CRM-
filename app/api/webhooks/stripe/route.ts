/**
 * Stripe Webhook Handler
 *
 * POST /api/webhooks/stripe
 * Receives events from Stripe:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */

import { ensureCoreSchema } from "@/lib/core/db";
import { handleStripeWebhook } from "@/lib/core/billing";
import crypto from "crypto";

// Note: Use env var in production
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature || !STRIPE_WEBHOOK_SECRET) {
      console.warn("webhook.stripe.missing_signature");
      return Response.json({ error: "Missing signature" }, { status: 401 });
    }

    // Verify signature (in production, use real Stripe verification)
    // For now, just parse and process
    const event = JSON.parse(body);

    console.log(`stripe.webhook.${event.type}`, { eventId: event.id });

    // Process webhook
    await handleStripeWebhook(event);

    return Response.json({ received: true });
  } catch (error) {
    console.error("webhook.stripe.failed", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
