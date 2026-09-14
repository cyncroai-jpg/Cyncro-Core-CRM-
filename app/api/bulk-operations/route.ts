/**
 * Bulk Operations API
 *
 * POST /api/bulk-operations — create bulk operation
 * GET /api/bulk-operations — list bulk operations
 * GET /api/bulk-operations/:id — get bulk operation status
 * GET /api/bulk-operations/:id/results — get operation results
 * POST /api/bulk-operations/:id/cancel — cancel operation
 * GET /api/bulk-operations/stats — get bulk operation statistics
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createBulkOperation,
  getBulkOperation,
  listBulkOperations,
  getBulkOperationResults,
  cancelBulkOperation,
  getBulkOperationStats,
  validateBulkData,
  type BulkOperationType,
} from "@/lib/core/bulk-operations";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const operationId = pathParts[3]; // /api/bulk-operations/[id]
    const section = pathParts[4]; // /api/bulk-operations/[id]/[section]

    // GET /api/bulk-operations/stats
    if (operationId === "stats") {
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
        90
      );

      const stats = await getBulkOperationStats(tenant.tenantId, days);
      return Response.json({ stats });
    }

    // GET /api/bulk-operations/:id/results
    if (section === "results") {
      const operation = await getBulkOperation(tenant.tenantId, operationId);
      if (!operation) {
        return Response.json(
          { error: "Operation not found" },
          { status: 404 }
        );
      }

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 1000);
      const results = await getBulkOperationResults(tenant.tenantId, operationId, limit);

      return Response.json({ results, total: results.length });
    }

    // GET /api/bulk-operations/:id
    if (operationId && operationId !== "bulk-operations") {
      const operation = await getBulkOperation(tenant.tenantId, operationId);
      if (!operation) {
        return Response.json(
          { error: "Operation not found" },
          { status: 404 }
        );
      }
      return Response.json({ operation });
    }

    // GET /api/bulk-operations - list all operations
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
    const operations = await listBulkOperations(tenant.tenantId, limit);

    return Response.json({ operations, total: operations.length });
  } catch (error) {
    console.error("bulk-operations.get.failed", error);
    return Response.json(
      { error: "Unable to fetch bulk operations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can create bulk operations
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const operationId = pathParts[3];
    const section = pathParts[4];
    const body = (await request.json()) as Record<string, unknown>;

    // POST /api/bulk-operations/:id/cancel
    if (section === "cancel") {
      if (!operationId) {
        return Response.json(
          { error: "operationId is required" },
          { status: 400 }
        );
      }

      const operation = await getBulkOperation(tenant.tenantId, operationId);
      if (!operation) {
        return Response.json(
          { error: "Operation not found" },
          { status: 404 }
        );
      }

      if (operation.status !== "PROCESSING" && operation.status !== "PENDING") {
        return Response.json(
          { error: "Cannot cancel completed or failed operations" },
          { status: 400 }
        );
      }

      await cancelBulkOperation(tenant.tenantId, operationId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CANCEL",
        "bulk_operation",
        operationId,
        {
          resourceName: `Bulk Operation: ${operation.operationType}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ success: true, message: "Operation cancelled" });
    }

    // POST /api/bulk-operations - create new bulk operation
    const operationType = cleanText(String(body.operationType || ""), 50) as BulkOperationType;
    const items = Array.isArray(body.items)
      ? body.items.map((item) => (typeof item === "object" ? item : {}))
      : [];

    if (!operationType || items.length === 0) {
      return Response.json(
        { error: "operationType and items are required" },
        { status: 400 }
      );
    }

    // Validate bulk data
    const validation = validateBulkData(operationType, items);
    if (!validation.valid) {
      return Response.json(
        {
          error: "Invalid bulk operation data",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const operation = await createBulkOperation(
      tenant.tenantId,
      operationType,
      items,
      tenant.userId
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "bulk_operation",
      operation.id,
      {
        resourceName: `Bulk Operation: ${operationType}`,
        status: "SUCCESS",
        itemCount: items.length,
      }
    );

    return Response.json({ operation }, { status: 201 });
  } catch (error) {
    console.error("bulk-operations.post.failed", error);
    return Response.json(
      { error: "Unable to create bulk operation" },
      { status: 500 }
    );
  }
}
