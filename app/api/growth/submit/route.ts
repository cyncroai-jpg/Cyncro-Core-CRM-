/**
 * Public form funnel + submission endpoint — the FORM → CRM SYNC pipeline.
 * No auth: this is called from the public form renderer. Every call is a
 * real funnel event (viewed/started/step/abandoned/submitted); on SUBMIT
 * it finds-or-creates the real CRM contact, optionally creates a real
 * opportunity, and runs AI lead qualification if the form is configured
 * for it — same pattern as the rest of this session's AI features:
 * honest errors, never a faked success.
 */
import { coreDb, cleanText } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { resolveVisitorSession, recordEvent } from "@/lib/growth/events";
import { syncContact, createOpportunityForContact, addActivityNote } from "@/lib/growth/crmSync";
import { readCookie, setCookie, VISITOR_COOKIE, SESSION_COOKIE, VISITOR_MAX_AGE, SESSION_MAX_AGE } from "@/lib/growth/http";
import { loadAgent, runLeadQualification } from "@/lib/growth/agents";

interface FormField { id: string; label: string; type: string; required: boolean; options: string[]; role?: "NAME" | "EMAIL" | "PHONE" | null }
interface FormStep { id: string; title: string; fields: FormField[] }

function extractIdentity(steps: FormStep[], answers: Record<string, unknown>) {
  let name = ""; let email = ""; let phone = "";
  for (const step of steps) {
    for (const field of step.fields) {
      const value = answers[field.id];
      if (!value) continue;
      if (field.role === "NAME" && !name) name = String(value);
      if (field.role === "EMAIL" && !email) email = String(value);
      if (field.role === "PHONE" && !phone) phone = String(value);
    }
  }
  return { name, email, phone };
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    const db = coreDb();
    const body = (await request.json()) as {
      token?: string; action?: string; submissionId?: string; step?: number; answers?: Record<string, unknown>;
      utmSource?: string; utmMedium?: string; utmCampaign?: string; referrer?: string; landingPageUrl?: string;
    };
    const token = cleanText(body.token, 120);
    const action = String(body.action || "").toUpperCase();
    if (!token || !action) return Response.json({ error: "token and action are required." }, { status: 400 });

    const form = await db.prepare("SELECT * FROM gi_forms WHERE public_token=?").bind(token).first<Record<string, unknown>>();
    if (!form || form.status !== "PUBLISHED") return Response.json({ error: "This form is not available." }, { status: 404 });
    const steps: FormStep[] = JSON.parse(String(form.steps_json || "[]"));

    const visitorCookie = readCookie(request, VISITOR_COOKIE);
    const sessionCookie = readCookie(request, SESSION_COOKIE);
    const { visitorId, sessionId } = await resolveVisitorSession(visitorCookie, sessionCookie, {
      utmSource: body.utmSource || null, utmMedium: body.utmMedium || null, utmCampaign: body.utmCampaign || null,
      referrer: body.referrer || request.headers.get("referer") || null, landingPageUrl: body.landingPageUrl || null,
    });
    const cookieHeaders = new Headers();
    cookieHeaders.append("Set-Cookie", setCookie(VISITOR_COOKIE, visitorId, VISITOR_MAX_AGE));
    cookieHeaders.append("Set-Cookie", setCookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE));

    if (action === "VIEW") {
      await db.prepare("UPDATE gi_forms SET views = views + 1 WHERE id=?").bind(form.id).run();
      await recordEvent({ visitorId, sessionId, eventType: "form.viewed", formId: String(form.id) });
      return Response.json({ ok: true }, { headers: cookieHeaders });
    }

    if (action === "START") {
      const now = new Date().toISOString();
      const submissionId = crypto.randomUUID();
      await db.prepare(`INSERT INTO gi_form_submissions (id, form_id, visitor_id, session_id, answers_json, current_step, status, started_at) VALUES (?,?,?,?,?,0,'STARTED',?)`)
        .bind(submissionId, form.id, visitorId, sessionId, JSON.stringify({}), now).run();
      await db.prepare("UPDATE gi_forms SET starts = starts + 1 WHERE id=?").bind(form.id).run();
      await recordEvent({ visitorId, sessionId, eventType: "form.started", formId: String(form.id) });
      return Response.json({ submissionId }, { headers: cookieHeaders });
    }

    const submissionId = cleanText(body.submissionId, 80);
    if (!submissionId) return Response.json({ error: "submissionId is required." }, { status: 400 });
    const submission = await db.prepare("SELECT * FROM gi_form_submissions WHERE id=? AND form_id=?").bind(submissionId, form.id).first<Record<string, unknown>>();
    if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });

    if (action === "STEP") {
      const merged = { ...JSON.parse(String(submission.answers_json || "{}")), ...(body.answers || {}) };
      await db.prepare("UPDATE gi_form_submissions SET answers_json=?, current_step=? WHERE id=?").bind(JSON.stringify(merged), Math.max(0, Number(body.step || 0)), submissionId).run();
      await recordEvent({ visitorId, sessionId, eventType: "form.step_completed", formId: String(form.id), metadata: { step: body.step } });
      return Response.json({ ok: true }, { headers: cookieHeaders });
    }

    if (action === "ABANDON") {
      await db.prepare("UPDATE gi_form_submissions SET status='ABANDONED' WHERE id=?").bind(submissionId).run();
      await recordEvent({ visitorId, sessionId, eventType: "form.abandoned", formId: String(form.id), metadata: { step: submission.current_step } });
      return Response.json({ ok: true }, { headers: cookieHeaders });
    }

    if (action === "SUBMIT") {
      const finalAnswers = { ...JSON.parse(String(submission.answers_json || "{}")), ...(body.answers || {}) };
      const identity = extractIdentity(steps, finalAnswers);
      if (!identity.name) return Response.json({ error: "Name is required to submit this form." }, { status: 400 });
      if (!identity.email && !identity.phone) return Response.json({ error: "Email or phone is required to submit this form." }, { status: 400 });

      const session = await db.prepare("SELECT source, medium, campaign, landing_page_url FROM gi_sessions WHERE id=?").bind(sessionId).first<{ source: string; medium: string; campaign: string | null; landing_page_url: string | null }>();
      const syncConfig = JSON.parse(String(form.sync_config_json || "{}")) as { createOpportunity?: boolean; pipelineId?: string; stage?: string; assignedRep?: string; tags?: string[]; qualifyWithAI?: boolean; qualificationAgentId?: string };

      const { contact, created } = await syncContact({
        fullName: identity.name, email: identity.email || null, phone: identity.phone || null,
        source: session?.source || "growth-intelligence", visitorId, formId: String(form.id), tags: syncConfig.tags,
        attribution: { source: session?.source || null, medium: session?.medium || null, campaign: session?.campaign || null, landingPage: session?.landing_page_url || null },
      });
      const contactId = String(contact.id);
      let opportunityId: string | null = null;
      if (syncConfig.createOpportunity !== false) {
        const opportunity = await createOpportunityForContact({
          contactId, accountId: String(contact.account_id), name: `${identity.name} — ${form.name}`,
          pipelineId: syncConfig.pipelineId || null, stage: syncConfig.stage || null, assignedRep: syncConfig.assignedRep || null,
          source: session?.source || "growth-intelligence", campaign: session?.campaign || null, formId: String(form.id),
        });
        opportunityId = String(opportunity.id);
      }
      await addActivityNote(contactId, `Submitted "${form.name}"`, JSON.stringify(finalAnswers, null, 2), "growth-intelligence");

      const now = new Date().toISOString();
      await db.prepare("UPDATE gi_form_submissions SET answers_json=?, contact_id=?, opportunity_id=?, status='SUBMITTED', completed_at=? WHERE id=?")
        .bind(JSON.stringify(finalAnswers), contactId, opportunityId, now, submissionId).run();
      await db.prepare("UPDATE gi_forms SET submissions = submissions + 1 WHERE id=?").bind(form.id).run();
      await recordEvent({ visitorId, sessionId, contactId, opportunityId, eventType: "form.submitted", formId: String(form.id) });
      await recordEvent({ visitorId, sessionId, contactId, opportunityId, eventType: created ? "crm.contact_created" : "crm.contact_updated", formId: String(form.id) });
      if (opportunityId) await recordEvent({ visitorId, sessionId, contactId, opportunityId, eventType: "crm.opportunity_created", formId: String(form.id) });

      let qualification: { score: number; output: string } | null = null;
      if (syncConfig.qualifyWithAI && syncConfig.qualificationAgentId) {
        try {
          const agent = await loadAgent(syncConfig.qualificationAgentId);
          if (agent && agent.active) {
            const result = await runLeadQualification(agent, submissionId);
            qualification = { score: result.score, output: result.output };
          }
        } catch (error) {
          console.error("growth.submit.qualification_failed", error);
          // Submission itself already succeeded — qualification failure is reported, not hidden, but doesn't block the thank-you page.
        }
      }

      const thankYou = JSON.parse(String(form.thank_you_json || "{}"));
      return Response.json({ contactId, opportunityId, thankYou, qualification }, { status: 201, headers: cookieHeaders });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("growth.submit_failed", error);
    return Response.json({ error: "Unable to process this form action." }, { status: 500 });
  }
}
