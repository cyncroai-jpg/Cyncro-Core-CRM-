/**
 * Audit Logging API
 *
 * GET /api/audit/logs — query audit logs with filters
 * GET /api/audit/stats — get audit statistics
 * GET /api/audit/logs?export=csv — export logs as CSV
 * GET /api/audit/summary — get compliance summary
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  queryAuditLogs,
  getAuditStats,
  exportAuditLogsToCSV,
  cleanOldAuditLogs,
} from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER, ADMIN, and MANAGER can view audit logs
    if (!["OWNER", "ADMIN", "MANAGER"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/audit/[section]

    if (section === "logs") {
      // GET /api/audit/logs with optional filtering and export
      const userId = cleanText(url.searchParams.get("userId") || "", 80);
      const email = cleanText(url.searchParams.get("email") || "", 100);
      const action = cleanText(url.searchParams.get("action") || "", 50);
      const resourceType = cleanText(url.searchParams.get("resourceType") || "", 50);
      const resourceId = cleanText(url.searchParams.get("resourceId") || "", 80);
      const startDate = cleanText(url.searchParams.get("startDate") || "", 30);
      const endDate = cleanText(url.searchParams.get("endDate") || "", 30);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
      const exportFormat = cleanText(url.searchParams.get("export") || "", 10);

      const { logs, total, hasMore } = await queryAuditLogs(tenant.tenantId, {
        userId: userId || undefined,
        email: email || undefined,
        action: (action as any) || undefined,
        resourceType: (resourceType as any) || undefined,
        resourceId: resourceId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit,
        offset,
      });

      // Export as CSV if requested
      if (exportFormat === "csv") {
        const csv = exportAuditLogsToCSV(logs);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="audit-logs.csv"',
          },
        });
      }

      return Response.json({
        logs,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
        },
      });
    }

    if (section === "stats") {
      // GET /api/audit/stats - get statistics for date range
      const startDate = cleanText(
        url.searchParams.get("startDate") || "",
        30
      ) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = cleanText(
        url.searchParams.get("endDate") || "",
        30
      ) || new Date().toISOString();

      const stats = await getAuditStats(tenant.tenantId, startDate, endDate);
      return Response.json({ stats });
    }

    if (section === "summary") {
      // GET /api/audit/summary - get compliance and security summary
      const days = Math.min(
        parseInt(url.searchParams.get("days") || "30"),
        365
      );
      const startDate = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();
      const endDate = new Date().toISOString();

      const db = coreDb();

      // Count logins
      const { results: loginCount } = await db
        .prepare(
          `SELECT COUNT(*) as count FROM audit_logs
           WHERE tenant_id = ? AND action = 'LOGIN'
           AND created_at >= ? AND created_at <= ?`
        )
        .bind(tenant.tenantId, startDate, endDate)
        .all<{ count: number }>();

      // Count failed attempts
      const { results: failedCount } = await db
        .prepare(
          `SELECT COUNT(*) as count FROM audit_logs
           WHERE tenant_id = ? AND status = 'FAILURE'
           AND created_at >= ? AND created_at <= ?`
        )
        .bind(tenant.tenantId, startDate, endDate)
        .all<{ count: number }>();

      // Count data exports
      const { results: exportCount } = await db
        .prepare(
          `SELECT COUNT(*) as count FROM audit_logs
           WHERE tenant_id = ? AND action IN ('EXPORT', 'EXPORT_DATA')
           AND created_at >= ? AND created_at <= ?`
        )
        .bind(tenant.tenantId, startDate, endDate)
        .all<{ count: number }>();

      // Count permission changes
      const { results: permissionChanges } = await db
        .prepare(
          `SELECT COUNT(*) as count FROM audit_logs
           WHERE tenant_id = ? AND action IN ('PERMISSION_CHANGE', 'ROLE_CHANGE')
           AND created_at >= ? AND created_at <= ?`
        )
        .bind(tenant.tenantId, startDate, endDate)
        .all<{ count: number }>();

      // Get recent suspicious activity
      const { results: suspicious } = await db
        .prepare(
          `SELECT email, COUNT(*) as count FROM audit_logs
           WHERE tenant_id = ? AND status = 'FAILURE'
           AND created_at >= ? AND created_at <= ?
           GROUP BY email
           HAVING count > 5
           ORDER BY count DESC`
        )
        .bind(tenant.tenantId, startDate, endDate)
        .all<{ email: string; count: number }>();

      return Response.json({
        summary: {
          period: { startDate, endDate, days },
          logins: loginCount[0]?.count || 0,
          failedAttempts: failedCount[0]?.count || 0,
          dataExports: exportCount[0]?.count || 0,
          permissionChanges: permissionChanges[0]?.count || 0,
          suspiciousActivity: suspicious.map((s) => ({
            email: s.email,
            failedAttempts: s.count,
          })),
        },
      });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("audit.get.failed", error);
    return Response.json(
      { error: "Unable to fetch audit logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage audit retention
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "audit" || section === "logs") {
      // POST /api/audit/logs - trigger retention cleanup
      const retentionDays = Math.min(parseInt(String(body.retentionDays || 90)), 365);

      const deleted = await cleanOldAuditLogs(tenant.tenantId, retentionDays);

      return Response.json({
        success: true,
        message: `Deleted ${deleted} audit logs older than ${retentionDays} days`,
        deletedCount: deleted,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("audit.post.failed", error);
    return Response.json(
      { error: "Unable to process audit request" },
      { status: 500 }
    );
  }
}
