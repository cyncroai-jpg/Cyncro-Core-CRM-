/**
 * Two-factor sign-in for the signed-in user (authenticator app, TOTP).
 *   GET                 → { enabled, backupCodesLeft, companyRequires }
 *   POST action=setup   → { secret, otpauth } (not enabled until verified)
 *   POST action=verify  → { enabled: true, backupCodes } once a correct code is entered
 *   POST action=disable → needs current password
 *   POST action=codes   → new backup codes (needs a current code)
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireAuth, verifyPassword } from "@/lib/core/auth";
import { newBackupCodes, newTotpSecret, otpauthUrl, sha256Hex, twoFactorFor, verifyTotp, verifySecondFactor } from "@/lib/core/security";
import { companySettings } from "@/lib/core/companySettings";

async function companyRequires(email: string) {
  const m = await coreDb().prepare("SELECT tenant_id FROM tenant_members WHERE lower(email)=lower(?) AND active=1 ORDER BY created_at LIMIT 1").bind(email).first<{ tenant_id: string }>();
  return m ? (await companySettings(m.tenant_id)).require2fa : false;
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const a = await requireAuth(request); if (a instanceof Response) return a;
    const tf = await twoFactorFor(a.user.id);
    return Response.json({ enabled: tf.enabled, enabledAt: tf.enabled_at, backupCodesLeft: tf.backup_codes.length, companyRequires: await companyRequires(a.user.email) });
  } catch (error) { console.error("auth.2fa.get_failed", error); return Response.json({ error: "Unable to load two-factor status." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const a = await requireAuth(request); if (a instanceof Response) return a;
    const db = coreDb(); const userId = a.user.id; const now = new Date().toISOString();
    const action = new URL(request.url).searchParams.get("action");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tf = await twoFactorFor(userId);
    if (action === "setup") {
      if (tf.enabled) return Response.json({ error: "Two-factor is already on. Turn it off first to set up a new device." }, { status: 400 });
      const secret = newTotpSecret();
      await db.prepare("INSERT INTO auth_totp (user_id, secret, enabled, backup_codes, created_at) VALUES (?,?,0,'[]',?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret, enabled=0, backup_codes='[]'").bind(userId, secret, now).run();
      return Response.json({ secret, otpauth: otpauthUrl(secret, a.user.email) });
    }
    if (action === "verify") {
      if (!tf.secret) return Response.json({ error: "Start setup first." }, { status: 400 });
      if (!(await verifyTotp(tf.secret, String(body.code || "")))) return Response.json({ error: "That code isn't right. Check the time on your phone and try the newest code." }, { status: 400 });
      const codes = newBackupCodes();
      const hashed = await Promise.all(codes.map((c) => sha256Hex(c.replace(/-/g, ""))));
      await db.prepare("UPDATE auth_totp SET enabled=1, enabled_at=?, backup_codes=? WHERE user_id=?").bind(now, JSON.stringify(hashed), userId).run();
      await db.prepare("DELETE FROM auth_sessions WHERE user_id=? AND token<>?").bind(userId, (request.headers.get("cookie") || "").split(";").map((p) => p.trim()).find((p) => p.startsWith("cyncro_session="))?.slice("cyncro_session=".length) || "").run().catch(() => undefined);
      return Response.json({ enabled: true, backupCodes: codes });
    }
    if (action === "codes") {
      if (!tf.enabled) return Response.json({ error: "Two-factor isn't on." }, { status: 400 });
      if (!(await verifySecondFactor(userId, String(body.code || "")))) return Response.json({ error: "Enter a current code from your app first." }, { status: 400 });
      const codes = newBackupCodes();
      await db.prepare("UPDATE auth_totp SET backup_codes=? WHERE user_id=?").bind(JSON.stringify(await Promise.all(codes.map((c) => sha256Hex(c.replace(/-/g, ""))))), userId).run();
      return Response.json({ backupCodes: codes });
    }
    if (action === "disable") {
      const u = await db.prepare("SELECT password_hash FROM auth_users WHERE id=?").bind(userId).first<{ password_hash: string }>();
      if (!u || !(await verifyPassword(String(body.password || ""), u.password_hash))) return Response.json({ error: "Enter your current password to turn two-factor off." }, { status: 400 });
      if (await companyRequires(a.user.email)) return Response.json({ error: "Your company requires two-factor sign-in. Ask an owner to change that in Team Access → Security." }, { status: 403 });
      await db.prepare("DELETE FROM auth_totp WHERE user_id=?").bind(userId).run();
      return Response.json({ enabled: false });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { console.error("auth.2fa.post_failed", error); return Response.json({ error: "Two-factor change failed." }, { status: 500 }); }
}
