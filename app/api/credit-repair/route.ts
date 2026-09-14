/**
 * Credit Repair & Dispute Management API
 *
 * GET /api/credit-repair — list credit repair clients
 * POST /api/credit-repair — create new credit repair client
 * GET /api/credit-repair/:clientId — get client details
 * POST /api/credit-repair/:clientId/disputes — create dispute
 * GET /api/credit-repair/:clientId/disputes — list client disputes
 * POST /api/credit-repair/:clientId/disputes/:disputeId/submit — submit dispute
 * PATCH /api/credit-repair/:clientId/disputes/:disputeId — update dispute status
 * GET /api/credit-repair/:clientId/scores — get credit score history
 * POST /api/credit-repair/:clientId/scores — record new credit score
 * POST /api/credit-repair/:clientId/payment — record payment/unlock features
 * POST /api/credit-repair/:clientId/upgrade — upgrade access level
 * POST /api/credit-repair/:clientId/onboarding — complete onboarding step
 * GET /api/credit-repair/:clientId/analytics — get client analytics
 * GET /api/credit-repair/templates — list dispute templates
 * POST /api/credit-repair/templates — create dispute template
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
  coreDb,
} from "@/lib/core/db";
import {
  createCreditRepairClient,
  getCreditRepairClient,
  createDispute,
  submitDispute,
  updateDisputeStatus,
  addCreditScoreRecord,
  recordPayment,
  upgradeClientAccessLevel,
  completeOnboardingStep,
  getCreditRepairAnalytics,
  getClientDisputes,
  getClientCreditScores,
  createDisputeTemplate,
  getDisputeTemplates,
  type DisputeReason,
  type CreditBureau,
  type AccessLevel,
  type DisputeStatus,
} from "@/lib/core/credit-repair";
import { logAuditAction } from "@/lib/core/audit";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const clientId = pathParts[3];
    const section = pathParts[4];

    if (clientId === "templates") {
      // GET /api/credit-repair/templates - list dispute templates
      const reason = url.searchParams.get("reason") as DisputeReason | null;
      const templates = await getDisputeTemplates(tenant.tenantId, reason || undefined);
      return Response.json({ templates });
    }

    if (clientId === undefined) {
      // GET /api/credit-repair - list all credit repair clients for tenant
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM credit_repair_clients
           WHERE tenant_id = ?
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ clients: result.results || [] });
    }

    if (section === "disputes") {
      // GET /api/credit-repair/:clientId/disputes - list disputes
      const disputes = await getClientDisputes(tenant.tenantId, clientId);
      return Response.json({ disputes });
    }

    if (section === "scores") {
      // GET /api/credit-repair/:clientId/scores - get credit score history
      const scores = await getClientCreditScores(tenant.tenantId, clientId);
      return Response.json({ scores });
    }

    if (section === "analytics") {
      // GET /api/credit-repair/:clientId/analytics - get client analytics
      const analytics = await getCreditRepairAnalytics(tenant.tenantId, clientId);
      return Response.json({ analytics: analytics[0] || {} });
    }

    if (clientId && !section) {
      // GET /api/credit-repair/:clientId - get client details
      const client = await getCreditRepairClient(tenant.tenantId, clientId);
      if (!client) {
        return Response.json({ error: "Client not found" }, { status: 404 });
      }
      return Response.json({ client });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("credit-repair.get.failed", error);
    return Response.json(
      { error: "Unable to fetch credit repair data" },
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
    const clientId = pathParts[3];
    const action = pathParts[4];
    const disputeId = pathParts[5];

    const body = (await request.json()) as Record<string, unknown>;

    if (clientId === "templates") {
      // POST /api/credit-repair/templates - create dispute template
      const name = cleanText(String(body.name || ""), 200);
      const reason = String(body.reason || "OTHER") as DisputeReason;
      const templateContent = String(body.templateContent || "");
      const creditBureau = (String(body.creditBureau || "ALL") as CreditBureau) || "ALL";
      const isDefault = Boolean(body.isDefault);

      if (!name || !templateContent) {
        return Response.json(
          { error: "name and templateContent are required" },
          { status: 400 }
        );
      }

      const template = await createDisputeTemplate(
        tenant.tenantId,
        name,
        reason,
        templateContent,
        creditBureau,
        isDefault
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dispute_template",
        template.id,
        {
          resourceName: `Template: ${name}`,
          status: "SUCCESS",
          reason,
        }
      );

      return Response.json({ template }, { status: 201 });
    }

    if (clientId === undefined) {
      // POST /api/credit-repair - create new credit repair client
      const email = cleanText(String(body.email || ""), 100);
      const firstName = cleanText(String(body.firstName || ""), 100);
      const lastName = cleanText(String(body.lastName || ""), 100);
      const accessLevel = (String(body.accessLevel || "FREE") as AccessLevel) || "FREE";
      const phoneNumber = body.phoneNumber ? cleanText(String(body.phoneNumber), 20) : undefined;
      const address = body.address ? cleanText(String(body.address), 200) : undefined;

      if (!email || !firstName || !lastName) {
        return Response.json(
          { error: "email, firstName, and lastName are required" },
          { status: 400 }
        );
      }

      const client = await createCreditRepairClient(
        tenant.tenantId,
        email,
        firstName,
        lastName,
        accessLevel,
        phoneNumber,
        address
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "credit_repair_client",
        client.id,
        {
          resourceName: `Client: ${firstName} ${lastName}`,
          status: "SUCCESS",
          accessLevel,
          email,
        }
      );

      return Response.json({ client }, { status: 201 });
    }

    if (action === "disputes" && !disputeId) {
      // POST /api/credit-repair/:clientId/disputes - create dispute
      const creditBureau = (String(body.creditBureau || "EQUIFAX") as CreditBureau) || "EQUIFAX";
      const reason = String(body.reason || "OTHER") as DisputeReason;
      const description = cleanText(String(body.description || ""), 1000);
      const accountInfo = body.accountInfo ? cleanText(String(body.accountInfo), 500) : undefined;

      if (!description) {
        return Response.json(
          { error: "description is required" },
          { status: 400 }
        );
      }

      const dispute = await createDispute(
        tenant.tenantId,
        clientId,
        creditBureau,
        reason,
        description,
        accountInfo
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dispute",
        dispute.id,
        {
          resourceName: `Dispute: ${reason}`,
          status: "SUCCESS",
          creditBureau,
          clientId,
        }
      );

      return Response.json({ dispute }, { status: 201 });
    }

    if (action === "disputes" && disputeId && pathParts[6] === "submit") {
      // POST /api/credit-repair/:clientId/disputes/:disputeId/submit - submit dispute
      const dispute = await submitDispute(tenant.tenantId, disputeId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "SUBMIT",
        "dispute",
        disputeId,
        {
          resourceName: `Dispute Submitted`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ dispute });
    }

    if (action === "scores") {
      // POST /api/credit-repair/:clientId/scores - record credit score
      const equifaxScore = body.equifaxScore ? Number(body.equifaxScore) : undefined;
      const experianScore = body.experianScore ? Number(body.experianScore) : undefined;
      const transunionScore = body.transunionScore ? Number(body.transunionScore) : undefined;
      const documentProof = body.documentProof ? cleanText(String(body.documentProof), 100) : undefined;

      const scoreRecord = await addCreditScoreRecord(
        tenant.tenantId,
        clientId,
        equifaxScore,
        experianScore,
        transunionScore,
        documentProof
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "credit_score_record",
        scoreRecord.id,
        {
          resourceName: `Credit Score Recorded: ${scoreRecord.averageScore}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ scoreRecord }, { status: 201 });
    }

    if (action === "payment") {
      // POST /api/credit-repair/:clientId/payment - record payment
      const paymentType = String(body.paymentType || "SUBSCRIPTION");
      const amount = Number(body.amount || 0);
      const currency = cleanText(String(body.currency || "USD"), 10);
      const paymentMethod = cleanText(String(body.paymentMethod || "CREDIT_CARD"), 50);
      const transactionId = cleanText(String(body.transactionId || ""), 100);
      const newAccessLevel = (String(body.newAccessLevel || "") as AccessLevel) || undefined;
      const recipientEmail = body.recipientEmail ? cleanText(String(body.recipientEmail), 100) : undefined;
      const invoiceUrl = body.invoiceUrl ? cleanText(String(body.invoiceUrl), 500) : undefined;

      if (!transactionId) {
        return Response.json(
          { error: "transactionId is required" },
          { status: 400 }
        );
      }

      const payment = await recordPayment(
        tenant.tenantId,
        clientId,
        paymentType as any,
        amount,
        currency,
        paymentMethod,
        transactionId,
        undefined,
        recipientEmail,
        invoiceUrl
      );

      // If upgrading, update access level
      if (newAccessLevel) {
        await upgradeClientAccessLevel(tenant.tenantId, clientId, newAccessLevel);
      }

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "PAYMENT",
        "payment_record",
        payment.id,
        {
          resourceName: `Payment: $${amount}`,
          status: "SUCCESS",
          amount,
          clientId,
        }
      );

      return Response.json({ payment }, { status: 201 });
    }

    if (action === "upgrade") {
      // POST /api/credit-repair/:clientId/upgrade - upgrade access level
      const newAccessLevel = String(body.newAccessLevel || "PREMIUM") as AccessLevel;

      const client = await upgradeClientAccessLevel(tenant.tenantId, clientId, newAccessLevel);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPGRADE",
        "client_access",
        clientId,
        {
          resourceName: `Access Upgraded to ${newAccessLevel}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ client });
    }

    if (action === "onboarding") {
      // POST /api/credit-repair/:clientId/onboarding - complete onboarding step
      const stepNumber = Number(body.stepNumber || 1);
      const stepData = body.stepData ? JSON.stringify(body.stepData) : undefined;

      const step = await completeOnboardingStep(
        tenant.tenantId,
        clientId,
        stepNumber,
        stepData
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "COMPLETE_STEP",
        "onboarding",
        clientId,
        {
          resourceName: `Onboarding Step ${stepNumber}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ step }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("credit-repair.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const clientId = pathParts[3];
    const action = pathParts[4];
    const disputeId = pathParts[5];

    const body = (await request.json()) as Record<string, unknown>;

    if (action === "disputes" && disputeId) {
      // PATCH /api/credit-repair/:clientId/disputes/:disputeId - update dispute status
      const status = String(body.status || "INVESTIGATING") as DisputeStatus;
      const resolution = body.resolution ? cleanText(String(body.resolution), 1000) : undefined;

      const dispute = await updateDisputeStatus(tenant.tenantId, disputeId, status, resolution);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "dispute",
        disputeId,
        {
          resourceName: `Dispute Status Updated: ${status}`,
          status: "SUCCESS",
          clientId,
        }
      );

      return Response.json({ dispute });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("credit-repair.patch.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
