/**
 * Advanced Permissions System
 *
 * Field-level and attribute-based access control:
 * - Field-level permissions (hide/mask sensitive data)
 * - Attribute-based access control (ABAC)
 * - Dynamic permission rules
 * - Team-based visibility
 * - Custom permission rules per resource
 */

import { coreDb } from "@/lib/core/db";

export type PermissionRuleType =
  | "FIELD_MASK"
  | "FIELD_HIDE"
  | "ATTRIBUTE_MATCH"
  | "TEAM_ONLY"
  | "OWNER_ONLY";

export type FieldMaskType = "FULL" | "PARTIAL" | "LAST_4" | "DOMAIN";

export interface FieldPermissionRule {
  id: string;
  tenantId: string;
  role: string;
  resourceType: string;
  field: string;
  ruleType: "HIDE" | "MASK" | "VISIBLE";
  maskType?: FieldMaskType; // FULL, PARTIAL (show ***), LAST_4, DOMAIN
  condition?: Record<string, unknown>; // e.g., { status: "DRAFT" }
  createdAt: string;
  updatedAt: string;
}

export interface DynamicPermissionRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  resourceType: string;
  action: "create" | "read" | "update" | "delete";
  conditions: {
    field: string;
    operator: "eq" | "ne" | "gt" | "lt" | "in" | "contains" | "matches_role";
    value: unknown;
  }[];
  allow: boolean; // true = allow, false = deny
  priority: number;
  createdAt: string;
  updatedAt: string;
}

