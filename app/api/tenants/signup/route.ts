/**
 * Tenant Signup (Multi-Tenant Onboarding) — creates a brand-new, fully
 * isolated company workspace.
 *
 * POST /api/tenants/signup
 * { "tenantName": "Acme Sales", "email": "founder@acme.com", "displayName": "Alice Chen", "password": "..." }
 *
 * Sets the real cyncro_session cookie (same mechanism as /api/auth/login)
 * so the new owner is immediately signed in — the caller doesn't need to
 * separately log in with the sessionToken this also returns.
 */
import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { hashPassword, createSession, sessionCookie } from "@/lib/core/auth";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;

    const tenantName = cleanText(body.tenantName, 160);
    const email = normalizeEmail(body.email);
    const displayName = cleanText(body.displayName, 160);
    const password = cleanText(body.password, 256);

    if (!tenantName || !email || !displayName || !password) {
      return Response.json({ error: "Company name, email, name, and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const db = coreDb();
    const existingUser = await db.prepare("SELECT id FROM auth_users WHERE lower(email) = ?").bind(email).first();
    if (existingUser) return Response.json({ error: "Email already registered." }, { status: 409 });

    let tenantSlug = cleanText(body.tenantSlug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-")
      || tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
      || "workspace";
    const existingTenant = await db.prepare("SELECT id FROM tenants WHERE slug = ?").bind(tenantSlug).first();
    if (existingTenant) tenantSlug = `${tenantSlug}-${crypto.randomUUID().slice(0, 6)}`;

    const passwordHash = await hashPassword(password);
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.batch([
      db.prepare(`INSERT INTO tenants (id, name, slug, plan, seats, active, created_at, updated_at) VALUES (?, ?, ?, 'starter', 3, 1, ?, ?)`)
        .bind(tenantId, tenantName, tenantSlug, now, now),
      db.prepare(`INSERT INTO auth_users (id, email, password_hash, display_name, role, active, default_tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'MEMBER', 1, ?, ?, ?)`)
        .bind(userId, email, passwordHash, displayName, tenantId, now, now),
      db.prepare(`INSERT INTO tenant_members (id, tenant_id, user_id, email, display_name, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'OWNER', 1, ?, ?)`)
        .bind(crypto.randomUUID(), tenantId, userId, email, displayName, now, now),
    ]);

    const token = await createSession(userId, email);
    const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

    return Response.json({
      tenantId, userId, email, sessionToken: token,
      tenant: { id: tenantId, name: tenantName, slug: tenantSlug, plan: "starter" },
    }, { status: 201, headers: { "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE) } });
  } catch (error) {
    console.error("tenant.signup.failed", error);
    return Response.json({ error: "Unable to create your workspace." }, { status: 500 });
  }
}
