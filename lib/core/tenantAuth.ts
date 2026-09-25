/**
 * Tenant-scoped auth guards for the multi-tenant CRM/Prospecting/Calendar
 * surface. This is deliberately separate from hasModuleAccess/hasCrmAction
 * (lib/core/db.ts), which check the old single, global workspace_members
 * table — those stay in place for the parts of the app not yet retrofitted
 * for multi-tenancy. Everything under this helper resolves the request's
 * real company (tenant) via getTenantContext() and every query a route
 * makes after that must be scoped to tenant.tenantId.
 */
import { coreDb, getTenantContext, type TenantContext } from "@/lib/core/db";

export type TenantAction = "view" | "create" | "edit" | "delete" | "export";

const ROLE_RANK: Record<string, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, USER: 1, VIEWER: 0 };

/** Resolves the signed-in user's tenant, or a 401 Response if they aren't signed into one. */
export async function requireTenant(request: Request): Promise<TenantContext | Response> {
  const tenant = await getTenantContext(request);
  if (!tenant) return Response.json({ error: "Sign in to a company workspace to continue." }, { status: 401 });
  return tenant;
}

export function canTenantAct(tenant: TenantContext, action: TenantAction): boolean {
  const rank = ROLE_RANK[tenant.role] ?? 0;
  if (action === "view") return rank >= 0; // every active member, including VIEWER
  if (action === "delete") return rank >= 3; // ADMIN or OWNER
  return rank >= 1; // USER, MANAGER, ADMIN, OWNER can create/edit/export
}

/** Resolves the tenant AND checks the member's role allows this action, or returns the right error Response. */
export async function requireTenantAction(request: Request, action: TenantAction): Promise<TenantContext | Response> {
  const result = await requireTenant(request);
  if (result instanceof Response) return result;
  if (!canTenantAct(result, action)) return Response.json({ error: "Your role in this workspace doesn't allow that." }, { status: 403 });
  return result;
}

/**
 * Public booking access. Shared booking links (/?event=slug#book) are opened by
 * customers who are not signed in, so these routes resolve the company from the
 * event type itself when there is no session. A signed-in member still gets
 * their own tenant context (and is denied for other companies' event types).
 * The returned `email` for a visitor is the company owner's, used only as the
 * fallback host / created_by on the booking.
 */
export async function tenantForBooking(request: Request, lookup: { eventTypeId?: string; slug?: string }): Promise<TenantContext | Response> {
  const signedIn = await getTenantContext(request);
  if (signedIn) return signedIn;
  const db = coreDb();
  const row = lookup.eventTypeId
    ? await db.prepare("SELECT tenant_id FROM calendar_event_types WHERE id=? AND active=1").bind(lookup.eventTypeId).first<{ tenant_id: string | null }>()
    : lookup.slug
      ? await db.prepare("SELECT tenant_id FROM calendar_event_types WHERE slug=? AND active=1").bind(lookup.slug).first<{ tenant_id: string | null }>()
      : null;
  if (!row?.tenant_id) return Response.json({ error: "This booking link is not available." }, { status: 404 });
  const owner = await db.prepare("SELECT email, user_id FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, created_at ASC LIMIT 1").bind(row.tenant_id).first<{ email: string; user_id: string }>();
  return { tenantId: row.tenant_id, userId: owner?.user_id || "", email: owner?.email || "booking", role: "VIEWER" as TenantContext["role"] };
}

/**
 * Platform owner = an OWNER of the first company ever created on this
 * deployment. Used to fence off legacy single-workspace areas (the Growth
 * Intelligence suite) that are not yet company-scoped.
 */
export async function isPlatformOwner(request: Request): Promise<boolean> {
  const tenant = await getTenantContext(request);
  if (!tenant || tenant.role !== "OWNER") return false;
  const first = await coreDb().prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").first<{ id: string }>();
  return Boolean(first && first.id === tenant.tenantId);
}
