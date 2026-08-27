import { env } from "cloudflare:workers";
import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  await ensureCoreSchema();
  const config = env as unknown as Record<string, string | undefined>;
  const origin = new URL(request.url).origin;
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return Response.redirect(`${origin}/?connection=google-required#crm`, 302);
  const state = crypto.randomUUID(); const now = new Date();
  await coreDb().prepare("INSERT INTO calendar_oauth_states (state,owner,expires_at,created_at) VALUES (?,?,?,?)").bind(state, requestUser(request), new Date(now.getTime() + 10 * 60_000).toISOString(), now.toISOString()).run();
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/integrations/google-calendar/callback`, response_type: "code", scope: "openid email https://www.googleapis.com/auth/calendar.events", access_type: "offline", prompt: "consent", state }).toString();
  return Response.redirect(authorize.toString(), 302);
}
