/**
 * Company billing through Stripe: plans, 14-day trial, seat limits, Checkout,
 * Customer Portal and the signed webhook that keeps D1 in sync.
 *
 * Nothing here pretends. When STRIPE_SECRET_KEY is missing, every call reports
 * "not connected" and no plan can change. Plans map to Stripe prices through
 * STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH / STRIPE_PRICE_SCALE.
 */
import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";

type CfEnv = Record<string, string | undefined>;
const cf = () => env as unknown as CfEnv;
const now = () => new Date().toISOString();

export type Plan = "starter" | "growth" | "scale";
export type BillingStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "COMPLIMENTARY";
export const TRIAL_DAYS = 14;

export const PLANS: Record<Plan, { id: Plan; name: string; priceCents: number; seats: number; aiCalls: number; blurb: string; perks: string[] }> = {
  starter: { id: "starter", name: "Starter", priceCents: 4900, seats: 3, aiCalls: 300, blurb: "One team getting organized.", perks: ["CRM, calendar, booking links", "Forms and landing pages", "Automations", "Cyncro AI, 300 actions a month", "3 seats"] },
  growth: { id: "growth", name: "Growth", priceCents: 14900, seats: 10, aiCalls: 1500, blurb: "A sales or service team that lives in it.", perks: ["Everything in Starter", "Team chat and dispatch", "Connected apps for Cyncro AI", "Cyncro AI, 1,500 actions a month", "10 seats"] },
  scale: { id: "scale", name: "Scale", priceCents: 39900, seats: 25, aiCalls: 5000, blurb: "Several teams, serious volume.", perks: ["Everything in Growth", "Priority support", "Data export any time", "Cyncro AI, 5,000 actions a month", "25 seats"] },
};
const LEGACY: Record<string, Plan> = { pro: "growth", enterprise: "scale" };
export function normalizePlan(p: string | null | undefined): Plan { const k = String(p || "starter").toLowerCase(); return (PLANS as Record<string, unknown>)[k] ? (k as Plan) : LEGACY[k] || "starter"; }

