/**
 * Custom Fields & Extensibility (Phase 35)
 *
 * Allows tenants to define custom fields on standard resources:
 * - Contacts, Accounts, Deals, Activities, Calendar Events
 * - Support for multiple field types (text, number, date, select, checkbox)
 * - Field validation rules
 * - Field grouping and organization
 * - Conditional field visibility
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type CustomFieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "CURRENCY"
  | "DATE"
  | "DATETIME"
  | "SELECT"
  | "MULTI_SELECT"
  | "CHECKBOX"
  | "EMAIL"
  | "PHONE"
  | "URL";

export type ResourceType =
  | "CONTACT"
  | "ACCOUNT"
  | "DEAL"
  | "ACTIVITY"
  | "BOOKING";

export interface CustomField {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  fieldName: string;
  displayName: string;
  fieldType: CustomFieldType;
  required: boolean;
  unique: boolean;
  description?: string;
  defaultValue?: unknown;
  options?: string[]; // For select/multi-select
  validationRules?: ValidationRule[];
  groupName?: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationRule {
  type: "MIN_LENGTH" | "MAX_LENGTH" | "MIN_VALUE" | "MAX_VALUE" | "REGEX" | "CUSTOM";
  value?: unknown;
  errorMessage?: string;
}

export interface FieldGroup {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  groupName: string;
  description?: string;
  displayOrder: number;
  collapsed: boolean;
  createdAt: string;
}

export interface CustomFieldValue {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  resourceId: string;
  fieldId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a custom field for a resource type
 */
export async function createCustomField(
  tenantId: string,
  field: Omit<CustomField, "id" | "tenantId" | "createdAt" | "updatedAt">
): Promise<CustomField> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const customField: CustomField = {
    id,
    tenantId,
    ...field,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO custom_fields
       (id, tenant_id, resource_type, field_name, display_name, field_type, required, "unique", description, default_value, options, validation_rules, group_name, display_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      field.resourceType,
      field.fieldName,
      field.displayName,
      field.fieldType,
      field.required ? 1 : 0,
      field.unique ? 1 : 0,
      field.description || null,
      field.defaultValue ? JSON.stringify(field.defaultValue) : null,
      field.options ? JSON.stringify(field.options) : null,
      field.validationRules ? JSON.stringify(field.validationRules) : null,
      field.groupName || null,
      field.displayOrder,
      field.active ? 1 : 0,
      now,
      now
    )
    .run();

  return customField;
}

/**
 * Get custom fields for a resource type
 */
export async function getCustomFields(
  tenantId: string,
  resourceType: ResourceType
): Promise<CustomField[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM custom_fields
       WHERE tenant_id = ? AND resource_type = ? AND active = 1
       ORDER BY display_order ASC`
    )
    .bind(tenantId, resourceType)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceType,
    fieldName: String(row.field_name),
    displayName: String(row.display_name),
    fieldType: String(row.field_type) as CustomFieldType,
    required: Boolean(row.required),
    unique: Boolean(row.unique),
    description: row.description ? String(row.description) : undefined,
    defaultValue: row.default_value
      ? JSON.parse(String(row.default_value))
      : undefined,
    options: row.options ? JSON.parse(String(row.options)) : undefined,
    validationRules: row.validation_rules
      ? JSON.parse(String(row.validation_rules))
      : undefined,
    groupName: row.group_name ? String(row.group_name) : undefined,
    displayOrder: Number(row.display_order),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Get a specific custom field
 */
export async function getCustomField(
  tenantId: string,
  fieldId: string
): Promise<CustomField | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT * FROM custom_fields WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, fieldId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceType,
    fieldName: String(row.field_name),
    displayName: String(row.display_name),
    fieldType: String(row.field_type) as CustomFieldType,
    required: Boolean(row.required),
    unique: Boolean(row.unique),
    description: row.description ? String(row.description) : undefined,
    defaultValue: row.default_value
      ? JSON.parse(String(row.default_value))
      : undefined,
    options: row.options ? JSON.parse(String(row.options)) : undefined,
    validationRules: row.validation_rules
      ? JSON.parse(String(row.validation_rules))
      : undefined,
    groupName: row.group_name ? String(row.group_name) : undefined,
    displayOrder: Number(row.display_order),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Update a custom field
 */
export async function updateCustomField(
  tenantId: string,
  fieldId: string,
  updates: Partial<Omit<CustomField, "id" | "tenantId" | "createdAt">>
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(updates.displayName);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description || null);
  }
  if (updates.defaultValue !== undefined) {
    fields.push("default_value = ?");
    values.push(updates.defaultValue ? JSON.stringify(updates.defaultValue) : null);
  }
  if (updates.options !== undefined) {
    fields.push("options = ?");
    values.push(updates.options ? JSON.stringify(updates.options) : null);
  }
  if (updates.validationRules !== undefined) {
    fields.push("validation_rules = ?");
    values.push(
      updates.validationRules
        ? JSON.stringify(updates.validationRules)
        : null
    );
  }
  if (updates.required !== undefined) {
    fields.push("required = ?");
    values.push(updates.required ? 1 : 0);
  }
  if (updates.active !== undefined) {
    fields.push("active = ?");
    values.push(updates.active ? 1 : 0);
  }
  if (updates.displayOrder !== undefined) {
    fields.push("display_order = ?");
    values.push(updates.displayOrder);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  values.push(now);
  values.push(tenantId);
  values.push(fieldId);

  await db
    .prepare(
      `UPDATE custom_fields SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`
    )
    .bind(...values)
    .run();
}

/**
 * Delete a custom field (soft delete)
 */
export async function deleteCustomField(
  tenantId: string,
  fieldId: string
): Promise<void> {
  await updateCustomField(tenantId, fieldId, { active: false });
}

/**
 * Set custom field value for a resource
 */
export async function setCustomFieldValue(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string,
  fieldId: string,
  value: unknown
): Promise<CustomFieldValue> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result: CustomFieldValue = {
    id,
    tenantId,
    resourceType,
    resourceId,
    fieldId,
    value,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT OR REPLACE INTO custom_field_values
       (id, tenant_id, resource_type, resource_id, field_id, value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      resourceType,
      resourceId,
      fieldId,
      typeof value === "string" ? value : JSON.stringify(value),
      now,
      now
    )
    .run();

  return result;
}

/**
 * Get custom field values for a resource
 */
export async function getCustomFieldValues(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<Record<string, unknown>> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT field_id, value FROM custom_field_values
       WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?`
    )
    .bind(tenantId, resourceType, resourceId)
    .all<{ field_id: string; value: string }>();

  const values: Record<string, unknown> = {};
  for (const row of results) {
    try {
      values[row.field_id] = JSON.parse(row.value);
    } catch {
      values[row.field_id] = row.value;
    }
  }

  return values;
}

