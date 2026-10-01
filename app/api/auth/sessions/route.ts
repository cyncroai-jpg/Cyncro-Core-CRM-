/** Where you're signed in: list every session for the current user, sign one (or all others) out. */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { getTokenFromRequest, requireAuth } from "@/lib/core/auth";
import { sha256Hex } from "@/lib/core/security";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const a = await requireAuth(request); if (a instanceof Response) return a;
    const current = await sha256Hex(getTokenFromRequest(request));
    const { results } = await coreDb().prepare("SELECT token, device, ip, created_at, last_seen_at, expires_at FROM auth_sessions WHERE user_id=? AND expires_at>? ORDER BY COALESCE(last_seen_at, created_at) DESC").bind(a.user.id, new Date().toISOString()).all<{ token: string; device: string | null; ip: string | null; created_at: string; last_seen_at: string | null; expires_at: string }>();
    const sessions = await Promise.all(results.map(async (s) => ({ id: await sha256Hex(s.token), device: s.device || "Unknown device", ip: s.ip, created_at: s.created_at, last_seen_at: s.last_seen_at || s.created_at, current: (await sha256Hex(s.token)) === current })));
    return Response.json({ sessions });
  } catch (error) { console.error("auth.sessions.get_failed", error); return Response.json({ error: "Unable to list sessions." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const a = await requireAuth(request); if (a instanceof Response) return a;
    const url = new URL(request.url); const id = url.searchParams.get("id") || ""; const others = url.searchParams.get("others") === "1";
    const mine = getTokenFromRequest(request);
    const { results } = await coreDb().prepare("SELECT token FROM auth_sessions WHERE user_id=?").bind(a.user.id).all<{ token: string }>();
    let removed = 0;
    for (const s of results) {
      const h = await sha256Hex(s.token);
      if ((others && s.token !== mine) || (id && h === id && s.token !== mine)) { await coreDb().prepare("DELETE FROM auth_sessions WHERE token=?").bind(s.token).run(); removed++; }
    }
    return Response.json({ removed });
  } catch (error) { console.error("auth.sessions.delete_failed", error); return Response.json({ error: "Unable to sign that session out." }, { status: 500 }); }
}
