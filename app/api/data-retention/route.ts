/**
 * Data Retention & Archival API
 *
 * GET /api/data-retention/policies — list retention policies
 * POST /api/data-retention/policies — create/update policy
 * DELETE /api/data-retention/policies — disable policy
 * GET /api/data-retention/metrics — get retention metrics
 * POST /api/data-retention/cleanup — execute cleanup job
 * GET /api/data-retention/archived — list archived records
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  setRetentionPolicy,
  listRetentionPolicies,
  disableRetentionPolicy,
  getDataRetentionMetrics,
  executeRetentionCleanup,
  type ResourceTypeForRetention,
  type RetentionAction,
} from "@/lib/core/data-retention";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can view retention settings
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/data-retention/[section]

    if (section === "metrics") {
      // GET /api/data-retention/metrics
      const metrics = await getDataRetentionMetrics(tenant.tenantId);
      return Response.json({ metrics });
    }

    if (section === "archived") {
      // GET /api/data-retention/archived
      // Would list archived records - implement as needed
      return Response.json({ archived: [], total: 0 });
    }

    // GET /api/data-retention/policies - list all policies
    const policies = await listRetentionPolicies(tenant.tenantId);
    return Response.json({ policies, total: policies.length });
  } catch (error) {
    console.error("data-retention.get.failed", error);
    return Response.json(
      { error: "Unable to fetch retention settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER can configure retention policies
    if (tenant.role !== "OWNER") {
      return Response.json({ error: "Only OWNER can configure retention" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "cleanup") {
      // POST /api/data-retention/cleanup - execute cleanup job
      const result = await executeRetentionCleanup(tenant.tenantId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "EXECUTE",
        "retention_cleanup",
        `cleanup-${Date.now()}`,
        {
          resourceName: "Data Retention Cleanup",
          status: "SUCCESS",
          processed: result.processed,
          archived: result.archived,
          deleted: result.deleted,
          anonymized: result.anonymized,
        }
      );

      return Response.json({ result });
    }

    // POST /api/data-retention/policies - create/update policy
    const resourceType = cleanText(String(body.resourceType || ""), 50) as ResourceTypeForRetention;
    const retentionDays = Math.min(
      Math.max(parseInt(String(body.retentionDays || 365)), 1),
      3650
    );
    const action = cleanText(String(body.action || ""), 50) as RetentionAction;
    const archiveStorage = body.archiveStorage
      ? cleanText(String(body.archiveStorage), 500)
      : undefined;
    const anonymizeFields = Array.isArray(body.anonymizeFields)
      ? body.anonymizeFields.map((f) => cleanText(String(f), 100))
      : undefined;

    if (!resourceType || !action) {
      return Response.json(
        { error: "resourceType and action are required" },
        { status: 400 }
      );
    }

    if (!["ARCHIVE", "DELETE", "ANONYMIZE"].includes(action)) {
      return Response.json(
        { error: "action must be ARCHIVE, DELETE, or ANONYMIZE" },
        { status: 400 }
      );
    }

    const policy = await setRetentionPolicy(
      tenant.tenantId,
      resourceType,
      retentionDays,
      action,
      {
        archiveStorage,
        anonymizeFields,
      }
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "retention_policy",
      policy.id,
      {
        resourceName: `Retention Policy: ${resourceType}`,
        status: "SUCCESS",
        action,
        retentionDays,
      }
    );

    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    console.error("data-retention.post.failed", error);
    return Response.json(
      { error: "Unable to configure retention settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER can manage retention policies
    if (tenant.role !== "OWNER") {
      return Response.json({ error: "Only OWNER can disable retention policies" }, { status: 403 });
    }

    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType") as ResourceTypeForRetention;

    if (!resourceType) {
      return Response.json(
        { error: "resourceType parameter required" },
        { status: 400 }
      );
    }

    await disableRetentionPolicy(tenant.tenantId, resourceType);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "retention_policy",
      resourceType,
      {
        resourceName: `Retention Policy: ${resourceType}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Retention policy disabled" });
  } catch (error) {
    console.error("data-retention.delete.failed", error);
    return Response.json(
      { error: "Unable to disable retention policy" },
      { status: 500 }
    );
  }
}
