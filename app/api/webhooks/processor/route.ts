/**
 * Webhook Processor Admin API
 *
 * POST /api/webhooks/processor/process — manually trigger processing
 * GET /api/webhooks/processor/analytics — get delivery analytics
 * POST /api/webhooks/processor/cleanup — cleanup old deliveries
 */

import {
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  processWebhookQueue,
  getWebhookAnalytics,
  cleanupOldDeliveries,
} from "@/lib/core/webhook-processor";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can access processor
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = Math.min(
      Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
      90
    );

    // GET /api/webhooks/processor/analytics
    const analytics = await getWebhookAnalytics(tenant.tenantId, days);

    return Response.json({
      analytics,
      period: `${days} days`,
    });
  } catch (error) {
    console.error("webhook.processor.get.failed", error);
    return Response.json(
      { error: "Unable to fetch webhook analytics" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can trigger processor
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[4]; // /api/webhooks/processor/[section]

    if (section === "process") {
      // POST /api/webhooks/processor/process - manually process pending deliveries
      const limit = Math.min(
        parseInt((await request.json()).limit || 100),
        1000
      );

      const result = await processWebhookQueue(limit);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "webhook_processor",
        "process_queue",
        {
          resourceName: "Webhook delivery processing",
          status: "SUCCESS",
          ...result,
        }
      );

      return Response.json({
        success: true,
        message: `Processed ${result.processed} deliveries`,
        result,
      });
    }

    if (section === "cleanup") {
      // POST /api/webhooks/processor/cleanup - cleanup old deliveries
      const body = (await request.json()) as Record<string, unknown>;
      const daysOld = Math.min(
        Math.max(parseInt(String(body.daysOld || 30)), 1),
        365
      );

      const cleaned = await cleanupOldDeliveries(tenant.tenantId, daysOld);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "DELETE",
        "webhook_deliveries",
        "cleanup",
        {
          resourceName: "Webhook delivery cleanup",
          status: "SUCCESS",
          cleanedCount: cleaned,
          daysOld,
        }
      );

      return Response.json({
        success: true,
        message: `Cleaned up ${cleaned} old deliveries`,
        cleaned,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("webhook.processor.post.failed", error);
    return Response.json(
      { error: "Unable to process webhook queue" },
      { status: 500 }
    );
  }
}
