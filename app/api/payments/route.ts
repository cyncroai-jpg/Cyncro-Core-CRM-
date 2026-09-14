/**
 * Payment Gateway Integration API
 *
 * All routes are on the single /api/payments path — Next.js has no
 * catch-all segment under app/api/payments, so the resource, id and
 * action are passed as query params instead of URL path segments.
 *
 * GET /api/payments?section=methods — list payment methods
 * POST /api/payments?section=methods — add payment method
 * GET /api/payments?section=methods&id=:methodId — get payment method
 * DELETE /api/payments?section=methods&id=:methodId — remove payment method
 * PATCH /api/payments?section=methods&id=:methodId&action=default — set as default
 * GET /api/payments?section=transactions — list transactions
 * POST /api/payments?section=transactions — create transaction
 * GET /api/payments?section=transactions&id=:transactionId — get transaction
 * GET /api/payments?section=invoices — list invoices
 * POST /api/payments?section=invoices — create invoice
 * PATCH /api/payments?section=invoices&id=:invoiceId&action=pay — mark invoice paid
 * GET /api/payments?section=subscriptions — list subscriptions
 * POST /api/payments?section=subscriptions — create subscription
 * PATCH /api/payments?section=subscriptions&id=:subscriptionId&action=cancel — cancel subscription
 * GET /api/payments?section=disputes — list disputes
 * POST /api/payments?section=disputes — create dispute
 * PATCH /api/payments?section=disputes&id=:disputeId&action=evidence — submit evidence
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
  coreDb,
} from "@/lib/core/db";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    const resourceId = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    const db = coreDb();

    if (section === "methods") {
      if (resourceId) {
        const method = await db
          .prepare(
            `SELECT * FROM payment_methods
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!method) {
          return Response.json({ error: "Payment method not found" }, { status: 404 });
        }
        return Response.json({ method });
      } else {
        const methods = await db
          .prepare(
            `SELECT * FROM payment_methods
             WHERE tenant_id = ? AND is_active = 1
             ORDER BY is_default DESC, created_at DESC`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ methods: methods.results || [] });
      }
    }

    if (section === "transactions") {
      if (resourceId) {
        const transaction = await db
          .prepare(
            `SELECT * FROM transactions
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!transaction) {
          return Response.json({ error: "Transaction not found" }, { status: 404 });
        }
        return Response.json({ transaction });
      } else {
        const transactions = await db
          .prepare(
            `SELECT * FROM transactions
             WHERE tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ transactions: transactions.results || [] });
      }
    }

    if (section === "invoices") {
      if (resourceId) {
        const invoice = await db
          .prepare(
            `SELECT * FROM invoices
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!invoice) {
          return Response.json({ error: "Invoice not found" }, { status: 404 });
        }
        return Response.json({ invoice });
      } else {
        const invoices = await db
          .prepare(
            `SELECT * FROM invoices
             WHERE tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ invoices: invoices.results || [] });
      }
    }

    if (section === "subscriptions") {
      if (resourceId) {
        const subscription = await db
          .prepare(
            `SELECT * FROM subscriptions
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!subscription) {
          return Response.json({ error: "Subscription not found" }, { status: 404 });
        }
        return Response.json({ subscription });
      } else {
        const subscriptions = await db
          .prepare(
            `SELECT * FROM subscriptions
             WHERE tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ subscriptions: subscriptions.results || [] });
      }
    }

    if (section === "disputes") {
      if (resourceId) {
        const dispute = await db
          .prepare(
            `SELECT * FROM payment_disputes
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!dispute) {
          return Response.json({ error: "Dispute not found" }, { status: 404 });
        }
        return Response.json({ dispute });
      } else {
        const disputes = await db
          .prepare(
            `SELECT * FROM payment_disputes
             WHERE tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ disputes: disputes.results || [] });
      }
    }

    if (section === "plans") {
      const plans = await db
        .prepare(
          `SELECT * FROM subscription_plans
           WHERE tenant_id = ? AND is_active = 1
           ORDER BY amount_cents ASC`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ plans: plans.results || [] });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("payments.get.failed", error);
    return Response.json(
      { error: "Unable to fetch payment data" },
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
    const section = url.searchParams.get("section");
    const resourceId = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    const body = (await request.json()) as Record<string, unknown>;
    const db = coreDb();

    if (section === "methods") {
      const customerId = cleanText(String(body.customerId || ""), 100);
      const methodType = String(body.methodType || "CARD");
      const provider = String(body.provider || "STRIPE");
      const tokenId = cleanText(String(body.tokenId || ""), 200);
      const displayName = cleanText(String(body.displayName || ""), 200);
      const cardLastFour = body.cardLastFour ? cleanText(String(body.cardLastFour), 4) : null;
      const cardBrand = body.cardBrand ? cleanText(String(body.cardBrand), 50) : null;
      const cardExpiry = body.cardExpiry ? cleanText(String(body.cardExpiry), 7) : null;
      const bankAccountLastFour = body.bankAccountLastFour ? cleanText(String(body.bankAccountLastFour), 4) : null;
      const bankRoutingNumber = body.bankRoutingNumber ? cleanText(String(body.bankRoutingNumber), 9) : null;

      if (!customerId || !tokenId || !displayName) {
        return Response.json({ error: "customerId, tokenId, and displayName are required" }, { status: 400 });
      }

      const id = `pm-${Date.now()}`;
      const now = new Date().toISOString();
      const isDefault = 1;

      await db
        .prepare(
          `INSERT INTO payment_methods
           (id, tenant_id, customer_id, method_type, provider, token_id, display_name, is_default, is_active,
            card_last_four, card_brand, card_expiry, bank_account_last_four, bank_routing_number, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, customerId, methodType, provider, tokenId, displayName, isDefault, 1,
          cardLastFour, cardBrand, cardExpiry, bankAccountLastFour, bankRoutingNumber, now, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "payment_method",
        id,
        {
          resourceName: `Payment Method: ${displayName}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ method: { id, customerId, displayName, methodType } }, { status: 201 });
    }

    if (section === "transactions") {
      const customerId = cleanText(String(body.customerId || ""), 100);
      const loanId = body.loanId ? cleanText(String(body.loanId), 100) : null;
      const paymentMethodId = cleanText(String(body.paymentMethodId || ""), 100);
      const provider = String(body.provider || "STRIPE");
      const providerTransactionId = cleanText(String(body.providerTransactionId || ""), 100);
      const transactionType = String(body.transactionType || "PAYMENT");
      const amountCents = Number(body.amountCents || 0);
      const processingFeeCents = Number(body.processingFeeCents || 0);
      const netAmountCents = amountCents - processingFeeCents;
      const currency = String(body.currency || "USD");

      if (!customerId || !paymentMethodId || !amountCents) {
        return Response.json({ error: "customerId, paymentMethodId, and amountCents are required" }, { status: 400 });
      }

      const id = `txn-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO transactions
           (id, tenant_id, loan_id, customer_id, payment_method_id, provider, provider_transaction_id,
            transaction_type, amount_cents, processing_fee_cents, net_amount_cents, currency, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, loanId, customerId, paymentMethodId, provider, providerTransactionId,
          transactionType, amountCents, processingFeeCents, netAmountCents, currency, "PENDING", now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "transaction",
        id,
        {
          resourceName: `Transaction: $${(amountCents / 100).toFixed(2)}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ transaction: { id, customerId, amountCents, status: "PENDING" } }, { status: 201 });
    }

    if (section === "invoices") {
      const customerId = cleanText(String(body.customerId || ""), 100);
      const loanId = body.loanId ? cleanText(String(body.loanId), 100) : null;
      const invoiceNumber = cleanText(String(body.invoiceNumber || `INV-${Date.now()}`), 50);
      const amountCents = Number(body.amountCents || 0);
      const description = body.description ? cleanText(String(body.description), 500) : null;
      const dueDate = String(body.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

      if (!customerId || !amountCents) {
        return Response.json({ error: "customerId and amountCents are required" }, { status: 400 });
      }

      const id = `inv-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO invoices
           (id, tenant_id, customer_id, loan_id, invoice_number, amount_cents, status, description, due_date, issued_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, customerId, loanId, invoiceNumber, amountCents, "PENDING", description, dueDate, now, now, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "invoice",
        id,
        {
          resourceName: `Invoice: ${invoiceNumber}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ invoice: { id, invoiceNumber, amountCents, status: "PENDING" } }, { status: 201 });
    }

    if (section === "subscriptions") {
      const customerId = cleanText(String(body.customerId || ""), 100);
      const planId = cleanText(String(body.planId || ""), 100);
      const paymentMethodId = cleanText(String(body.paymentMethodId || ""), 100);
      const trialDays = Number(body.trialDays || 0);

      if (!customerId || !planId || !paymentMethodId) {
        return Response.json({ error: "customerId, planId, and paymentMethodId are required" }, { status: 400 });
      }

      const id = `sub-${Date.now()}`;
      const now = new Date().toISOString();
      const currentPeriodStart = now;
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const nextBillingDate = trialDays > 0 
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
        : currentPeriodEnd;
      const trialEndDate = trialDays > 0 
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await db
        .prepare(
          `INSERT INTO subscriptions
           (id, tenant_id, customer_id, plan_id, payment_method_id, status, current_period_start, current_period_end,
            next_billing_date, trial_end_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, customerId, planId, paymentMethodId, "ACTIVE", currentPeriodStart, currentPeriodEnd,
          nextBillingDate, trialEndDate, now, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "subscription",
        id,
        {
          resourceName: `Subscription Created`,
          status: "SUCCESS",
        }
      );

      return Response.json({ subscription: { id, customerId, planId, status: "ACTIVE" } }, { status: 201 });
    }

    if (section === "disputes") {
      const transactionId = cleanText(String(body.transactionId || ""), 100);
      const customerId = cleanText(String(body.customerId || ""), 100);
      const provider = String(body.provider || "STRIPE");
      const providerDisputeId = cleanText(String(body.providerDisputeId || ""), 100);
      const disputeType = String(body.disputeType || "CHARGEBACK");
      const amountCents = Number(body.amountCents || 0);
      const reason = body.reason ? cleanText(String(body.reason), 500) : null;

      if (!transactionId || !customerId || !amountCents) {
        return Response.json({ error: "transactionId, customerId, and amountCents are required" }, { status: 400 });
      }

      const id = `disp-${Date.now()}`;
      const now = new Date().toISOString();
      const responseDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db
        .prepare(
          `INSERT INTO payment_disputes
           (id, tenant_id, transaction_id, customer_id, provider, provider_dispute_id, dispute_type, amount_cents,
            status, reason, response_deadline, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, transactionId, customerId, provider, providerDisputeId, disputeType, amountCents,
          "OPEN", reason, responseDeadline, now, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dispute",
        id,
        {
          resourceName: `Dispute: $${(amountCents / 100).toFixed(2)}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ dispute: { id, transactionId, amountCents, status: "OPEN" } }, { status: 201 });
    }

    if (section === "plans") {
      const name = cleanText(String(body.name || ""), 100);
      const description = body.description ? cleanText(String(body.description), 500) : null;
      const billingCycle = String(body.billingCycle || "MONTHLY");
      const amountCents = Number(body.amountCents || 0);
      const trialDays = Number(body.trialDays || 0);
      const features = JSON.stringify(Array.isArray(body.features) ? body.features : []);

      if (!name || !amountCents) {
        return Response.json({ error: "name and amountCents are required" }, { status: 400 });
      }

      const id = `plan-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO subscription_plans
           (id, tenant_id, name, description, billing_cycle, amount_cents, trial_days, features, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, tenant.tenantId, name, description, billingCycle, amountCents, trialDays, features, 1, now, now)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "subscription_plan",
        id,
        {
          resourceName: `Plan: ${name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ plan: { id, name, amountCents } }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("payments.post.failed", error);
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
    const section = url.searchParams.get("section");
    const resourceId = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    const body = (await request.json()) as Record<string, unknown>;
    const db = coreDb();

    if (section === "methods" && action === "default") {
      if (!resourceId) return Response.json({ error: "id is required" }, { status: 400 });
      const now = new Date().toISOString();
      await db
        .prepare(
          `UPDATE payment_methods SET is_default = 0, updated_at = ? WHERE tenant_id = ? AND is_default = 1`
        )
        .bind(now, tenant.tenantId)
        .run();

      await db
        .prepare(
          `UPDATE payment_methods SET is_default = 1, updated_at = ? WHERE tenant_id = ? AND id = ?`
        )
        .bind(now, tenant.tenantId, resourceId)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "payment_method",
        resourceId,
        { resourceName: "Set as Default", status: "SUCCESS" }
      );

      return Response.json({ status: "updated" });
    }

    if (section === "invoices" && action === "pay") {
      if (!resourceId) return Response.json({ error: "id is required" }, { status: 400 });
      const transactionId = cleanText(String(body.transactionId || ""), 100);
      const now = new Date().toISOString();

      await db
        .prepare(
          `UPDATE invoices SET status = ?, paid_at = ?, paid_with_transaction_id = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`
        )
        .bind("PAID", now, transactionId, now, tenant.tenantId, resourceId)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "invoice",
        resourceId,
        { resourceName: "Invoice Paid", status: "SUCCESS" }
      );

      return Response.json({ status: "paid" });
    }

    if (section === "subscriptions" && action === "cancel") {
      if (!resourceId) return Response.json({ error: "id is required" }, { status: 400 });
      const now = new Date().toISOString();

      await db
        .prepare(
          `UPDATE subscriptions SET status = ?, cancelled_at = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`
        )
        .bind("CANCELLED", now, now, tenant.tenantId, resourceId)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "subscription",
        resourceId,
        { resourceName: "Subscription Cancelled", status: "SUCCESS" }
      );

      return Response.json({ status: "cancelled" });
    }

    if (section === "disputes" && action === "evidence") {
      if (!resourceId) return Response.json({ error: "id is required" }, { status: 400 });
      const documentId = cleanText(String(body.documentId || ""), 100);
      const documentType = String(body.documentType || "RECEIPT");
      const description = body.description ? cleanText(String(body.description), 500) : null;

      const evidence = JSON.stringify({
        type: documentType,
        documentId: documentId,
        description: description,
        submittedAt: new Date().toISOString()
      });

      const dispute = await db
        .prepare(
          `SELECT evidence FROM payment_disputes WHERE tenant_id = ? AND id = ?`
        )
        .bind(tenant.tenantId, resourceId)
        .first<any>();

      let evidenceList: any[] = [];
      if (dispute && dispute.evidence) {
        try {
          evidenceList = JSON.parse(dispute.evidence);
        } catch {
          evidenceList = [];
        }
      }
      evidenceList.push(JSON.parse(evidence));

      const now = new Date().toISOString();
      await db
        .prepare(
          `UPDATE payment_disputes SET evidence = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`
        )
        .bind(JSON.stringify(evidenceList), now, tenant.tenantId, resourceId)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "dispute",
        resourceId,
        { resourceName: "Evidence Submitted", status: "SUCCESS" }
      );

      return Response.json({ status: "evidence_submitted" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("payments.patch.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    const resourceId = url.searchParams.get("id");

    const db = coreDb();

    if (section === "methods") {
      if (!resourceId) return Response.json({ error: "id is required" }, { status: 400 });
      await db
        .prepare(
          `UPDATE payment_methods SET is_active = 0 WHERE tenant_id = ? AND id = ?`
        )
        .bind(tenant.tenantId, resourceId)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "DELETE",
        "payment_method",
        resourceId,
        { resourceName: "Payment Method Removed", status: "SUCCESS" }
      );

      return Response.json({ status: "deleted" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("payments.delete.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
