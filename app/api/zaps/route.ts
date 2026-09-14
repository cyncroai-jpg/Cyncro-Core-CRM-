/**
 * Zaps API (Zapier-like Automations)
 *
 * GET /api/zaps — list user's zaps
 * GET /api/zaps?id=X — get zap details with execution history
 * POST /api/zaps — create new zap
 * PATCH /api/zaps — enable/disable or update zap
 * DELETE /api/zaps?id=X — delete zap
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import { createZap, getTenantZaps } from "@/lib/core/integrations";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const zapId = cleanText(url.searchParams.get("id"), 80);

    if (zapId) {
      // GET /api/zaps?id=X — get zap + execution history
      const db = coreDb();
      const zap = await db
        .prepare(`SELECT * FROM zaps WHERE id = ? AND tenant_id = ?`)
        .bind(zapId, tenant.tenantId)
        .first();

      if (!zap) {
        return Response.json({ error: "Zap not found" }, { status: 404 });
      }

      // Get execution history
      const { results: executions } = await db
        .prepare(
          `SELECT * FROM zap_executions
           WHERE zap_id = ?
           ORDER BY executed_at DESC
           LIMIT 100`
        )
        .bind(zapId)
        .all();

      return Response.json({
        zap: {
          ...zap,
          trigger_config: zap.trigger_config ? JSON.parse(String(zap.trigger_config)) : null,
          action_config: zap.action_config ? JSON.parse(String(zap.action_config)) : null,
        },
        executions: executions.map((e: Record<string, unknown>) => ({
          ...e,
          trigger_data: e.trigger_data ? JSON.parse(String(e.trigger_data)) : null,
          action_result: e.action_result ? JSON.parse(String(e.action_result)) : null,
        })),
      });
    }

    // GET /api/zaps — list all zaps
    const zaps = await getTenantZaps(tenant.tenantId);
    return Response.json({ zaps });
  } catch (error) {
    console.error("zaps.get.failed", error);
    return Response.json(
      { error: "Unable to load zaps" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(String(body.name || ""), 160);
    const triggerApp = cleanText(String(body.triggerApp || ""), 50);
    const triggerEvent = cleanText(String(body.triggerEvent || ""), 50);
    const actionApp = cleanText(String(body.actionApp || ""), 50);
    const actionEvent = cleanText(String(body.actionEvent || ""), 50);

    if (!name || !triggerApp || !triggerEvent || !actionApp || !actionEvent) {
      return Response.json(
        {
          error:
            "name, triggerApp, triggerEvent, actionApp, and actionEvent are required",
        },
        { status: 400 }
      );
    }

    const triggerConfig = body.triggerConfig as Record<string, unknown> | undefined;
    const actionConfig = body.actionConfig as Record<string, unknown> | undefined;

    const zap = await createZap(
      tenant.tenantId,
      name,
      triggerApp,
      triggerEvent,
      actionApp,
      actionEvent,
      triggerConfig,
      actionConfig,
      tenant.email
    );

    return Response.json(zap, { status: 201 });
  } catch (error) {
    console.error("zaps.create.failed", error);
    return Response.json(
      { error: "Unable to create zap" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const zapId = cleanText(String(body.id || ""), 80);

    if (!zapId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    const updates: [string, unknown][] = [];
    const now = new Date().toISOString();

    if (body.name !== undefined) {
      updates.push(["name", cleanText(String(body.name), 160)]);
    }
    if (body.enabled !== undefined) {
      updates.push(["enabled", body.enabled ? 1 : 0]);
    }
    if (body.triggerConfig !== undefined) {
      updates.push(["trigger_config", JSON.stringify(body.triggerConfig)]);
    }
    if (body.actionConfig !== undefined) {
      updates.push(["action_config", JSON.stringify(body.actionConfig)]);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No changes provided" }, { status: 400 });
    }

    updates.push(["updated_at", now]);

    const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
    const values = updates.map(([, val]) => val);
    values.push(zapId, tenant.tenantId);

    await db
      .prepare(
        `UPDATE zaps SET ${setClauses} WHERE id = ? AND tenant_id = ?`
      )
      .bind(...values)
      .run();

    // Fetch updated zap
    const updated = await db
      .prepare(`SELECT * FROM zaps WHERE id = ? AND tenant_id = ?`)
      .bind(zapId, tenant.tenantId)
      .first();

    return Response.json({
      ...updated,
      trigger_config: updated.trigger_config ? JSON.parse(String(updated.trigger_config)) : null,
      action_config: updated.action_config ? JSON.parse(String(updated.action_config)) : null,
    });
  } catch (error) {
    console.error("zaps.update.failed", error);
    return Response.json(
      { error: "Unable to update zap" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const zapId = cleanText(url.searchParams.get("id"), 80);

    if (!zapId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    await db
      .prepare(`DELETE FROM zaps WHERE id = ? AND tenant_id = ?`)
      .bind(zapId, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("zaps.delete.failed", error);
    return Response.json(
      { error: "Unable to delete zap" },
      { status: 500 }
    );
  }
}
