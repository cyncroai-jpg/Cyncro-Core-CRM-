/**
 * Custom Fields API
 *
 * GET /api/custom-fields — list custom fields
 * POST /api/custom-fields — create custom field
 * PATCH /api/custom-fields/:id — update custom field
 * DELETE /api/custom-fields/:id — delete custom field
 * GET /api/custom-fields/groups — list field groups
 * POST /api/custom-fields/groups — create field group
 * GET /api/custom-fields/values — get field values for resource
 * POST /api/custom-fields/values — set field value
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createCustomField,
  getCustomFields,
  getCustomField,
  updateCustomField,
  deleteCustomField,
  setCustomFieldValue,
  getCustomFieldValues,
  createFieldGroup,
  getFieldGroups,
  validateCustomFieldValue,
  type ResourceType,
  type CustomFieldType,
} from "@/lib/core/custom-fields";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType") as ResourceType;
    const section = url.pathname.split("/")[3]; // /api/custom-fields/[section]

    if (section === "groups") {
      // GET /api/custom-fields/groups
      if (!resourceType) {
        return Response.json(
          { error: "resourceType parameter required" },
          { status: 400 }
        );
      }

      const groups = await getFieldGroups(tenant.tenantId, resourceType);
      return Response.json({ groups });
    }

    if (section === "values") {
      // GET /api/custom-fields/values - get values for a resource
      const resourceId = url.searchParams.get("resourceId");
      if (!resourceType || !resourceId) {
        return Response.json(
          { error: "resourceType and resourceId parameters required" },
          { status: 400 }
        );
      }

      const values = await getCustomFieldValues(
        tenant.tenantId,
        resourceType,
        resourceId
      );
      const fields = await getCustomFields(tenant.tenantId, resourceType);

      return Response.json({ values, fields });
    }

    // GET /api/custom-fields - list custom fields
    if (!resourceType) {
      return Response.json(
        { error: "resourceType parameter required" },
        { status: 400 }
      );
    }

    const fields = await getCustomFields(tenant.tenantId, resourceType);
    return Response.json({ fields });
  } catch (error) {
    console.error("custom-fields.get.failed", error);
    return Response.json(
      { error: "Unable to fetch custom fields" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage custom fields
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "groups") {
      // POST /api/custom-fields/groups - create field group
      const resourceType = cleanText(String(body.resourceType || ""), 50) as ResourceType;
      const groupName = cleanText(String(body.groupName || ""), 100);
      const displayOrder = Math.min(
        Math.max(parseInt(String(body.displayOrder || 0)), 0),
        1000
      );
      const description = body.description
        ? cleanText(String(body.description), 500)
        : undefined;

      if (!resourceType || !groupName) {
        return Response.json(
          { error: "resourceType and groupName are required" },
          { status: 400 }
        );
      }

      const group = await createFieldGroup(
        tenant.tenantId,
        resourceType,
        groupName,
        displayOrder,
        description
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "custom_field_group",
        group.id,
        {
          resourceName: `Field group: ${groupName}`,
          status: "SUCCESS",
          resourceType,
        }
      );

      return Response.json({ group }, { status: 201 });
    }

    if (section === "values") {
      // POST /api/custom-fields/values - set field value
      const resourceType = cleanText(String(body.resourceType || ""), 50) as ResourceType;
      const resourceId = cleanText(String(body.resourceId || ""), 100);
      const fieldId = cleanText(String(body.fieldId || ""), 100);
      const value = body.value;

      if (!resourceType || !resourceId || !fieldId) {
        return Response.json(
          { error: "resourceType, resourceId, and fieldId are required" },
          { status: 400 }
        );
      }

      // Validate against field definition
      const field = await getCustomField(tenant.tenantId, fieldId);
      if (!field) {
        return Response.json(
          { error: "Custom field not found" },
          { status: 404 }
        );
      }

      const validation = validateCustomFieldValue(field, value);
      if (!validation.valid) {
        return Response.json(
          { error: validation.error || "Validation failed" },
          { status: 400 }
        );
      }

      const result = await setCustomFieldValue(
        tenant.tenantId,
        resourceType,
        resourceId,
        fieldId,
        value
      );

      return Response.json({ result }, { status: 201 });
    }

    // POST /api/custom-fields - create custom field
    const resourceType = cleanText(String(body.resourceType || ""), 50) as ResourceType;
    const fieldName = cleanText(String(body.fieldName || ""), 100);
    const displayName = cleanText(String(body.displayName || ""), 200);
    const fieldType = cleanText(String(body.fieldType || ""), 50) as CustomFieldType;
    const required = body.required === true;
    const unique = body.unique === true;
    const displayOrder = Math.min(
      Math.max(parseInt(String(body.displayOrder || 0)), 0),
      1000
    );

    if (!resourceType || !fieldName || !displayName || !fieldType) {
      return Response.json(
        { error: "resourceType, fieldName, displayName, and fieldType are required" },
        { status: 400 }
      );
    }

    const field = await createCustomField(tenant.tenantId, {
      resourceType,
      fieldName,
      displayName,
      fieldType,
      required,
      unique,
      displayOrder,
      active: true,
      description: body.description
        ? cleanText(String(body.description), 500)
        : undefined,
      defaultValue: body.defaultValue,
      options: Array.isArray(body.options)
        ? body.options.map((o) => cleanText(String(o), 100))
        : undefined,
      validationRules: body.validationRules as any,
      groupName: body.groupName
        ? cleanText(String(body.groupName), 100)
        : undefined,
    });

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "custom_field",
      field.id,
      {
        resourceName: `Custom field: ${displayName}`,
        status: "SUCCESS",
        resourceType,
        fieldType,
      }
    );

    return Response.json({ field }, { status: 201 });
  } catch (error) {
    console.error("custom-fields.post.failed", error);
    return Response.json(
      { error: "Unable to create custom field" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage custom fields
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const fieldId = url.pathname.split("/")[4]; // /api/custom-fields/[id]
    const body = (await request.json()) as Record<string, unknown>;

    if (!fieldId) {
      return Response.json(
        { error: "fieldId is required" },
        { status: 400 }
      );
    }

    // Verify field exists and belongs to tenant
    const field = await getCustomField(tenant.tenantId, fieldId);
    if (!field) {
      return Response.json(
        { error: "Custom field not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.displayName !== undefined) {
      updates.displayName = cleanText(String(body.displayName), 200);
    }
    if (body.description !== undefined) {
      updates.description = body.description
        ? cleanText(String(body.description), 500)
        : undefined;
    }
    if (body.required !== undefined) {
      updates.required = body.required === true;
    }
    if (body.active !== undefined) {
      updates.active = body.active === true;
    }
    if (body.displayOrder !== undefined) {
      updates.displayOrder = Math.min(
        Math.max(parseInt(String(body.displayOrder)), 0),
        1000
      );
    }
    if (body.defaultValue !== undefined) {
      updates.defaultValue = body.defaultValue;
    }
    if (body.options !== undefined && Array.isArray(body.options)) {
      updates.options = body.options.map((o) => cleanText(String(o), 100));
    }
    if (body.validationRules !== undefined) {
      updates.validationRules = body.validationRules as any;
    }

    await updateCustomField(tenant.tenantId, fieldId, updates as any);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "UPDATE",
      "custom_field",
      fieldId,
      {
        resourceName: `Custom field: ${field.displayName}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Custom field updated" });
  } catch (error) {
    console.error("custom-fields.patch.failed", error);
    return Response.json(
      { error: "Unable to update custom field" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage custom fields
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const fieldId = url.pathname.split("/")[4];

    if (!fieldId) {
      return Response.json(
        { error: "fieldId is required" },
        { status: 400 }
      );
    }

    const field = await getCustomField(tenant.tenantId, fieldId);
    if (!field) {
      return Response.json(
        { error: "Custom field not found" },
        { status: 404 }
      );
    }

    await deleteCustomField(tenant.tenantId, fieldId);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "custom_field",
      fieldId,
      {
        resourceName: `Custom field: ${field.displayName}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Custom field deleted" });
  } catch (error) {
    console.error("custom-fields.delete.failed", error);
    return Response.json(
      { error: "Unable to delete custom field" },
      { status: 500 }
    );
  }
}
