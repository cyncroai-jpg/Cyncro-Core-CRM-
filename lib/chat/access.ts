/**
 * Team Chat access, per company. Every chat route resolves the signed-in
 * member's tenant here and then only touches channels that belong to it.
 * Tenant OWNER/ADMIN act as chat owners (can see and manage every channel).
 */
import { coreDb, getTenantContext } from "@/lib/core/db";

export type ChatUser = { tenantId: string; email: string; role: "OWNER" | "MEMBER"; displayName: string };

export async function requireChat(request: Request): Promise<ChatUser | Response> {
  const tenant = await getTenantContext(request);
  if (!tenant) return Response.json({ error: "Sign in to a company workspace to use Team Chat." }, { status: 401 });
  const member = await coreDb().prepare("SELECT display_name FROM tenant_members WHERE tenant_id=? AND email=? AND active=1").bind(tenant.tenantId, tenant.email).first<{ display_name: string | null }>();
  return { tenantId: tenant.tenantId, email: tenant.email, role: tenant.role === "OWNER" || tenant.role === "ADMIN" ? "OWNER" : "MEMBER", displayName: member?.display_name || tenant.email.split("@")[0] };
}

/** The channel row if it belongs to this company, else null. */
export async function tenantChannel(user: ChatUser, channelId: string, includeArchived = false) {
  return coreDb().prepare(`SELECT id, type, archived FROM team_chat_channels WHERE id=? AND tenant_id=?${includeArchived ? "" : " AND archived=0"}`).bind(channelId, user.tenantId).first<{ id: string; type: string; archived: number }>();
}

/** True when the user may read the channel: public in their company, a member, or a company owner/admin. */
export async function canAccessChannel(user: ChatUser, channelId: string, includeArchived = false): Promise<boolean> {
  const channel = await tenantChannel(user, channelId, includeArchived);
  if (!channel) return false;
  if (channel.type === "PUBLIC" || user.role === "OWNER") return true;
  const membership = await coreDb().prepare("SELECT 1 FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first();
  return Boolean(membership);
}

/** Active teammates in this company, for @mentions and channel membership. */
export async function tenantTeam(tenantId: string) {
  const { results } = await coreDb().prepare("SELECT email, display_name, role FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY display_name").bind(tenantId).all<{ email: string; display_name: string; role: string }>();
  return results;
}