export function stripeConfig() {
  const e = cf(); const pe = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const get = (k: string) => e[k] || pe[k] || "";
  const prices: Record<Plan, string> = { starter: get("STRIPE_PRICE_STARTER"), growth: get("STRIPE_PRICE_GROWTH"), scale: get("STRIPE_PRICE_SCALE") };
  return { secret: get("STRIPE_SECRET_KEY"), webhookSecret: get("STRIPE_WEBHOOK_SECRET"), apiBase: (get("STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/$/, ""), prices, configured: Boolean(get("STRIPE_SECRET_KEY")), pricesConfigured: Object.values(prices).every(Boolean) };
}
export function planForPrice(priceId: string | undefined, nickname?: string | null, metaPlan?: string | null): Plan {
  const { prices } = stripeConfig();
  for (const p of Object.keys(prices) as Plan[]) if (priceId && prices[p] === priceId) return p;
  return normalizePlan(metaPlan || nickname);
}

async function stripe<T>(path: string, form?: URLSearchParams, method = "POST"): Promise<T> {
  const { secret, apiBase } = stripeConfig();
  const r = await fetch(`${apiBase}/v1/${path}`, { method, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(d.error?.message || `Stripe ${path} failed (${r.status})`);
  return d;
}

export type BillingState = {
  configured: boolean; pricesConfigured: boolean; plan: Plan; status: BillingStatus; seats: number; seatsUsed: number;
  trialEndsAt: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; hasCustomer: boolean; daysLeft: number | null; writable: boolean;
};

/** Everything the app needs to know about a company's subscription, computed from D1 (webhook-fed). */
export async function billingState(tenantId: string): Promise<BillingState> {
  const db = coreDb(); const cfg = stripeConfig();
  const t = await db.prepare("SELECT plan, seats, stripe_customer_id, trial_ends_at, created_at FROM tenants WHERE id=?").bind(tenantId).first<{ plan: string; seats: number; stripe_customer_id: string | null; trial_ends_at: string | null; created_at: string }>();
  const sub = await db.prepare("SELECT plan, status, current_period_end, cancel_at_period_end FROM tenant_subscriptions WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1").bind(tenantId).first<{ plan: string; status: string; current_period_end: string | null; cancel_at_period_end: number | null }>();
  const used = await db.prepare("SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id=? AND active=1").bind(tenantId).first<{ n: number }>();
  const first = await db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").first<{ id: string }>();
  const plan = normalizePlan(sub && ["ACTIVE", "PAST_DUE", "TRIALING"].includes(sub.status) ? sub.plan : t?.plan);
  let status: BillingStatus;
  if (first?.id === tenantId) status = "COMPLIMENTARY"; // the platform owner's own company
  else if (sub && (sub.status === "ACTIVE" || sub.status === "TRIALING")) status = "ACTIVE";
  else if (sub && sub.status === "PAST_DUE") status = "PAST_DUE";
  else if (sub && sub.status === "CANCELLED" && (!t?.trial_ends_at || new Date(t.trial_ends_at) < new Date())) status = "CANCELLED";
  else if (!t?.trial_ends_at) status = "COMPLIMENTARY"; // companies created before billing existed
  else status = new Date(t.trial_ends_at) > new Date() ? "TRIALING" : "EXPIRED";
  const trialEndsAt = t?.trial_ends_at || null;
  const daysLeft = status === "TRIALING" && trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;
  // Writes stay open unless the trial ran out or the subscription ended, and only once Stripe is actually connected (otherwise nobody could pay).
  const writable = !cfg.configured || !["EXPIRED", "CANCELLED"].includes(status);
  return { configured: cfg.configured, pricesConfigured: cfg.pricesConfigured, plan, status, seats: Number(t?.seats || PLANS[plan].seats), seatsUsed: Number(used?.n || 0), trialEndsAt, periodEnd: sub?.current_period_end || null, cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end), hasCustomer: Boolean(t?.stripe_customer_id), daysLeft, writable };
}

/** Seat check used by invites: false when the plan is full. */
export async function seatAvailable(tenantId: string): Promise<{ ok: boolean; seats: number; used: number }> {
  const s = await billingState(tenantId);
  return { ok: s.seatsUsed < s.seats, seats: s.seats, used: s.seatsUsed };
}

async function ensureCustomer(tenantId: string, email: string): Promise<string> {
  const db = coreDb();
  const t = await db.prepare("SELECT name, stripe_customer_id FROM tenants WHERE id=?").bind(tenantId).first<{ name: string; stripe_customer_id: string | null }>();
  if (t?.stripe_customer_id) return t.stripe_customer_id;
  const c = await stripe<{ id: string }>("customers", new URLSearchParams({ email, name: t?.name || "Cyncro company", "metadata[tenant_id]": tenantId }));
  await db.prepare("UPDATE tenants SET stripe_customer_id=?, updated_at=? WHERE id=?").bind(c.id, now(), tenantId).run();
  return c.id;
}

/** Stripe Checkout for a plan; returns the URL to send the owner to. */
export async function createCheckout(tenantId: string, email: string, plan: Plan, origin: string): Promise<string> {
  const cfg = stripeConfig();
  if (!cfg.configured) throw new Error("Stripe isn't connected on this deployment yet.");
  if (!cfg.prices[plan]) throw new Error(`No Stripe price is set for the ${PLANS[plan].name} plan (STRIPE_PRICE_${plan.toUpperCase()}).`);
  const customer = await ensureCustomer(tenantId, email);
  const form = new URLSearchParams({ mode: "subscription", customer, "line_items[0][price]": cfg.prices[plan], "line_items[0][quantity]": "1", success_url: `${origin}/#crm/team-access?billing=success`, cancel_url: `${origin}/#crm/team-access?billing=cancelled`, "subscription_data[metadata][tenant_id]": tenantId, "subscription_data[metadata][plan]": plan, "metadata[tenant_id]": tenantId, allow_promotion_codes: "true" });
  const s = await stripe<{ url: string }>("checkout/sessions", form);
  return s.url;
}

/** Stripe Customer Portal: change plan, card, cancel, download invoices. */
export async function createPortal(tenantId: string, origin: string): Promise<string> {
  const cfg = stripeConfig();
  if (!cfg.configured) throw new Error("Stripe isn't connected on this deployment yet.");
  const t = await coreDb().prepare("SELECT stripe_customer_id FROM tenants WHERE id=?").bind(tenantId).first<{ stripe_customer_id: string | null }>();
  if (!t?.stripe_customer_id) throw new Error("This company hasn't subscribed yet.");
  const s = await stripe<{ url: string }>("billing_portal/sessions", new URLSearchParams({ customer: t.stripe_customer_id, return_url: `${origin}/#crm/team-access` }));
  return s.url;
}

// ── Webhook ──
const enc = new TextEncoder();
async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Verifies a Stripe-Signature header (t=...,v1=...) against the raw body, 5-minute tolerance. */
export async function verifyStripeSignature(body: string, header: string | null, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t); const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => s.length === expected.length && s === expected);
}

type StripeSub = { id: string; customer: string; status: string; cancel_at_period_end?: boolean; current_period_start?: number; current_period_end?: number; items: { data: { price: { id: string; nickname?: string | null; unit_amount?: number | null }; current_period_end?: number; current_period_start?: number }[] }; metadata?: Record<string, string> };

async function tenantForCustomer(customer: string, meta?: Record<string, string>): Promise<string | null> {
  const db = coreDb();
  const t = await db.prepare("SELECT id FROM tenants WHERE stripe_customer_id=?").bind(customer).first<{ id: string }>();
  if (t) return t.id;
  if (meta?.tenant_id) { await db.prepare("UPDATE tenants SET stripe_customer_id=?, updated_at=? WHERE id=?").bind(customer, now(), meta.tenant_id).run(); return meta.tenant_id; }
  return null;
}
function mapStatus(s: string): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" {
  if (s === "active") return "ACTIVE"; if (s === "trialing") return "TRIALING";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "PAST_DUE";
  return "CANCELLED";
}
async function applySubscription(sub: StripeSub) {
  const db = coreDb(); const tenantId = await tenantForCustomer(sub.customer, sub.metadata); if (!tenantId) return;
  const item = sub.items?.data?.[0]; const plan = planForPrice(item?.price?.id, item?.price?.nickname, sub.metadata?.plan);
  const status = mapStatus(sub.status);
  const end = sub.current_period_end || item?.current_period_end; const start = sub.current_period_start || item?.current_period_start;
  const existing = await db.prepare("SELECT id FROM tenant_subscriptions WHERE stripe_subscription_id=?").bind(sub.id).first<{ id: string }>();
  const vals = [plan, status, start ? new Date(start * 1000).toISOString() : null, end ? new Date(end * 1000).toISOString() : null, item?.price?.unit_amount ?? PLANS[plan].priceCents, sub.cancel_at_period_end ? 1 : 0, now()];
  if (existing) await db.prepare("UPDATE tenant_subscriptions SET plan=?, status=?, current_period_start=?, current_period_end=?, amount_cents=?, cancel_at_period_end=?, updated_at=? WHERE id=?").bind(...vals, existing.id).run();
  else await db.prepare("INSERT INTO tenant_subscriptions (id, tenant_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, amount_cents, cancel_at_period_end, updated_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), tenantId, sub.id, ...vals, now()).run();
  if (status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE") await db.prepare("UPDATE tenants SET plan=?, seats=?, updated_at=? WHERE id=?").bind(plan, PLANS[plan].seats, now(), tenantId).run();
  else await db.prepare("UPDATE tenants SET plan='starter', seats=?, updated_at=? WHERE id=?").bind(PLANS.starter.seats, now(), tenantId).run();
}

/** Applies one verified Stripe event. Returns what it did, for logs and tests. */
export async function handleStripeEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }): Promise<string> {
  const db = coreDb(); const obj = event.data.object as Record<string, unknown>;
  switch (event.type) {
    case "checkout.session.completed": {
      const customer = String(obj.customer || ""); const meta = (obj.metadata || {}) as Record<string, string>;
      if (customer) await tenantForCustomer(customer, meta);
      if (obj.subscription) { const sub = await stripe<StripeSub>(`subscriptions/${String(obj.subscription)}`, undefined, "GET"); await applySubscription(sub); return "subscription synced from checkout"; }
      return "customer linked";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(obj as unknown as StripeSub); return `subscription ${event.type.split(".").pop()}`;
    case "invoice.payment_failed": {
      const subId = String(obj.subscription || ""); if (!subId) return "ignored";
      await db.prepare("UPDATE tenant_subscriptions SET status='PAST_DUE', updated_at=? WHERE stripe_subscription_id=?").bind(now(), subId).run(); return "marked past due";
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const subId = String(obj.subscription || ""); if (!subId) return "ignored";
      await db.prepare("UPDATE tenant_subscriptions SET status=CASE WHEN status='PAST_DUE' THEN 'ACTIVE' ELSE status END, stripe_invoice_id=?, updated_at=? WHERE stripe_subscription_id=?").bind(String(obj.id || ""), now(), subId).run(); return "payment recorded";
    }
    default: return "ignored";
  }
}

/** Feature gates kept for the older modules. Everything in the product is on every plan; plans differ by seats and AI volume. */
export async function hasFeatureAccess(tenantId: string, _feature: "sequences" | "workflows" | "forms" | "api" | "callRecording" | "websiteTracking" | "customDomain"): Promise<boolean> {
  const s = await billingState(tenantId);
  return s.writable;
}
