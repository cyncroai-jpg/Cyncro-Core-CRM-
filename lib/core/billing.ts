/**
 * Billing & Subscription Management via Stripe
 *
 * Plans:
 * - starter: $29/month, 3 seats, basic features
 * - pro: $99/month, 10 seats, all features + API access
 * - enterprise: $299/month, unlimited seats, custom integrations
 */

import { coreDb } from "@/lib/core/db";

export type Plan = "starter" | "pro" | "enterprise";
export type BillingStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING";

export interface PlanDetails {
  id: Plan;
  name: string;
  price: number; // monthly in cents
  seats: number;
  features: {
    sequences: boolean;
    workflows: boolean;
    forms: boolean;
    api: boolean;
    callRecording: boolean;
    websiteTracking: boolean;
    customDomain: boolean;
  };
}

export const PLANS: Record<Plan, PlanDetails> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 2900, // $29
    seats: 3,
    features: {
      sequences: true,
      workflows: false,
      forms: true,
      api: false,
      callRecording: false,
      websiteTracking: false,
      customDomain: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 9900, // $99
    seats: 10,
    features: {
      sequences: true,
      workflows: true,
      forms: true,
      api: true,
      callRecording: false,
      websiteTracking: true,
      customDomain: true,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 29900, // $299
    seats: 999,
    features: {
      sequences: true,
      workflows: true,
      forms: true,
      api: true,
      callRecording: true,
      websiteTracking: true,
      customDomain: true,
    },
  },
};

/** Check if tenant has access to a feature */
export async function hasFeatureAccess(
  tenantId: string,
  feature: keyof PlanDetails["features"],
): Promise<boolean> {
  const db = coreDb();

  const tenant = await db
    .prepare("SELECT plan FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<{ plan: Plan }>();

  if (!tenant) return false;

  const planDetails = PLANS[tenant.plan] || PLANS.starter;
  return planDetails.features[feature] || false;
}

/** Get active subscription */
export async function getSubscription(
  tenantId: string,
): Promise<any | null> {
  const db = coreDb();

  return db
    .prepare(
      `SELECT * FROM tenant_subscriptions
       WHERE tenant_id = ? AND status = 'ACTIVE'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first();
}

/** Create or update subscription (called by Stripe webhook) */
export async function upsertSubscription(
  tenantId: string,
  stripeSubscriptionId: string,
  plan: Plan,
  status: BillingStatus,
  currentPeriodEnd: string,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Check if subscription exists
  const existing = await db
    .prepare(
      "SELECT id FROM tenant_subscriptions WHERE tenant_id = ? AND stripe_subscription_id = ?",
    )
    .bind(tenantId, stripeSubscriptionId)
    .first();

  const planDetails = PLANS[plan];

  if (existing) {
    // Update
    await db
      .prepare(
        `UPDATE tenant_subscriptions
         SET plan = ?, status = ?, current_period_end = ?, updated_at = ?
         WHERE tenant_id = ? AND stripe_subscription_id = ?`,
      )
      .bind(plan, status, currentPeriodEnd, now, tenantId, stripeSubscriptionId)
      .run();
  } else {
    // Create
    await db
      .prepare(
        `INSERT INTO tenant_subscriptions
         (id, tenant_id, stripe_subscription_id, plan, status, current_period_end, amount_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tenantId,
        stripeSubscriptionId,
        plan,
        status,
        currentPeriodEnd,
        planDetails.price,
        now,
        now,
      )
      .run();
  }

  // Update tenant plan
  await db
    .prepare("UPDATE tenants SET plan = ?, updated_at = ? WHERE id = ?")
    .bind(plan, now, tenantId)
    .run();
}

/** Handle Stripe webhook event */
export async function handleStripeWebhook(event: any): Promise<void> {
  const eventType = event.type;

  switch (eventType) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object);
      break;

    case "invoice.payment_failed":
      await handleInvoiceFailed(event.data.object);
      break;

    default:
      // Ignore other events
      break;
  }
}

async function handleSubscriptionUpdate(subscription: any): Promise<void> {
  const db = coreDb();

  // Find tenant by stripe_customer_id
  const tenant = await db
    .prepare("SELECT id FROM tenants WHERE stripe_customer_id = ?")
    .bind(subscription.customer)
    .first<{ id: string }>();

  if (!tenant) return;

  const items = subscription.items.data[0];
  const plan = items.price.nickname || "starter"; // nickname should be "starter", "pro", or "enterprise"

  const status = mapStripeStatus(subscription.status);

  await upsertSubscription(
    tenant.id,
    subscription.id,
    plan as Plan,
    status,
    new Date(subscription.current_period_end * 1000).toISOString(),
  );
}

async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const tenant = await db
    .prepare("SELECT id FROM tenants WHERE stripe_customer_id = ?")
    .bind(subscription.customer)
    .first<{ id: string }>();

  if (!tenant) return;

  // Mark subscription as cancelled
  await db
    .prepare(
      "UPDATE tenant_subscriptions SET status = 'CANCELLED', updated_at = ? WHERE stripe_subscription_id = ?",
    )
    .bind(now, subscription.id)
    .run();

  // Downgrade tenant to starter
  await db
    .prepare("UPDATE tenants SET plan = 'starter', updated_at = ? WHERE id = ?")
    .bind(now, tenant.id)
    .run();
}

async function handleInvoicePaid(invoice: any): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Update subscription with invoice ID
  await db
    .prepare(
      "UPDATE tenant_subscriptions SET stripe_invoice_id = ?, updated_at = ? WHERE stripe_subscription_id = ?",
    )
    .bind(invoice.subscription, now, invoice.subscription)
    .run();
}

async function handleInvoiceFailed(invoice: any): Promise<void> {
  // Mark subscription as past due
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      "UPDATE tenant_subscriptions SET status = 'PAST_DUE', updated_at = ? WHERE stripe_subscription_id = ?",
    )
    .bind(now, invoice.subscription)
    .run();
}

function mapStripeStatus(status: string): BillingStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "trialing":
      return "TRIALING";
    default:
      return "ACTIVE";
  }
}
