/**
 * Public, unauthenticated endpoints for live Studio pages — visitors hit
 * these directly, so no session/workspace check here (unlike
 * /api/studio/pages, which is the authenticated editor API).
 *
 * GET  /api/studio/public?slug=X — fetch a published page's sections
 * POST /api/studio/public { slug, answers } — submit the lead form:
 *   creates/matches a CRM contact, account, and pipeline opportunity so
 *   the lead lands exactly where a manually-entered one would.
 */
import { emitAutomationEvent } from "@/lib/automations/engine";
import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { applyAfterSubmit, nextUrl, parseAfterSubmit } from "@/lib/forms/afterSubmit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const slug = cleanText(new URL(request.url).searchParams.get("slug"), 100);
    if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });
    const page = await coreDb()
      .prepare("SELECT id,slug,title,sections_json,seo_title,seo_description,status FROM studio_pages WHERE slug=? AND status='PUBLISHED'")
      .bind(slug)
      .first<Record<string, unknown>>();
    if (!page) return Response.json({ error: "This page is not available." }, { status: 404 });
    return Response.json({
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        seoTitle: page.seo_title,
        seoDescription: page.seo_description,
        sections: JSON.parse(String(page.sections_json || "[]")),
      },
    });
  } catch (error) {
    console.error("studio.public.get_failed", error);
    return Response.json({ error: "Unable to load page." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const slug = cleanText(body.slug, 100);
    const answers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, unknown>;
    if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });

    const db = coreDb();
    const page = await db.prepare("SELECT id,title,tenant_id,sections_json FROM studio_pages WHERE slug=? AND status='PUBLISHED'").bind(slug).first<{ id: string; title: string; tenant_id: string | null; sections_json: string }>();
    if (!page) return Response.json({ error: "This page is not available." }, { status: 404 });
    const tenantId = page.tenant_id;
    if (!tenantId) return Response.json({ error: "This page is not connected to a workspace yet. Open it in Studio and save once." }, { status: 409 });

    let sections: { type?: string; props?: Record<string, unknown> }[] = [];
    try { sections = JSON.parse(page.sections_json || "[]"); } catch { sections = []; }
    const formProps = (sections.find((x) => x && x.type === "form")?.props || {}) as Record<string, unknown>;
    const settings = parseAfterSubmit({ ...formProps, successMessage: formProps.successMessage });

    const fullName = cleanText(String(answers.name || answers.fullName || ""), 160) || "Website Lead";
    const email = normalizeEmail(answers.email);
    const phone = cleanText(String(answers.phone || ""), 40) || null;
    if (!email && !phone) {
      return Response.json({ error: "An email or phone number is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    let contactId: string | null = null;
    if (email) {
      const existing = await db.prepare("SELECT id FROM crm_contacts WHERE lower(email)=? AND tenant_id=?").bind(email, tenantId).first<{ id: string }>();
      contactId = existing?.id || null;
    }

    let accountId: string | null = null;
    if (!contactId) {
      const company = `${fullName} (via ${page.title})`;
      accountId = crypto.randomUUID();
      await db.prepare("INSERT INTO crm_accounts (id,name,owner_email,source,status,tenant_id,created_at,updated_at) VALUES (?,?,?,?, 'ACTIVE',?,?,?)")
        .bind(accountId, company, settings.assignTo || "studio", "STUDIO", tenantId, now, now).run();

      contactId = crypto.randomUUID();
      await db.prepare(`INSERT INTO crm_contacts
        (id, account_id, full_name, email, phone, lifecycle, source, notes, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'LEAD', 'STUDIO', ?, ?, ?, ?)`)
        .bind(contactId, accountId, fullName, email, phone, `Submitted "${page.title}" (${slug})`, tenantId, now, now).run();

      const defaultPipeline = await db.prepare("SELECT id FROM crm_pipelines WHERE active=1 AND tenant_id=? ORDER BY is_default DESC, created_at LIMIT 1").bind(tenantId).first<{ id: string }>();
      if (defaultPipeline) {
        const firstStage = await db.prepare("SELECT name FROM crm_pipeline_stages WHERE pipeline_id=? ORDER BY position LIMIT 1").bind(defaultPipeline.id).first<{ name: string }>();
        if (firstStage) {
          await db.prepare(`INSERT INTO crm_opportunities
            (id,account_id,primary_contact_id,pipeline_id,name,stage,value_cents,probability,source,tenant_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?,0,10,'STUDIO',?,?,?)`)
            .bind(crypto.randomUUID(), accountId, contactId, defaultPipeline.id, `${fullName} — ${page.title}`, firstStage.name, tenantId, now, now).run();
        }
      }
      await emitAutomationEvent(tenantId, "CONTACT_CREATED", { contactId, source: "STUDIO", trigger: "CONTACT_CREATED" });
    }

    await db.prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,created_at,updated_at)
      VALUES (?,?,'FORM',?,?,'COMPLETED','studio',?,?)`)
      .bind(crypto.randomUUID(), contactId, `Submitted "${page.title}"`, JSON.stringify(answers), now, now).run();

    const submissionId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO studio_submissions (id,page_id,contact_id,answers_json,tenant_id,created_at) VALUES (?,?,?,?,?,?)")
        .bind(submissionId, page.id, contactId, JSON.stringify(answers), tenantId, now),
      db.prepare("UPDATE studio_pages SET submission_count = submission_count + 1, updated_at=? WHERE id=?").bind(now, page.id),
    ]);

    await applyAfterSubmit(tenantId, contactId, settings);
    await emitAutomationEvent(tenantId, "FORM_SUBMITTED", { contactId, formId: page.id, formTitle: page.title, pageSlug: slug, submissionId, source: "STUDIO", trigger: "FORM_SUBMITTED" });

    return Response.json({ submitted: true, next: nextUrl(settings, { name: fullName, email, phone }) }, { status: 201 });
  } catch (error) {
    console.error("studio.public.submit_failed", error);
    return Response.json({ error: "Unable to submit form." }, { status: 500 });
  }
}
