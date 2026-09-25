/**
 * Password reset by email.
 *   POST  { email }            → emails a one-hour reset link (never reveals whether the email exists)
 *   GET   ?token=…             → says whether a token is still valid (for the reset screen)
 *   PATCH { token, password }  → sets the new password, invalidates the token, signs the user in
 */
import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { createSession, hashPassword, sessionCookie } from "@/lib/core/auth";
import { emailTransportStatus, sendEmail } from "@/lib/core/email";

const HOUR = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    if (!email) return Response.json({ error: "Enter the email you sign in with." }, { status: 400 });
    const transport = await emailTransportStatus();
    if (transport.transport === "none") return Response.json({ error: "Email sending isn't connected on this deployment yet, so reset links can't go out. Ask your workspace owner to send you a new invite link from Team Access." }, { status: 503 });
    const db = coreDb();
    const user = await db.prepare("SELECT id, display_name FROM auth_users WHERE lower(email)=? AND active=1").bind(email).first<{ id: string; display_name: string }>();
    if (user) {
      const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const now = new Date();
      await db.batch([
        db.prepare("UPDATE auth_password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL").bind(now.toISOString(), user.id),
        db.prepare("INSERT INTO auth_password_resets (id,user_id,token,expires_at,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), user.id, token, new Date(now.getTime() + HOUR).toISOString(), now.toISOString()),
      ]);
      const link = `${new URL(request.url).origin}/login?reset=${token}`;
      await sendEmail({ to: email, subject: "Reset your Cyncro password", html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111"><p>Hi ${user.display_name || "there"},</p><p>Someone asked to reset the password for this account. If that was you, click below within the next hour:</p><p><a href="${link}" style="display:inline-block;background:#a91f39;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Choose a new password</a></p><p style="color:#666">If you didn't ask for this, you can ignore this email. Your password won't change.</p></div>` });
    } else {
      await new Promise((r) => setTimeout(r, 300));
    }
    return Response.json({ sent: true });
  } catch (error) {
    console.error("auth.reset.request_failed", error);
    return Response.json({ error: "Unable to send a reset link right now." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const token = cleanText(new URL(request.url).searchParams.get("token"), 128);
    const row = token ? await coreDb().prepare("SELECT r.expires_at, r.used_at, u.email FROM auth_password_resets r JOIN auth_users u ON u.id=r.user_id WHERE r.token=?").bind(token).first<{ expires_at: string; used_at: string | null; email: string }>() : null;
    const valid = Boolean(row && !row.used_at && new Date(row.expires_at).getTime() > Date.now());
    return Response.json({ valid, email: valid ? row?.email : undefined });
  } catch (error) {
    console.error("auth.reset.check_failed", error);
    return Response.json({ valid: false });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = cleanText(body.token, 128); const password = String(body.password || "");
    if (!token) return Response.json({ error: "This reset link is missing its code." }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "Use at least 8 characters." }, { status: 400 });
    const db = coreDb();
    const row = await db.prepare("SELECT r.id, r.user_id, r.expires_at, r.used_at, u.email FROM auth_password_resets r JOIN auth_users u ON u.id=r.user_id WHERE r.token=?").bind(token).first<{ id: string; user_id: string; expires_at: string; used_at: string | null; email: string }>();
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return Response.json({ error: "This reset link has expired. Request a new one." }, { status: 410 });
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE auth_users SET password_hash=?, updated_at=? WHERE id=?").bind(await hashPassword(password), now, row.user_id),
      db.prepare("UPDATE auth_password_resets SET used_at=? WHERE id=?").bind(now, row.id),
      db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(row.user_id),
    ]);
    const session = await createSession(row.user_id, row.email);
    return Response.json({ reset: true }, { headers: { "Set-Cookie": sessionCookie(session, 30 * 24 * 60 * 60) } });
  } catch (error) {
    console.error("auth.reset.complete_failed", error);
    return Response.json({ error: "Unable to reset the password." }, { status: 500 });
  }
}
