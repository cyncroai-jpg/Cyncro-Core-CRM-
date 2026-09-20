/**
 * Tenant-scoped auth guards for the multi-tenant CRM/Prospecting/Calendar
 * surface. This is deliberately separate from hasModuleAccess/hasCrmAction
 * (lib/core/db.ts), which check the old single, global workspace_members
 * table — those stay in place for the parts of the app not yet retrofitted
 * for multi-tenancy. Everything under this helper resolves the request's
 * real company (tenant) via getTenantContext() and every query a route
 * makes after that must be scoped to tenant.tenantId.
 */
import { getTenantContext, type TenantContext } from "@/lib/core/db";

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
