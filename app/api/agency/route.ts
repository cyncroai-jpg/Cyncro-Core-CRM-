/**
 * Agency console.
 *   GET                        → { isAgency, clients[], branding, canManage }
 *   POST { action:"enable", brandName?, whiteLabel? }       owner: turn this company into an agency
 *   POST { action:"create", clients:[{name, ownerEmail, ownerName}], snapshotFrom? }  bulk create
 *   POST { action:"enter", tenantId }                        open a client as support admin (audited)
 *   POST { action:"snapshot", from, to:[tenantId] }          push one company's setup into clients
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { clientsOf, createClient, effectiveBranding, grantSupportAccess, isAgency, snapshotApply, snapshotExport } from "@/lib/core/agency";
import { companySettings, parseSettings } from "@/lib/core/companySettings";
import { logAuditAction } from "@/lib/core/audit";
import { syncAgencyQuantity } from "@/lib/core/billing";

const canManage = (role: string) => role === "OWNER" || role === "ADMIN";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    const agency = await isAgency(tenant.tenantId);
    const settings = await companySettings(tenant.tenantId);
    return Response.json({ isAgency: agency, canManage: canManage(tenant.role), role: tenant.role, clients: agency && canManage(tenant.role) ? await clientsOf(tenant.tenantId) : [], branding: { brandName: settings.brandName, logoUrl: settings.logoUrl, whiteLabel: settings.whiteLabel }, effective: await effectiveBranding(tenant.tenantId) });
  } catch (error) { console.error("agency.get_failed", error); return Response.json({ error: "Unable to load the agency console." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can manage the agency." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = coreDb(); const origin = new URL(request.url).origin;
    const me = { email: tenant.email, userId: tenant.userId, displayName: (await db.prepare("SELECT display_name FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?)").bind(tenant.tenantId, tenant.email).first<{ display_name: string }>())?.display_name || tenant.email };
    if (body.action === "enable") {
      if (tenant.role !== "OWNER") return Response.json({ error: "Only an owner can turn on agency mode." }, { status: 403 });
      const current = await companySettings(tenant.tenantId);
      const next = parseSettings({ ...current, agency: true, brandName: body.brandName !== undefined ? String(body.brandName) : current.brandName, whiteLabel: body.whiteLabel !== undefined ? Boolean(body.whiteLabel) : current.whiteLabel });
      await db.prepare("UPDATE tenants SET settings_json=?, updated_at=? WHERE id=?").bind(JSON.stringify(next), new Date().toISOString(), tenant.tenantId).run();
      return Response.json({ enabled: true, settings: next });
    }
    if (!(await isAgency(tenant.tenantId))) return Response.json({ error: "Turn on agency mode first." }, { status: 409 });
    if (body.action === "create") {
      const rows = Array.isArray(body.clients) ? (body.clients as Record<string, unknown>[]) : [];
      if (!rows.length || rows.length > 500) return Response.json({ error: "Send between 1 and 500 clients." }, { status: 400 });
      const snapshotFrom = cleanText(body.snapshotFrom, 80);
      const snap = snapshotFrom ? await snapshotExport(snapshotFrom === "self" ? tenant.tenantId : snapshotFrom) : null;
      if (snapshotFrom && snapshotFrom !== "self") { const ok = await db.prepare("SELECT id FROM tenants WHERE id=? AND (id=? OR parent_tenant_id=?)").bind(snapshotFrom, tenant.tenantId, tenant.tenantId).first(); if (!ok) return Response.json({ error: "Snapshot source must be this agency or one of its clients." }, { status: 403 }); }
      const created: { name: string; tenantId: string; ownerEmail: string; inviteUrl: string | null; snapshot?: Record<string, number> }[] = []; const failed: { name: string; error: string }[] = [];
      for (const r of rows) {
        try {
          const c = await createClient(tenant.tenantId, { name: String(r.name || ""), ownerEmail: String(r.ownerEmail || r.email || ""), ownerName: String(r.ownerName || r.owner || "") }, me, origin);
          const out: (typeof created)[number] = { name: String(r.name), ...c };
          if (snap) out.snapshot = await snapshotApply(c.tenantId, snap, tenant.email);
          created.push(out);
        } catch (e) { failed.push({ name: String(r.name || "?"), error: e instanceof Error ? e.message : "failed" }); }
      }
      await syncAgencyQuantity(tenant.tenantId).catch(() => undefined);
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "user", tenant.tenantId, { resourceName: `Agency created ${created.length} client compan${created.length === 1 ? "y" : "ies"}` }).catch(() => undefined);
      return Response.json({ created, failed }, { status: created.length ? 201 : 400 });
    }
    if (body.action === "enter") {
      const childId = cleanText(body.tenantId, 80);
      const child = await db.prepare("SELECT id, name FROM tenants WHERE id=? AND parent_tenant_id=?").bind(childId, tenant.tenantId).first<{ id: string; name: string }>();
      if (!child) return Response.json({ error: "That company isn't one of your clients." }, { status: 404 });
      await grantSupportAccess(child.id, me);
      await db.prepare("UPDATE auth_users SET default_tenant_id=?, updated_at=? WHERE lower(email)=lower(?)").bind(child.id, new Date().toISOString(), tenant.email).run();
      await logAuditAction(child.id, tenant.userId, tenant.email, "READ", "user", child.id, { resourceName: `Agency support access by ${me.displayName}` }).catch(() => undefined);
      return Response.json({ entered: child.id, name: child.name });
    }
    if (body.action === "snapshot") {
      const from = cleanText(body.from, 80) || tenant.tenantId; const to = Array.isArray(body.to) ? (body.to as string[]).map((x) => cleanText(x, 80)).filter(Boolean) : [];
      const okFrom = from === tenant.tenantId || (await db.prepare("SELECT id FROM tenants WHERE id=? AND parent_tenant_id=?").bind(from, tenant.tenantId).first());
      if (!okFrom) return Response.json({ error: "Snapshot source must be this agency or one of its clients." }, { status: 403 });
      const snap = await snapshotExport(from); const results: Record<string, Record<string, number>> = {};
      for (const id of to) { const ok = await db.prepare("SELECT id FROM tenants WHERE id=? AND parent_tenant_id=?").bind(id, tenant.tenantId).first(); if (ok) results[id] = await snapshotApply(id, snap, tenant.email); }
      return Response.json({ applied: results, items: Object.fromEntries(Object.entries(snap.tables).map(([k, v]) => [k, v.length])) });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { console.error("agency.post_failed", error); return Response.json({ error: error instanceof Error ? error.message : "Agency action failed." }, { status: 500 }); }
}
