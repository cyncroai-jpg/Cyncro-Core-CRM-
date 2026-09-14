/**
 * Data Retention & Archival Policies (Phase 39)
 *
 * Manage data lifecycle and compliance:
 * - Define retention policies per resource type
 * - Automatic archival of old data
 * - GDPR-compliant data deletion
 * - Audit trail preservation
 * - Storage optimization
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type ResourceTypeForRetention =
  | "CONTACT"
  | "DEAL"
  | "ACCOUNT"
  | "ACTIVITY"
  | "EMAIL"
  | "SMS"
  | "FORM_SUBMISSION"
  | "AUDIT_LOG"
  | "API_KEY_USAGE";

export type RetentionAction = "ARCHIVE" | "DELETE" | "ANONYMIZE";

export interface RetentionPolicy {
  id: string;
  tenantId: string;
  resourceType: ResourceTypeForRetention;
  retentionDays: number;
  action: RetentionAction;
  archiveStorage?: string; // S3 bucket, etc.
  anonymizeFields?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArchivedRecord {
  id: string;
  tenantId: string;
  resourceType: ResourceTypeForRetention;
  resourceId: string;
  originalData: Record<string, unknown>;
  archivedAt: string;
  expiresAt?: string;
  storageLocation?: string;
}

export interface DataRetentionMetrics {
  totalRecords: number;
  archivedRecords: number;
  pendingDeletion: number;
  estimatedStorageSavedMB: number;
  policiesActive: number;
  lastCleanupAt?: string;
}

/**
 * Create or update a retention policy
 */
export async function setRetentionPolicy(
  tenantId: string,
  resourceType: ResourceTypeForRetention,
  retentionDays: number,
  action: RetentionAction,
  options?: {
    archiveStorage?: string;
    anonymizeFields?: string[];
  }
): Promise<RetentionPolicy> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const policy: RetentionPolicy = {
    id,
    tenantId,
    resourceType,
    retentionDays,
    action,
    archiveStorage: options?.archiveStorage,
    anonymizeFields: options?.anonymizeFields,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT OR REPLACE INTO retention_policies
       (id, tenant_id, resource_type, retention_days, action, archive_storage, anonymize_fields, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      resourceType,
      retentionDays,
      action,
      options?.archiveStorage || null,
      options?.anonymizeFields ? JSON.stringify(options.anonymizeFields) : null,
      1,
      now,
      now
    )
    .run();

  return policy;
}

/**
 * Get retention policy for resource type
 */
export async function getRetentionPolicy(
  tenantId: string,
  resourceType: ResourceTypeForRetention
): Promise<RetentionPolicy | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT * FROM retention_policies WHERE tenant_id = ? AND resource_type = ? AND enabled = 1`
    )
    .bind(tenantId, resourceType)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceTypeForRetention,
    retentionDays: Number(row.retention_days),
    action: String(row.action) as RetentionAction,
    archiveStorage: row.archive_storage ? String(row.archive_storage) : undefined,
    anonymizeFields: row.anonymize_fields
      ? JSON.parse(String(row.anonymize_fields))
      : undefined,
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List all retention policies for tenant
 */
export async function listRetentionPolicies(tenantId: string): Promise<RetentionPolicy[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM retention_policies WHERE tenant_id = ? ORDER BY resource_type ASC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceTypeForRetention,
    retentionDays: Number(row.retention_days),
    action: String(row.action) as RetentionAction,
    archiveStorage: row.archive_storage ? String(row.archive_storage) : undefined,
    anonymizeFields: row.anonymize_fields
      ? JSON.parse(String(row.anonymize_fields))
      : undefined,
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Disable a retention policy
 */
export async function disableRetentionPolicy(
  tenantId: string,
  resourceType: ResourceTypeForRetention
): Promise<void> {
  const db = coreDb();

  await db
    .prepare(
      `UPDATE retention_policies SET enabled = 0, updated_at = ? WHERE tenant_id = ? AND resource_type = ?`
    )
    .bind(new Date().toISOString(), tenantId, resourceType)
    .run();
}

/**
 * Archive a record
 */
export async function archiveRecord(
  tenantId: string,
  resourceType: ResourceTypeForRetention,
  resourceId: string,
  originalData: Record<string, unknown>,
  storageLocation?: string
): Promise<ArchivedRecord> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: ArchivedRecord = {
    id,
    tenantId,
    resourceType,
    resourceId,
    originalData,
    archivedAt: now,
    storageLocation,
  };

  await db
    .prepare(
      `INSERT INTO archived_records
       (id, tenant_id, resource_type, resource_id, original_data, archived_at, storage_location)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      resourceType,
      resourceId,
      JSON.stringify(originalData),
      now,
      storageLocation || null
    )
    .run();

  return record;
}

/**
 * Get archived record
 */
export async function getArchivedRecord(
  tenantId: string,
  recordId: string
): Promise<ArchivedRecord | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT * FROM archived_records WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, recordId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ResourceTypeForRetention,
    resourceId: String(row.resource_id),
    originalData: JSON.parse(String(row.original_data)),
    archivedAt: String(row.archived_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    storageLocation: row.storage_location ? String(row.storage_location) : undefined,
  };
}

/**
 * Get records eligible for retention action
 */
