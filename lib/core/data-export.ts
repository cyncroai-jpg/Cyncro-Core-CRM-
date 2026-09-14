/**
 * Data Export & Compliance Engine
 *
 * GDPR/CCPA compliance features:
 * - User data export (portable format)
 * - Data deletion requests
 * - Compliance reports
 * - Data retention policies
 * - Right to be forgotten
 */

import { coreDb } from "@/lib/core/db";

export type ExportFormat = "json" | "csv" | "pdf";

export interface DataExportRequest {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  format: ExportFormat;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  downloadUrl?: string;
  includeCategories: string[]; // contacts, deals, bookings, activities, etc.
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface DataDeletionRequest {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  includeCategories: string[]; // What data to delete
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface ComplianceReport {
  reportId: string;
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  dataCollected: Record<string, number>; // Contact count, deal count, etc.
  processingActivities: Array<{
    purpose: string;
    legalBasis: string;
    dataCategories: string[];
    recipients: string[];
    retentionPeriod: string;
  }>;
  thirdParties: string[]; // Integrated apps
  dataSubjectRights: {
    accessRequests: number;
    deletionRequests: number;
    portabilityRequests: number;
  };
  generatedAt: string;
}

/** Create data export request */
export async function createExportRequest(
  tenantId: string,
  userId: string,
  email: string,
  format: ExportFormat = "json",
  includeCategories: string[] = ["contacts", "deals", "bookings", "activities"]
): Promise<DataExportRequest> {
  const db = coreDb();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const requestId = crypto.randomUUID();

  const request: DataExportRequest = {
    id: requestId,
    tenantId,
    userId,
    email,
    format,
    status: "PENDING",
    includeCategories,
    createdAt: now,
    expiresAt,
  };

  await db
    .prepare(
      `INSERT INTO data_exports
       (id, tenant_id, user_id, email, format, status, categories, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      requestId,
      tenantId,
      userId,
      email,
      format,
      "PENDING",
      JSON.stringify(includeCategories),
      now,
      expiresAt
    )
    .run();

  return request;
}

/** Get export request status */
export async function getExportRequest(
  tenantId: string,
  requestId: string
): Promise<DataExportRequest | null> {
  const db = coreDb();

  const result = await db
    .prepare(
      `SELECT * FROM data_exports WHERE id = ? AND tenant_id = ?`
    )
    .bind(requestId, tenantId)
    .first<Record<string, unknown>>();

  if (!result) return null;

  return {
    id: String(result.id),
    tenantId: String(result.tenant_id),
    userId: String(result.user_id),
    email: String(result.email),
    format: String(result.format) as ExportFormat,
    status: String(result.status) as any,
    downloadUrl: result.download_url ? String(result.download_url) : undefined,
    includeCategories: JSON.parse(String(result.categories || "[]")),
    createdAt: String(result.created_at),
    expiresAt: String(result.expires_at),
    completedAt: result.completed_at ? String(result.completed_at) : undefined,
    errorMessage: result.error_message ? String(result.error_message) : undefined,
  };
}

/** Mark export as completed */
export async function completeExport(
  tenantId: string,
  requestId: string,
  downloadUrl: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE data_exports SET status = ?, download_url = ?, completed_at = ?
       WHERE id = ? AND tenant_id = ?`
    )
    .bind("COMPLETED", downloadUrl, now, requestId, tenantId)
    .run();
}

/** Create data deletion request */
export async function createDeletionRequest(
  tenantId: string,
  userId: string,
  email: string,
  includeCategories: string[] = ["all"]
): Promise<DataDeletionRequest> {
  const db = coreDb();
  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();

  const request: DataDeletionRequest = {
    id: requestId,
    tenantId,
    userId,
    email,
    status: "PENDING",
    includeCategories,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO data_deletions
       (id, tenant_id, user_id, email, status, categories, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      requestId,
      tenantId,
      userId,
      email,
      "PENDING",
      JSON.stringify(includeCategories),
      now
    )
    .run();

  return request;
}

/** Get deletion request */
export async function getDeletionRequest(
  tenantId: string,
  requestId: string
): Promise<DataDeletionRequest | null> {
  const db = coreDb();

  const result = await db
    .prepare(
      `SELECT * FROM data_deletions WHERE id = ? AND tenant_id = ?`
    )
    .bind(requestId, tenantId)
    .first<Record<string, unknown>>();

  if (!result) return null;

  return {
    id: String(result.id),
    tenantId: String(result.tenant_id),
    userId: String(result.user_id),
    email: String(result.email),
    status: String(result.status) as any,
    includeCategories: JSON.parse(String(result.categories || "[]")),
    createdAt: String(result.created_at),
    completedAt: result.completed_at ? String(result.completed_at) : undefined,
    errorMessage: result.error_message ? String(result.error_message) : undefined,
  };
}

/** Execute data deletion */
export async function executeDeletion(
  tenantId: string,
  userId: string,
  includeCategories: string[]
): Promise<{ deletedRecords: number }> {
  const db = coreDb();
  let deletedRecords = 0;

  if (
    includeCategories.includes("all") ||
    includeCategories.includes("contacts")
  ) {
    const result = await db
      .prepare(
        `DELETE FROM crm_contacts WHERE tenant_id = ? AND id IN
         (SELECT id FROM crm_contacts WHERE tenant_id = ? AND assigned_rep = ?)`
      )
      .bind(tenantId, tenantId, userId)
      .run();
    deletedRecords += result.meta?.changes || 0;
  }

  if (
    includeCategories.includes("all") ||
    includeCategories.includes("activities")
  ) {
    const result = await db
      .prepare(
        `DELETE FROM crm_activities WHERE tenant_id = ? AND created_by = ?`
      )
      .bind(tenantId, userId)
      .run();
    deletedRecords += result.meta?.changes || 0;
  }

  if (
    includeCategories.includes("all") ||
    includeCategories.includes("bookings")
  ) {
    const result = await db
      .prepare(
        `DELETE FROM calendar_bookings WHERE tenant_id = ? AND assigned_to = ?`
      )
      .bind(tenantId, userId)
      .run();
    deletedRecords += result.meta?.changes || 0;
  }

  return { deletedRecords };
}

/** Generate compliance report */
export async function generateComplianceReport(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<ComplianceReport> {
  const db = coreDb();

  // Count data
  const { results: contactsResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM crm_contacts WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  const { results: dealsResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM crm_opportunities WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  const { results: bookingsResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM calendar_bookings WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ count: number }>();

  // Count requests
  const { results: accessRequests } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM data_exports WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ count: number }>();

  const { results: deletionRequests } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM data_deletions WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?`
    )
    .bind(tenantId, startDate, endDate)
    .all<{ count: number }>();

  const { results: integrations } = await db
    .prepare(
      `SELECT DISTINCT name FROM integrations WHERE tenant_id = ? AND active = 1`
    )
    .bind(tenantId)
    .all<{ name: string }>();

  return {
    reportId: crypto.randomUUID(),
    tenantId,
    period: { startDate, endDate },
    dataCollected: {
      contacts: contactsResult[0]?.count || 0,
      deals: dealsResult[0]?.count || 0,
      bookings: bookingsResult[0]?.count || 0,
    },
    processingActivities: [
      {
        purpose: "CRM contact management",
        legalBasis: "Legitimate interest",
        dataCategories: ["Name", "Email", "Phone"],
        recipients: ["Internal team"],
        retentionPeriod: "While customer relationship exists",
      },
      {
        purpose: "Booking scheduling",
        legalBasis: "Consent",
        dataCategories: ["Calendar data", "Timezone"],
        recipients: ["Calendar system"],
        retentionPeriod: "90 days after event",
      },
    ],
    thirdParties: integrations.map((i) => i.name),
    dataSubjectRights: {
      accessRequests: accessRequests[0]?.count || 0,
      deletionRequests: deletionRequests[0]?.count || 0,
      portabilityRequests: accessRequests[0]?.count || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** List all export requests for tenant */
export async function listExportRequests(
  tenantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<DataExportRequest[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM data_exports WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(tenantId, limit, offset)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    email: String(row.email),
    format: String(row.format) as ExportFormat,
    status: String(row.status) as any,
    downloadUrl: row.download_url ? String(row.download_url) : undefined,
    includeCategories: JSON.parse(String(row.categories || "[]")),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  }));
}

/** Clean expired exports */
export async function cleanExpiredExports(tenantId: string): Promise<number> {
  const db = coreDb();
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `DELETE FROM data_exports WHERE tenant_id = ? AND expires_at < ? AND status = 'COMPLETED'`
    )
    .bind(tenantId, now)
    .run();

  return result.meta?.changes || 0;
}
