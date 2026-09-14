/**
 * Bulk Operations API (Phase 38)
 *
 * Perform batch operations on multiple resources:
 * - Bulk create/update/delete contacts, deals, accounts
 * - Bulk tag/untag resources
 * - Bulk email sending
 * - Bulk property updates with validation
 * - Batch job processing and monitoring
 * - Progress tracking and error reporting
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type BulkOperationType =
  | "CREATE_CONTACTS"
  | "UPDATE_CONTACTS"
  | "DELETE_CONTACTS"
  | "ADD_TAGS"
  | "REMOVE_TAGS"
  | "BULK_EMAIL"
  | "UPDATE_PROPERTIES"
  | "MOVE_DEALS"
  | "EXPORT_DATA";

export type BulkOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_COMPLETED";

export interface BulkOperation {
  id: string;
  tenantId: string;
  operationType: BulkOperationType;
  status: BulkOperationStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  data: Record<string, unknown>;
  errors?: { itemIndex: number; error: string }[];
  progress: number;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedTimeRemainingSeconds?: number;
}

export interface BulkOperationResult {
  operationId: string;
  itemIndex: number;
  resourceId?: string;
  success: boolean;
  error?: string;
}

/**
 * Create a bulk operation
 */
export async function createBulkOperation(
  tenantId: string,
  operationType: BulkOperationType,
  items: Record<string, unknown>[],
  createdBy: string
): Promise<BulkOperation> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const operation: BulkOperation = {
    id,
    tenantId,
    operationType,
    status: "PENDING",
    totalItems: items.length,
    processedItems: 0,
    successfulItems: 0,
    failedItems: 0,
    data: { items },
    progress: 0,
    createdBy,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO bulk_operations
       (id, tenant_id, operation_type, status, total_items, processed_items, successful_items, failed_items, data, progress, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      operationType,
      "PENDING",
      items.length,
      0,
      0,
      0,
      JSON.stringify({ items }),
      0,
      createdBy,
      now
    )
    .run();

  return operation;
}

/**
 * Get bulk operation by ID
 */
export async function getBulkOperation(
  tenantId: string,
  operationId: string
): Promise<BulkOperation | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT * FROM bulk_operations WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, operationId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    operationType: String(row.operation_type) as BulkOperationType,
    status: String(row.status) as BulkOperationStatus,
    totalItems: Number(row.total_items),
    processedItems: Number(row.processed_items),
    successfulItems: Number(row.successful_items),
    failedItems: Number(row.failed_items),
    data: JSON.parse(String(row.data || "{}")),
    errors: row.errors ? JSON.parse(String(row.errors)) : undefined,
    progress: Number(row.progress || 0),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    estimatedTimeRemainingSeconds: row.estimated_time_remaining_seconds
      ? Number(row.estimated_time_remaining_seconds)
      : undefined,
  };
}

/**
 * List bulk operations for tenant
 */
export async function listBulkOperations(
  tenantId: string,
  limit = 50
): Promise<BulkOperation[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM bulk_operations WHERE tenant_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .bind(tenantId, limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    operationType: String(row.operation_type) as BulkOperationType,
    status: String(row.status) as BulkOperationStatus,
    totalItems: Number(row.total_items),
    processedItems: Number(row.processed_items),
    successfulItems: Number(row.successful_items),
    failedItems: Number(row.failed_items),
    data: JSON.parse(String(row.data || "{}")),
    errors: row.errors ? JSON.parse(String(row.errors)) : undefined,
    progress: Number(row.progress || 0),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    estimatedTimeRemainingSeconds: row.estimated_time_remaining_seconds
      ? Number(row.estimated_time_remaining_seconds)
      : undefined,
  }));
}

/**
 * Update bulk operation status
 */
export async function updateBulkOperationProgress(
  tenantId: string,
  operationId: string,
  processedItems: number,
  successfulItems: number,
  failedItems: number,
  status?: BulkOperationStatus,
  errors?: { itemIndex: number; error: string }[]
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get total items to calculate progress
  const operation = await getBulkOperation(tenantId, operationId);
  if (!operation) return;

  const progress = Math.round((processedItems / operation.totalItems) * 100);
  const newStatus = status || "PROCESSING";

  let query =
    `UPDATE bulk_operations SET processed_items = ?, successful_items = ?, failed_items = ?, progress = ?, status = ?, updated_at = ?`;
  const params: unknown[] = [
    processedItems,
    successfulItems,
    failedItems,
    progress,
    newStatus,
    now,
  ];

  if (newStatus === "PROCESSING" && !operation.startedAt) {
    query += `, started_at = ?`;
    params.push(now);
  }

  if (
    newStatus === "COMPLETED" ||
    newStatus === "FAILED" ||
    newStatus === "PARTIALLY_COMPLETED"
  ) {
    query += `, completed_at = ?`;
    params.push(now);
  }

  if (errors) {
    query += `, errors = ?`;
    params.push(JSON.stringify(errors));
  }

  query += ` WHERE tenant_id = ? AND id = ?`;
  params.push(tenantId);
  params.push(operationId);

  await db.prepare(query).bind(...params).run();
}

