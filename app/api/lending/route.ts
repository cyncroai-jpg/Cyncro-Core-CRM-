/**
 * Lending Platform API
 *
 * A single Next.js route file (no catch-all segment), so the resource,
 * id and action are passed as query params instead of URL path segments.
 *
 * GET /api/lending?resource=products — list available loan products
 * POST /api/lending?resource=products — create loan product
 * POST /api/lending?resource=applications — create loan application
 * GET /api/lending?resource=applications — list applications
 * GET /api/lending?resource=applications&id=X — get application details
 * POST /api/lending?resource=applications&id=X&action=submit — submit application
 * POST /api/lending?resource=applications&id=X&action=underwrite — perform underwriting
 * POST /api/lending?resource=applications&id=X&action=offer — create loan offer
 * POST /api/lending?resource=offers&id=X&action=accept — accept offer and create loan
 * GET /api/lending?resource=loans — list loans
 * GET /api/lending?resource=loans&id=X — get loan details
 * POST /api/lending?resource=loans&id=X&action=payment — record payment
 * POST /api/lending?resource=loans&id=X&action=disclosure — create disclosure
 * GET /api/lending?resource=loans&id=X&section=payments — get payment history
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
  coreDb,
} from "@/lib/core/db";
import {
  createLoanProduct,
  getLoanProduct,
  listLoanProducts,
  createLoanApplication,
  submitLoanApplication,
  performUnderwriting,
  createLoanOffer,
  acceptLoanOffer,
  recordLoanPayment,
  createDisclosure,
  getLoan,
  getLoanApplication,
  type LoanType,
} from "@/lib/core/lending-platform";
import { performAIUnderwriting, saveAIRecommendation } from "@/lib/core/lending-ai";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.searchParams.get("resource");
    const resourceId = url.searchParams.get("id");
    const action = url.searchParams.get("section");

    if (section === "products") {
      // GET /api/lending?resource=products — list loan products
      const products = await listLoanProducts(tenant.tenantId);
      return Response.json({ products });
    }

    if (section === "applications" && resourceId) {
      // GET /api/lending?resource=applications&id=X
      const application = await getLoanApplication(tenant.tenantId, resourceId);
      if (!application) {
        return Response.json({ error: "Application not found" }, { status: 404 });
      }
      return Response.json({ application });
    }

    if (section === "applications") {
      // GET /api/lending?resource=applications — list applications
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM loan_applications
           WHERE tenant_id = ?
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ applications: result.results || [] });
    }

    if (section === "loans" && !resourceId) {
      // GET /api/lending?resource=loans — list loans
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM loans
           WHERE tenant_id = ?
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ loans: result.results || [] });
    }

    if (section === "loans" && resourceId && action === "payments") {
      // GET /api/lending?resource=loans&id=X&section=payments
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM loan_payments
           WHERE tenant_id = ? AND loan_id = ?
           ORDER BY payment_date DESC`
        )
        .bind(tenant.tenantId, resourceId)
        .all<any>();
      return Response.json({ payments: result.results || [] });
    }

    if (section === "loans" && resourceId) {
      // GET /api/lending/loans/:loanId
      const loan = await getLoan(tenant.tenantId, resourceId);
      if (!loan) {
        return Response.json({ error: "Loan not found" }, { status: 404 });
      }
      return Response.json({ loan });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("lending.get.failed", error);
    return Response.json(
      { error: "Unable to fetch lending data" },
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
    const section = url.searchParams.get("resource");
    const resourceId = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    const body = (await request.json()) as Record<string, unknown>;

    if (section === "products") {
      // POST /api/lending?resource=products — create loan product
      const name = cleanText(String(body.name || ""), 200);
      const type = String(body.type || "PERSONAL") as LoanType;
      const minAmount = Number(body.minAmount || 1000);
      const maxAmount = Number(body.maxAmount || 50000);
      const minTerm = Number(body.minTerm || 12);
      const maxTerm = Number(body.maxTerm || 60);
      const baseInterestRate = Number(body.baseInterestRate || 8.5);
      const description = cleanText(String(body.description || ""), 500);
      const features = Array.isArray(body.features)
        ? body.features.map((f) => cleanText(String(f), 100))
        : [];

      if (!name) {
        return Response.json({ error: "name is required" }, { status: 400 });
      }

      const product = await createLoanProduct(
        tenant.tenantId,
        name,
        type,
        minAmount,
        maxAmount,
        minTerm,
        maxTerm,
        baseInterestRate,
        description,
        features,
        {
          minCreditScore: Number(body.minCreditScore || 600),
          minIncome: Number(body.minIncome || 30000),
          maxDTI: Number(body.maxDTI || 0.43),
          residencyRequired: Boolean(body.residencyRequired),
        }
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "loan_product",
        product.id,
        {
          resourceName: `Product: ${name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ product }, { status: 201 });
    }

    if (section === "applications" && !resourceId) {
      // POST /api/lending/applications — create application
      const applicantId = cleanText(String(body.applicantId || ""), 100);
      const applicantEmail = cleanText(String(body.applicantEmail || ""), 100);
      const productId = cleanText(String(body.productId || ""), 100);
      const requestedAmount = Number(body.requestedAmount || 5000);
      const requestedTerm = Number(body.requestedTerm || 36);
      const purpose = cleanText(String(body.purpose || ""), 200);
      const applicantPhone = body.applicantPhone
        ? cleanText(String(body.applicantPhone), 20)
        : undefined;
      const annualIncomeCents = body.annualIncome ? Math.round(Number(body.annualIncome) * 100) : undefined;
      const monthlyDebtPaymentsCents = body.monthlyDebtPayments ? Math.round(Number(body.monthlyDebtPayments) * 100) : undefined;
      const employmentStatus = body.employmentStatus ? cleanText(String(body.employmentStatus), 50) : undefined;
      const selfReportedCreditScore = body.selfReportedCreditScore ? Number(body.selfReportedCreditScore) : undefined;

      if (!applicantId || !applicantEmail || !productId) {
        return Response.json(
          { error: "applicantId, applicantEmail, and productId are required" },
          { status: 400 }
        );
      }

      const application = await createLoanApplication(
        tenant.tenantId,
        applicantId,
        applicantEmail,
        productId,
        requestedAmount,
        requestedTerm,
        purpose,
        applicantPhone,
        { annualIncomeCents, monthlyDebtPaymentsCents, employmentStatus, selfReportedCreditScore }
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "loan_application",
        application.id,
        {
          resourceName: `Application: $${requestedAmount}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ application }, { status: 201 });
    }

    if (section === "applications" && action === "submit" && resourceId) {
      // POST /api/lending?resource=applications&id=X&action=submit
      const appId = resourceId;
      const application = await submitLoanApplication(tenant.tenantId, appId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "SUBMIT",
        "loan_application",
        appId,
        {
          resourceName: `Application Submitted`,
          status: "SUCCESS",
        }
      );

      return Response.json({ application });
    }

    if (section === "applications" && action === "ai-underwrite" && resourceId) {
      // POST /api/lending?resource=applications&id=X&action=ai-underwrite
      const result = await performAIUnderwriting(tenant.tenantId, resourceId);
      await saveAIRecommendation(tenant.tenantId, resourceId, result);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "AI_UNDERWRITE",
        "loan_application",
        resourceId,
        {
          resourceName: `AI recommendation: ${result.recommendedDecision}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ recommendation: result });
    }

    if (section === "applications" && action === "underwrite" && resourceId) {
      // POST /api/lending?resource=applications&id=X&action=underwrite
      const appId = resourceId;
      const creditScore = Number(body.creditScore || 650);
      const debtToIncomeRatio = Number(body.debtToIncomeRatio || 0.35);
      const riskLevel = String(body.riskLevel || "MEDIUM") as any;
      const decision = String(body.decision || "APPROVED") as any;
      const decisionNotes = body.decisionNotes
        ? cleanText(String(body.decisionNotes), 1000)
        : undefined;
      const estimatedAPR = Number(body.estimatedAPR || 8.5);
      const monthlyPayment = Number(body.monthlyPayment || 250);

      const { application, assessment } = await performUnderwriting(
        tenant.tenantId,
        appId,
        creditScore,
        debtToIncomeRatio,
        riskLevel,
        decision,
        decisionNotes,
        estimatedAPR,
        monthlyPayment
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UNDERWRITE",
        "loan_application",
        appId,
        {
          resourceName: `Underwriting: ${decision}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ application, assessment });
    }

    if (section === "applications" && action === "offer" && resourceId) {
      // POST /api/lending?resource=applications&id=X&action=offer
      const appId = resourceId;
      const app = await getLoanApplication(tenant.tenantId, appId);
      if (!app) {
        return Response.json({ error: "Application not found" }, { status: 404 });
      }

      const offer = await createLoanOffer(
        tenant.tenantId,
        appId,
        app.productId,
        Number(body.loanAmount || app.requestedAmount),
        Number(body.interestRate || app.estimatedAPR || 8.5),
        Number(body.term || app.requestedTerm),
        body.fees as any
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "loan_offer",
        offer.id,
        {
          resourceName: `Offer: $${offer.loanAmount}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ offer }, { status: 201 });
    }

    if (section === "offers" && action === "accept" && resourceId) {
      // POST /api/lending?resource=offers&id=X&action=accept
      const offerId = resourceId;
      const borrowerId = cleanText(String(body.borrowerId || ""), 100);
      const applicationId = cleanText(String(body.applicationId || ""), 100);
      const productId = cleanText(String(body.productId || ""), 100);

      if (!borrowerId || !applicationId || !productId) {
        return Response.json(
          { error: "borrowerId, applicationId, and productId are required" },
          { status: 400 }
        );
      }

      const loan = await acceptLoanOffer(
        tenant.tenantId,
        offerId,
        borrowerId,
        applicationId,
        productId
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "ACCEPT_OFFER",
        "loan",
        loan.id,
        {
          resourceName: `Loan Created: $${loan.loanAmount}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ loan }, { status: 201 });
    }

    if (section === "loans" && action === "payment" && resourceId) {
      // POST /api/lending?resource=loans&id=X&action=payment
      const loanId = resourceId;
      const amount = Number(body.amount || 0);
      const principalAmount = Number(body.principalAmount || 0);
      const interestAmount = Number(body.interestAmount || 0);
      const paymentMethod = cleanText(String(body.paymentMethod || ""), 50);
      const transactionId = cleanText(String(body.transactionId || ""), 100);
      const feeAmount = body.feeAmount ? Number(body.feeAmount) : undefined;

      if (!amount || !paymentMethod || !transactionId) {
        return Response.json(
          { error: "amount, paymentMethod, and transactionId are required" },
          { status: 400 }
        );
      }

      const payment = await recordLoanPayment(
        tenant.tenantId,
        loanId,
        amount,
        principalAmount,
        interestAmount,
        paymentMethod,
        transactionId,
        feeAmount
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "PAYMENT",
        "loan_payment",
        payment.id,
        {
          resourceName: `Payment: $${amount}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ payment }, { status: 201 });
    }

    if (section === "loans" && action === "disclosure" && resourceId) {
      // POST /api/lending?resource=loans&id=X&action=disclosure
      const loanId = resourceId;
      const disclosureType = String(body.disclosureType || "TILA") as any;
      const content = cleanText(String(body.content || ""), 5000);

      if (!content) {
        return Response.json(
          { error: "content is required" },
          { status: 400 }
        );
      }

      const disclosure = await createDisclosure(
        tenant.tenantId,
        loanId,
        disclosureType,
        content
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "disclosure",
        disclosure.id,
        {
          resourceName: `Disclosure: ${disclosureType}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ disclosure }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("lending.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
