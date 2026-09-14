/**
 * Webhooks Management API
 *
 * GET /api/webhooks — list webhooks
 * POST /api/webhooks — create webhook
 * PATCH /api/webhooks — update webhook
 * DELETE /api/webhooks?id=X — delete webhook
 * GET /api/webhooks/deliveries — get delivery history
 * POST /api/webhooks/test — send test webhook
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  getDeliveryHistory,
  createSignature,
  triggerWebhooks,
  WebhookEventType,
} from "@/lib/core/webhooks";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage webhooks
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/webhooks/[section]

    if (section === "deliveries") {
      // GET /api/webhooks/deliveries - get delivery history
      const webhookId = cleanText(url.searchParams.get("webhookId") || "", 80);

      if (!webhookId) {
        return Response.json({ error: "webhookId is required" }, { status: 400 });
      }

      const webhook = await getWebhook(tenant.tenantId, webhookId);
      if (!webhook) {
        return Response.json({ error: "Webhook not found" }, { status: 404 });
      }

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
      const deliveries = await getDeliveryHistory(webhookId, limit);

      return Response.json({ deliveries });
    }

    // GET /api/webhooks - list all webhooks
    const webhooks = await listWebhooks(tenant.tenantId);
    return Response.json({ webhooks });
  } catch (error) {
    console.error("webhooks.get.failed", error);
    return Response.json(
      { error: "Unable to fetch webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can create webhooks
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "test") {
      // POST /api/webhooks/test - send test webhook
      const webhookId = cleanText(String(body.webhookId || ""), 80);

      if (!webhookId) {
        return Response.json({ error: "webhookId is required" }, { status: 400 });
      }

      const webhook = await getWebhook(tenant.tenantId, webhookId);
      if (!webhook) {
        return Response.json({ error: "Webhook not found" }, { status: 404 });
      }

      // Trigger test event
      const testPayload = {
        id: "test_" + Date.now(),
        name: "Test Webhook",
        status: "active",
        createdAt: new Date().toISOString(),
      };

      const deliveryIds = await triggerWebhooks(
        tenant.tenantId,
        body.eventType as WebhookEventType || "contact.created",
        testPayload
      );

      return Response.json({
        success: true,
        message: "Test webhook sent",
        deliveryIds,
      });
    }

    // POST /api/webhooks - create webhook
    const name = cleanText(String(body.name || ""), 100);
    const webhookUrl = cleanText(String(body.url || ""), 500);
    const events = Array.isArray(body.events) ? (body.events as WebhookEventType[]) : [];
    const headers = body.headers as Record<string, string> | undefined;
    const filter = body.filter as Record<string, unknown> | undefined;
    const maxRetries = Math.min(
      Math.max(parseInt(String(body.maxRetries || 5)), 1),
      20
    );
    const timeout = Math.min(
      Math.max(parseInt(String(body.timeout || 30000)), 1000),
      120000
    );

    if (!name || !webhookUrl || events.length === 0) {
      return Response.json(
        { error: "name, url, and events are required" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(webhookUrl);
    } catch {
      return Response.json({ error: "Invalid webhook URL" }, { status: 400 });
    }

    const webhook = await createWebhook(
      tenant.tenantId,
      name,
      webhookUrl,
      events,
      { headers, filter, maxRetries, timeout }
    );

    return Response.json(webhook, { status: 201 });
  } catch (error) {
    console.error("webhooks.post.failed", error);
    return Response.json(
      { error: "Unable to create webhook" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can update webhooks
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const webhookId = cleanText(String(body.id || ""), 80);
    const db = coreDb();
    const now = new Date().toISOString();

    if (!webhookId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const updates: [string, unknown][] = [];

    if (body.name) updates.push(["name", cleanText(String(body.name), 100)]);
    if (body.url) updates.push(["url", cleanText(String(body.url), 500)]);
    if (body.events) updates.push(["events", JSON.stringify(body.events)]);
    if (body.status) updates.push(["status", String(body.status)]);
    if (body.headers) updates.push(["headers", JSON.stringify(body.headers)]);
    if (body.filter) updates.push(["filter", JSON.stringify(body.filter)]);

    if (updates.length === 0) {
      return Response.json({ error: "No changes provided" }, { status: 400 });
    }

    updates.push(["updated_at", now]);

    const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
    const values = updates.map(([, val]) => val);
    values.push(webhookId, tenant.tenantId);

    await db
      .prepare(
        `UPDATE webhooks SET ${setClauses} WHERE id = ? AND tenant_id = ?`
      )
      .bind(...values)
      .run();

    const updated = await getWebhook(tenant.tenantId, webhookId);
    if (!updated) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (error) {
    console.error("webhooks.patch.failed", error);
    return Response.json(
      { error: "Unable to update webhook" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can delete webhooks
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const webhookId = cleanText(url.searchParams.get("id") || "", 80);

    if (!webhookId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    const result = await db
      .prepare(`DELETE FROM webhooks WHERE id = ? AND tenant_id = ?`)
      .bind(webhookId, tenant.tenantId)
      .run();

    if ((result.meta?.changes || 0) === 0) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    // Also delete delivery history
    await db
      .prepare(`DELETE FROM webhook_deliveries WHERE webhook_id = ?`)
      .bind(webhookId)
      .run();

    return Response.json({ success: true, message: "Webhook deleted" });
  } catch (error) {
    console.error("webhooks.delete.failed", error);
    return Response.json(
      { error: "Unable to delete webhook" },
      { status: 500 }
    );
  }
}
