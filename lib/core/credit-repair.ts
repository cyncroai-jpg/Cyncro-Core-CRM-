/**
 * Credit Repair & Dispute Management (Phase 47)
 *
 * Comprehensive credit repair and dispute resolution:
 * - Automated dispute filing and tracking
 * - Credit score monitoring and improvement tracking
 * - Document/evidence file management
 * - Payment/unlock system for premium features
 * - Onboarding workflow integration
 * - Dispute templates and automation
 * - Progress tracking and analytics
 * - Multi-bureau support (Equifax, Experian, TransUnion)
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type DisputeStatus =
  | "DRAFT"
  | "PENDING"
  | "SUBMITTED"
  | "INVESTIGATING"
  | "RESOLVED"
  | "REJECTED"
  | "ESCALATED";

export type CreditBureau = "EQUIFAX" | "EXPERIAN" | "TRANSUNION" | "ALL";

export type DisputeReason =
  | "INACCURATE_ACCOUNT_INFO"
  | "UNAUTHORIZED_ACCOUNT"
  | "IDENTITY_THEFT"
  | "DUPLICATE_ENTRY"
  | "ACCOUNT_CLOSED"
  | "WRONG_PAYMENT_STATUS"
  | "INCORRECT_BALANCE"
  | "LATE_PAYMENT_ERROR"
  | "CHARGE_OFF_ERROR"
  | "OTHER";

export type AccessLevel = "FREE" | "PREMIUM" | "PROFESSIONAL" | "UNLIMITED";

export interface CreditRepairClient {
  id: string;
  tenantId: string;
  contactId?: string;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  ssn?: string; // encrypted
  phoneNumber?: string;
  address?: string;
  accessLevel: AccessLevel;
  onboardingStatus: "PENDING" | "COMPLETED" | "VERIFIED";
  creditScoreCurrent?: number;
  creditScoreGoal?: number;
  creditScoreStarting?: number;
  disputesRemaining: number;
  monthlyDisputeLimit: number;
  subscriptionStatus: "ACTIVE" | "INACTIVE" | "CANCELLED" | "TRIAL";
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Dispute {
  id: string;
  tenantId: string;
  clientId: string;
  creditBureau: CreditBureau;
  reason: DisputeReason;
  description: string;
  accountInfo?: string;
  status: DisputeStatus;
  submittedDate?: string;
  investigationStartDate?: string;
  expectedResolutionDate?: string;
  actualResolutionDate?: string;
  resolution?: string;
  documents?: string[]; // document IDs
  certificateOfDispute?: string; // document ID
  createdAt: string;
  updatedAt: string;
}

export interface DisputeTemplate {
  id: string;
  tenantId: string;
  name: string;
  reason: DisputeReason;
  templateContent: string;
  creditBureau: CreditBureau;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditScoreRecord {
  id: string;
  tenantId: string;
  clientId: string;
  equifaxScore?: number;
  experianScore?: number;
  transunionScore?: number;
  averageScore: number;
  recordedDate: string;
  source: "MANUAL" | "BUREAU_SYNC" | "IMPORT";
  documentProof?: string; // document ID with proof
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  tenantId: string;
  clientId: string;
  paymentType: "SUBSCRIPTION" | "PER_DISPUTE" | "BULK_DISPUTES" | "UPGRADE";
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  unlockedFeatures?: string[]; // features/dispute counts unlocked
  recipientEmail?: string;
  invoiceUrl?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingStep {
  id: string;
  tenantId: string;
  clientId: string;
  stepNumber: number;
  stepType: string; // "IDENTITY_VERIFICATION", "CREDIT_PULL", "DOCUMENT_UPLOAD", "PAYMENT_SETUP", etc.
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  data?: string; // JSON field for step-specific data
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditRepairAnalytics {
  clientId: string;
  tenantId: string;
  totalDisputesFiled: number;
  disputesResolved: number;
  resolutionRate: number; // percentage
  averageDaysToResolve: number;
  creditScoreImprovement: number;
  averageScoreGain: number;
  disputesByReason: Record<DisputeReason, number>;
  disputesByStatus: Record<DisputeStatus, number>;
  successfulOutcomes: number;
  revenue: number;
}

// ==================== CREATE FUNCTIONS ====================

export async function createCreditRepairClient(
  tenantId: string,
  email: string,
  firstName: string,
  lastName: string,
  accessLevel: AccessLevel = "FREE",
  phoneNumber?: string,
  address?: string
): Promise<CreditRepairClient> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const disputesRemaining =
    accessLevel === "FREE"
      ? 1
      : accessLevel === "PREMIUM"
        ? 5
        : accessLevel === "PROFESSIONAL"
          ? 20
          : 1000;

  const monthlyDisputeLimit =
    accessLevel === "FREE"
      ? 1
      : accessLevel === "PREMIUM"
        ? 5
        : accessLevel === "PROFESSIONAL"
          ? 20
          : 100;

  await db
    .prepare(
      `INSERT INTO credit_repair_clients (
        id, tenant_id, email, first_name, last_name, phone_number, address,
        access_level, onboarding_status, disputes_remaining, monthly_dispute_limit,
        subscription_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      email,
      firstName,
      lastName,
      phoneNumber ?? null,
      address ?? null,
      accessLevel,
      "PENDING",
      disputesRemaining,
      monthlyDisputeLimit,
      "TRIAL",
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    email,
    firstName,
    lastName,
    phoneNumber,
    address,
    accessLevel,
    onboardingStatus: "PENDING",
    disputesRemaining,
    monthlyDisputeLimit,
    subscriptionStatus: "TRIAL",
    createdAt: now,
    updatedAt: now,
  };
}

export async function getCreditRepairClient(
  tenantId: string,
  clientId: string
): Promise<CreditRepairClient | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM credit_repair_clients WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, clientId)
    .first<CreditRepairClient>();
}

export async function createDispute(
  tenantId: string,
  clientId: string,
  creditBureau: CreditBureau,
  reason: DisputeReason,
  description: string,
  accountInfo?: string
): Promise<Dispute> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Verify client exists and has disputes remaining
  const client = await getCreditRepairClient(tenantId, clientId);
  if (!client) throw new Error("Client not found");
  if (client.disputesRemaining <= 0) throw new Error("No disputes remaining");

  await db
    .prepare(
      `INSERT INTO disputes (
        id, tenant_id, client_id, credit_bureau, reason, description,
        account_info, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      creditBureau,
      reason,
      description,
      accountInfo ?? null,
      "DRAFT",
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    clientId,
    creditBureau,
    reason,
    description,
    accountInfo,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
  };
}

export async function submitDispute(
  tenantId: string,
  disputeId: string
): Promise<Dispute> {
  const db = coreDb();
  const now = new Date().toISOString();
  const submittedDate = new Date().toISOString();

  // Update dispute status
  await db
    .prepare(
      `UPDATE disputes
       SET status = ?, submitted_date = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind("SUBMITTED", submittedDate, now, tenantId, disputeId)
    .run();

  // Decrement disputes remaining for client
  await db
    .prepare(
      `UPDATE credit_repair_clients
       SET disputes_remaining = disputes_remaining - 1
       WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .run();

  const dispute = await db
    .prepare(`SELECT * FROM disputes WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, disputeId)
    .first<Dispute>();

  if (!dispute) throw new Error("Dispute not found");
  return dispute;
}

export async function updateDisputeStatus(
  tenantId: string,
  disputeId: string,
  status: DisputeStatus,
  resolution?: string
): Promise<Dispute> {
  const db = coreDb();
  const now = new Date().toISOString();
  const actualResolutionDate = status === "RESOLVED" ? now : undefined;

  await db
    .prepare(
      `UPDATE disputes
       SET status = ?, resolution = ?, actual_resolution_date = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(status, resolution ?? null, actualResolutionDate ?? null, now, tenantId, disputeId)
    .run();

  const dispute = await db
    .prepare(`SELECT * FROM disputes WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, disputeId)
    .first<Dispute>();

  if (!dispute) throw new Error("Dispute not found");
  return dispute;
}

export async function addCreditScoreRecord(
  tenantId: string,
  clientId: string,
  equifaxScore?: number,
  experianScore?: number,
  transunionScore?: number,
  documentProof?: string
): Promise<CreditScoreRecord> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const scores = [equifaxScore, experianScore, transunionScore].filter(
    (s) => s !== undefined
  );
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => (a || 0) + (b || 0), 0) / scores.length)
      : 0;

  await db
    .prepare(
      `INSERT INTO credit_score_records (
        id, tenant_id, client_id, equifax_score, experian_score, transunion_score,
        average_score, recorded_date, source, document_proof, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      equifaxScore ?? null,
      experianScore ?? null,
      transunionScore ?? null,
      averageScore,
      now,
      "MANUAL",
      documentProof ?? null,
      now
    )
    .run();

  return {
    id,
    tenantId,
    clientId,
    equifaxScore,
    experianScore,
    transunionScore,
    averageScore,
    recordedDate: now,
    source: "MANUAL",
    documentProof,
    createdAt: now,
  };
}

export async function recordPayment(
  tenantId: string,
  clientId: string,
  paymentType: "SUBSCRIPTION" | "PER_DISPUTE" | "BULK_DISPUTES" | "UPGRADE",
  amount: number,
  currency: string = "USD",
  paymentMethod: string,
  transactionId: string,
  unlockedFeatures?: string[],
  recipientEmail?: string,
  invoiceUrl?: string
): Promise<PaymentRecord> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO payment_records (
        id, tenant_id, client_id, payment_type, amount, currency, payment_method,
        transaction_id, status, unlocked_features, recipient_email, invoice_url,
        paid_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      paymentType,
      amount,
      currency,
      paymentMethod,
      transactionId,
      "COMPLETED",
      JSON.stringify(unlockedFeatures || []),
      recipientEmail ?? null,
      invoiceUrl ?? null,
      now,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    clientId,
    paymentType,
    amount,
    currency,
    paymentMethod,
    transactionId,
    status: "COMPLETED",
    unlockedFeatures,
    recipientEmail,
    invoiceUrl,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function upgradeClientAccessLevel(
  tenantId: string,
  clientId: string,
  newAccessLevel: AccessLevel
): Promise<CreditRepairClient> {
  const db = coreDb();
  const now = new Date().toISOString();

  const disputesRemaining =
    newAccessLevel === "FREE"
      ? 1
      : newAccessLevel === "PREMIUM"
        ? 5
        : newAccessLevel === "PROFESSIONAL"
          ? 20
          : 1000;

  const monthlyDisputeLimit =
    newAccessLevel === "FREE"
      ? 1
      : newAccessLevel === "PREMIUM"
        ? 5
        : newAccessLevel === "PROFESSIONAL"
          ? 20
          : 100;

  await db
    .prepare(
      `UPDATE credit_repair_clients
       SET access_level = ?, disputes_remaining = ?, monthly_dispute_limit = ?,
           subscription_status = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(
      newAccessLevel,
      disputesRemaining,
      monthlyDisputeLimit,
      "ACTIVE",
      now,
      tenantId,
      clientId
    )
    .run();

  const client = await getCreditRepairClient(tenantId, clientId);
  if (!client) throw new Error("Client not found");
  return client;
}

export async function completeOnboardingStep(
  tenantId: string,
  clientId: string,
  stepNumber: number,
  stepData?: string
): Promise<OnboardingStep> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO onboarding_steps (
        id, tenant_id, client_id, step_number, step_type, status, data, completed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      stepNumber,
      "STEP_" + stepNumber,
      "COMPLETED",
      stepData ?? null,
      now,
      now,
      now
    )
    .run();

  // Check if all steps completed
  const allSteps = await db
    .prepare(
      `SELECT COUNT(*) as total FROM onboarding_steps
       WHERE tenant_id = ? AND client_id = ? AND status = 'COMPLETED'`
    )
    .bind(tenantId, clientId)
    .first<{ total: number }>();

  if (allSteps && allSteps.total >= 5) {
    // Mark client onboarding as complete
    await db
      .prepare(
        `UPDATE credit_repair_clients
         SET onboarding_status = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`
      )
      .bind("COMPLETED", now, tenantId, clientId)
      .run();
  }

  return {
    id,
    tenantId,
    clientId,
    stepNumber,
    stepType: "STEP_" + stepNumber,
    status: "COMPLETED",
    data: stepData,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getCreditRepairAnalytics(
  tenantId: string,
  clientId?: string
): Promise<CreditRepairAnalytics[]> {
  const db = coreDb();

  let query = `
    SELECT
      cr.id as clientId,
      cr.tenant_id as tenantId,
      COUNT(CASE WHEN d.status != 'DRAFT' THEN 1 END) as totalDisputesFiled,
      COUNT(CASE WHEN d.status = 'RESOLVED' THEN 1 END) as disputesResolved
    FROM credit_repair_clients cr
    LEFT JOIN disputes d ON cr.id = d.client_id AND cr.tenant_id = d.tenant_id
    WHERE cr.tenant_id = ?
  `;

  const params: any[] = [tenantId];

  if (clientId) {
    query += ` AND cr.id = ?`;
    params.push(clientId);
  }

  query += ` GROUP BY cr.id, cr.tenant_id`;

  const results = await db.prepare(query).bind(...params).all<any>();

  return (results.results || []).map((row) => {
    const totalFiled = row.totalDisputesFiled || 0;
    const resolved = row.disputesResolved || 0;
    const resolutionRate = totalFiled > 0 ? (resolved / totalFiled) * 100 : 0;

    return {
      clientId: row.clientId,
      tenantId: row.tenantId,
      totalDisputesFiled: totalFiled,
      disputesResolved: resolved,
      resolutionRate,
      averageDaysToResolve: 30, // placeholder
      creditScoreImprovement: 0, // would calculate from score records
      averageScoreGain: 0,
      disputesByReason: {} as Record<DisputeReason, number>,
      disputesByStatus: {} as Record<DisputeStatus, number>,
      successfulOutcomes: resolved,
      revenue: 0,
    };
  });
}

export async function getClientDisputes(
  tenantId: string,
  clientId: string
): Promise<Dispute[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM disputes
       WHERE tenant_id = ? AND client_id = ?
       ORDER BY created_at DESC`
    )
    .bind(tenantId, clientId)
    .all<Dispute>();

  return result.results || [];
}

export async function getClientCreditScores(
  tenantId: string,
  clientId: string
): Promise<CreditScoreRecord[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM credit_score_records
       WHERE tenant_id = ? AND client_id = ?
       ORDER BY recorded_date DESC`
    )
    .bind(tenantId, clientId)
    .all<CreditScoreRecord>();

  return result.results || [];
}

export async function createDisputeTemplate(
  tenantId: string,
  name: string,
  reason: DisputeReason,
  templateContent: string,
  creditBureau: CreditBureau = "ALL",
  isDefault: boolean = false
): Promise<DisputeTemplate> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO dispute_templates (
        id, tenant_id, name, reason, template_content, credit_bureau,
        is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      reason,
      templateContent,
      creditBureau,
      isDefault ? 1 : 0,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    name,
    reason,
    templateContent,
    creditBureau,
    isDefault,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getDisputeTemplates(
  tenantId: string,
  reason?: DisputeReason
): Promise<DisputeTemplate[]> {
  const db = coreDb();

  let query = `SELECT * FROM dispute_templates WHERE tenant_id = ?`;
  const params: any[] = [tenantId];

  if (reason) {
    query += ` AND reason = ?`;
    params.push(reason);
  }

  query += ` ORDER BY is_default DESC, created_at DESC`;

  const result = await db.prepare(query).bind(...params).all<DisputeTemplate>();
  return result.results || [];
}
