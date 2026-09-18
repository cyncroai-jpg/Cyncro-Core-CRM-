/**
 * FCRA Compliance & Dispute Letter Generation API
 *
 * GET  /api/fcra-compliance?section=statutes
 * GET  /api/fcra-compliance?section=templates
 * GET  /api/fcra-compliance?section=letters&clientId=X — list a client's letters
 * GET  /api/fcra-compliance?section=letter&letterId=X — get a specific letter
 * GET  /api/fcra-compliance?section=checklist&clientId=X — get compliance checklist
 * POST /api/fcra-compliance  { action: "generate-letter", ... }
 * POST /api/fcra-compliance  { action: "mark-sent", letterId, sentDate? }
 * POST /api/fcra-compliance  { action: "record-response", letterId, responseStatus, responseContent? }
 * POST /api/fcra-compliance  { action: "create-checklist", clientId, checklistType? }
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
  coreDb,
} from "@/lib/core/db";
import {
  generateDisputeLetter,
  getDisputeLetter,
  listClientLetters,
  markLetterSent,
  recordLetterResponse,
  createComplianceChecklist,
  FCRA_STATUTES,
  FCRA_REPORTING_LIMITS,
  type LetterType,
  type DisputeReason,
  type CreditBureau,
} from "@/lib/core/fcra-compliance";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    const clientId = cleanText(url.searchParams.get("clientId"), 100);
    const letterId = cleanText(url.searchParams.get("letterId"), 100);

    if (section === "statutes") {
      return Response.json({ statutes: FCRA_STATUTES, reportingLimits: FCRA_REPORTING_LIMITS });
    }

    if (section === "templates") {
      return Response.json({
        templates: {
          letterTypes: [
            "INITIAL_DISPUTE",
            "INVESTIGATION_FOLLOW_UP",
            "SECOND_DISPUTE",
            "DEBT_VALIDATION",
            "CEASE_AND_DESIST",
            "REINVESTIGATION_REQUEST",
            "FURNISHER_DISPUTE",
            "GOODWILL_LETTER",
            "PAY_FOR_DELETE",
          ],
          bureaus: ["EQUIFAX", "EXPERIAN", "TRANSUNION", "FURNISHER"],
          reasons: [
            "NOT_MINE",
            "NOT_ACCURATE",
            "ALREADY_PAID",
            "WRONG_AMOUNT",
            "WRONG_STATUS",
            "IDENTITY_THEFT",
            "ACCOUNT_CLOSED",
            "DUPLICATE",
            "WRONG_DATE",
            "NO_ACCOUNT_HISTORY",
          ],
        },
      });
    }

    if (section === "letters") {
      if (!clientId) return Response.json({ error: "clientId is required" }, { status: 400 });
      const letters = await listClientLetters(tenant.tenantId, clientId);
      return Response.json({ letters });
    }

    if (section === "letter") {
      if (!letterId) return Response.json({ error: "letterId is required" }, { status: 400 });
      const letter = await getDisputeLetter(tenant.tenantId, letterId);
      if (!letter) return Response.json({ error: "Letter not found" }, { status: 404 });
      return Response.json({ letter });
    }

    if (section === "checklist") {
      if (!clientId) return Response.json({ error: "clientId is required" }, { status: 400 });
      const db = coreDb();
      const result = await db
        .prepare(`SELECT * FROM compliance_checklists WHERE tenant_id = ? AND client_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(tenant.tenantId, clientId)
        .first<Record<string, unknown>>();
      if (!result) return Response.json({ checklist: null });
      return Response.json({ checklist: result });
    }

    return Response.json({ error: "Unknown section" }, { status: 400 });
  } catch (error) {
    console.error("fcra-compliance.get.failed", error);
    return Response.json({ error: "Unable to fetch FCRA compliance data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "generate-letter") {
      const clientIdFromBody = cleanText(String(body.clientId || ""), 100);
      const letterType = String(body.letterType || "INITIAL_DISPUTE") as LetterType;
      const creditBureau = String(body.creditBureau || "EQUIFAX") as CreditBureau;
      const disputeReason = String(body.disputeReason || "NOT_ACCURATE") as DisputeReason;
      const accountNumber = cleanText(String(body.accountNumber || ""), 100);
      const accountName = cleanText(String(body.accountName || ""), 200);
      const customNarrative = body.customNarrative ? cleanText(String(body.customNarrative), 2000) : undefined;

      const clientInfo = {
        name: cleanText(String(body.clientName || ""), 200),
        ssn: body.clientSSN ? cleanText(String(body.clientSSN), 20) : undefined,
        address: cleanText(String(body.clientAddress || ""), 300),
        phone: body.clientPhone ? cleanText(String(body.clientPhone), 20) : undefined,
        email: body.clientEmail ? cleanText(String(body.clientEmail), 100) : undefined,
      };

      const accountDetails = {
        reportedAmount: body.reportedAmount ? Number(body.reportedAmount) : undefined,
        reportedStatus: body.reportedStatus ? cleanText(String(body.reportedStatus), 100) : undefined,
        creditor: body.creditor ? cleanText(String(body.creditor), 200) : undefined,
        originalAccountDate: body.originalAccountDate ? cleanText(String(body.originalAccountDate), 20) : undefined,
      };

      if (!clientIdFromBody || !accountNumber || !accountName || !clientInfo.name) {
        return Response.json({ error: "clientId, accountNumber, accountName, and clientName are required" }, { status: 400 });
      }

      const letter = await generateDisputeLetter(
        tenant.tenantId, clientIdFromBody, letterType, creditBureau, disputeReason,
        accountNumber, accountName, clientInfo, accountDetails, customNarrative,
      );

      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "dispute_letter", letter.id, {
        resourceName: `Letter: ${letterType} to ${creditBureau}`, status: "SUCCESS", reason: disputeReason, clientId: clientIdFromBody,
      });

      return Response.json({ letter }, { status: 201 });
    }

    if (action === "mark-sent") {
      const letterId = cleanText(String(body.letterId || ""), 100);
      if (!letterId) return Response.json({ error: "letterId is required" }, { status: 400 });
      const sentDate = String(body.sentDate || new Date().toISOString());
      const letter = await markLetterSent(tenant.tenantId, letterId, sentDate);
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "MARK_SENT", "dispute_letter", letterId, {
        resourceName: "Letter Marked as Sent", status: "SUCCESS", sentDate,
      });
      return Response.json({ letter });
    }

    if (action === "record-response") {
      const letterId = cleanText(String(body.letterId || ""), 100);
      if (!letterId) return Response.json({ error: "letterId is required" }, { status: 400 });
      const responseStatus = String(body.responseStatus || "PENDING") as Parameters<typeof recordLetterResponse>[2];
      const responseContent = body.responseContent ? cleanText(String(body.responseContent), 5000) : undefined;
      const letter = await recordLetterResponse(tenant.tenantId, letterId, responseStatus, responseContent);
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "RECORD_RESPONSE", "dispute_letter", letterId, {
        resourceName: `Response Recorded: ${responseStatus}`, status: "SUCCESS",
      });
      return Response.json({ letter });
    }

    if (action === "create-checklist") {
      const clientId = cleanText(String(body.clientId || ""), 100);
      if (!clientId) return Response.json({ error: "clientId is required" }, { status: 400 });
      const checklistType = cleanText(String(body.checklistType || "DISPUTE_PROCESS"), 100);
      const checklist = await createComplianceChecklist(tenant.tenantId, clientId, checklistType);
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "compliance_checklist", checklist.id, {
        resourceName: `Checklist: ${checklistType}`, status: "SUCCESS", clientId,
      });
      return Response.json({ checklist }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("fcra-compliance.post.failed", error);
    return Response.json({ error: "Unable to process request" }, { status: 500 });
  }
}
