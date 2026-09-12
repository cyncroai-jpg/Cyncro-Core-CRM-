/**
 * Profile management for the currently logged-in user.
 *
 * PATCH — update display_name and/or change password
 *         Requires current_password for password changes.
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { hashPassword, verifyPassword, requireAuth } from "@/lib/core/auth";

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { user } = authResult;
    const userId = user.id;
    const email = user.email;

    const body = (await request.json()) as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 160) : null;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    const db = coreDb();
    const now = new Date().toISOString();

    // If changing password, verify current password first
    if (newPassword) {
      if (newPassword.length < 8) {
        return Response.json({ error: "New password must be at least 8 characters." }, { status: 400 });
      }
      if (!currentPassword) {
        return Response.json({ error: "Current password is required to set a new password." }, { status: 400 });
      }
      const user = await db.prepare("SELECT password_hash FROM auth_users WHERE id=?")
        .bind(userId).first<{ password_hash: string }>();
      if (!user) return Response.json({ error: "User not found." }, { status: 404 });
      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) return Response.json({ error: "Current password is incorrect." }, { status: 401 });

      const newHash = await hashPassword(newPassword);
      if (displayName) {
        await db.prepare("UPDATE auth_users SET password_hash=?, display_name=?, updated_at=? WHERE id=?")
          .bind(newHash, displayName, now, userId).run();
        await db.prepare("UPDATE workspace_members SET display_name=?, updated_at=? WHERE lower(email)=lower(?)")
          .bind(displayName, now, email).run();
      } else {
        await db.prepare("UPDATE auth_users SET password_hash=?, updated_at=? WHERE id=?")
          .bind(newHash, now, userId).run();
      }
      return Response.json({ ok: true, message: "Password updated successfully." });
    }

    // Just update display name
    if (displayName) {
      await db.prepare("UPDATE auth_users SET display_name=?, updated_at=? WHERE id=?")
        .bind(displayName, now, userId).run();
      await db.prepare("UPDATE workspace_members SET display_name=?, updated_at=? WHERE lower(email)=lower(?)")
        .bind(displayName, now, email).run();
      return Response.json({ ok: true, message: "Profile updated." });
    }

    return Response.json({ error: "Nothing to update." }, { status: 400 });
  } catch (error) {
    console.error("auth.profile.update_failed", error);
    return Response.json({ error: "Unable to update profile." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const db = coreDb();
    const user = await db.prepare("SELECT email, display_name, role, created_at FROM auth_users WHERE id=?")
      .bind(userId).first<{ email: string; display_name: string; role: string; created_at: string }>();
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });

    return Response.json({ email: user.email, displayName: user.display_name, role: user.role, createdAt: user.created_at });
  } catch (error) {
    console.error("auth.profile.get_failed", error);
    return Response.json({ error: "Unable to load profile." }, { status: 500 });
  }
}
