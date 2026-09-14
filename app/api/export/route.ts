/**
 * Data Export & Compliance API
 *
 * GET /api/export/requests — list export requests
 * POST /api/export/requests — create new export request
 * GET /api/export/requests?id=X — check export status
 * POST /api/export/delete-requests — create deletion request
 * GET /api/export/compliance — get compliance report
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createExportRequest,
  getExportRequest,
  createDeletionRequest,
  getDeletionRequest,
  generateComplianceReport,
  listExportRequests,
  cleanExpiredExports,
  ExportFormat,
} from "@/lib/core/data-export";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/export/[section]

    if (section === "requests") {
      // GET /api/export/requests or /api/export/requests?id=X
      const requestId = cleanText(url.searchParams.get("id") || "", 80);

      if (requestId) {
        // Get specific request
        const exportReq = await getExportRequest(tenant.tenantId, requestId);

        if (!exportReq) {
          return Response.json(
            { error: "Export request not found" },
            { status: 404 }
          );
        }

        // Only owner can see other users' requests (or admin)
        if (
          exportReq.userId !== tenant.userId &&
          !["OWNER", "ADMIN"].includes(tenant.role)
        ) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        return Response.json({ request: exportReq });
      }

      // List requests
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

      let requests = await listExportRequests(tenant.tenantId, limit, offset);

      // Non-admin users only see their own
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        requests = requests.filter((r) => r.userId === tenant.userId);
      }

      return Response.json({ requests });
    }

    if (section === "compliance") {
      // GET /api/export/compliance - generate compliance report
      // Only OWNER and ADMIN can access
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        parseInt(url.searchParams.get("days") || "365"),
        1095
      ); // Max 3 years
      const startDate = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();
      const endDate = new Date().toISOString();

      const report = await generateComplianceReport(
        tenant.tenantId,
        startDate,
        endDate
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "EXPORT_DATA",
        "compliance_report",
        report.reportId,
        {
          status: "SUCCESS",
        }
      );

      return Response.json({ report });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("export.get.failed", error);
    return Response.json(
      { error: "Unable to fetch export data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "requests") {
      // POST /api/export/requests - create export request
      const format = (cleanText(String(body.format || "json"), 10) as ExportFormat) || "json";
      const categories = Array.isArray(body.categories)
        ? (body.categories as string[])
        : [
            "contacts",
            "deals",
            "bookings",
            "activities",
            "sequences",
            "workflows",
          ];

      const exportReq = await createExportRequest(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        format,
        categories
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "EXPORT_DATA",
        "export_request",
        exportReq.id,
        {
          resourceName: `Data export (${format})`,
          status: "SUCCESS",
        }
      );

      return Response.json(
        {
          request: exportReq,
          message: "Export request created. You will receive a download link via email when ready.",
        },
        { status: 201 }
      );
    }

    if (section === "delete-requests") {
      // POST /api/export/delete-requests - create deletion request (Right to be forgotten)
      const categories = Array.isArray(body.categories)
        ? (body.categories as string[])
        : ["all"];

      const deletionReq = await createDeletionRequest(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        categories
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "DELETE",
        "deletion_request",
        deletionReq.id,
        {
          resourceName: "Right to be forgotten request",
          status: "SUCCESS",
        }
      );

      return Response.json(
        {
          request: deletionReq,
          message:
            "Deletion request created. Your data will be deleted within 30 days.",
        },
        { status: 201 }
      );
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("export.post.failed", error);
    return Response.json(
      { error: "Unable to create export request" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can clean up
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];

    if (section === "requests") {
      // DELETE /api/export/requests - clean expired exports
      const cleaned = await cleanExpiredExports(tenant.tenantId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "DELETE",
        "expired_exports",
        "cleanup",
        {
          status: "SUCCESS",
        }
      );

      return Response.json({
        success: true,
        message: `Cleaned up ${cleaned} expired exports`,
        cleanedCount: cleaned,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("export.delete.failed", error);
    return Response.json(
      { error: "Unable to clean exports" },
      { status: 500 }
    );
  }
}
