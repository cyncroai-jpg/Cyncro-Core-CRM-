/**
 * Apex Funds — lending-broker fintech infrastructure API.
 *
 * Core data-model requirement: one applicant can be submitted to multiple
 * lenders simultaneously, each with its own independent status, rate, term,
 * offer, stipulations, and underwriter communication (apex_submissions is
 * one row per applicant-lender pair, not a single "application" record).
 *
 * IMPORTANT: apex_lenders is a manually-managed registry, not a live
 * integration. Nothing in this API ever claims a lender is "synced" or
 * "connected" — there is no lender API/secure feed operational. Submitting
 * an applicant to a lender here logs the submission for tracking; it does
 * not transmit anything to a real lender.
 *
 * A single Next.js route file (no catch-all segment) — resource, id and
 * action are query params instead of URL path segments.
 *
 * GET  /api/apex?resource=applicants[&id=X]
 * POST /api/apex?resource=applicants
 * PATCH /api/apex?resource=applicants&id=X
 * GET  /api/apex?resource=owners&applicantId=X
 * POST /api/apex?resource=owners
 * GET  /api/apex?resource=documents&applicantId=X
 * POST /api/apex?resource=documents
 * GET  /api/apex?resource=lenders
 * POST /api/apex?resource=lenders
 * PATCH /api/apex?resource=lenders&id=X
 * GET  /api/apex?resource=submissions&applicantId=X
 * POST /api/apex?resource=submissions  { applicantId, lenderIds: [...] } — multi-lender submit
 * PATCH /api/apex?resource=submissions&id=X
 * GET  /api/apex?resource=notes&submissionId=X
 * POST /api/apex?resource=notes
 * GET  /api/apex?resource=commissions
 * POST /api/apex?resource=commissions
 * PATCH /api/apex?resource=commissions&id=X
 * GET  /api/apex?resource=summary
 */
import { cleanText, ensureCoreSchema, getTenantContext, coreDb } from "@/lib/core/db";
import { logAuditAction } from "@/lib/core/audit";

