import { env } from "cloudflare:workers";
import { coreDb, ensureCoreSchema } from "@/lib/core/db";

export async function GET(request: Request) {
  await ensureCoreSchema();
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const saved = state ? await coreDb().prepare("SELECT * FROM calendar_oauth_states WHERE state=?").bind(state).first<Record<string, unknown>>() : null;
  if (!code || !saved || new Date(String(saved.expires_at)) < new Date()) return Response.redirect(`${url.origin}/?connection=google-error#crm`, 302);
  const config = env as unknown as Record<string, string | undefined>;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.GOOGLE_CLIENT_ID || "", client_secret: config.GOOGLE_CLIENT_SECRET || "", redirect_uri: `${url.origin}/api/integrations/google-calendar/callback`, grant_type: "authorization_code" }) });
  if (!response.ok) return Response.redirect(`${url.origin}/?connection=google-error#crm`, 302);
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
  const now = new Date().toISOString(), expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  await coreDb().prepare(`INSERT INTO calendar_oauth_connections (owner,provider,account_email,calendar_id,access_token,refresh_token,expires_at,created_at,updated_at) VALUES (?,'GOOGLE',?,'primary',?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET account_email=excluded.account_email,access_token=excluded.access_token,refresh_token=COALESCE(excluded.refresh_token,calendar_oauth_connections.refresh_token),expires_at=excluded.expires_at,updated_at=excluded.updated_at`).bind(String(saved.owner), profile.email || null, token.access_token, token.refresh_token || null, expiresAt, now, now).run();
  await coreDb().prepare("DELETE FROM calendar_oauth_states WHERE state=?").bind(state).run();
  return Response.redirect(`${url.origin}/?connection=google-connected#crm`, 302);
}