/** Set field-level permission */
export async function setFieldPermission(
  tenantId: string,
  role: string,
  resourceType: string,
  field: string,
  ruleType: "HIDE" | "MASK" | "VISIBLE",
  maskType?: FieldMaskType,
  condition?: Record<string, unknown>
): Promise<FieldPermissionRule> {
  const db = coreDb();
  const now = new Date().toISOString();
  const ruleId = crypto.randomUUID();

  const rule: FieldPermissionRule = {
    id: ruleId,
    tenantId,
    role,
    resourceType,
    field,
    ruleType,
    maskType,
    condition,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO field_permissions
       (id, tenant_id, role, resource_type, field, rule_type, mask_type, condition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ruleId,
      tenantId,
      role,
      resourceType,
      field,
      ruleType,
      maskType || null,
      condition ? JSON.stringify(condition) : null,
      now,
      now
    )
    .run();

  return rule;
}

/** Get field permissions for role */
export async function getFieldPermissionsForRole(
  tenantId: string,
  role: string,
  resourceType: string
): Promise<FieldPermissionRule[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM field_permissions
       WHERE tenant_id = ? AND role = ? AND resource_type = ?
       ORDER BY field ASC`
    )
    .bind(tenantId, role, resourceType)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    role: String(row.role),
    resourceType: String(row.resource_type),
    field: String(row.field),
    ruleType: String(row.rule_type) as "HIDE" | "MASK" | "VISIBLE",
    maskType: row.mask_type ? (String(row.mask_type) as FieldMaskType) : undefined,
    condition: row.condition ? JSON.parse(String(row.condition)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/** Filter object fields based on permissions */
export async function filterResourceFields(
  tenantId: string,
  role: string,
  resourceType: string,
  resource: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const permissions = await getFieldPermissionsForRole(
    tenantId,
    role,
    resourceType
  );

  const filtered: Record<string, unknown> = { ...resource };

  for (const perm of permissions) {
    if (perm.ruleType === "HIDE") {
      delete filtered[perm.field];
    } else if (perm.ruleType === "MASK" && filtered[perm.field]) {
      const value = String(filtered[perm.field]);

      filtered[perm.field] = maskFieldValue(value, perm.maskType || "FULL");
    }
  }

  return filtered;
}

/** Mask a field value */
function maskFieldValue(value: string, maskType: FieldMaskType): string {
  switch (maskType) {
    case "FULL":
      return "***";
    case "PARTIAL":
      return value.substring(0, 2) + "***";
    case "LAST_4":
      return "***" + value.substring(value.length - 4);
    case "DOMAIN":
      // For emails, show domain only
      if (value.includes("@")) {
        return "*@" + value.split("@")[1];
      }
      return "***";
    default:
      return "***";
  }
}

/** Create dynamic permission rule */
export async function createDynamicRule(
  tenantId: string,
  name: string,
  resourceType: string,
  action: "create" | "read" | "update" | "delete",
  conditions: {
    field: string;
    operator: "eq" | "ne" | "gt" | "lt" | "in" | "contains" | "matches_role";
    value: unknown;
  }[],
  allow: boolean = true,
  priority: number = 100,
  description?: string
): Promise<DynamicPermissionRule> {
  const db = coreDb();
  const now = new Date().toISOString();
  const ruleId = crypto.randomUUID();

  const rule: DynamicPermissionRule = {
    id: ruleId,
    tenantId,
    name,
    description,
    resourceType,
    action,
    conditions,
    allow,
    priority,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO dynamic_permissions
       (id, tenant_id, name, description, resource_type, action, conditions, allow, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ruleId,
      tenantId,
      name,
      description || null,
      resourceType,
      action,
      JSON.stringify(conditions),
      allow ? 1 : 0,
      priority,
      now,
      now
    )
    .run();

  return rule;
}

/** Evaluate if action is allowed by dynamic rules */
export async function evaluateDynamicRules(
  tenantId: string,
  resourceType: string,
  action: "create" | "read" | "update" | "delete",
  resource: Record<string, unknown>,
  userRole: string
): Promise<{
  allowed: boolean;
  reason?: string;
  ruleId?: string;
}> {
  const db = coreDb();

  const { results: rules } = await db
    .prepare(
      `SELECT * FROM dynamic_permissions
       WHERE tenant_id = ? AND resource_type = ? AND action = ?
       ORDER BY priority ASC`
    )
    .bind(tenantId, resourceType, action)
    .all<Record<string, unknown>>();

  for (const rule of rules) {
    const conditions = JSON.parse(String(rule.conditions || "[]"));
    const allow = Boolean(rule.allow);
    const ruleId = String(rule.id);

    // Check if all conditions match
    const allMatch = conditions.every((cond: any) => {
      const fieldValue = resource[cond.field];

      switch (cond.operator) {
        case "eq":
          return fieldValue === cond.value;
        case "ne":
          return fieldValue !== cond.value;
        case "gt":
          return Number(fieldValue) > Number(cond.value);
        case "lt":
          return Number(fieldValue) < Number(cond.value);
        case "in":
          return Array.isArray(cond.value) &&
            cond.value.includes(fieldValue);
        case "contains":
          return String(fieldValue).includes(String(cond.value));
        case "matches_role":
          return userRole === cond.value;
        default:
          return false;
      }
    });

    if (allMatch) {
      return {
        allowed: allow,
        reason: String(rule.name),
        ruleId,
      };
    }
  }

  // Default: allow if no rules matched
  return { allowed: true };
}

/** Get all dynamic rules for tenant */
export async function getDynamicRulesForTenant(
  tenantId: string,
  resourceType?: string
): Promise<DynamicPermissionRule[]> {
  const db = coreDb();

  let query = `SELECT * FROM dynamic_permissions WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (resourceType) {
    query += ` AND resource_type = ?`;
    params.push(resourceType);
  }

  query += ` ORDER BY priority ASC`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    resourceType: String(row.resource_type),
    action: String(row.action) as any,
    conditions: JSON.parse(String(row.conditions || "[]")),
    allow: Boolean(row.allow),
    priority: Number(row.priority),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/** Delete dynamic rule */
export async function deleteDynamicRule(
  tenantId: string,
  ruleId: string
): Promise<boolean> {
  const db = coreDb();

  const result = await db
    .prepare(`DELETE FROM dynamic_permissions WHERE id = ? AND tenant_id = ?`)
    .bind(ruleId, tenantId)
    .run();

  return (result.meta?.changes || 0) > 0;
}

/** Create team-based visibility rule */
export async function createTeamVisibilityRule(
  tenantId: string,
  role: string,
  resourceType: string,
  visibility: "own" | "team" | "all",
  teamId?: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Store as dynamic permission
  const condition = visibility === "own"
    ? { field: "owner_id", operator: "matches_role", value: "self" }
    : visibility === "team" && teamId
    ? { field: "team_id", operator: "eq", value: teamId }
    : null;

  if (!condition) return;

  await db
    .prepare(
      `INSERT INTO dynamic_permissions
       (id, tenant_id, name, resource_type, action, conditions, allow, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      `${role} ${visibility} visibility`,
      resourceType,
      "read",
      JSON.stringify([condition]),
      100,
      now,
      now
    )
    .run();
}
