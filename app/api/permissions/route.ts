/**
 * Permission & Role Management API
 *
 * GET /api/permissions/roles — list all roles for tenant
 * POST /api/permissions/roles — create custom role
 * PATCH /api/permissions/roles — update role permissions
 * DELETE /api/permissions/roles — delete custom role
 * GET /api/permissions/members — list team members with assigned roles
 * PATCH /api/permissions/members — update member role or permissions
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  RoleName,
  ModuleName,
  RolePermission,
  Role,
  getDefaultRoles,
  hasPermission,
} from "@/lib/core/permissions";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/permissions/[section]

    if (section === "roles") {
      // GET /api/permissions/roles
      const db = coreDb();
      const { results: roles } = await db
        .prepare(
          `SELECT * FROM tenant_roles WHERE tenant_id = ? ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all<Record<string, unknown>>();

      // Include default roles
      const defaultRoles = getDefaultRoles();
      const systemRoles: Role[] = (Object.keys(defaultRoles) as RoleName[]).map(
        (roleName) => ({
          id: `system_${roleName.toLowerCase()}`,
          tenantId: tenant.tenantId,
          name: roleName,
          roleName,
          permissions: new Map(
            defaultRoles[roleName].map((perm) => [perm.module, perm])
          ),
          memberCount: 0, // Would be counted from tenant_members
          isSystem: true,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        })
      );

      // Get member counts for custom roles
      const { results: memberCounts } = await db
        .prepare(
          `SELECT role, COUNT(*) as count FROM tenant_members
           WHERE tenant_id = ? GROUP BY role`
        )
        .bind(tenant.tenantId)
        .all<Record<string, unknown>>();

      const countMap: Record<string, number> = {};
      memberCounts.forEach((row) => {
        countMap[String(row.role)] = Number(row.count);
      });

      const customRoles: Role[] = roles.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        tenantId: String(r.tenant_id),
        name: String(r.name),
        description: r.description ? String(r.description) : undefined,
        permissions: r.permissions
          ? new Map(Object.entries(JSON.parse(String(r.permissions))))
          : new Map(),
        memberCount: countMap[String(r.id)] || 0,
        isSystem: false,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));

      return Response.json({
        roles: [...systemRoles, ...customRoles],
      });
    }

    if (section === "members") {
      // GET /api/permissions/members
      const db = coreDb();
      const { results: members } = await db
        .prepare(
          `SELECT id, user_id, email, display_name, role, permissions, active, created_at, updated_at
           FROM tenant_members
           WHERE tenant_id = ?
           ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all<Record<string, unknown>>();

      return Response.json({
        members: members.map((m) => ({
          id: String(m.id),
          userId: String(m.user_id),
          email: String(m.email),
          displayName: String(m.display_name),
          role: String(m.role),
          permissions: m.permissions ? JSON.parse(String(m.permissions)) : {},
          active: Boolean(m.active),
          createdAt: String(m.created_at),
          updatedAt: String(m.updated_at),
        })),
      });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("permissions.get.failed", error);
    return Response.json(
      { error: "Unable to load permissions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage roles
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "roles") {
      // POST /api/permissions/roles - create custom role
      const name = cleanText(String(body.name || ""), 100);
      const description = body.description
        ? cleanText(String(body.description), 500)
        : undefined;
      const permissions = body.permissions as Record<string, RolePermission> | undefined;

      if (!name) {
        return Response.json({ error: "name is required" }, { status: 400 });
      }

      const db = coreDb();
      const roleId = crypto.randomUUID();
      const now = new Date().toISOString();

      const role: Role = {
        id: roleId,
        tenantId: tenant.tenantId,
        name,
        description,
        permissions: new Map(Object.entries(permissions || {})),
        memberCount: 0,
        isSystem: false,
        createdAt: now,
        updatedAt: now,
      };

      await db
        .prepare(
          `INSERT INTO tenant_roles
           (id, tenant_id, name, description, permissions, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          roleId,
          tenant.tenantId,
          name,
          description || null,
          JSON.stringify(permissions || {}),
          now,
          now
        )
        .run();

      return Response.json(role, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("permissions.post.failed", error);
    return Response.json(
      { error: "Unable to create role" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage roles
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "roles") {
      // PATCH /api/permissions/roles - update role permissions
      const roleId = cleanText(String(body.id || ""), 80);
      const permissions = body.permissions as Record<string, RolePermission> | undefined;

      if (!roleId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const db = coreDb();
      const now = new Date().toISOString();

      const updates: [string, unknown][] = [];
      if (body.name) updates.push(["name", cleanText(String(body.name), 100)]);
      if (body.description !== undefined) {
        updates.push([
          "description",
          body.description ? cleanText(String(body.description), 500) : null,
        ]);
      }
      if (permissions) {
        updates.push(["permissions", JSON.stringify(permissions)]);
      }

      if (updates.length === 0) {
        return Response.json({ error: "No changes provided" }, { status: 400 });
      }

      updates.push(["updated_at", now]);

      const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
      const values = updates.map(([, val]) => val);
      values.push(roleId, tenant.tenantId);

      await db
        .prepare(
          `UPDATE tenant_roles SET ${setClauses} WHERE id = ? AND tenant_id = ?`
        )
        .bind(...values)
        .run();

      // Fetch updated role
      const updated = await db
        .prepare(
          `SELECT * FROM tenant_roles WHERE id = ? AND tenant_id = ?`
        )
        .bind(roleId, tenant.tenantId)
        .first<Record<string, unknown>>();

      if (!updated) {
        return Response.json({ error: "Role not found" }, { status: 404 });
      }

      return Response.json({
        id: String(updated.id),
        tenantId: String(updated.tenant_id),
        name: String(updated.name),
        description: updated.description ? String(updated.description) : undefined,
        permissions: JSON.parse(String(updated.permissions)),
        isSystem: false,
        createdAt: String(updated.created_at),
        updatedAt: String(updated.updated_at),
      });
    }

    if (section === "members") {
      // PATCH /api/permissions/members - update member role
      const memberId = cleanText(String(body.id || ""), 80);
      const newRole = cleanText(String(body.role || ""), 50);

      if (!memberId || !newRole) {
        return Response.json(
          { error: "id and role are required" },
          { status: 400 }
        );
      }

      const db = coreDb();
      const now = new Date().toISOString();

      await db
        .prepare(
          `UPDATE tenant_members SET role = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
        )
        .bind(newRole, now, memberId, tenant.tenantId)
        .run();

      const updated = await db
        .prepare(
          `SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?`
        )
        .bind(memberId, tenant.tenantId)
        .first<Record<string, unknown>>();

      if (!updated) {
        return Response.json({ error: "Member not found" }, { status: 404 });
      }

      return Response.json({
        id: String(updated.id),
        userId: String(updated.user_id),
        email: String(updated.email),
        displayName: String(updated.display_name),
        role: String(updated.role),
        permissions: updated.permissions ? JSON.parse(String(updated.permissions)) : {},
        active: Boolean(updated.active),
        createdAt: String(updated.created_at),
        updatedAt: String(updated.updated_at),
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("permissions.patch.failed", error);
    return Response.json(
      { error: "Unable to update permissions" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage roles
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const roleId = cleanText(url.searchParams.get("id") || "", 80);

    if (section === "roles" && roleId) {
      // DELETE /api/permissions/roles?id=X - delete custom role
      const db = coreDb();

      // Check if role is in use
      const { results: members } = await db
        .prepare(
          `SELECT COUNT(*) as count FROM tenant_members WHERE role = ? AND tenant_id = ?`
        )
        .bind(roleId, tenant.tenantId)
        .all<Record<string, unknown>>();

      if (members[0] && Number(members[0].count) > 0) {
        return Response.json(
          { error: "Cannot delete role with active members" },
          { status: 400 }
        );
      }

      await db
        .prepare(
          `DELETE FROM tenant_roles WHERE id = ? AND tenant_id = ?`
        )
        .bind(roleId, tenant.tenantId)
        .run();

      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("permissions.delete.failed", error);
    return Response.json(
      { error: "Unable to delete role" },
      { status: 500 }
    );
  }
}
