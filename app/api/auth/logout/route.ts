import { ensureCoreSchema } from "@/lib/core/db";
import { getTokenFromRequest, deleteSession, clearSessionCookie } from "@/lib/core/auth";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const token = getTokenFromRequest(request);
    if (token) await deleteSession(token);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearSessionCookie() } },
    );
  } catch (error) {
    console.error("auth.logout_failed", error);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  }
}
