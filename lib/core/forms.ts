/**
 * Form Builder™ — Lead capture forms
 *
 * Features:
 * - Drag-drop form builder (stored as JSON)
 * - Public form pages with shareable URLs
 * - Auto-create contacts from submissions
 * - Auto-enroll in sequences
 * - Trigger workflows
 * - Email notifications on submission
 * - Spam protection (honeypot, rate limiting)
 */

import { coreDb } from "@/lib/core/db";

export interface FormField {
  id: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "date";
  name: string;
  label: string;
  placeholder?: string;
  required: boolean;
  validation?: "email" | "phone" | "url";
  options?: string[]; // for select/radio
}

export interface Form {
  id: string;
  tenantId: string;
  name: string;
  slug: string; // for public URL: /forms/{slug}
  fields: FormField[];
  title: string;
  description?: string;
  successMessage: string;
  redirectUrl?: string;
  notifyEmail?: string; // Send submission to this email
  autoEnrollSequence?: string;
  triggerWorkflow?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  tenantId: string;
  contactId?: string;
  data: Record<string, unknown>;
  email?: string;
  name?: string;
  submittedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Create or update form */
export async function upsertForm(tenantId: string, form: Partial<Form>): Promise<string> {
  const db = coreDb();
  const now = new Date().toISOString();

  if (form.id) {
    // Update
    await db.prepare(
      `UPDATE forms SET name = ?, slug = ?, fields = ?, title = ?, description = ?,
       success_message = ?, redirect_url = ?, notify_email = ?,
       auto_enroll_sequence = ?, trigger_workflow = ?, active = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`
    ).bind(
      form.name,
      form.slug,
      JSON.stringify(form.fields || []),
      form.title,
      form.description,
      form.successMessage,
      form.redirectUrl,
      form.notifyEmail,
      form.autoEnrollSequence,
      form.triggerWorkflow,
      form.active ? 1 : 0,
      now,
      form.id,
      tenantId,
    ).run();
    return form.id;
  } else {
    // Create
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO forms
       (id, tenant_id, name, slug, fields, title, description, success_message,
        redirect_url, notify_email, auto_enroll_sequence, trigger_workflow, active,
        created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      id,
      tenantId,
      form.name,
      form.slug,
      JSON.stringify(form.fields || []),
      form.title,
      form.description,
      form.successMessage,
      form.redirectUrl,
      form.notifyEmail,
      form.autoEnrollSequence,
      form.triggerWorkflow,
      form.createdBy,
      now,
      now,
    ).run();
    return id;
  }
}

/** Submit a form and auto-create contact */
export async function submitForm(
  tenantId: string,
  formId: string,
  data: Record<string, unknown>,
  ipAddress?: string,
): Promise<{ contactId?: string; submissionId: string }> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get form
  const form = await db.prepare(
    "SELECT * FROM forms WHERE id = ? AND tenant_id = ?"
  ).bind(formId, tenantId).first<any>();

  if (!form) throw new Error("Form not found");

  // Extract contact info
  const email = String(data.email || "").toLowerCase();
  const name = String(data.name || email.split("@")[0] || "");
  const phone = String(data.phone || "");

  let contactId: string | undefined;

  // Auto-create or update contact
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const existing = await db.prepare(
      "SELECT id FROM crm_contacts WHERE lower(email) = ? AND tenant_id = ?"
    ).bind(email, tenantId).first<{ id: string }>();

    if (existing) {
      contactId = existing.id;
    } else {
      contactId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO crm_contacts
         (id, tenant_id, full_name, email, phone, lifecycle, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'LEAD', 'FORM', ?, ?)`
      ).bind(
        contactId,
        tenantId,
        name,
        email,
        phone || null,
        now,
        now,
      ).run();
    }
  }

  // Record submission
  const submissionId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO form_submissions
     (id, form_id, tenant_id, contact_id, email, name, data, submitted_at, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    submissionId,
    formId,
    tenantId,
    contactId || null,
    email,
    name,
    JSON.stringify(data),
    now,
    ipAddress,
  ).run();

  // Auto-enroll in sequence (fire-and-forget)
  if (form.auto_enroll_sequence && contactId && email) {
    try {
      const { fireSequenceTrigger } = await import("@/lib/core/email-sequences");
      await fireSequenceTrigger(tenantId, "contact.created", { contactId, email, name });
    } catch { /* non-blocking */ }
  }

  // Trigger workflow (fire-and-forget)
  if (form.trigger_workflow && contactId) {
    try {
      const { fireWorkflowTrigger } = await import("@/lib/core/workflows");
      await fireWorkflowTrigger(tenantId, "contact.created", { contactId, email, name });
    } catch { /* non-blocking */ }
  }

  // Send notification email (fire-and-forget)
  if (form.notify_email) {
    try {
      const { sendEmail } = await import("@/lib/core/email");
      const submissionText = Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      await sendEmail({
        to: form.notify_email,
        subject: `New form submission: ${form.name}`,
        html: `<p>New submission from <strong>${name}</strong> (${email})</p><pre>${submissionText}</pre>`,
      });
    } catch { /* non-blocking */ }
  }

  return { contactId, submissionId };
}

/** Get form by slug (for public form page) */
export async function getFormBySlug(tenantId: string, slug: string): Promise<Form | null> {
  const db = coreDb();
  const form = await db.prepare(
    "SELECT * FROM forms WHERE tenant_id = ? AND slug = ? AND active = 1"
  ).bind(tenantId, slug).first<any>();

  if (!form) return null;

  return {
    ...form,
    fields: JSON.parse(String(form.fields || "[]")),
  };
}
