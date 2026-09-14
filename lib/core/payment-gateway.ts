/**
 * Payment Gateway Integration (Phase 51)
 *
 * Multi-gateway payment processing:
 * - Stripe integration (cards, ACH, bank transfers)
 * - ACH payments (direct bank transfers)
 * - Recurring/subscription payments
 * - Payment method tokenization
 * - PCI compliance and security
 * - Webhook handling
 * - Dispute/chargeback management
 * - Refund processing
 * - Payment reconciliation
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type PaymentProvider = "STRIPE" | "ACH" | "PAYPAL" | "SQUARE";
export type PaymentMethodType = "CARD" | "ACH" | "BANK_TRANSFER" | "DIGITAL_WALLET";
export type PaymentStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "LOST" | "WON";

export interface PaymentMethod {
  id: string;
  tenantId: string;
  customerId: string; // borrower/client ID
  provider: PaymentProvider;
  methodType: PaymentMethodType;
  tokenId: string; // provider's token ID
  displayName: string; // last 4 digits, bank name, etc.
  expiryMonth?: number;
  expiryYear?: number;
  bankName?: string;
  accountNumberLast4?: string;
  routingNumber?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  tenantId: string;
  customerId: string;
  loanId?: string;
  creditRepairClientId?: string;
  transactionType: "PAYMENT" | "REFUND" | "DISPUTE" | "CHARGEBACK";
  amount: number;
  currency: string;
  provider: PaymentProvider;
  paymentMethodId?: string;
  providerTransactionId: string;
  status: PaymentStatus;
  description: string;
  metadata?: Record<string, unknown>;
  failureReason?: string;
  failureCode?: string;
  processingFee?: number;
  netAmount?: number;
  receiptUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  customerId: string;
  loanId?: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "DRAFT" | "SENT" | "VIEWED" | "PAID" | "OVERDUE" | "CANCELLED";
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  paymentTerms?: string;
  notes?: string;
  viewedAt?: string;
  paidAt?: string;
  paidWith?: string; // transaction ID
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  tenantId: string;
  name: string;
  billingCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  amount: number;
  currency: string;
  description?: string;
  features?: string[];
  trialDays?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  paymentMethodId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate?: string;
  cancellationDate?: string;
  trialEndDate?: string;
  providerSubscriptionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Dispute {
  id: string;
  tenantId: string;
  transactionId: string;
  customerId: string;
  amount: number;
  reason: string;
  status: DisputeStatus;
  providerDisputeId: string;
  evidence?: {
    type: string;
    documentId?: string;
    description?: string;
  }[];
  resultCode?: string;
  resultDescription?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReconciliation {
  id: string;
  tenantId: string;
  reconciliationDate: string;
  transactionsProcessed: number;
  totalAmount: number;
  totalFees: number;
  netAmount: number;
  discrepancies: {
    type: string;
    description: string;
    amount: number;
  }[];
  status: "RECONCILED" | "PENDING" | "DISCREPANCIES_FOUND";
  createdAt: string;
}

// ==================== PAYMENT METHODS ====================

export async function addPaymentMethod(
  tenantId: string,
  customerId: string,
  provider: PaymentProvider,
  methodType: PaymentMethodType,
  tokenId: string,
  displayName: string,
  expiryMonth?: number,
  expiryYear?: number,
  bankName?: string,
  accountNumberLast4?: string,
  routingNumber?: string
): Promise<PaymentMethod> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Set this as default if first payment method
  const existingMethods = await db
    .prepare(
      `SELECT COUNT(*) as count FROM payment_methods
       WHERE tenant_id = ? AND customer_id = ?`
    )
    .bind(tenantId, customerId)
    .first<{ count: number }>();

  const isDefault = !existingMethods || existingMethods.count === 0;

  await db
    .prepare(
      `INSERT INTO payment_methods (
        id, tenant_id, customer_id, provider, method_type, token_id, display_name,
        expiry_month, expiry_year, bank_name, account_number_last4, routing_number,
        is_default, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      customerId,
      provider,
      methodType,
      tokenId,
      displayName,
      expiryMonth,
      expiryYear,
      bankName,
      accountNumberLast4,
      routingNumber,
      isDefault ? 1 : 0,
      1,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    customerId,
    provider,
    methodType,
    tokenId,
    displayName,
    expiryMonth,
    expiryYear,
    bankName,
    accountNumberLast4,
    routingNumber,
    isDefault,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getPaymentMethods(
  tenantId: string,
  customerId: string
): Promise<PaymentMethod[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM payment_methods
       WHERE tenant_id = ? AND customer_id = ? AND is_active = 1
       ORDER BY is_default DESC, created_at DESC`
    )
    .bind(tenantId, customerId)
    .all<PaymentMethod>();

  return result.results || [];
}

// ==================== TRANSACTIONS ====================

export async function createTransaction(
  tenantId: string,
  customerId: string,
  transactionType: "PAYMENT" | "REFUND" | "DISPUTE" | "CHARGEBACK",
  amount: number,
  provider: PaymentProvider,
  providerTransactionId: string,
  description: string,
  paymentMethodId?: string,
  loanId?: string,
  creditRepairClientId?: string,
  metadata?: Record<string, unknown>,
  processingFee?: number
): Promise<Transaction> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const netAmount = processingFee ? amount - processingFee : amount;

  await db
    .prepare(
      `INSERT INTO transactions (
        id, tenant_id, customer_id, loan_id, credit_repair_client_id, transaction_type,
        amount, currency, provider, payment_method_id, provider_transaction_id,
        status, description, metadata, processing_fee, net_amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      customerId,
      loanId,
      creditRepairClientId,
      transactionType,
      amount,
      "USD",
      provider,
      paymentMethodId,
      providerTransactionId,
      "COMPLETED",
      description,
      JSON.stringify(metadata || {}),
      processingFee,
      netAmount,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    customerId,
    loanId,
    creditRepairClientId,
    transactionType,
    amount,
    currency: "USD",
    provider,
    paymentMethodId,
    providerTransactionId,
    status: "COMPLETED",
    description,
    metadata,
    processingFee,
    netAmount,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getTransaction(
  tenantId: string,
  transactionId: string
): Promise<Transaction | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM transactions WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, transactionId)
    .first<Transaction>();
}

export async function getTransactionsByLoan(
  tenantId: string,
  loanId: string
): Promise<Transaction[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM transactions
       WHERE tenant_id = ? AND loan_id = ?
       ORDER BY created_at DESC`
    )
    .bind(tenantId, loanId)
    .all<Transaction>();

  return result.results || [];
}

// ==================== INVOICES ====================

export async function createInvoice(
  tenantId: string,
  customerId: string,
  description: string,
  amount: number,
  dueDate: string,
  lineItems: any[],
  loanId?: string,
  notes?: string
): Promise<Invoice> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const invoiceNumber = `INV-${Date.now()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO invoices (
        id, tenant_id, customer_id, loan_id, invoice_number, description,
        amount, due_date, status, line_items, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      customerId,
      loanId,
      invoiceNumber,
      description,
      amount,
      dueDate,
      "DRAFT",
      JSON.stringify(lineItems),
      notes,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    customerId,
    loanId,
    invoiceNumber,
    description,
    amount,
    dueDate,
    status: "DRAFT",
    lineItems,
    notes,
    createdAt: now,
    updatedAt: now,
  };
}

export async function sendInvoice(
  tenantId: string,
  invoiceId: string
): Promise<Invoice> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE invoices SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`
    )
    .bind("SENT", now, tenantId, invoiceId)
    .run();

  const invoice = await db
    .prepare(`SELECT * FROM invoices WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, invoiceId)
    .first<Invoice>();

  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

export async function markInvoicePaid(
  tenantId: string,
  invoiceId: string,
  transactionId: string
): Promise<Invoice> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE invoices
       SET status = ?, paid_at = ?, paid_with = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind("PAID", now, transactionId, now, tenantId, invoiceId)
    .run();

  const invoice = await db
    .prepare(`SELECT * FROM invoices WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, invoiceId)
    .first<Invoice>();

  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

// ==================== SUBSCRIPTIONS ====================

export async function createSubscriptionPlan(
  tenantId: string,
  name: string,
  billingCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL",
  amount: number,
  description?: string,
  features?: string[],
  trialDays?: number
): Promise<SubscriptionPlan> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO subscription_plans (
        id, tenant_id, name, billing_cycle, amount, currency, description, features,
        trial_days, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      billingCycle,
      amount,
      "USD",
      description,
      JSON.stringify(features || []),
      trialDays,
      1,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    name,
    billingCycle,
    amount,
    currency: "USD",
    description,
    features,
    trialDays,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function subscribeCustomer(
  tenantId: string,
  customerId: string,
  planId: string,
  paymentMethodId: string,
  providerSubscriptionId: string,
  trialDays?: number
): Promise<Subscription> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const currentPeriodStart = now;
  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const trialEndDate = trialDays
    ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  await db
    .prepare(
      `INSERT INTO subscriptions (
        id, tenant_id, customer_id, plan_id, status, payment_method_id,
        current_period_start, current_period_end, next_billing_date, trial_end_date,
        provider_subscription_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      customerId,
      planId,
      "ACTIVE",
      paymentMethodId,
      currentPeriodStart,
      currentPeriodEnd,
      currentPeriodEnd,
      trialEndDate,
      providerSubscriptionId,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    customerId,
    planId,
    status: "ACTIVE",
    paymentMethodId,
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingDate: currentPeriodEnd,
    trialEndDate,
    providerSubscriptionId,
    createdAt: now,
    updatedAt: now,
  };
}

// ==================== DISPUTES & CHARGEBACKS ====================

export async function createDispute(
  tenantId: string,
  transactionId: string,
  customerId: string,
  amount: number,
  reason: string,
  providerDisputeId: string
): Promise<Dispute> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO payment_disputes (
        id, tenant_id, transaction_id, customer_id, amount, reason, status,
        provider_dispute_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      transactionId,
      customerId,
      amount,
      reason,
      "OPEN",
      providerDisputeId,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    transactionId,
    customerId,
    amount,
    reason,
    status: "OPEN",
    providerDisputeId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function submitDisputeEvidence(
  tenantId: string,
  disputeId: string,
  evidenceType: string,
  documentId?: string,
  description?: string
): Promise<Dispute> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get current dispute
  const dispute = await db
    .prepare(`SELECT * FROM payment_disputes WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, disputeId)
    .first<any>();

  if (!dispute) throw new Error("Dispute not found");

  const evidence = JSON.parse(dispute.evidence || "[]");
  evidence.push({
    type: evidenceType,
    documentId,
    description,
    submittedAt: now,
  });

  await db
    .prepare(
      `UPDATE payment_disputes SET evidence = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`
    )
    .bind(JSON.stringify(evidence), now, tenantId, disputeId)
    .run();

  const updated = await db
    .prepare(`SELECT * FROM payment_disputes WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, disputeId)
    .first<Dispute>();

  if (!updated) throw new Error("Dispute not found");
  return updated;
}
