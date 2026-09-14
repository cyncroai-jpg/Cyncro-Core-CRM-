/**
 * Form Management & Submissions
 *
 * GET /api/forms — list forms (admin)
 * GET /api/forms?id=X — get form + submissions
 * POST /api/forms — create form (admin)
 * PATCH /api/forms — update form (admin)
 * DELETE /api/forms?id=X — delete form (admin)
 * POST /api/forms/submit?slug=X — public form submission
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
  normalizeEmail,
  normalizePhone,
} from "@/lib/core/db";
import { submitForm as submitFormCore, getFormBySlug } from "@/lib/core/forms";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const formId = cleanText(url.searchParams.get("id"), 80);

    if (formId) {
      // GET /api/forms?id=X — get form + submissions
      const db = coreDb();
      const form = await db
        .prepare("SELECT * FROM forms WHERE id = ? AND tenant_id = ?")
        .bind(formId, tenant.tenantId)
        .first();

      if (!form) return Response.json({ error: "Form not found" }, { status: 404 });

      // Get submissions
      const { results: submissions } = await db
        .prepare(
          `SELECT id, email, name, submitted_at FROM form_submissions
           WHERE form_id = ? ORDER BY submitted_at DESC LIMIT 100`,
        )
        .bind(formId)
        .all();

      return Response.json({
        form: { ...form, fields: JSON.parse(String(form.fields || "[]")) },
        submissions,
      });
    }

    // GET /api/forms — list forms
    const db = coreDb();
    const { results } = await db
      .prepare(
        `SELECT id, name, slug, active, created_at, updated_at FROM forms
         WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .bind(tenant.tenantId)
      .all();

    return Response.json({ forms: results });
  } catch (error) {
    console.error("forms.list.failed", error);
    return Response.json({ error: "Unable to load forms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    // Check if this is a public submission
    const url = new URL(request.url);
    if (url.searchParams.get("submit") === "1") {
      return handlePublicSubmission(request);
    }

    // Admin: create form
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const slug = cleanText(body.slug, 80)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const title = cleanText(body.title, 160);
    const fields = Array.isArray(body.fields) ? body.fields : [];

    if (!name || !slug || !title || !fields.length) {
      return Response.json({
        error: "name, slug, title, and fields are required",
      }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();

    await db
      .prepare(
        `INSERT INTO forms
         (id, tenant_id, name, slug, fields, title, description, success_message,
          redirect_url, notify_email, auto_enroll_sequence, trigger_workflow,
          active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        tenant.tenantId,
        name,
        slug,
        JSON.stringify(fields),
        title,
        cleanText(body.description, 500),
        cleanText(body.successMessage, 500) || "Thank you for your submission!",
        cleanText(body.redirectUrl, 500),
        normalizeEmail(body.notifyEmail),
        cleanText(body.autoEnrollSequence, 80),
        cleanText(body.triggerWorkflow, 80),
        tenant.email,
        now,
        now,
      )
      .run();

    return Response.json(
      { id, name, slug, fields },
      { status: 201 },
    );
  } catch (error) {
    console.error("forms.create.failed", error);
    return Response.json({ error: "Unable to create form" }, { status: 500 });
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
    if (body.title !== undefined) updates.push(["title", cleanText(body.title, 160)]);
    if (body.active !== undefined) updates.push(["active", body.active ? 1 : 0]);
    if (Array.isArray(body.fields)) updates.push(["fields", JSON.stringify(body.fields)]);
    if (body.successMessage !== undefined) updates.push(["success_message", cleanText(body.successMessage, 500)]);
    if (body.redirectUrl !== undefined) updates.push(["redirect_url", cleanText(body.redirectUrl, 500)]);
    if (body.notifyEmail !== undefined) updates.push(["notify_email", normalizeEmail(body.notifyEmail)]);

    if (!updates.length) {
      return Response.json({ error: "No changes provided" }, { status: 400 });
    }

    updates.push(["updated_at", now]);

    const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
    const values = updates.map(([, val]) => val);
    values.push(id, tenant.tenantId);

    await db
      .prepare(`UPDATE forms SET ${setClauses} WHERE id = ? AND tenant_id = ?`)
      .bind(...values)
      .run();

    const updated = await db
      .prepare("SELECT * FROM forms WHERE id = ? AND tenant_id = ?")
      .bind(id, tenant.tenantId)
      .first();

    return Response.json({
      form: updated ? { ...updated, fields: JSON.parse(String(updated.fields)) } : null,
    });
  } catch (error) {
    console.error("forms.update.failed", error);
    return Response.json({ error: "Unable to update form" }, { status: 500 });
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
    await db.prepare("DELETE FROM forms WHERE id = ? AND tenant_id = ?")
      .bind(id, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("forms.delete.failed", error);
    return Response.json({ error: "Unable to delete form" }, { status: 500 });
  }
}

/** Handle public form submission */
async function handlePublicSubmission(request: Request): Promise<Response> {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const slug = cleanText(body.slug, 80);
    const tenantId = cleanText(body.tenantId, 80);

    if (!slug || !tenantId) {
      return Response.json({
        error: "slug and tenantId are required",
      }, { status: 400 });
    }

    // Get form
    const form = await getFormBySlug(tenantId, slug);
    if (!form) {
      return Response.json({ error: "Form not found" }, { status: 404 });
    }

    // Validate & clean data
    const data: Record<string, unknown> = {};
    for (const field of form.fields) {
      let value = body[field.name];

      if (field.required && !value) {
        return Response.json({
          error: `${field.label} is required`,
        }, { status: 400 });
      }

      if (value) {
        // Validate
        if (field.validation === "email") {
          value = normalizeEmail(value);
          if (!value) {
            return Response.json({ error: `${field.label} must be valid email` }, { status: 400 });
          }
        } else if (field.validation === "phone") {
          value = normalizePhone(value);
        }

        data[field.name] = value;
      }
    }

    // Submit form
    const ipAddress = request.headers.get("x-forwarded-for") ||
                     request.headers.get("x-real-ip") ||
                     "unknown";

    const { contactId } = await submitFormCore(tenantId, form.id, data, ipAddress);

    return Response.json({
      success: true,
      message: form.successMessage,
      contactId,
      redirectUrl: form.redirectUrl,
    }, { status: 201 });
  } catch (error) {
    console.error("forms.submit.failed", error);
    return Response.json({ error: "Unable to submit form" }, { status: 500 });
  }
}
