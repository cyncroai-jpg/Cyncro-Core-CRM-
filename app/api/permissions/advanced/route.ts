/**
 * Advanced Permissions API
 *
 * GET /api/permissions/advanced/fields — get field-level permissions
 * POST /api/permissions/advanced/fields — set field permission
 * DELETE /api/permissions/advanced/fields — remove field permission
 * GET /api/permissions/advanced/rules — get dynamic rules
 * POST /api/permissions/advanced/rules — create dynamic rule
 * PATCH /api/permissions/advanced/rules — update rule
 * DELETE /api/permissions/advanced/rules — delete rule
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  setFieldPermission,
  getFieldPermissionsForRole,
  createDynamicRule,
  getDynamicRulesForTenant,
  deleteDynamicRule,
} from "@/lib/core/advanced-permissions";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can view advanced permissions
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[4]; // /api/permissions/advanced/[section]

    if (section === "fields") {
      // GET /api/permissions/advanced/fields
      const role = cleanText(url.searchParams.get("role") || "", 50);
      const resourceType = cleanText(
        url.searchParams.get("resourceType") || "",
        50
      );

      if (!role || !resourceType) {
        return Response.json(
          { error: "role and resourceType are required" },
          { status: 400 }
        );
      }

      const permissions = await getFieldPermissionsForRole(
        tenant.tenantId,
        role,
        resourceType
      );

      return Response.json({ permissions });
    }

    if (section === "rules") {
      // GET /api/permissions/advanced/rules
      const resourceType = cleanText(
        url.searchParams.get("resourceType") || "",
        50
      );

      const rules = await getDynamicRulesForTenant(
        tenant.tenantId,
        resourceType || undefined
      );

      return Response.json({ rules });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("advanced_permissions.get.failed", error);
    return Response.json(
      { error: "Unable to fetch advanced permissions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can create advanced permissions
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[4];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "fields") {
      // POST /api/permissions/advanced/fields - set field permission
      const role = cleanText(String(body.role || ""), 50);
      const resourceType = cleanText(
        String(body.resourceType || ""),
        50
      );
      const field = cleanText(String(body.field || ""), 100);
      const ruleType = String(body.ruleType || "VISIBLE");
      const maskType = body.maskType ? String(body.maskType) : undefined;
      const condition = body.condition as Record<string, unknown> | undefined;

      if (!role || !resourceType || !field) {
        return Response.json(
          { error: "role, resourceType, and field are required" },
          { status: 400 }
        );
      }

      const permission = await setFieldPermission(
        tenant.tenantId,
        role,
        resourceType,
        field,
        ruleType as "HIDE" | "MASK" | "VISIBLE",
        maskType as any,
        condition
      );

      return Response.json(permission, { status: 201 });
    }

    if (section === "rules") {
      // POST /api/permissions/advanced/rules - create dynamic rule
      const name = cleanText(String(body.name || ""), 100);
      const resourceType = cleanText(
        String(body.resourceType || ""),
        50
      );
      const action = String(body.action || "read");
      const conditions = Array.isArray(body.conditions) ? body.conditions : [];
      const allow = Boolean(body.allow !== false);
      const priority = Math.max(0, Math.min(1000, parseInt(String(body.priority || 100))));
      const description = body.description
        ? cleanText(String(body.description), 500)
        : undefined;

      if (!name || !resourceType || conditions.length === 0) {
        return Response.json(
          { error: "name, resourceType, and conditions are required" },
          { status: 400 }
        );
      }

      const rule = await createDynamicRule(
        tenant.tenantId,
        name,
        resourceType,
        action as any,
        conditions as any,
        allow,
        priority,
        description
      );

      return Response.json(rule, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("advanced_permissions.post.failed", error);
    return Response.json(
      { error: "Unable to create advanced permission" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can update advanced permissions
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[4];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "rules") {
      // PATCH /api/permissions/advanced/rules - update rule
      const ruleId = cleanText(String(body.id || ""), 80);
      const db = coreDb();
      const now = new Date().toISOString();

      if (!ruleId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const updates: [string, unknown][] = [];
      if (body.name) updates.push(["name", cleanText(String(body.name), 100)]);
      if (body.description !== undefined) {
        updates.push([
          "description",
          body.description ? cleanText(String(body.description), 500) : null,
        ]);
      }
      if (body.conditions) {
        updates.push(["conditions", JSON.stringify(body.conditions)]);
      }
      if (body.allow !== undefined) {
        updates.push(["allow", body.allow ? 1 : 0]);
      }
      if (body.priority !== undefined) {
        updates.push([
          "priority",
          Math.max(0, Math.min(1000, parseInt(String(body.priority)))),
        ]);
      }

      if (updates.length === 0) {
        return Response.json({ error: "No changes provided" }, { status: 400 });
      }

      updates.push(["updated_at", now]);

      const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
      const values = updates.map(([, val]) => val);
      values.push(ruleId, tenant.tenantId);

      await db
        .prepare(
          `UPDATE dynamic_permissions SET ${setClauses} WHERE id = ? AND tenant_id = ?`
        )
        .bind(...values)
        .run();

      const updated = await db
        .prepare(
          `SELECT * FROM dynamic_permissions WHERE id = ? AND tenant_id = ?`
        )
        .bind(ruleId, tenant.tenantId)
        .first<Record<string, unknown>>();

      if (!updated) {
        return Response.json({ error: "Rule not found" }, { status: 404 });
      }

      return Response.json({
        id: String(updated.id),
        tenantId: String(updated.tenant_id),
        name: String(updated.name),
        resourceType: String(updated.resource_type),
        action: String(updated.action),
        conditions: JSON.parse(String(updated.conditions || "[]")),
        allow: Boolean(updated.allow),
        priority: Number(updated.priority),
        createdAt: String(updated.created_at),
        updatedAt: String(updated.updated_at),
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("advanced_permissions.patch.failed", error);
    return Response.json(
      { error: "Unable to update advanced permission" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can delete advanced permissions
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[4];
    const id = cleanText(url.searchParams.get("id") || "", 80);

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    if (section === "rules") {
      // DELETE /api/permissions/advanced/rules?id=X
      const success = await deleteDynamicRule(tenant.tenantId, id);

      if (!success) {
        return Response.json({ error: "Rule not found" }, { status: 404 });
      }

      return Response.json({ success: true, message: "Rule deleted" });
    }

    if (section === "fields") {
      // DELETE /api/permissions/advanced/fields?id=X
      const db = coreDb();

      const result = await db
        .prepare(
          `DELETE FROM field_permissions WHERE id = ? AND tenant_id = ?`
        )
        .bind(id, tenant.tenantId)
        .run();

      if ((result.meta?.changes || 0) === 0) {
        return Response.json(
          { error: "Field permission not found" },
          { status: 404 }
        );
      }

      return Response.json({ success: true, message: "Field permission deleted" });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("advanced_permissions.delete.failed", error);
    return Response.json(
      { error: "Unable to delete advanced permission" },
      { status: 500 }
    );
  }
}
