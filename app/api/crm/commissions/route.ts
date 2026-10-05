/**
 * Commissions desk. One place for who earns what, month by month.
 *   GET  ?month=YYYY-MM     → people (with plans + month totals), entries for the month,
 *                             closed-won deals, rate presets, 12-month history
 *   GET  ?members=1         → teammates only (for assignment pickers)
 *   POST { action:"entry" } → log revenue/cost for a person in a month; payout computed
 *   POST { action:"plan" }  → set a teammate's default rate, basis (PROFIT|REVENUE), residual
 *   PATCH { id, updates }   → edit/approve/pay one entry;  PATCH { action:"payMonth", month, memberEmail }
 *   DELETE ?id
 * Owners and admins manage everyone. Everyone else sees only their own rows, read-only.
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";

const now = () => new Date().toISOString();
const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const validMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const cents = (v: unknown) => Math.max(0, Math.round(Number(v || 0) * 100));
const bps = (v: unknown) => Math.min(10000, Math.max(0, Math.round(Number(v || 0) * 100)));
const payoutFor = (revenue: number, cost: number, rateBps: number, basis: string) => Math.max(0, Math.round(((basis === "REVENUE" ? revenue : revenue - cost) * rateBps) / 10000));
const canManage = (role: string) => role === "OWNER" || role === "ADMIN";

type Member = { email: string; display_name: string; role: string };
async function members(tenantId: string): Promise<Member[]> {
  const { results } = await coreDb().prepare("SELECT email, display_name, role FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, display_name").bind(tenantId).all<Member>();
  return results;
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    const db = coreDb(); const url = new URL(request.url);
    const team = await members(tenant.tenantId);
    if (url.searchParams.get("members") === "1") return Response.json({ members: team });
    const manage = canManage(tenant.role);
    const month = validMonth(url.searchParams.get("month") || "") ? String(url.searchParams.get("month")) : monthOf();
    const me = tenant.email.toLowerCase();
    const scope = manage ? "" : " AND lower(member_email)=?"; const scopeArgs = manage ? [] : [me];
    const plans = (await db.prepare("SELECT member_email, default_rate_bps, basis, residual_flat_cents, notes FROM crm_commission_plans WHERE tenant_id=?").bind(tenant.tenantId).all<{ member_email: string; default_rate_bps: number; basis: string; residual_flat_cents: number; notes: string | null }>()).results;
    const entries = (await db.prepare(`SELECT * FROM crm_commission_entries WHERE tenant_id=? AND month=?${scope} ORDER BY created_at DESC`).bind(tenant.tenantId, month, ...scopeArgs).all<Record<string, unknown>>()).results;
    const history = (await db.prepare(`SELECT month, SUM(revenue_cents) AS revenue_cents, SUM(revenue_cents-cost_cents) AS profit_cents, SUM(payout_cents) AS payout_cents, SUM(CASE WHEN status='PAID' THEN payout_cents ELSE 0 END) AS paid_cents FROM crm_commission_entries WHERE tenant_id=?${scope} GROUP BY month ORDER BY month DESC LIMIT 12`).bind(tenant.tenantId, ...scopeArgs).all<Record<string, number | string>>()).results.reverse();
    const dealScope = manage ? "" : " AND lower(o.assigned_rep)=?";
    const deals = (await db.prepare(`SELECT o.id, o.name, o.stage, o.value_cents, o.cost_cents, o.collected_cents, o.payment_status, o.commission_rate_bps, o.commission_status, o.assigned_rep, o.service_kind, o.updated_at, a.name AS account_name,
        (SELECT COUNT(*) FROM crm_commission_entries e WHERE e.deal_id=o.id) AS logged
        FROM crm_opportunities o JOIN crm_accounts a ON a.id=o.account_id WHERE o.tenant_id=? AND (o.stage='CLOSED WON' OR o.collected_cents>0)${dealScope} ORDER BY o.updated_at DESC LIMIT 200`).bind(tenant.tenantId, ...(manage ? [] : [me])).all<Record<string, unknown>>()).results;
    const rules = (await db.prepare("SELECT id, service_name, applies_to, percentage_bps FROM crm_commission_rules WHERE tenant_id=? AND active=1 ORDER BY sort_order, created_at").bind(tenant.tenantId).all<Record<string, unknown>>()).results;
    const people = (manage ? team : team.filter((m) => m.email.toLowerCase() === me)).map((m) => {
      const plan = plans.find((p) => p.member_email.toLowerCase() === m.email.toLowerCase());
      const mine = entries.filter((e) => String(e.member_email).toLowerCase() === m.email.toLowerCase());
      const sum = (f: (e: Record<string, unknown>) => number) => mine.reduce((a, e) => a + f(e), 0);
      return { email: m.email, display_name: m.display_name, role: m.role,
        plan: { rate: (plan?.default_rate_bps ?? 2000) / 100, basis: plan?.basis || "PROFIT", residualFlat: (plan?.residual_flat_cents || 0) / 100, notes: plan?.notes || "", set: Boolean(plan) },
        month: { entries: mine.length, revenue_cents: sum((e) => Number(e.revenue_cents)), cost_cents: sum((e) => Number(e.cost_cents)), profit_cents: sum((e) => Number(e.revenue_cents) - Number(e.cost_cents)), payout_cents: sum((e) => Number(e.payout_cents)), paid_cents: sum((e) => (e.status === "PAID" ? Number(e.payout_cents) : 0)), pending_cents: sum((e) => (e.status === "PAID" ? 0 : Number(e.payout_cents))) } };
    });
    return Response.json({ month, canManage: manage, people, entries, deals, rules, history });
  } catch (error) { console.error("commissions.get_failed", error); return Response.json({ error: "Unable to load commissions." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can change commissions." }, { status: 403 });
    const db = coreDb(); const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const team = await members(tenant.tenantId);
    const memberEmail = cleanText(body.memberEmail, 254).toLowerCase();
    const member = team.find((m) => m.email.toLowerCase() === memberEmail);
    if (!member) return Response.json({ error: "Pick a teammate from this company." }, { status: 400 });
    if (body.action === "plan") {
      const rate = bps(body.rate); const basis = String(body.basis || "PROFIT").toUpperCase() === "REVENUE" ? "REVENUE" : "PROFIT";
      await db.prepare("INSERT INTO crm_commission_plans (id, tenant_id, member_email, default_rate_bps, basis, residual_flat_cents, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id, member_email) DO UPDATE SET default_rate_bps=excluded.default_rate_bps, basis=excluded.basis, residual_flat_cents=excluded.residual_flat_cents, notes=excluded.notes, updated_at=excluded.updated_at")
        .bind(crypto.randomUUID(), tenant.tenantId, memberEmail, rate, basis, cents(body.residualFlat), cleanText(body.notes, 500) || null, now(), now()).run();
      return Response.json({ saved: true, rate: rate / 100, basis });
    }
    if (body.action === "entry") {
      const month = validMonth(String(body.month || "")) ? String(body.month) : monthOf();
      const label = cleanText(body.label, 200); if (!label) return Response.json({ error: "Say what this commission is for." }, { status: 400 });
      const plan = await db.prepare("SELECT default_rate_bps, basis FROM crm_commission_plans WHERE tenant_id=? AND member_email=?").bind(tenant.tenantId, memberEmail).first<{ default_rate_bps: number; basis: string }>();
      const revenue = cents(body.revenue), cost = cents(body.cost);
      const rate = body.rate !== undefined && body.rate !== "" ? bps(body.rate) : plan?.default_rate_bps ?? 2000;
      const basis = body.basis ? (String(body.basis).toUpperCase() === "REVENUE" ? "REVENUE" : "PROFIT") : plan?.basis || "PROFIT";
      const dealId = cleanText(body.dealId, 80) || null;
      if (dealId) { const d = await db.prepare("SELECT id FROM crm_opportunities WHERE id=? AND tenant_id=?").bind(dealId, tenant.tenantId).first(); if (!d) return Response.json({ error: "That deal isn't in this company." }, { status: 404 }); }
      const id = crypto.randomUUID(); const payout = payoutFor(revenue, cost, rate, basis);
      await db.prepare("INSERT INTO crm_commission_entries (id, tenant_id, month, member_email, label, deal_id, revenue_cents, cost_cents, rate_bps, basis, payout_cents, status, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,?,?,?)")
        .bind(id, tenant.tenantId, month, memberEmail, label, dealId, revenue, cost, rate, basis, payout, cleanText(body.notes, 1000) || null, tenant.email, now(), now()).run();
      if (dealId) await db.prepare("UPDATE crm_opportunities SET assigned_rep=COALESCE(assigned_rep, ?), commission_rate_bps=?, updated_at=? WHERE id=? AND tenant_id=?").bind(memberEmail, rate, now(), dealId, tenant.tenantId).run();
      return Response.json({ id, payout_cents: payout, rate: rate / 100, basis }, { status: 201 });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { console.error("commissions.post_failed", error); return Response.json({ error: "Unable to save." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can change commissions." }, { status: 403 });
    const db = coreDb(); const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "payMonth") {
      const month = String(body.month || ""); const email = cleanText(body.memberEmail, 254).toLowerCase();
      if (!validMonth(month) || !email) return Response.json({ error: "Month and teammate are required." }, { status: 400 });
      const r = await db.prepare("UPDATE crm_commission_entries SET status='PAID', paid_at=?, updated_at=? WHERE tenant_id=? AND month=? AND lower(member_email)=? AND status<>'PAID'").bind(now(), now(), tenant.tenantId, month, email).run();
      return Response.json({ paid: r.meta?.changes ?? 0 });
    }
    const id = cleanText(body.id, 80); const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const row = await db.prepare("SELECT * FROM crm_commission_entries WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "Entry not found." }, { status: 404 });
    const next = {
      member_email: updates.memberEmail !== undefined ? cleanText(updates.memberEmail, 254).toLowerCase() : String(row.member_email),
      label: updates.label !== undefined ? cleanText(updates.label, 200) || String(row.label) : String(row.label),
      month: updates.month !== undefined && validMonth(String(updates.month)) ? String(updates.month) : String(row.month),
      revenue_cents: updates.revenue !== undefined ? cents(updates.revenue) : Number(row.revenue_cents),
      cost_cents: updates.cost !== undefined ? cents(updates.cost) : Number(row.cost_cents),
      rate_bps: updates.rate !== undefined ? bps(updates.rate) : Number(row.rate_bps),
      basis: updates.basis !== undefined ? (String(updates.basis).toUpperCase() === "REVENUE" ? "REVENUE" : "PROFIT") : String(row.basis),
      status: updates.status !== undefined ? (["PENDING", "APPROVED", "PAID", "HOLD", "CLAWBACK"].includes(String(updates.status).toUpperCase()) ? String(updates.status).toUpperCase() : String(row.status)) : String(row.status),
      notes: updates.notes !== undefined ? cleanText(updates.notes, 1000) || null : (row.notes as string | null),
    };
    if (updates.memberEmail !== undefined) { const team = await members(tenant.tenantId); if (!team.some((m) => m.email.toLowerCase() === next.member_email)) return Response.json({ error: "Pick a teammate from this company." }, { status: 400 }); }
    const payout = next.status === "CLAWBACK" ? 0 : payoutFor(next.revenue_cents, next.cost_cents, next.rate_bps, next.basis);
    const paidAt = next.status === "PAID" ? (row.paid_at as string | null) || now() : null;
    await db.prepare("UPDATE crm_commission_entries SET member_email=?, label=?, month=?, revenue_cents=?, cost_cents=?, rate_bps=?, basis=?, payout_cents=?, status=?, paid_at=?, notes=?, updated_at=? WHERE id=? AND tenant_id=?")
      .bind(next.member_email, next.label, next.month, next.revenue_cents, next.cost_cents, next.rate_bps, next.basis, payout, next.status, paidAt, next.notes, now(), id, tenant.tenantId).run();
    return Response.json({ saved: true, payout_cents: payout, status: next.status });
  } catch (error) { console.error("commissions.patch_failed", error); return Response.json({ error: "Unable to update." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can change commissions." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    const r = await coreDb().prepare("DELETE FROM crm_commission_entries WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).run();
    return Response.json({ deleted: r.meta?.changes ?? 0 });
  } catch (error) { console.error("commissions.delete_failed", error); return Response.json({ error: "Unable to delete." }, { status: 500 }); }
}