/**
 * Log bulk operation result
 */
export async function logBulkOperationResult(
  tenantId: string,
  operationId: string,
  result: BulkOperationResult
): Promise<void> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO bulk_operation_results
       (id, tenant_id, operation_id, item_index, resource_id, success, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      operationId,
      result.itemIndex,
      result.resourceId || null,
      result.success ? 1 : 0,
      result.error || null,
      now
    )
    .run();
}

/**
 * Get bulk operation results
 */
export async function getBulkOperationResults(
  tenantId: string,
  operationId: string,
  limit = 100
): Promise<BulkOperationResult[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM bulk_operation_results
       WHERE tenant_id = ? AND operation_id = ?
       ORDER BY item_index ASC LIMIT ?`
    )
    .bind(tenantId, operationId, limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    operationId: String(row.operation_id),
    itemIndex: Number(row.item_index),
    resourceId: row.resource_id ? String(row.resource_id) : undefined,
    success: Boolean(row.success),
    error: row.error ? String(row.error) : undefined,
  }));
}

/**
 * Cancel bulk operation
 */
export async function cancelBulkOperation(
  tenantId: string,
  operationId: string
): Promise<void> {
  const db = coreDb();

  const operation = await getBulkOperation(tenantId, operationId);
  if (!operation) return;

  if (operation.status === "PROCESSING") {
    await db
      .prepare(
        `UPDATE bulk_operations SET status = ?, completed_at = ? WHERE tenant_id = ? AND id = ?`
      )
      .bind("FAILED", new Date().toISOString(), tenantId, operationId)
      .run();
  }
}

/**
 * Get bulk operation statistics
 */
export async function getBulkOperationStats(
  tenantId: string,
  days = 7
): Promise<{
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  pendingOperations: number;
  totalItemsProcessed: number;
  averageSuccessRate: number;
  operationsByType: Record<string, number>;
}> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { results } = await db
    .prepare(
      `SELECT * FROM bulk_operations WHERE tenant_id = ? AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<Record<string, unknown>>();

  const total = results.length;
  const completed = results.filter((r) => r.status === "COMPLETED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const pending = results.filter((r) => r.status === "PENDING").length;

  let totalProcessed = 0;
  let totalSuccess = 0;

  const operationsByType: Record<string, number> = {};

  for (const op of results) {
    totalProcessed += Number(op.total_items);
    totalSuccess += Number(op.successful_items);

    const type = String(op.operation_type);
    operationsByType[type] = (operationsByType[type] || 0) + 1;
  }

  return {
    totalOperations: total,
    completedOperations: completed,
    failedOperations: failed,
    pendingOperations: pending,
    totalItemsProcessed: totalProcessed,
    averageSuccessRate:
      totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 0,
    operationsByType,
  };
}

/**
 * Validate bulk operation data before processing
 */
export function validateBulkData(
  operationType: BulkOperationType,
  items: Record<string, unknown>[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!items || items.length === 0) {
    errors.push("At least one item is required");
    return { valid: false, errors };
  }

  if (items.length > 10000) {
    errors.push("Maximum 10,000 items per bulk operation");
    return { valid: false, errors };
  }

  switch (operationType) {
    case "CREATE_CONTACTS":
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.full_name && !item.email) {
          errors.push(
            `Item ${i}: Either full_name or email is required`
          );
        }
      }
      break;
    case "UPDATE_CONTACTS":
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.id) {
          errors.push(`Item ${i}: id is required for updates`);
        }
      }
      break;
    case "ADD_TAGS":
    case "REMOVE_TAGS":
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.resource_id || !item.tags) {
          errors.push(`Item ${i}: resource_id and tags are required`);
        }
      }
      break;
    case "BULK_EMAIL":
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.recipient_email || !item.subject || !item.body) {
          errors.push(
            `Item ${i}: recipient_email, subject, and body are required`
          );
        }
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clean up old bulk operations (keep 30 days)
 */
export async function cleanupOldBulkOperations(): Promise<void> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `DELETE FROM bulk_operations WHERE completed_at < ?`
    )
    .bind(cutoffDate)
    .run();

  await db
    .prepare(
      `DELETE FROM bulk_operation_results WHERE created_at < ?`
    )
    .bind(cutoffDate)
    .run();
}
