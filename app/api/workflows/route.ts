/**
 * Workflow Builder API
 *
 * GET /api/workflows — list workflows
 * GET /api/workflows?id=X — get workflow + execution history
 * POST /api/workflows — create workflow
 * PATCH /api/workflows — update workflow
 * DELETE /api/workflows?id=X — delete workflow
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import crypto from "crypto";

const VALID_TRIGGERS = new Set([
  "contact.created",
  "contact.updated",
  "deal.created",
  "deal.updated",
  "booking.confirmed",
  "booking.cancelled",
  "task.completed",
  "email.opened",
  "email.clicked",
  "webhook.received",
  "time_based",
]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const workflowId = cleanText(url.searchParams.get("id"), 80);

    if (workflowId) {
      // GET /api/workflows?id=X — get one workflow + recent executions
      const db = coreDb();
      const workflow = await db
        .prepare(
          "SELECT * FROM workflows WHERE id = ? AND tenant_id = ?",
        )
        .bind(workflowId, tenant.tenantId)
        .first();

      if (!workflow)
        return Response.json({ error: "Workflow not found" }, { status: 404 });

      // Parse nodes
      const nodes = JSON.parse(String(workflow.nodes || "[]"));

      // Get recent executions
      const { results: executions } = await db
        .prepare(
          `SELECT id, status, started_at, completed_at FROM workflow_executions
           WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 20`,
        )
        .bind(workflowId)
        .all();

      return Response.json({
        workflow: { ...workflow, nodes },
        executions,
      });
    }

    // GET /api/workflows — list all workflows
    const db = coreDb();
    const { results } = await db
      .prepare(
        `SELECT id, name, trigger, enabled, created_at, updated_at
         FROM workflows WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .bind(tenant.tenantId)
      .all();

    return Response.json({ workflows: results });
  } catch (error) {
    console.error("workflows.list.failed", error);
    return Response.json(
      { error: "Unable to load workflows" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check admin
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const trigger = cleanText(body.trigger, 50);
    const nodes = Array.isArray(body.nodes) ? body.nodes : [];

    if (!name || !trigger) {
      return Response.json({
        error: "name and trigger are required",
      }, { status: 400 });
    }

    if (!VALID_TRIGGERS.has(trigger)) {
      return Response.json({ error: "Invalid trigger type" }, { status: 400 });
    }

    if (!Array.isArray(nodes)) {
      return Response.json({ error: "nodes must be an array" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();

    await db
      .prepare(
        `INSERT INTO workflows
         (id, tenant_id, name, trigger, nodes, enabled, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        tenant.tenantId,
        name,
        trigger,
        JSON.stringify(nodes),
        tenant.email,
        now,
        now,
      )
      .run();

    return Response.json(
      { id, name, trigger, nodes },
      { status: 201 },
    );
  } catch (error) {
    console.error("workflows.create.failed", error);
    return Response.json(
      { error: "Unable to create workflow" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    const now = new Date().toISOString();
    const updates: [string, unknown][] = [];

    if (body.name !== undefined) updates.push(["name", cleanText(body.name, 160)]);
    if (body.enabled !== undefined) updates.push(["enabled", body.enabled ? 1 : 0]);
    if (Array.isArray(body.nodes)) updates.push(["nodes", JSON.stringify(body.nodes)]);

    if (!updates.length) {
      return Response.json({ error: "No changes provided" }, { status: 400 });
    }

    updates.push(["updated_at", now]);

    const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
    const values = updates.map(([, val]) => val);
    values.push(id, tenant.tenantId);

    await db
      .prepare(
        `UPDATE workflows SET ${setClauses} WHERE id = ? AND tenant_id = ?`,
      )
      .bind(...values)
      .run();

    const updated = await db
      .prepare(
        "SELECT * FROM workflows WHERE id = ? AND tenant_id = ?",
      )
      .bind(id, tenant.tenantId)
      .first();

    return Response.json({
      workflow: updated ? { ...updated, nodes: JSON.parse(String(updated.nodes)) } : null,
    });
  } catch (error) {
    console.error("workflows.update.failed", error);
    return Response.json(
      { error: "Unable to update workflow" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    await db
      .prepare("DELETE FROM workflows WHERE id = ? AND tenant_id = ?")
      .bind(id, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("workflows.delete.failed", error);
    return Response.json(
      { error: "Unable to delete workflow" },
      { status: 500 },
    );
  }
}
