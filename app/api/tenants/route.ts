/**
 * Tenant Management
 *
 * GET /api/tenants  — list my tenants
 * POST /api/tenants/:id/members — invite team member
 * GET /api/tenants/:id/members — list team members
 * PATCH /api/tenants/:id — update tenant settings
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  resolveRequestEmail,
} from "@/lib/core/db";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const email = await resolveRequestEmail(request);
    if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("id");

    if (tenantId) {
      // GET /api/tenants?id=X — get specific tenant + members
      const db = coreDb();
      const tenant = await db
        .prepare("SELECT * FROM tenants WHERE id = ?")
        .bind(tenantId)
        .first();
      if (!tenant)
        return Response.json({ error: "Tenant not found" }, { status: 404 });

      // Check user is member
      const member = await db
        .prepare("SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ?")
        .bind(tenantId, email)
        .first<{ role: string }>();
      if (!member)
        return Response.json({
          error: "You are not a member of this tenant",
        }, { status: 403 });

      // Get all members
      const { results: members } = await db
        .prepare(
          "SELECT id, email, display_name, role, active, created_at FROM tenant_members WHERE tenant_id = ? ORDER BY role DESC, created_at ASC",
        )
        .bind(tenantId)
        .all();

      return Response.json({ tenant, members, userRole: member.role });
    }

    // GET /api/tenants — list all my tenants
    const db = coreDb();
    const { results } = await db
      .prepare(
        `SELECT t.id, t.name, t.slug, t.plan, t.seats, t.active, t.created_at, tm.role
         FROM tenants t
         JOIN tenant_members tm ON tm.tenant_id = t.id
         WHERE tm.email = ? AND tm.active = 1
         ORDER BY t.created_at DESC`,
      )
      .bind(email)
      .all();

    return Response.json({ tenants: results });
  } catch (error) {
    console.error("tenant.list.failed", error);
    return Response.json({ error: "Unable to load tenants" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const email = await resolveRequestEmail(request);
    if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 50);
    const tenantId = cleanText(body.tenantId, 80);

    if (!tenantId) {
      return Response.json({ error: "tenantId is required" }, { status: 400 });
    }

    const db = coreDb();

    // Check user is OWNER or ADMIN of this tenant
    const member = await db
      .prepare("SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ?")
      .bind(tenantId, email)
      .first<{ role: string }>();

    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
      return Response.json({
        error: "Only OWNER or ADMIN can manage members",
      }, { status: 403 });
    }

    // Invite member
    if (action === "invite") {
      const inviteEmail = cleanText(body.inviteEmail, 254).toLowerCase();
      const inviteRole = cleanText(body.inviteRole || "USER", 50);
      const inviteDisplayName = cleanText(body.inviteDisplayName, 160) || inviteEmail;

      if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
        return Response.json({ error: "Valid email is required" }, { status: 400 });
      }

      if (!["USER", "MANAGER", "ADMIN"].includes(inviteRole)) {
        return Response.json({ error: "Invalid role" }, { status: 400 });
      }

      // Check if already member
      const existing = await db
        .prepare("SELECT id FROM tenant_members WHERE tenant_id = ? AND email = ?")
        .bind(tenantId, inviteEmail)
        .first();

      if (existing) {
        return Response.json({ error: "User is already a member" }, { status: 409 });
      }

      // Get or create user
      let userId: string;
      const existingUser = await db
        .prepare("SELECT id FROM auth_users WHERE lower(email) = ?")
        .bind(inviteEmail)
        .first<{ id: string }>();

      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Create user (no password yet — they'll set it on first login)
        userId = crypto.randomUUID();
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO auth_users (id, email, password_hash, display_name, role, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'MEMBER', 1, ?, ?)`,
          )
          .bind(userId, inviteEmail, "", inviteDisplayName, now, now)
          .run();
      }

      // Add to tenant
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO tenant_members (id, tenant_id, user_id, email, display_name, role, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          userId,
          inviteEmail,
          inviteDisplayName,
          inviteRole,
          now,
          now,
        )
        .run();

      // Log to audit
      await db
        .prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, email, action, resource_type, details, created_at)
           VALUES (?, ?, ?, ?, 'INVITE_MEMBER', 'tenant_member', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          userId,
          email,
          JSON.stringify({ invited_email: inviteEmail, role: inviteRole }),
          now,
        )
        .run();

      return Response.json({
        success: true,
        message: `Invited ${inviteEmail} as ${inviteRole}`,
      }, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("tenant.action.failed", error);
    return Response.json({ error: "Unable to complete action" }, { status: 500 });
  }
}
