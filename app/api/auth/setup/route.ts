/**
 * First-run workspace setup.
 * Creates the initial OWNER account — only works when zero users exist.
 * Once an owner exists, this endpoint returns 403.
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { hashPassword, createSession, sessionCookie } from "@/lib/core/auth";

function randomId(): string {
  return crypto.randomUUID();
}

export async function GET() {
  try {
    await ensureCoreSchema();
    const count = await coreDb()
      .prepare("SELECT COUNT(*) AS total FROM auth_users")
      .first<{ total: number }>();
    return Response.json({ needsSetup: Number(count?.total || 0) === 0 });
  } catch (error) {
    console.error("auth.setup_check_failed", error);
    return Response.json({ error: "Setup check failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    // Guard: only allowed when no users exist
    const count = await coreDb()
      .prepare("SELECT COUNT(*) AS total FROM auth_users")
      .first<{ total: number }>();
    if (Number(count?.total || 0) > 0) {
      return Response.json({ error: "Workspace is already set up." }, { status: 403 });
    }

    const { email, password, display_name } = (await request.json()) as {
      email?: string;
      password?: string;
      display_name?: string;
    };

    if (!email || !password || !display_name) {
      return Response.json({ error: "Name, email, and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const id = randomId();
    const hash = await hashPassword(password);
    const now = new Date().toISOString();

    await coreDb()
      .prepare(
        "INSERT INTO auth_users (id, email, password_hash, display_name, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'OWNER', 1, ?, ?)",
      )
      .bind(id, email.trim().toLowerCase(), hash, display_name.trim(), now, now)
      .run();

    // Also seed workspace_members so existing permission checks work
    await coreDb()
      .prepare(
        `INSERT INTO workspace_members (email, display_name, role, crm_access, calendar_access, prospecting_access, manage_users, active, created_at, updated_at)
         VALUES (?, ?, 'OWNER', 1, 1, 1, 1, 1, ?, ?)
         ON CONFLICT(email) DO NOTHING`,
      )
      .bind(email.trim().toLowerCase(), display_name.trim(), now, now)
      .run();

    const token = await createSession(id, email.trim().toLowerCase());
    const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

    return Response.json(
      { ok: true, user: { id, email: email.trim().toLowerCase(), display_name: display_name.trim(), role: "OWNER" } },
      { headers: { "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE) } },
    );
  } catch (error) {
    console.error("auth.setup_failed", error);
    return Response.json({ error: "Setup failed. Please try again." }, { status: 500 });
  }
}
