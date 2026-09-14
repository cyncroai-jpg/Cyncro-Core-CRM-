/**
 * SMS Sequence Management
 *
 * GET /api/sms-sequences — list SMS sequences
 * GET /api/sms-sequences?id=X — get SMS sequence details
 * POST /api/sms-sequences — create SMS sequence
 * PATCH /api/sms-sequences — update SMS sequence
 * DELETE /api/sms-sequences?id=X — delete SMS sequence
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
  normalizePhone,
} from "@/lib/core/db";
import { hasFeatureAccess } from "@/lib/core/billing";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const sequenceId = cleanText(url.searchParams.get("id"), 80);

    if (sequenceId) {
      // GET /api/sms-sequences?id=X
      const db = coreDb();
      const sequence = await db
        .prepare(
          "SELECT * FROM sms_sequences WHERE id = ? AND tenant_id = ?",
        )
        .bind(sequenceId, tenant.tenantId)
        .first();

      if (!sequence)
        return Response.json({ error: "Sequence not found" }, { status: 404 });

      const steps = JSON.parse(String(sequence.steps || "[]"));

      // Get enrollment stats
      const { results: counts } = await db
        .prepare(
          `SELECT status, COUNT(*) AS count FROM sms_sequence_enrollments
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

    // GET /api/sms-sequences — list all
    const db = coreDb();
    const { results } = await db
      .prepare(
        `SELECT id, name, provider, enabled, auto_enroll, created_at
         FROM sms_sequences WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .bind(tenant.tenantId)
      .all();

    return Response.json({ sequences: results });
  } catch (error) {
    console.error("sms_sequences.list.failed", error);
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

    // Check admin
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    // Check feature access
    const hasSMS = await hasFeatureAccess(tenant.tenantId, "sequences");
    if (!hasSMS) {
      return Response.json({
        error: "Upgrade to Pro plan to use SMS sequences",
      }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const provider = cleanText(body.provider, 50) || "mock";
    const steps = Array.isArray(body.steps) ? body.steps : [];

    if (!name || !steps.length) {
      return Response.json({
        error: "name and steps are required",
      }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();

    await db
      .prepare(
        `INSERT INTO sms_sequences
         (id, tenant_id, name, provider, steps, enabled, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        tenant.tenantId,
        name,
        provider,
        JSON.stringify(steps),
        tenant.email,
        now,
        now,
      )
      .run();

    return Response.json(
      { id, name, provider, steps },
      { status: 201 },
    );
  } catch (error) {
    console.error("sms_sequences.create.failed", error);
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
        `UPDATE sms_sequences SET ${setClauses} WHERE id = ? AND tenant_id = ?`,
      )
      .bind(...values)
      .run();

    const updated = await db
      .prepare(
        "SELECT * FROM sms_sequences WHERE id = ? AND tenant_id = ?",
      )
      .bind(id, tenant.tenantId)
      .first();

    return Response.json({
      sequence: updated ? { ...updated, steps: JSON.parse(String(updated.steps)) } : null,
    });
  } catch (error) {
    console.error("sms_sequences.update.failed", error);
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
        "DELETE FROM sms_sequences WHERE id = ? AND tenant_id = ?",
      )
      .bind(id, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("sms_sequences.delete.failed", error);
    return Response.json(
      { error: "Unable to delete sequence" },
      { status: 500 },
    );
  }
}