/**
 * Create a field group for organizing custom fields
 */
export async function createFieldGroup(
  tenantId: string,
  resourceType: ResourceType,
  groupName: string,
  displayOrder: number,
  description?: string
): Promise<FieldGroup> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const group: FieldGroup = {
    id,
    tenantId,
    resourceType,
    groupName,
    description,
    displayOrder,
    collapsed: false,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO custom_field_groups
       (id, tenant_id, resource_type, group_name, description, display_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      resourceType,
      groupName,
      description || null,
      displayOrder,
      0,
      now
    )
    .run();

  return group;
}

/**
 * Get field groups for a resource type
 */
export async function getFieldGroups(
  tenantId: string,
  resourceType: ResourceType
): Promise<FieldGroup[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM custom_field_groups
       WHERE tenant_id = ? AND resource_type = ?
       ORDER BY display_order ASC`
    )
    .bind(tenantId, resourceType)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceType,
    groupName: String(row.group_name),
    description: row.description ? String(row.description) : undefined,
    displayOrder: Number(row.display_order),
    collapsed: Boolean(row.collapsed),
    createdAt: String(row.created_at),
  }));
}

/**
 * Validate custom field value against field definition
 */
export function validateCustomFieldValue(
  field: CustomField,
  value: unknown
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    if (field.required) {
      return { valid: false, error: `${field.displayName} is required` };
    }
    return { valid: true };
  }

  // Type validation
  switch (field.fieldType) {
    case "NUMBER":
    case "CURRENCY":
      if (typeof value !== "number") {
        return { valid: false, error: `${field.displayName} must be a number` };
      }
      break;
    case "DATE":
    case "DATETIME":
      if (!isValidDate(String(value))) {
        return {
          valid: false,
          error: `${field.displayName} must be a valid date`,
        };
      }
      break;
    case "EMAIL":
      if (!isValidEmail(String(value))) {
        return {
          valid: false,
          error: `${field.displayName} must be a valid email`,
        };
      }
      break;
    case "PHONE":
      if (!isValidPhone(String(value))) {
        return {
          valid: false,
          error: `${field.displayName} must be a valid phone number`,
        };
      }
      break;
    case "SELECT":
      if (field.options && !field.options.includes(String(value))) {
        return {
          valid: false,
          error: `${field.displayName} has an invalid option`,
        };
      }
      break;
    case "MULTI_SELECT":
      if (field.options) {
        const values = Array.isArray(value) ? value : [value];
        if (!values.every((v) => field.options!.includes(String(v)))) {
          return {
            valid: false,
            error: `${field.displayName} has invalid options`,
          };
        }
      }
      break;
    case "CHECKBOX":
      if (typeof value !== "boolean") {
        return {
          valid: false,
          error: `${field.displayName} must be true or false`,
        };
      }
      break;
  }

  // Validation rules
  if (field.validationRules) {
    const strValue = String(value);
    for (const rule of field.validationRules) {
      switch (rule.type) {
        case "MIN_LENGTH":
          if (strValue.length < Number(rule.value)) {
            return {
              valid: false,
              error: rule.errorMessage || `Minimum ${rule.value} characters required`,
            };
          }
          break;
        case "MAX_LENGTH":
          if (strValue.length > Number(rule.value)) {
            return {
              valid: false,
              error:
                rule.errorMessage ||
                `Maximum ${rule.value} characters allowed`,
            };
          }
          break;
        case "MIN_VALUE":
          if (Number(value) < Number(rule.value)) {
            return {
              valid: false,
              error:
                rule.errorMessage ||
                `Minimum value ${rule.value} required`,
            };
          }
          break;
        case "MAX_VALUE":
          if (Number(value) > Number(rule.value)) {
            return {
              valid: false,
              error:
                rule.errorMessage ||
                `Maximum value ${rule.value} allowed`,
            };
          }
          break;
        case "REGEX":
          const regex = new RegExp(String(rule.value));
          if (!regex.test(strValue)) {
            return {
              valid: false,
              error:
                rule.errorMessage ||
                `${field.displayName} format is invalid`,
            };
          }
          break;
      }
    }
  }

  return { valid: true };
}

function isValidDate(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^\d{7,}$/.test(value.replace(/\D/g, ""));
}
