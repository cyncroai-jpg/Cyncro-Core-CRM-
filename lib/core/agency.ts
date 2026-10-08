/**
 * Agency layer: one company (the agency) manages many client companies.
 *   - tenants.parent_tenant_id links a client to its agency
 *   - agency owners/admins see every client's health, create them in bulk,
 *     open any client as a support admin (audited), and push snapshots
 *   - clients inherit the agency's branding when they have none of their own
 *   - billing rolls up to the agency (see billingState)
 */
import { coreDb } from "@/lib/core/db";
import { companySettings, type CompanySettings } from "@/lib/core/companySettings";
import { hashPassword } from "@/lib/core/auth";

const now = () => new Date().toISOString();
const token = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8);

export async function parentOf(tenantId: string): Promise<string | null> {
  const r = await coreDb().prepare("SELECT parent_tenant_id FROM tenants WHERE id=?").bind(tenantId).first<{ parent_tenant_id: string | null }>();
  return r?.parent_tenant_id || null;
}
export async function isAgency(tenantId: string): Promise<boolean> {
  const s = await companySettings(tenantId);
  if (s.agency) return true;
  const c = await coreDb().prepare("SELECT COUNT(*) AS n FROM tenants WHERE parent_tenant_id=?").bind(tenantId).first<{ n: number }>();
  return Number(c?.n || 0) > 0;
}

export type ClientHealth = {
  id: string; name: string; slug: string; plan: string; active: number; created_at: string; owner_email: string | null; owner_name: string | null; owner_pending: boolean;
  users: number; contacts: number; deals: number; bookings_week: number; overdue_invoices: number; last_activity: string | null;
};
export async function clientsOf(parentId: string): Promise<ClientHealth[]> {
  const db = coreDb();
  const { results } = await db.prepare(`
    SELECT t.id, t.name, t.slug, t.plan, t.active, t.created_at,
      (SELECT email FROM tenant_members WHERE tenant_id=t.id AND role='OWNER' ORDER BY created_at LIMIT 1) AS owner_email,
      (SELECT display_name FROM tenant_members WHERE tenant_id=t.id AND role='OWNER' ORDER BY created_at LIMIT 1) AS owner_name,
      (SELECT COUNT(*) FROM tenant_members WHERE tenant_id=t.id AND active=1) AS users,
      (SELECT COUNT(*) FROM crm_contacts WHERE tenant_id=t.id) AS contacts,
      (SELECT COUNT(*) FROM crm_opportunities WHERE tenant_id=t.id) AS deals,
      (SELECT COUNT(*) FROM calendar_bookings WHERE tenant_id=t.id AND starts_at BETWEEN ? AND ?) AS bookings_week,
      (SELECT COUNT(*) FROM crm_invoices WHERE tenant_id=t.id AND status='SENT' AND due_date IS NOT NULL AND due_date < ?) AS overdue_invoices,
      (SELECT MAX(updated_at) FROM crm_contacts WHERE tenant_id=t.id) AS last_activity
    FROM tenants t WHERE t.parent_tenant_id=? ORDER BY t.created_at DESC`).bind(now(), new Date(Date.now() + 7 * 86_400_000).toISOString(), now().slice(0, 10), parentId).all<ClientHealth & { owner_email: string | null }>();
  const out: ClientHealth[] = [];
  for (const r of results) {
    const u = r.owner_email ? await db.prepare("SELECT active, invite_token FROM auth_users WHERE lower(email)=lower(?)").bind(r.owner_email).first<{ active: number; invite_token: string | null }>() : null;
    out.push({ ...r, owner_pending: Boolean(u && !u.active) });
  }
  return out;
}