export async function getEligibleRecordsForRetention(
  tenantId: string,
  resourceType: ResourceTypeForRetention,
  retentionDays: number,
  limit = 1000
): Promise<{ id: string; created_at: string }[]> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const tableName = getTableNameForResourceType(resourceType);
  if (!tableName) return [];

  const { results } = await db
    .prepare(
      `SELECT id, created_at FROM ${tableName}
       WHERE tenant_id = ? AND created_at < ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .bind(tenantId, cutoffDate, limit)
    .all<{ id: string; created_at: string }>();

  return results;
}

/**
 * Delete records (compliant with GDPR)
 */
export async function deleteRecords(
  tenantId: string,
  resourceType: ResourceTypeForRetention,
  resourceIds: string[]
): Promise<number> {
  const db = coreDb();
  const tableName = getTableNameForResourceType(resourceType);

  if (!tableName || resourceIds.length === 0) return 0;

  const placeholders = resourceIds.map(() => "?").join(",");
  const { meta } = await db
    .prepare(
      `DELETE FROM ${tableName} WHERE tenant_id = ? AND id IN (${placeholders})`
    )
    .bind(tenantId, ...resourceIds)
    .run();

  return meta?.changes || 0;
}

/**
 * Anonymize records (GDPR compliance)
 */
export async function anonymizeRecords(
  tenantId: string,
  resourceType: ResourceTypeForRetention,
  resourceIds: string[],
  fieldsToAnonymize: string[]
): Promise<void> {
  const db = coreDb();
  const tableName = getTableNameForResourceType(resourceType);

  if (!tableName || resourceIds.length === 0) return;

  // Create anonymized values
  const anonymizedData: Record<string, unknown> = {};
  for (const field of fieldsToAnonymize) {
    anonymizedData[field] = `[REDACTED-${crypto.randomBytes(4).toString("hex")}]`;
  }

  const updateFields = fieldsToAnonymize
    .map((field) => `${field} = ?`)
    .join(", ");
  const updateValues = fieldsToAnonymize.map((f) => anonymizedData[f]);

  const placeholders = resourceIds.map(() => "?").join(",");
  const query = `UPDATE ${tableName} SET ${updateFields}, updated_at = ? WHERE tenant_id = ? AND id IN (${placeholders})`;

  await db
    .prepare(query)
    .bind(...updateValues, new Date().toISOString(), tenantId, ...resourceIds)
    .run();
}

/**
 * Execute retention cleanup job
 */
export async function executeRetentionCleanup(
  tenantId: string,
  batchSize = 100
): Promise<{
  processed: number;
  archived: number;
  deleted: number;
  anonymized: number;
}> {
  const db = coreDb();
  let processed = 0;
  let archived = 0;
  let deleted = 0;
  let anonymized = 0;

  // Get all active policies
  const policies = await listRetentionPolicies(tenantId);

  for (const policy of policies) {
    if (!policy.enabled) continue;

    const records = await getEligibleRecordsForRetention(
      tenantId,
      policy.resourceType,
      policy.retentionDays,
      batchSize
    );

    if (records.length === 0) continue;

    const recordIds = records.map((r) => r.id);

    // Archive before deleting if needed
    if (policy.action === "ARCHIVE" || policy.action === "ANONYMIZE") {
      for (const record of records) {
        // In a real implementation, fetch the full record data
        await archiveRecord(
          tenantId,
          policy.resourceType,
          record.id,
          { id: record.id, archived: true },
          policy.archiveStorage
        );
        archived++;
      }
    }

    // Execute action
    if (policy.action === "DELETE") {
      deleted += await deleteRecords(tenantId, policy.resourceType, recordIds);
    } else if (
      policy.action === "ANONYMIZE" &&
      policy.anonymizeFields &&
      policy.anonymizeFields.length > 0
    ) {
      await anonymizeRecords(
        tenantId,
        policy.resourceType,
        recordIds,
        policy.anonymizeFields
      );
      anonymized += recordIds.length;
    }

    processed += recordIds.length;
  }

  // Update last cleanup timestamp
  await db
    .prepare(
      `UPDATE retention_cleanup_log SET last_cleanup_at = ? WHERE tenant_id = ?`
    )
    .bind(new Date().toISOString(), tenantId)
    .run();

  return { processed, archived, deleted, anonymized };
}

/**
 * Get data retention metrics
 */
export async function getDataRetentionMetrics(tenantId: string): Promise<DataRetentionMetrics> {
  const db = coreDb();

  // Count archived records
  const { results: archivedResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM archived_records WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  const archivedCount = Number(archivedResult[0]?.count || 0);

  // Count active policies
  const { results: policiesResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM retention_policies WHERE tenant_id = ? AND enabled = 1`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  const activePolicies = Number(policiesResult[0]?.count || 0);

  // Get last cleanup
  const lastCleanup = await db
    .prepare(
      `SELECT last_cleanup_at FROM retention_cleanup_log WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .first<{ last_cleanup_at: string }>();

  // Estimate total records (simplified)
  const { results: totalResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM crm_contacts WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  const totalRecords = Number(totalResult[0]?.count || 0);
  const estimatedStorageSaved = archivedCount * 0.5; // Rough estimate

  return {
    totalRecords,
    archivedRecords: archivedCount,
    pendingDeletion: 0,
    estimatedStorageSavedMB: estimatedStorageSaved,
    policiesActive: activePolicies,
    lastCleanupAt: lastCleanup?.last_cleanup_at,
  };
}

// Helper function to get table name from resource type
function getTableNameForResourceType(resourceType: ResourceTypeForRetention): string | null {
  const tableMap: Record<ResourceTypeForRetention, string> = {
    CONTACT: "crm_contacts",
    DEAL: "crm_opportunities",
    ACCOUNT: "crm_accounts",
    ACTIVITY: "crm_activities",
    EMAIL: "email_sequences",
    SMS: "sms_sequences",
    FORM_SUBMISSION: "form_submissions",
    AUDIT_LOG: "audit_logs",
    API_KEY_USAGE: "api_key_usage",
  };

  return tableMap[resourceType] || null;
}
