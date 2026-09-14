/**
 * FCRA Compliance & Dispute Letter Generation API
 *
 * GET /api/fcra-compliance/statutes — list all FCRA statutes and references
 * POST /api/fcra-compliance/generate-letter — generate compliant dispute letter
 * GET /api/fcra-compliance/:clientId/letters — list all dispute letters
 * GET /api/fcra-compliance/:clientId/letters/:letterId — get specific letter
 * POST /api/fcra-compliance/:clientId/letters/:letterId/mark-sent — mark letter as sent
 * POST /api/fcra-compliance/:clientId/letters/:letterId/response — record response
 * POST /api/fcra-compliance/:clientId/checklist — create compliance checklist
 * GET /api/fcra-compliance/:clientId/checklist — get compliance checklist
 * GET /api/fcra-compliance/templates — get letter templates
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
    const pathParts = url.pathname.split("/");
    const section = pathParts[3];
    const clientId = pathParts[3];
    const action = pathParts[4];

    if (section === "statutes") {
      // GET /api/fcra-compliance/statutes - list all FCRA statutes
      return Response.json({
        statutes: FCRA_STATUTES,
        reportingLimits: FCRA_REPORTING_LIMITS,
      });
    }

    if (section === "templates") {
      // GET /api/fcra-compliance/templates - get letter templates
      const templates = {
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
      };
      return Response.json({ templates });
    }

    if (action === "letters") {
      // GET /api/fcra-compliance/:clientId/letters - list client letters
      const letters = await listClientLetters(tenant.tenantId, clientId);
      return Response.json({ letters });
    }

    if (action === "letters" && pathParts[5]) {
      // GET /api/fcra-compliance/:clientId/letters/:letterId - get specific letter
      const letterId = pathParts[5];
      const letter = await getDisputeLetter(tenant.tenantId, letterId);
      if (!letter) {
        return Response.json({ error: "Letter not found" }, { status: 404 });
      }
      return Response.json({ letter });
    }

    if (action === "checklist") {
      // GET /api/fcra-compliance/:clientId/checklist - get compliance checklist
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM compliance_checklists
           WHERE tenant_id = ? AND client_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(tenant.tenantId, clientId)
        .first<any>();

      if (!result) {
        return Response.json({ error: "Checklist not found" }, { status: 404 });
      }
      return Response.json({ checklist: result });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("fcra-compliance.get.failed", error);
    return Response.json(
      { error: "Unable to fetch FCRA compliance data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const section = pathParts[3];
    const clientId = pathParts[3];
    const action = pathParts[4];

    const body = (await request.json()) as Record<string, unknown>;

    if (section === "generate-letter") {
      // POST /api/fcra-compliance/generate-letter - generate dispute letter
      const clientIdFromBody = cleanText(String(body.clientId || ""), 100);
      const letterType = String(body.letterType || "INITIAL_DISPUTE") as LetterType;
      const creditBureau = String(body.creditBureau || "EQUIFAX") as CreditBureau;
      const disputeReason = String(body.disputeReason || "NOT_ACCURATE") as DisputeReason;
      const accountNumber = cleanText(String(body.accountNumber || ""), 100);
      const accountName = cleanText(String(body.accountName || ""), 200);
      const customNarrative = body.customNarrative
        ? cleanText(String(body.customNarrative), 2000)
        : undefined;

      const clientInfo = {
        name: cleanText(String(body.clientName || ""), 200),
        ssn: body.clientSSN ? cleanText(String(body.clientSSN), 20) : undefined,
        address: cleanText(String(body.clientAddress || ""), 300),
        phone: body.clientPhone ? cleanText(String(body.clientPhone), 20) : undefined,
        email: body.clientEmail ? cleanText(String(body.clientEmail), 100) : undefined,
      };

      const accountDetails = {
        reportedAmount: body.reportedAmount ? Number(body.reportedAmount) : undefined,
        reportedStatus: body.reportedStatus
          ? cleanText(String(body.reportedStatus), 100)
          : undefined,
        creditor: body.creditor ? cleanText(String(body.creditor), 200) : undefined,
        originalAccountDate: body.originalAccountDate
          ? cleanText(String(body.originalAccountDate), 20)
          : undefined,
      };

      if (!clientIdFromBody || !accountNumber || !accountName || !clientInfo.name) {
        return Response.json(
          { error: "clientId, accountNumber, accountName, and clientName are required" },
          { status: 400 }
        );
      }

      const letter = await generateDisputeLetter(
        tenant.tenantId,
        clientIdFromBody,
        letterType,
        creditBureau,
        disputeReason,
        accountNumber,
        accountName,
        clientInfo,
        accountDetails,
        customNarrative
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dispute_letter",
        letter.id,
        {
          resourceName: `Letter: ${letterType} to ${creditBureau}`,
          status: "SUCCESS",
          reason: disputeReason,
          clientId: clientIdFromBody,
        }
      );

      return Response.json({ letter }, { status: 201 });
    }

    if (action === "letters" && pathParts[5] === "mark-sent") {
      // POST /api/fcra-compliance/:clientId/letters/:letterId/mark-sent
      const letterId = pathParts[4];
      const sentDate = String(body.sentDate || new Date().toISOString());

      const letter = await markLetterSent(tenant.tenantId, letterId, sentDate);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "MARK_SENT",
        "dispute_letter",
        letterId,
        {
          resourceName: `Letter Marked as Sent`,
          status: "SUCCESS",
          clientId,
          sentDate,
        }
      );

      return Response.json({ letter });
    }

    if (action === "letters" && pathParts[5] === "response") {
      // POST /api/fcra-compliance/:clientId/letters/:letterId/response
      const letterId = pathParts[4];
      const responseStatus = String(body.responseStatus || "PENDING") as any;
      const responseContent = body.responseContent
        ? cleanText(String(body.responseContent), 5000)
        : undefined;

      const letter = await recordLetterResponse(
        tenant.tenantId,
        letterId,
        responseStatus,
        responseContent
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "RECORD_RESPONSE",
        "dispute_letter",
        letterId,
        {
          resourceName: `Response Recorded: ${responseStatus}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ letter });
    }

    if (action === "checklist") {
      // POST /api/fcra-compliance/:clientId/checklist - create checklist
      const checklistType = cleanText(String(body.checklistType || "DISPUTE_PROCESS"), 100);

      const checklist = await createComplianceChecklist(
        tenant.tenantId,
        clientId,
        checklistType
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "compliance_checklist",
        checklist.id,
        {
          resourceName: `Checklist: ${checklistType}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ checklist }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("fcra-compliance.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
