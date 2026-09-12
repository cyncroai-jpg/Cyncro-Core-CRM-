import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { verifyPassword, createSession, sessionCookie } from "@/lib/core/auth";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const { email, password } = (await request.json()) as { email?: string; password?: string };

    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

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
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await createSession(user.id, user.email);
    const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

    return Response.json(
      { ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } },
      { headers: { "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE) } },
    );
  } catch (error) {
    console.error("auth.login_failed", error);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
