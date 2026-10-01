import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { verifyPassword, createSession, sessionCookie } from "@/lib/core/auth";
import { clearLoginFailures, clientIp, deviceLabel, lockStatus, rateLimit, rateLimitResponse, recordLoginFailure, twoFactorFor, verifySecondFactor } from "@/lib/core/security";
import { companySettings } from "@/lib/core/companySettings";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as { email?: string; password?: string; challenge?: string; code?: string };
    const meta = { device: deviceLabel(request), ip: clientIp(request) };
    try { await rateLimit(`login:ip:${meta.ip}`, 30, 15 * 60_000); } catch (e) { const r = rateLimitResponse(e); if (r) return r; throw e; }

    // Second step of a two-factor sign-in
    if (body.challenge) {
      const ch = await coreDb().prepare("SELECT c.user_id, c.expires_at, u.email, u.display_name, u.role FROM auth_2fa_challenges c JOIN auth_users u ON u.id=c.user_id WHERE c.token=?").bind(String(body.challenge)).first<{ user_id: string; expires_at: string; email: string; display_name: string; role: string }>();
      if (!ch || new Date(ch.expires_at) < new Date()) return Response.json({ error: "That sign-in attempt expired. Start again." }, { status: 410 });
      const code = String(body.code || "").trim();
      if (!(await verifySecondFactor(ch.user_id, code))) {
        const f = await recordLoginFailure(ch.email);
        return Response.json({ error: f.locked ? "Too many wrong codes. This account is locked for 15 minutes." : "That code isn't right." }, { status: 401 });
      }
      await coreDb().prepare("DELETE FROM auth_2fa_challenges WHERE token=?").bind(String(body.challenge)).run();
      await clearLoginFailures(ch.email);
      const token2 = await createSession(ch.user_id, ch.email, meta);
      return Response.json({ ok: true, user: { id: ch.user_id, email: ch.email, display_name: ch.display_name, role: ch.role } }, { headers: { "Set-Cookie": sessionCookie(token2, 30 * 24 * 60 * 60) } });
    }

    const { email, password } = body;
    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }
    const lock = await lockStatus(email.trim().toLowerCase());
    if (lock.locked) return Response.json({ error: `This account is locked after too many failed sign-ins. Try again in ${Math.ceil(lock.seconds / 60)} minute${lock.seconds > 90 ? "s" : ""}.` }, { status: 423 });

    const user = await coreDb()
      .prepare("SELECT id, email, password_hash, display_name, role, active FROM auth_users WHERE lower(email)=lower(?)")
      .bind(email.trim())
      .first<{ id: string; email: string; password_hash: string; display_name: string; role: string; active: number }>();

    if (!user || !user.active) {
      // Constant-time delay to prevent user enumeration
      await new Promise((r) => setTimeout(r, 300));
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const f = await recordLoginFailure(user.email.toLowerCase());
      return Response.json({ error: f.locked ? "Too many failed sign-ins. This account is locked for 15 minutes." : `Invalid email or password.${f.remaining <= 2 ? ` ${f.remaining} attempt${f.remaining === 1 ? "" : "s"} left before a 15-minute lock.` : ""}` }, { status: 401 });
    }
    await clearLoginFailures(user.email.toLowerCase());

    // Two-factor: the password is right, now ask for the code before issuing a session.
    const tf = await twoFactorFor(user.id);
    if (tf.enabled) {
      const challenge = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      await coreDb().prepare("INSERT INTO auth_2fa_challenges (token, user_id, expires_at, created_at) VALUES (?,?,?,?)").bind(challenge, user.id, new Date(Date.now() + 5 * 60_000).toISOString(), new Date().toISOString()).run();
      return Response.json({ requires2fa: true, challenge });
    }
    const token = await createSession(user.id, user.email, meta);
    const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
    // Companies can require two-factor; tell the app so it can walk the person through setup.
    const member = await coreDb().prepare("SELECT tenant_id FROM tenant_members WHERE lower(email)=lower(?) AND active=1 ORDER BY created_at LIMIT 1").bind(user.email).first<{ tenant_id: string }>();
    const must2fa = member ? (await companySettings(member.tenant_id)).require2fa : false;

    return Response.json(
      { ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role }, setup2fa: must2fa },
      { headers: { "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE) } },
    );
  } catch (error) {
    console.error("auth.login_failed", error);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