/** Make sure the agency person can open a client: an ADMIN membership flagged as agency support. */
export async function grantSupportAccess(childId: string, agencyUser: { email: string; userId: string; displayName: string }) {
  const db = coreDb();
  const existing = await db.prepare("SELECT id, role FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?)").bind(childId, agencyUser.email).first<{ id: string; role: string }>();
  if (existing) { if (existing.role !== "OWNER") await db.prepare("UPDATE tenant_members SET role='ADMIN', active=1, permissions=?, updated_at=? WHERE id=?").bind(JSON.stringify({ via_agency: 1 }), now(), existing.id).run(); return; }
  await db.prepare("INSERT INTO tenant_members (id, tenant_id, user_id, email, display_name, role, permissions, active, created_at, updated_at) VALUES (?,?,?,?,?,'ADMIN',?,1,?,?)")
    .bind(crypto.randomUUID(), childId, agencyUser.userId, agencyUser.email, agencyUser.displayName, JSON.stringify({ via_agency: 1 }), now(), now()).run();
}

export type NewClient = { name: string; ownerEmail: string; ownerName?: string };
/** Creates a client company under the agency, invites its owner, and gives the agency person support access. */
export async function createClient(parentId: string, c: NewClient, by: { email: string; userId: string; displayName: string }, origin: string): Promise<{ tenantId: string; inviteUrl: string | null; ownerEmail: string }> {
  const db = coreDb(); const t = now();
  const name = c.name.trim().slice(0, 160); const email = c.ownerEmail.trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Each client needs a name and a valid owner email (${c.name || "?"}).`);
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";
  if (await db.prepare("SELECT id FROM tenants WHERE slug=?").bind(slug).first()) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  const tenantId = crypto.randomUUID();
  await db.prepare("INSERT INTO tenants (id, name, slug, plan, seats, active, parent_tenant_id, created_at, updated_at) VALUES (?,?,?,'starter',10,1,?,?,?)").bind(tenantId, name, slug, parentId, t, t).run();
  // Owner account: existing user gets membership; new one gets an invite.
  let user = await db.prepare("SELECT id, display_name, active FROM auth_users WHERE lower(email)=lower(?)").bind(email).first<{ id: string; display_name: string; active: number }>();
  let inviteUrl: string | null = null;
  if (!user) {
    const tok = token(); const id = crypto.randomUUID();
    await db.prepare("INSERT INTO auth_users (id, email, password_hash, display_name, role, active, invite_token, invite_expires_at, default_tenant_id, created_at, updated_at) VALUES (?,?,?,?,'MEMBER',0,?,?,?,?,?)")
      .bind(id, email, await hashPassword(crypto.randomUUID()), (c.ownerName || email.split("@")[0]).slice(0, 160), tok, new Date(Date.now() + 14 * 86_400_000).toISOString(), tenantId, t, t).run();
    user = { id, display_name: c.ownerName || email.split("@")[0], active: 0 };
    inviteUrl = `${origin}/login?invite=${tok}`;
  } else if (!user.active) {
    const tok = token();
    await db.prepare("UPDATE auth_users SET invite_token=?, invite_expires_at=?, default_tenant_id=COALESCE(default_tenant_id, ?), updated_at=? WHERE id=?").bind(tok, new Date(Date.now() + 14 * 86_400_000).toISOString(), tenantId, t, user.id).run();
    inviteUrl = `${origin}/login?invite=${tok}`;
  }
  await db.prepare("INSERT INTO tenant_members (id, tenant_id, user_id, email, display_name, role, active, created_at, updated_at) VALUES (?,?,?,?,?,'OWNER',1,?,?)").bind(crypto.randomUUID(), tenantId, user.id, email, (c.ownerName || user.display_name || email).slice(0, 160), t, t).run();
  if (by.email.toLowerCase() !== email) await grantSupportAccess(tenantId, by);
  return { tenantId, inviteUrl, ownerEmail: email };
}

// ── Snapshots: copy the setup of one company into others ──
const SNAPSHOT_TABLES = ["crm_pipelines", "crm_pipeline_stages", "calendar_event_types", "crm_forms", "studio_pages", "automation_workflows", "crm_commission_rules"] as const;
export type Snapshot = { from: string; takenAt: string; tables: Record<string, Record<string, unknown>[]> };
export async function snapshotExport(tenantId: string): Promise<Snapshot> {
  const db = coreDb(); const tables: Snapshot["tables"] = {};
  for (const t of SNAPSHOT_TABLES) tables[t] = (await db.prepare(`SELECT * FROM ${t} WHERE tenant_id=?`).bind(tenantId).all<Record<string, unknown>>()).results;
  return { from: tenantId, takenAt: now(), tables };
}
const SKIP = new Set(["id", "tenant_id", "created_at", "updated_at", "public_token", "signing_token", "views", "submissions", "runs", "last_run_at"]);
/** Inserts copies with fresh ids, remapped pipeline links, unique slugs. Returns counts per table. */
export async function snapshotApply(targetId: string, snap: Snapshot, by: string): Promise<Record<string, number>> {
  const db = coreDb(); const t = now(); const counts: Record<string, number> = {}; const pipelineMap = new Map<string, string>();
  const insert = async (table: string, row: Record<string, unknown>, extra: Record<string, unknown>) => {
    const cols: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(row)) if (!SKIP.has(k)) { cols.push(k); vals.push(extra[k] !== undefined ? extra[k] : v); }
    for (const [k, v] of Object.entries(extra)) if (!cols.includes(k)) { cols.push(k); vals.push(v); }
    cols.push("id", "tenant_id", "created_at", "updated_at"); vals.push(extra.id, targetId, t, t);
    await db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...vals).run();
    counts[table] = (counts[table] || 0) + 1;
  };
  const uniqueSlug = async (table: string, slug: string) => { let s = slug; let n = 0; while (await db.prepare(`SELECT id FROM ${table} WHERE slug=?`).bind(s).first()) s = `${slug}-${++n}`; return s; };
  for (const row of snap.tables.crm_pipelines || []) { const id = crypto.randomUUID(); pipelineMap.set(String(row.id), id); await insert("crm_pipelines", row, { id }); }
  for (const row of snap.tables.crm_pipeline_stages || []) { const pid = pipelineMap.get(String(row.pipeline_id)); if (!pid) continue; await insert("crm_pipeline_stages", row, { id: crypto.randomUUID(), pipeline_id: pid }); }
  for (const row of snap.tables.calendar_event_types || []) await insert("calendar_event_types", row, { id: crypto.randomUUID(), slug: await uniqueSlug("calendar_event_types", String(row.slug)) });
  for (const row of snap.tables.crm_forms || []) await insert("crm_forms", row, { id: crypto.randomUUID(), public_token: token(), created_by: by });
  for (const row of snap.tables.studio_pages || []) await insert("studio_pages", row, { id: crypto.randomUUID(), slug: await uniqueSlug("studio_pages", String(row.slug)), status: "DRAFT" });
  for (const row of snap.tables.automation_workflows || []) await insert("automation_workflows", row, { id: crypto.randomUUID(), active: 0 });
  for (const row of snap.tables.crm_commission_rules || []) await insert("crm_commission_rules", row, { id: crypto.randomUUID() });
  return counts;
}

/** Branding a client shows: its own, else its agency's. */
export async function effectiveBranding(tenantId: string): Promise<{ brandName: string; logoUrl: string; brandColor: string; whiteLabel: boolean; agencyId: string | null }> {
  const own = await companySettings(tenantId);
  const parent = await parentOf(tenantId);
  if (!parent) return { brandName: own.brandName, logoUrl: own.logoUrl, brandColor: own.brandColor, whiteLabel: false, agencyId: null };
  const ag: CompanySettings = await companySettings(parent);
  return { brandName: own.brandName || ag.brandName, logoUrl: own.logoUrl || ag.logoUrl, brandColor: own.brandColor !== "#a91f39" ? own.brandColor : ag.brandColor, whiteLabel: ag.whiteLabel, agencyId: parent };
}
