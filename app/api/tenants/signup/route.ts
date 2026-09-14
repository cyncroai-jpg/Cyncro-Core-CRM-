/**
 * Tenant Signup (Multi-Tenant Onboarding)
 *
 * POST /api/tenants/signup
 * {
 *   "tenantName": "Acme Sales",
 *   "tenantSlug": "acme-sales",
 *   "email": "founder@acme.com",
 *   "displayName": "Alice Chen",
 *   "password": "..."
 * }
 *
 * Returns { tenantId, userId, email, sessionToken }
 */

import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;

    const tenantName = cleanText(body.tenantName, 160);
    const tenantSlug = cleanText(body.tenantSlug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const email = normalizeEmail(body.email);
    const displayName = cleanText(body.displayName, 160);
    const password = cleanText(body.password, 256);

    if (!tenantName || !tenantSlug || !email || !displayName || !password) {
      return Response.json({
        error: "tenantName, tenantSlug, email, displayName, and password are required.",
      }, { status: 400 });
    }

    // Validate slug is unique
    const db = coreDb();
    const existingTenant = await db
      .prepare("SELECT id FROM tenants WHERE slug = ?")
      .bind(tenantSlug)
      .first();
    if (existingTenant) {
      return Response.json({ error: "Tenant slug already exists." }, { status: 409 });
    }

    // Validate email is not already registered
    const existingUser = await db
      .prepare("SELECT id FROM auth_users WHERE lower(email) = ?")
      .bind(email)
      .first();
    if (existingUser) {
      return Response.json({ error: "Email already registered." }, { status: 409 });
    }

    // Hash password (for production: use bcrypt, not simple SHA256)
    const passwordHash = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Transaction-like: create tenant, user, member, session
    await db.batch([
      // 1. Create tenant
      db.prepare(`INSERT INTO tenants (id, name, slug, plan, seats, active, created_at, updated_at)
        VALUES (?, ?, ?, 'starter', 3, 1, ?, ?)`)
        .bind(tenantId, tenantName, tenantSlug, now, now),

      // 2. Create user
      db.prepare(`INSERT INTO auth_users
        (id, email, password_hash, display_name, role, active, default_tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'MEMBER', 1, ?, ?, ?)`)
        .bind(userId, email, passwordHash, displayName, tenantId, now, now),

      // 3. Create tenant member (OWNER of new tenant)
      db.prepare(`INSERT INTO tenant_members
        (id, tenant_id, user_id, email, display_name, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'OWNER', 1, ?, ?)`)
        .bind(crypto.randomUUID(), tenantId, userId, email, displayName, now, now),

      // 4. Create session token
      db.prepare(`INSERT INTO auth_sessions
        (token, user_id, email, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          userId,
          email,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          now,
        ),
    ]);

    // Return session token (would be set in httpOnly cookie in production)
    const session = await db
      .prepare("SELECT token FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(userId)
      .first<{ token: string }>();

    return Response.json({
      tenantId,
      userId,
      email,
      sessionToken: session?.token,
      tenant: { id: tenantId, name: tenantName, slug: tenantSlug, plan: "starter" },
    }, { status: 201 });
  } catch (error) {
    console.error("tenant.signup.failed", error);
    return Response.json({ error: "Unable to create tenant." }, { status: 500 });
  }
}
