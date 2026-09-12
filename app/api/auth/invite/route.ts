/**
 * Invite a team member to the workspace.
 *
 * GET  ?token=xxx   — validate an invite token (public, no auth required)
 * POST              — owner creates an invite for a workspace_member
 * PATCH             — invited user accepts invite (sets their password)
 */
import { coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { hashPassword, createSession, sessionCookie, requireOwner } from "@/lib/core/auth";
import { sendEmail, workspaceInviteEmail } from "@/lib/core/email";

/** 32-character random token */
function makeToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ── GET: validate a token (unauthenticated — called by the invite accept page) ─
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!token) return Response.json({ error: "Token is required." }, { status: 400 });

    const user = await coreDb()
      .prepare(
        `SELECT id, email, display_name, invite_token, invite_expires_at, active
         FROM auth_users WHERE invite_token = ?`,
      )
      .bind(token)
      .first<{ id: string; email: string; display_name: string; invite_token: string; invite_expires_at: string; active: number }>();

    if (!user) return Response.json({ error: "Invite link is invalid or already used." }, { status: 404 });
    if (new Date(user.invite_expires_at) < new Date())
      return Response.json({ error: "This invite link has expired. Ask your workspace owner to resend it." }, { status: 410 });

    return Response.json({ email: user.email, displayName: user.display_name });
  } catch (error) {
    console.error("auth.invite.validate_failed", error);
    return Response.json({ error: "Unable to validate invite." }, { status: 500 });
  }
}

// ── POST: owner sends an invite (creates / refreshes the auth_users row) ──────
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const authResult = await requireOwner(request);
    if (authResult instanceof Response) return authResult;

    const body = (await request.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const displayName = String(body.displayName || "").trim().slice(0, 160);
    if (!email || !displayName) return Response.json({ error: "Name and email are required." }, { status: 400 });

    const db = coreDb();
    const now = new Date().toISOString();
    const token = makeToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Check if auth_users row already exists
    const existing = await db.prepare("SELECT id, active FROM auth_users WHERE lower(email)=lower(?)").bind(email).first<{ id: string; active: number }>();

    if (existing) {
      // Refresh invite token so the owner can resend a link
      await db.prepare(
        "UPDATE auth_users SET invite_token=?, invite_expires_at=?, updated_at=? WHERE id=?",
      ).bind(token, expires, now, existing.id).run();
    } else {
      // Create placeholder auth_users row (no usable password — user must accept invite)
      const tempHash = await hashPassword(crypto.randomUUID()); // unusable random password
      await db.prepare(
        `INSERT INTO auth_users (id, email, password_hash, display_name, role, active, invite_token, invite_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'MEMBER', 0, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), email, tempHash, displayName, token, expires, now, now).run();
    }

    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/login?invite=${token}`;

    // Look up the inviter's display name for the email
    const inviter = await db.prepare("SELECT display_name FROM auth_users WHERE id=?")
      .bind(authResult.user.id).first<{ display_name: string }>();
    const inviterName = inviter?.display_name || authResult.user.email;

    // Fire-and-forget — failure does not block the invite from being created
    try {
      const { subject, html } = workspaceInviteEmail({
        displayName: displayName,
        inviterName,
        workspaceName: "Cyncro Core",
        inviteUrl,
        expiresAt: expires,
      });
      void sendEmail({ to: email, subject, html });
    } catch { /* non-fatal */ }

    return Response.json({ ok: true, inviteUrl, expiresAt: expires, emailSent: true });
  } catch (error) {
    console.error("auth.invite.create_failed", error);
    return Response.json({ error: "Unable to create invite." }, { status: 500 });
  }
}

// ── PATCH: invited user accepts — sets their real password & activates account ─
export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    const displayName = String(body.displayName || "").trim().slice(0, 160);

    if (!token || !password) return Response.json({ error: "Token and password are required." }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const db = coreDb();
    const user = await db.prepare(
      "SELECT id, email, display_name, invite_expires_at FROM auth_users WHERE invite_token = ? AND active = 0",
    ).bind(token).first<{ id: string; email: string; display_name: string; invite_expires_at: string }>();

    if (!user) return Response.json({ error: "Invite link is invalid or has already been used." }, { status: 404 });
    if (new Date(user.invite_expires_at) < new Date())
      return Response.json({ error: "This invite has expired. Ask your workspace owner to resend it." }, { status: 410 });

    const hash = await hashPassword(password);
    const now = new Date().toISOString();
    const name = displayName || user.display_name;

    await db.prepare(
      "UPDATE auth_users SET password_hash=?, display_name=?, active=1, invite_token=NULL, invite_expires_at=NULL, updated_at=? WHERE id=?",
    ).bind(hash, name, now, user.id).run();

    // Also update display_name in workspace_members
    await db.prepare("UPDATE workspace_members SET display_name=?, active=1, updated_at=? WHERE lower(email)=lower(?)")
      .bind(name, now, user.email).run();

    const sessionToken = await createSession(user.id, user.email);
    const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

    return Response.json(
      { ok: true, user: { email: user.email, displayName: name } },
      { headers: { "Set-Cookie": sessionCookie(sessionToken, SESSION_MAX_AGE) } },
    );
  } catch (error) {
    console.error("auth.invite.accept_failed", error);
    return Response.json({ error: "Unable to accept invite." }, { status: 500 });
  }
}
