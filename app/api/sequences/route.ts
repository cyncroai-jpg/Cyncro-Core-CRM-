/**
 * Email Sequence Management
 *
 * GET /api/sequences  — list sequences (admin)
 * GET /api/sequences?id=X — get sequence details
 * POST /api/sequences — create sequence (admin)
 * PATCH /api/sequences — update sequence (admin)
 * DELETE /api/sequences?id=X — delete sequence (admin)
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
  "deal.created",
  "booking.confirmed",
  "contact.inactivity_30d",
  "email.opened",
  "email.clicked",
]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const sequenceId = cleanText(url.searchParams.get("id"), 80);

    if (sequenceId) {
      // GET /api/sequences?id=X — get one sequence
      const db = coreDb();
      const sequence = await db
        .prepare(
          "SELECT * FROM email_sequences WHERE id = ? AND tenant_id = ?",
        )
        .bind(sequenceId, tenant.tenantId)
        .first();

      if (!sequence)
        return Response.json({ error: "Sequence not found" }, { status: 404 });

      // Parse steps JSON
      const steps = JSON.parse(String(sequence.steps || "[]"));

      // Get enrollments count
      const { results: counts } = await db
        .prepare(
          `SELECT status, COUNT(*) AS count FROM email_sequence_enrollments
           WHERE sequence_id = ? GROUP BY status`,
        )
        .bind(sequenceId)
        .all<{ status: string; count: number }>();

      const enrollmentStats = Object.fromEntries(
        counts.map((r) => [r.status, Number(r.count || 0)]),
      );

      return Response.json({
        sequence: { ...sequence, steps },
        enrollmentStats,
      });
    }

    // GET /api/sequences — list all sequences
    const db = coreDb();
    const { results } = await db
      .prepare(
        `SELECT id, name, trigger, enabled, auto_enroll, created_at, updated_at
         FROM email_sequences WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .bind(tenant.tenantId)
      .all();

    return Response.json({ sequences: results });
  } catch (error) {
    console.error("sequences.list.failed", error);
    return Response.json(
      { error: "Unable to load sequences" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check admin role
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const trigger = cleanText(body.trigger, 50);
    const steps = Array.isArray(body.steps) ? body.steps : [];

    if (!name || !trigger) {
      return Response.json({
        error: "name and trigger are required",
      }, { status: 400 });
    }

    if (!VALID_TRIGGERS.has(trigger)) {
      return Response.json({ error: "Invalid trigger type" }, { status: 400 });
    }

    if (!Array.isArray(steps) || !steps.length) {
      return Response.json({
        error: "At least one step is required",
      }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();

    await db
      .prepare(
        `INSERT INTO email_sequences
         (id, tenant_id, name, trigger, steps, enabled, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        tenant.tenantId,
        name,
        trigger,
        JSON.stringify(steps),
        tenant.email,
        now,
        now,
      )
      .run();

    return Response.json(
      { id, name, trigger, steps },
      { status: 201 },
    );
  } catch (error) {
    console.error("sequences.create.failed", error);
    return Response.json(
      { error: "Unable to create sequence" },
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
    if (body.autoEnroll !== undefined) updates.push(["auto_enroll", body.autoEnroll ? 1 : 0]);
    if (Array.isArray(body.steps)) updates.push(["steps", JSON.stringify(body.steps)]);

    if (!updates.length) {
      return Response.json({ error: "No changes provided" }, { status: 400 });
    }

    updates.push(["updated_at", now]);

    const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
    const values = updates.map(([, val]) => val);
    values.push(id, tenant.tenantId);

    await db
      .prepare(
        `UPDATE email_sequences SET ${setClauses} WHERE id = ? AND tenant_id = ?`,
      )
      .bind(...values)
      .run();

    const updated = await db
      .prepare(
        "SELECT * FROM email_sequences WHERE id = ? AND tenant_id = ?",
      )
      .bind(id, tenant.tenantId)
      .first();

    return Response.json({
      sequence: updated ? { ...updated, steps: JSON.parse(String(updated.steps)) } : null,
    });
  } catch (error) {
    console.error("sequences.update.failed", error);
    return Response.json(
      { error: "Unable to update sequence" },
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
      .prepare(
        "DELETE FROM email_sequences WHERE id = ? AND tenant_id = ?",
      )
      .bind(id, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("sequences.delete.failed", error);
    return Response.json(
      { error: "Unable to delete sequence" },
      { status: 500 },
    );
  }
}
