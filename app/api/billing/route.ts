/**
 * Company billing.
 *   GET  → { state, plans }                      any member
 *   POST { action: "checkout", plan }            OWNER → { url } to Stripe Checkout
 *   POST { action: "portal" }                    OWNER → { url } to Stripe's customer portal
 * No plan changes happen here; the Stripe webhook is the only writer.
 */
import { ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { PLANS, billingState, createCheckout, createPortal, normalizePlan, type Plan } from "@/lib/core/billing";
import { logAuditAction } from "@/lib/core/audit";
import { isAgency } from "@/lib/core/agency";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    const agency = await isAgency(tenant.tenantId);
    return Response.json({ state: await billingState(tenant.tenantId), plans: Object.values(PLANS).filter((p) => (p.id === "agency") === agency) });
  } catch (error) { console.error("billing.get_failed", error); return Response.json({ error: "Unable to load billing." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Only an owner can change billing." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { action?: string; plan?: string };
    const origin = new URL(request.url).origin;
    try {
      if (body.action === "checkout") {
        const plan: Plan = normalizePlan(body.plan);
        if (!body.plan || !(plan in PLANS) || normalizePlan(body.plan) !== String(body.plan).toLowerCase()) return Response.json({ error: "Pick a plan." }, { status: 400 });
        if (plan === "agency" && !(await isAgency(tenant.tenantId))) return Response.json({ error: "Turn on agency mode first." }, { status: 409 });
        const url = await createCheckout(tenant.tenantId, tenant.email, plan, origin);
        await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "UPDATE", "subscription", tenant.tenantId, { resourceName: `Billing checkout started: ${plan}` }).catch(() => undefined);
        return Response.json({ url });
      }
      if (body.action === "portal") return Response.json({ url: await createPortal(tenant.tenantId, origin) });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Stripe request failed." }, { status: 409 }); }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { console.error("billing.post_failed", error); return Response.json({ error: "Billing action failed." }, { status: 500 }); }
}