function uid() {
  return crypto.randomUUID();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id") || undefined;
    const applicantId = url.searchParams.get("applicantId") || undefined;
    const submissionId = url.searchParams.get("submissionId") || undefined;

    if (resource === "applicants") {
      if (id) {
        const applicant = await db.prepare("SELECT * FROM apex_applicants WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first();
        if (!applicant) return Response.json({ error: "Applicant not found." }, { status: 404 });
        const [owners, documents, submissions] = await Promise.all([
          db.prepare("SELECT * FROM apex_owners WHERE applicant_id=? ORDER BY created_at").bind(id).all(),
          db.prepare("SELECT * FROM apex_documents WHERE applicant_id=? ORDER BY created_at DESC").bind(id).all(),
          db.prepare(`SELECT s.*, l.name AS lender_name FROM apex_submissions s JOIN apex_lenders l ON l.id=s.lender_id WHERE s.applicant_id=? ORDER BY s.submitted_at DESC`).bind(id).all(),
        ]);
        return Response.json({ applicant, owners: owners.results, documents: documents.results, submissions: submissions.results });
      }
      const { results } = await db.prepare("SELECT * FROM apex_applicants WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").bind(tenant.tenantId).all();
      return Response.json({ applicants: results });
    }

    if (resource === "owners") {
      if (!applicantId) return Response.json({ error: "applicantId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM apex_owners WHERE tenant_id=? AND applicant_id=? ORDER BY created_at").bind(tenant.tenantId, applicantId).all();
      return Response.json({ owners: results });
    }

    if (resource === "documents") {
      if (!applicantId) return Response.json({ error: "applicantId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM apex_documents WHERE tenant_id=? AND applicant_id=? ORDER BY created_at DESC").bind(tenant.tenantId, applicantId).all();
      return Response.json({ documents: results });
    }

    if (resource === "lenders") {
      const { results } = await db.prepare("SELECT * FROM apex_lenders WHERE tenant_id=? ORDER BY name").bind(tenant.tenantId).all();
      return Response.json({ lenders: results });
    }

    if (resource === "submissions") {
      const q = applicantId
        ? db.prepare(`SELECT s.*, l.name AS lender_name FROM apex_submissions s JOIN apex_lenders l ON l.id=s.lender_id WHERE s.tenant_id=? AND s.applicant_id=? ORDER BY s.submitted_at DESC`).bind(tenant.tenantId, applicantId)
        : db.prepare(`SELECT s.*, l.name AS lender_name, a.applicant_name, a.business_name FROM apex_submissions s
                       JOIN apex_lenders l ON l.id=s.lender_id JOIN apex_applicants a ON a.id=s.applicant_id
                       WHERE s.tenant_id=? ORDER BY s.submitted_at DESC LIMIT 200`).bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ submissions: results });
    }

    if (resource === "notes") {
      if (!submissionId) return Response.json({ error: "submissionId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM apex_submission_notes WHERE tenant_id=? AND submission_id=? ORDER BY created_at DESC").bind(tenant.tenantId, submissionId).all();
      return Response.json({ notes: results });
    }

    if (resource === "commissions") {
      const { results } = await db.prepare(`SELECT c.*, a.applicant_name, a.business_name FROM apex_commissions c JOIN apex_applicants a ON a.id=c.applicant_id WHERE c.tenant_id=? ORDER BY c.created_at DESC LIMIT 200`).bind(tenant.tenantId).all();
      return Response.json({ commissions: results });
    }

    if (resource === "summary") {
      const [applicants, submitted, funded, pendingCommission] = await Promise.all([
        db.prepare("SELECT COUNT(*) c FROM apex_applicants WHERE tenant_id=?").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM apex_submissions WHERE tenant_id=? AND status IN ('SUBMITTED','UNDER_REVIEW','STIPS_REQUESTED')").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM apex_applicants WHERE tenant_id=? AND status='FUNDED'").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COALESCE(SUM(amount_cents),0) c FROM apex_commissions WHERE tenant_id=? AND status='PENDING'").bind(tenant.tenantId).first<{ c: number }>(),
      ]);
      return Response.json({
        totalApplicants: Number(applicants?.c || 0),
        activeSubmissions: Number(submitted?.c || 0),
        fundedDeals: Number(funded?.c || 0),
        pendingCommissionCents: Number(pendingCommission?.c || 0),
      });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("apex.get_failed", error);
    return Response.json({ error: "Unable to load Apex Funds data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "applicants") {
      const applicantName = cleanText(body.applicantName, 200);
      if (!applicantName) return Response.json({ error: "applicantName is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_applicants
        (id,tenant_id,broker_email,manager_email,applicant_name,applicant_email,applicant_phone,business_name,business_ein,industry,
         time_in_business_months,monthly_revenue_cents,annual_revenue_cents,credit_score_self_reported,funding_amount_requested_cents,funding_purpose,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          id, tenant.tenantId, cleanText(body.brokerEmail, 254) || tenant.email, cleanText(body.managerEmail, 254) || null,
          applicantName, cleanText(body.applicantEmail, 254) || null, cleanText(body.applicantPhone, 40) || null,
          cleanText(body.businessName, 200) || null, cleanText(body.businessEin, 40) || null, cleanText(body.industry, 100) || null,
          body.timeInBusinessMonths !== undefined ? Number(body.timeInBusinessMonths) : null,
          body.monthlyRevenue !== undefined ? Math.round(Number(body.monthlyRevenue) * 100) : null,
          body.annualRevenue !== undefined ? Math.round(Number(body.annualRevenue) * 100) : null,
          body.creditScore !== undefined ? Number(body.creditScore) : null,
          Math.round(Number(body.fundingAmount || 0) * 100),
          cleanText(body.fundingPurpose, 500) || null,
          "NEW", now, now,
        ).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "loan_application", id, { resourceName: `Applicant: ${applicantName}` });
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "owners") {
      const applicantId = cleanText(body.applicantId, 80);
      const fullName = cleanText(body.fullName, 200);
      if (!applicantId || !fullName) return Response.json({ error: "applicantId and fullName are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_owners (id,tenant_id,applicant_id,full_name,ownership_pct,ssn_last4,date_of_birth,home_address,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, applicantId, fullName, body.ownershipPct !== undefined ? Number(body.ownershipPct) : null,
          cleanText(body.ssnLast4, 4) || null, cleanText(body.dateOfBirth, 20) || null, cleanText(body.homeAddress, 300) || null, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "documents") {
      const applicantId = cleanText(body.applicantId, 80);
      const docType = cleanText(body.docType, 40);
      const fileName = cleanText(body.fileName, 300);
      if (!applicantId || !docType || !fileName) return Response.json({ error: "applicantId, docType, and fileName are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_documents (id,tenant_id,applicant_id,doc_type,file_name,notes,uploaded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id, tenant.tenantId, applicantId, docType, fileName, cleanText(body.notes, 1000) || null, tenant.email, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "lenders") {
      const name = cleanText(body.name, 200);
      if (!name) return Response.json({ error: "name is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_lenders
        (id,tenant_id,name,product_types,min_credit_score,min_time_in_business_months,min_monthly_revenue_cents,max_funding_amount_cents,excluded_industries,notes,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(
          id, tenant.tenantId, name, JSON.stringify(Array.isArray(body.productTypes) ? body.productTypes : []),
          body.minCreditScore !== undefined ? Number(body.minCreditScore) : null,
          body.minTimeInBusinessMonths !== undefined ? Number(body.minTimeInBusinessMonths) : null,
          body.minMonthlyRevenue !== undefined ? Math.round(Number(body.minMonthlyRevenue) * 100) : null,
          body.maxFundingAmount !== undefined ? Math.round(Number(body.maxFundingAmount) * 100) : null,
          JSON.stringify(Array.isArray(body.excludedIndustries) ? body.excludedIndustries : []),
          cleanText(body.notes, 1000) || null, now, now,
        ).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "submissions") {
      // Multi-lender submission: one applicant -> many lenders in one call,
      // each lender getting its own independent submission row.
      const applicantId = cleanText(body.applicantId, 80);
      const lenderIds = Array.isArray(body.lenderIds) ? (body.lenderIds as unknown[]).map((x) => cleanText(x, 80)).filter(Boolean) : [];
      if (!applicantId || !lenderIds.length) return Response.json({ error: "applicantId and at least one lenderId are required." }, { status: 400 });
      const created: string[] = [];
      for (const lenderId of lenderIds) {
        const id = uid();
        await db.prepare(`INSERT INTO apex_submissions (id,tenant_id,applicant_id,lender_id,status,submitted_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`).bind(id, tenant.tenantId, applicantId, lenderId, "SUBMITTED", now, now, now).run();
        created.push(id);
      }
      await db.prepare("UPDATE apex_applicants SET status='SUBMITTED', updated_at=? WHERE tenant_id=? AND id=?").bind(now, tenant.tenantId, applicantId).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "SUBMIT", "loan_application", applicantId, { resourceName: `Submitted to ${lenderIds.length} lender(s)` });
      return Response.json({ ids: created }, { status: 201 });
    }

    if (resource === "notes") {
      const submissionId = cleanText(body.submissionId, 80);
      const noteBody = cleanText(body.body, 4000);
      if (!submissionId || !noteBody) return Response.json({ error: "submissionId and body are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_submission_notes (id,tenant_id,submission_id,author,body,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, submissionId, tenant.email, noteBody, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "commissions") {
      const applicantId = cleanText(body.applicantId, 80);
      if (!applicantId) return Response.json({ error: "applicantId is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO apex_commissions (id,tenant_id,applicant_id,submission_id,broker_email,amount_cents,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, applicantId, cleanText(body.submissionId, 80) || null, cleanText(body.brokerEmail, 254) || tenant.email,
          Math.round(Number(body.amount || 0) * 100), "PENDING", now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("apex.post_failed", error);
    return Response.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "applicants") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 20)); }
      if (body.managerEmail !== undefined) { updates.push("manager_email=?"); vals.push(cleanText(body.managerEmail, 254) || null); }
      if (body.ofacChecked !== undefined) { updates.push("ofac_checked=?"); vals.push(body.ofacChecked ? 1 : 0); }
      if (body.ofacClear !== undefined) { updates.push("ofac_clear=?"); vals.push(body.ofacClear ? 1 : 0); }
      if (body.fundedAmount !== undefined) {
        updates.push("funded_amount_cents=?", "funded_at=?", "status=?");
        vals.push(Math.round(Number(body.fundedAmount) * 100), now, "FUNDED");
      }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE apex_applicants SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "lenders") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.active !== undefined) { updates.push("active=?"); vals.push(body.active ? 1 : 0); }
      if (body.minCreditScore !== undefined) { updates.push("min_credit_score=?"); vals.push(Number(body.minCreditScore)); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE apex_lenders SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "submissions") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) {
        updates.push("status=?"); vals.push(cleanText(body.status, 30));
        updates.push("responded_at=?"); vals.push(now);
      }
      if (body.rate !== undefined) { updates.push("rate=?"); vals.push(Number(body.rate)); }
      if (body.termMonths !== undefined) { updates.push("term_months=?"); vals.push(Number(body.termMonths)); }
      if (body.payment !== undefined) { updates.push("payment_cents=?"); vals.push(Math.round(Number(body.payment) * 100)); }
      if (body.factorRate !== undefined) { updates.push("factor_rate=?"); vals.push(Number(body.factorRate)); }
      if (body.approvalAmount !== undefined) { updates.push("approval_amount_cents=?"); vals.push(Math.round(Number(body.approvalAmount) * 100)); }
      if (body.declineReason !== undefined) { updates.push("decline_reason=?"); vals.push(cleanText(body.declineReason, 500) || null); }
      if (body.stipulations !== undefined) { updates.push("stipulations=?"); vals.push(JSON.stringify(Array.isArray(body.stipulations) ? body.stipulations : [])); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE apex_submissions SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      if (body.status !== undefined) {
        await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "UPDATE", "loan_application", id, { resourceName: `Submission status: ${body.status}` });
      }
      return Response.json({ updated: true });
    }

    if (resource === "commissions") {
      const status = cleanText(body.status, 20);
      if (!status) return Response.json({ error: "status is required." }, { status: 400 });
      await db.prepare("UPDATE apex_commissions SET status=?, updated_at=? WHERE tenant_id=? AND id=?").bind(status, now, tenant.tenantId, id).run();
      return Response.json({ updated: true });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("apex.patch_failed", error);
    return Response.json({ error: "Unable to update." }, { status: 500 });
  }
}
