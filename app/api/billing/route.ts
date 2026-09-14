/**
 * Billing & Subscription Management
 *
 * GET /api/billing/subscription — get current subscription
 * POST /api/billing/create-checkout-session — create Stripe checkout
 * GET /api/billing/plans — list available plans
 * POST /api/billing/manage-subscription — open customer portal
 */

import {
  coreDb,
  ensureCoreSchema,
  getTenantContext,
  cleanText,
} from "@/lib/core/db";
import {
  PLANS,
  getSubscription,
  hasFeatureAccess,
} from "@/lib/core/billing";

// Note: In production, use env vars and real Stripe keys
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);

    if (url.searchParams.get("plans") === "1") {
      // GET /api/billing/plans — list plans
      return Response.json({
        plans: Object.values(PLANS),
      });
    }

    // GET /api/billing/subscription — get current subscription
    const subscription = await getSubscription(tenant.tenantId);
    const db = coreDb();
    const tenantData = await db
      .prepare("SELECT plan, seats FROM tenants WHERE id = ?")
      .bind(tenant.tenantId)
      .first<{ plan: string; seats: number }>();

    return Response.json({
      subscription: subscription || null,
      currentPlan: tenantData?.plan || "starter",
      planDetails: PLANS[tenantData?.plan as keyof typeof PLANS] || PLANS.starter,
      features: {
        sequences: await hasFeatureAccess(tenant.tenantId, "sequences"),
        workflows: await hasFeatureAccess(tenant.tenantId, "workflows"),
        forms: await hasFeatureAccess(tenant.tenantId, "forms"),
        api: await hasFeatureAccess(tenant.tenantId, "api"),
        callRecording: await hasFeatureAccess(tenant.tenantId, "callRecording"),
        websiteTracking: await hasFeatureAccess(tenant.tenantId, "websiteTracking"),
        customDomain: await hasFeatureAccess(tenant.tenantId, "customDomain"),
      },
    });
  } catch (error) {
    console.error("billing.get.failed", error);
    return Response.json(
      { error: "Unable to load billing info" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 50);

    if (action === "create_checkout_session") {
      // Create Stripe checkout session
      const plan = cleanText(body.plan, 50);

      if (!Object.keys(PLANS).includes(plan)) {
        return Response.json({ error: "Invalid plan" }, { status: 400 });
      }

      // In production: call Stripe API
      // For now, return placeholder
      return Response.json({
        checkoutUrl: `https://checkout.stripe.com/pay/cs_test_${Math.random().toString(36).slice(2)}`,
        message: "Redirect to Stripe checkout (not implemented in demo)",
      }, { status: 200 });
    }

    if (action === "manage_subscription") {
      // Open Stripe customer portal
      const db = coreDb();
      const tenantData = await db
        .prepare("SELECT stripe_customer_id FROM tenants WHERE id = ?")
        .bind(tenant.tenantId)
        .first<{ stripe_customer_id: string }>();

      if (!tenantData?.stripe_customer_id) {
        return Response.json({
          error: "No active subscription found",
        }, { status: 404 });
      }

      // In production: call Stripe Portal API
      return Response.json({
        portalUrl: `https://billing.stripe.com/p/login/test_${Math.random().toString(36).slice(2)}`,
        message: "Redirect to Stripe customer portal (not implemented in demo)",
      }, { status: 200 });
    }

    if (action === "upgrade_plan") {
      const newPlan = cleanText(body.plan, 50);

      if (!Object.keys(PLANS).includes(newPlan)) {
        return Response.json({ error: "Invalid plan" }, { status: 400 });
      }

      // In production: would update Stripe subscription
      // For now, just update local plan
      const db = coreDb();
      const now = new Date().toISOString();
      await db
        .prepare("UPDATE tenants SET plan = ?, updated_at = ? WHERE id = ?")
        .bind(newPlan, now, tenant.tenantId)
        .run();

      return Response.json({
        success: true,
        message: `Upgraded to ${newPlan} plan`,
        newPlan,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("billing.action.failed", error);
    return Response.json({ error: "Unable to complete action" }, { status: 500 });
  }
}
