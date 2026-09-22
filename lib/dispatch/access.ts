import { coreDb, getTenantContext, requestUser, type TenantContext } from "@/lib/core/db";

/**
 * Dispatch access = an active member of the company (tenant) on the request.
 * Every dispatch table is scoped by tenant_id, so callers must use the
 * returned tenantId in every query. A deactivated team row still blocks.
 */
export async function requireDispatch(request: Request): Promise<TenantContext | null> {
  const tenant = await getTenantContext(request);
  if (!tenant) return null;
  const email = requestUser(request);
  if (email && email !== "platform-owner") {
    const member = await coreDb().prepare("SELECT active FROM workspace_members WHERE lower(email)=lower(?)").bind(email).first<{ active: number }>();
    if (member && !member.active) return null;
  }
  return tenant;
}

export const DISPATCH_DENIED = () => Response.json({ error: "Dispatch access required." }, { status: 403 });
