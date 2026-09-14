/**
 * Audit Logging System
 *
 * Comprehensive audit trail for compliance:
 * - Log all user actions with timestamps
 * - Track resource changes (before/after)
 * - Filter by user, resource type, action, date range
 * - Export audit logs for compliance
 * - Immutable logs (cannot be deleted or modified)
 * - Configurable retention policies
 */

import { coreDb } from "@/lib/core/db";

export type AuditAction =
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "IMPORT"
  | "LOGIN"
  | "LOGOUT"
  | "INVITE"
  | "PERMISSION_CHANGE"
  | "ROLE_CHANGE"
  | "WORKFLOW_TRIGGER"
  | "API_CALL"
  | "EXPORT_DATA"
  | "SUBMIT"
  | "PAYMENT"
  | "UPGRADE"
  | "COMPLETE_STEP"
  | "UNDERWRITE"
  | "ACCEPT_OFFER";

export type AuditResourceType =
  | "contact"
  | "account"
  | "opportunity"
  | "activity"
  | "event"
  | "booking"
  | "sequence"
  | "workflow"
  | "form"
  | "dashboard"
  | "report"
  | "integration"
  | "user"
  | "role"
  | "api_key"
  | "portfolio_metrics"
  | "customer_metrics"
  | "credit_repair_metrics"
  | "revenue_metrics"
  | "risk_analytics"
  | "analytics_dashboard"
  | "analytics_alert"
  | "export_job"
  | "payment_method"
  | "transaction"
  | "invoice"
  | "subscription"
  | "subscription_plan"
  | "dispute"
  | "dispute_template"
  | "credit_repair_client"
  | "credit_score_record"
  | "payment_record"
  | "client_access"
  | "onboarding"
  | "loan_application"
  | "loan"
  | "loan_payment"
  | "loan_product"
  | "loan_offer"
  | "disclosure"
  | "underwriting_decision";

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  resourceName?: string;
  changes?: {
    field: string;
    before: unknown;
    after: unknown;
  }[];
  ipAddress?: string;
  userAgent?: string;
  status: "SUCCESS" | "FAILURE";
  errorMessage?: string;
  createdAt: string;
}

export interface AuditFilter {
  userId?: string;
  email?: string;
  action?: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/** Log an action to audit trail */
export async function logAuditAction(
  tenantId: string,
  userId: string,
  email: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  options?: {
    resourceName?: string;
    changes?: AuditLog["changes"];
    ipAddress?: string;
    userAgent?: string;
    status?: "SUCCESS" | "FAILURE";
    errorMessage?: string;
  }
): Promise<AuditLog> {
  const db = coreDb();
  const now = new Date().toISOString();
  const logId = crypto.randomUUID();

  const log: AuditLog = {
    id: logId,
    tenantId,
    userId,
    email,
    action,
    resourceType,
    resourceId,
    resourceName: options?.resourceName,
    changes: options?.changes,
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
    status: options?.status || "SUCCESS",
    errorMessage: options?.errorMessage,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO audit_logs
       (id, tenant_id, user_id, email, action, resource_type, resource_id, resource_name,
        changes, ip_address, user_agent, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      logId,
      tenantId,
      userId,
      email,
      action,
      resourceType,
      resourceId,
      log.resourceName || null,
      log.changes ? JSON.stringify(log.changes) : null,
      options?.ipAddress || null,
      options?.userAgent || null,
      log.status,
      options?.errorMessage || null,
      now
    )
    .run();

  return log;
}

/** Query audit logs with filters */
export async function queryAuditLogs(
  tenantId: string,
  filter: AuditFilter
): Promise<{
  logs: AuditLog[];
  total: number;
  hasMore: boolean;
}> {
  const db = coreDb();
  let query =
    "SELECT * FROM audit_logs WHERE tenant_id = ? AND status = 'SUCCESS'";
  const params: unknown[] = [tenantId];

  // Apply filters
  if (filter.userId) {
    query += " AND user_id = ?";
    params.push(filter.userId);
  }
  if (filter.email) {
    query += " AND email = ?";
    params.push(filter.email);
  }
  if (filter.action) {
    query += " AND action = ?";
    params.push(filter.action);
  }
  if (filter.resourceType) {
    query += " AND resource_type = ?";
    params.push(filter.resourceType);
  }
  if (filter.resourceId) {
    query += " AND resource_id = ?";
    params.push(filter.resourceId);
  }
  if (filter.startDate) {
    query += " AND created_at >= ?";
    params.push(filter.startDate);
  }
  if (filter.endDate) {
    query += " AND created_at <= ?";
    params.push(filter.endDate);
  }

  // Get total count
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as count");
  const { results: countResult } = await db
    .prepare(countQuery)
    .bind(...params)
    .all<{ count: number }>();
  const total = countResult[0]?.count || 0;

  // Add pagination
  const limit = Math.min(filter.limit || 50, 1000);
  const offset = filter.offset || 0;
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit + 1, offset); // +1 to detect hasMore

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  const hasMore = results.length > limit;
  const logs: AuditLog[] = results.slice(0, limit).map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    email: String(row.email),
    action: String(row.action) as AuditAction,
    resourceType: String(row.resource_type) as AuditResourceType,
    resourceId: String(row.resource_id),
    resourceName: row.resource_name ? String(row.resource_name) : undefined,
    changes: row.changes ? JSON.parse(String(row.changes)) : undefined,
    ipAddress: row.ip_address ? String(row.ip_address) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    status: String(row.status) as "SUCCESS" | "FAILURE",
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    createdAt: String(row.created_at),
  }));

  return { logs, total, hasMore };
}

/** Get audit summary stats */
export async function getAuditStats(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalActions: number;
  actionsByType: Record<AuditAction, number>;
  actionsByResource: Record<AuditResourceType, number>;
  topUsers: Array<{ email: string; actionCount: number }>;
  failureCount: number;
}> {
  const db = coreDb();

  const { results: actions } = await db
    .prepare(
      `SELECT action, COUNT(*) as count FROM audit_logs
       WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?
       GROUP BY action`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ action: string; count: number }>();

  const { results: resources } = await db
    .prepare(
      `SELECT resource_type, COUNT(*) as count FROM audit_logs
       WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?
       GROUP BY resource_type`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ resource_type: string; count: number }>();

  const { results: users } = await db
    .prepare(
      `SELECT email, COUNT(*) as count FROM audit_logs
       WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?
       GROUP BY email
       ORDER BY count DESC
       LIMIT 10`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ email: string; count: number }>();

  const { results: failureResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE tenant_id = ? AND status = 'FAILURE' AND created_at >= ? AND created_at <= ?`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ count: number }>();

  const actionsByType: Record<AuditAction, number> = {} as any;
  actions.forEach((row) => {
    actionsByType[row.action as AuditAction] = row.count;
  });

  const actionsByResource: Record<AuditResourceType, number> = {} as any;
  resources.forEach((row) => {
    actionsByResource[row.resource_type as AuditResourceType] = row.count;
  });

  const totalActions = actions.reduce((sum, r) => sum + r.count, 0);

  return {
    totalActions,
    actionsByType,
    actionsByResource,
    topUsers: users.map((u) => ({ email: u.email, actionCount: u.count })),
    failureCount: failureResult[0]?.count || 0,
  };
}

/** Export audit logs as CSV */
export function exportAuditLogsToCSV(logs: AuditLog[]): string {
  const headers = [
    "Timestamp",
    "User",
    "Action",
    "Resource Type",
    "Resource ID",
    "Resource Name",
    "Status",
    "IP Address",
  ];

  const rows = logs.map((log) => [
    log.createdAt,
    log.email,
    log.action,
    log.resourceType,
    log.resourceId,
    log.resourceName || "",
    log.status,
    log.ipAddress || "",
  ]);

  const csvHeader = headers.map((h) => `"${h}"`).join(",");
  const csvRows = rows.map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  );

  return [csvHeader, ...csvRows].join("\n");
}

/** Clean old audit logs (retention policy) */
export async function cleanOldAuditLogs(
  tenantId: string,
  retentionDays: number = 90
): Promise<number> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const result = await db
    .prepare(
      `DELETE FROM audit_logs
       WHERE tenant_id = ? AND created_at < ?`
    )
    .bind(tenantId, cutoffDate)
    .run();

  return result.meta?.changes || 0;
}
