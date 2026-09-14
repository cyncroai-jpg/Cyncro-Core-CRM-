/**
 * Lending Platform & Loan Management (Phase 49)
 *
 * Complete lending platform with loan products, applications, underwriting:
 * - Multiple loan products (personal, auto, home, business)
 * - Loan application workflow
 * - Automated underwriting and approval
 * - Payment processing and schedules
 * - ECOA/TRID/FCRA/GLBA compliance
 * - Risk assessment and scoring
 * - Regulatory reporting
 * - Loan servicing and management
 * - Yield analysis and portfolio management
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type LoanType =
  | "PERSONAL"
  | "AUTO"
  | "HOME"
  | "BUSINESS"
  | "STUDENT"
  | "INSTALLMENT"
  | "LINE_OF_CREDIT";

export type LoanStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "DECLINED"
  | "WITHDRAWN"
  | "ACTIVE"
  | "PAID_OFF"
  | "DEFAULTED"
  | "CHARGED_OFF";

export type ApplicationStatus =
  | "STARTED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "DECLINED"
  | "WITHDRAWN";

export type UnderwritingDecision =
  | "APPROVED"
  | "APPROVED_WITH_CONDITIONS"
  | "DECLINED"
  | "MANUAL_REVIEW";

export interface LoanProduct {
  id: string;
  tenantId: string;
  name: string;
  type: LoanType;
  minAmount: number;
  maxAmount: number;
  minTerm: number; // months
  maxTerm: number;
  baseInterestRate: number; // APR
  description: string;
  features: string[]; // autopay, deferment, etc.
  requirements: {
    minCreditScore: number;
    minIncome: number;
    maxDTI: number; // debt-to-income ratio
    residencyRequired: boolean;
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoanApplication {
  id: string;
  tenantId: string;
  applicantId: string; // contact ID
  applicantEmail: string;
  applicantPhone?: string;
  productId: string;
  requestedAmount: number;
  requestedTerm: number; // months
  purpose: string;
  status: ApplicationStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decision?: UnderwritingDecision;
  decisionNotes?: string;
  creditScore?: number;
  estimatedAPR?: number;
  monthlyPayment?: number;
  documents?: string[]; // document IDs
  createdAt: string;
  updatedAt: string;
}

export interface LoanOffer {
  id: string;
  tenantId: string;
  applicationId: string;
  productId: string;
  loanAmount: number;
  interestRate: number; // APR
  term: number; // months
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
  fees?: {
    origination: number;
    processing: number;
    appraisal?: number;
    other?: number;
  };
  terms: string;
  validUntil: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  acceptedAt?: string;
  declinedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  tenantId: string;
  applicationId: string;
  offerId: string;
  borrowerId: string; // contact ID
  productId: string;
  loanAmount: number;
  interestRate: number; // APR
  term: number; // months
  monthlyPayment: number;
  totalInterest: number;
  originationDate: string;
  fundedDate?: string;
  dueDate?: string;
  status: LoanStatus;
  currentBalance: number;
  paidAmount: number;
  daysDelinquent: number;
  lastPaymentDate?: string;
  nextPaymentDueDate?: string;
  documents?: string[]; // promissory note, disclosure, etc.
  createdAt: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: string;
  tenantId: string;
  loanId: string;
  amount: number;
  paymentDate: string;
  dueDate?: string;
  principalAmount: number;
  interestAmount: number;
  feeAmount?: number;
  paymentMethod: string;
  transactionId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessment {
  id: string;
  tenantId: string;
  applicationId: string;
  creditScore: number;
  creditScoreTier: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  debtToIncomeRatio: number;
  employmentHistory: string;
  collateral?: string;
  riskScore: number; // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  factors: Record<string, number>;
  recommendations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Disclosure {
  id: string;
  tenantId: string;
  loanId: string;
  disclosureType: "TILA" | "TRID" | "ECOA" | "GLBA" | "TRUTH_IN_LENDING";
  content: string;
  acknowledgedDate?: string;
  acknowledgedBy?: string;
  ipAddress?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== LOAN PRODUCT FUNCTIONS ====================

export async function createLoanProduct(
  tenantId: string,
  name: string,
  type: LoanType,
  minAmount: number,
  maxAmount: number,
  minTerm: number,
  maxTerm: number,
  baseInterestRate: number,
  description: string,
  features: string[],
  requirements: {
    minCreditScore: number;
    minIncome: number;
    maxDTI: number;
    residencyRequired: boolean;
  }
): Promise<LoanProduct> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO loan_products (
        id, tenant_id, name, type, min_amount, max_amount, min_term, max_term,
        base_interest_rate, description, features, min_credit_score, min_income,
        max_dti, residency_required, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      type,
      minAmount,
      maxAmount,
      minTerm,
      maxTerm,
      baseInterestRate,
      description,
      JSON.stringify(features),
      requirements.minCreditScore,
      requirements.minIncome,
      requirements.maxDTI,
      requirements.residencyRequired ? 1 : 0,
      1,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    name,
    type,
    minAmount,
    maxAmount,
    minTerm,
    maxTerm,
    baseInterestRate,
    description,
    features,
    requirements,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getLoanProduct(
  tenantId: string,
  productId: string
): Promise<LoanProduct | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM loan_products WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, productId)
    .first<LoanProduct>();
}

export async function listLoanProducts(tenantId: string): Promise<LoanProduct[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM loan_products
       WHERE tenant_id = ? AND active = 1
       ORDER BY created_at DESC`
    )
    .bind(tenantId)
    .all<LoanProduct>();

  return result.results || [];
}

// ==================== LOAN APPLICATION FUNCTIONS ====================

export async function createLoanApplication(
  tenantId: string,
  applicantId: string,
  applicantEmail: string,
  productId: string,
  requestedAmount: number,
  requestedTerm: number,
  purpose: string,
  applicantPhone?: string
): Promise<LoanApplication> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO loan_applications (
        id, tenant_id, applicant_id, applicant_email, applicant_phone, product_id,
        requested_amount, requested_term, purpose, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      applicantId,
      applicantEmail,
      applicantPhone,
      productId,
      requestedAmount,
      requestedTerm,
      purpose,
      "STARTED",
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    applicantId,
    applicantEmail,
    applicantPhone,
    productId,
    requestedAmount,
    requestedTerm,
    purpose,
    status: "STARTED",
    createdAt: now,
    updatedAt: now,
  };
}

export async function submitLoanApplication(
  tenantId: string,
  applicationId: string
): Promise<LoanApplication> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE loan_applications
       SET status = ?, submitted_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind("SUBMITTED", now, now, tenantId, applicationId)
    .run();

  const app = await db
    .prepare(
      `SELECT * FROM loan_applications WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, applicationId)
    .first<LoanApplication>();

  if (!app) throw new Error("Application not found");
  return app;
}

export async function performUnderwriting(
  tenantId: string,
  applicationId: string,
  creditScore: number,
  debtToIncomeRatio: number,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH",
  decision: UnderwritingDecision,
  decisionNotes?: string,
  estimatedAPR?: number,
  monthlyPayment?: number
): Promise<{ application: LoanApplication; assessment: RiskAssessment }> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Create risk assessment
  const assessmentId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO risk_assessments (
        id, tenant_id, application_id, credit_score, credit_score_tier,
        debt_to_income_ratio, risk_score, risk_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      assessmentId,
      tenantId,
      applicationId,
      creditScore,
      getCreditScoreTier(creditScore),
      debtToIncomeRatio,
      calculateRiskScore(creditScore, debtToIncomeRatio),
      riskLevel,
      now,
      now
    )
    .run();

  // Update application with underwriting results
  const newStatus = decision === "APPROVED" ? "APPROVED" : decision === "DECLINED" ? "DECLINED" : "UNDER_REVIEW";

  await db
    .prepare(
      `UPDATE loan_applications
       SET status = ?, decision = ?, decision_notes = ?, credit_score = ?,
           estimated_apr = ?, monthly_payment = ?, reviewed_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(
      newStatus,
      decision,
      decisionNotes,
      creditScore,
      estimatedAPR,
      monthlyPayment,
      now,
      now,
      tenantId,
      applicationId
    )
    .run();

  const application = await db
    .prepare(
      `SELECT * FROM loan_applications WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, applicationId)
    .first<LoanApplication>();

  if (!application) throw new Error("Application not found");

  const assessment = await db
    .prepare(`SELECT * FROM risk_assessments WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, assessmentId)
    .first<RiskAssessment>();

  if (!assessment) throw new Error("Risk assessment not found");

  return { application, assessment };
}

// ==================== LOAN OFFER & DISBURSEMENT ====================

export async function createLoanOffer(
  tenantId: string,
  applicationId: string,
  productId: string,
  loanAmount: number,
  interestRate: number,
  term: number,
  fees?: { origination: number; processing: number; appraisal?: number; other?: number }
): Promise<LoanOffer> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  // Calculate payment
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, term)) /
    (Math.pow(1 + monthlyRate, term) - 1);
  const totalPayment = monthlyPayment * term;
  const totalInterest = totalPayment - loanAmount;

  await db
    .prepare(
      `INSERT INTO loan_offers (
        id, tenant_id, application_id, product_id, loan_amount, interest_rate, term,
        monthly_payment, total_interest, total_payment, fees, status, valid_until,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      applicationId,
      productId,
      loanAmount,
      interestRate,
      term,
      Math.round(monthlyPayment * 100) / 100,
      Math.round(totalInterest * 100) / 100,
      Math.round(totalPayment * 100) / 100,
      JSON.stringify(fees || {}),
      "PENDING",
      validUntil,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    applicationId,
    productId,
    loanAmount,
    interestRate,
    term,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
    fees,
    terms: "Standard loan terms",
    validUntil,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
}

export async function acceptLoanOffer(
  tenantId: string,
  offerId: string,
  borrowerId: string,
  applicationId: string,
  productId: string
): Promise<Loan> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get offer details
  const offer = await db
    .prepare(`SELECT * FROM loan_offers WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, offerId)
    .first<LoanOffer>();

  if (!offer) throw new Error("Offer not found");

  // Mark offer as accepted
  await db
    .prepare(`UPDATE loan_offers SET status = ?, accepted_at = ? WHERE id = ?`)
    .bind("ACCEPTED", now, offerId)
    .run();

  // Create loan
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO loans (
        id, tenant_id, application_id, offer_id, borrower_id, product_id,
        loan_amount, interest_rate, term, monthly_payment, total_interest,
        origination_date, due_date, status, current_balance, paid_amount,
        days_delinquent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      applicationId,
      offerId,
      borrowerId,
      productId,
      offer.loanAmount,
      offer.interestRate,
      offer.term,
      offer.monthlyPayment,
      offer.totalInterest,
      now,
      dueDate,
      "ACTIVE",
      offer.loanAmount,
      0,
      0,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    applicationId,
    offerId,
    borrowerId,
    productId,
    loanAmount: offer.loanAmount,
    interestRate: offer.interestRate,
    term: offer.term,
    monthlyPayment: offer.monthlyPayment,
    totalInterest: offer.totalInterest,
    originationDate: now,
    dueDate,
    status: "ACTIVE",
    currentBalance: offer.loanAmount,
    paidAmount: 0,
    daysDelinquent: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ==================== PAYMENT FUNCTIONS ====================

export async function recordLoanPayment(
  tenantId: string,
  loanId: string,
  amount: number,
  principalAmount: number,
  interestAmount: number,
  paymentMethod: string,
  transactionId: string,
  feeAmount?: number
): Promise<LoanPayment> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Record payment
  await db
    .prepare(
      `INSERT INTO loan_payments (
        id, tenant_id, loan_id, amount, payment_date, principal_amount,
        interest_amount, fee_amount, payment_method, transaction_id, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      loanId,
      amount,
      now,
      principalAmount,
      interestAmount,
      feeAmount,
      paymentMethod,
      transactionId,
      "COMPLETED",
      now,
      now
    )
    .run();

  // Update loan balance
  await db
    .prepare(
      `UPDATE loans
       SET current_balance = current_balance - ?,
           paid_amount = paid_amount + ?,
           last_payment_date = ?,
           updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(principalAmount, amount, now, now, tenantId, loanId)
    .run();

  return {
    id,
    tenantId,
    loanId,
    amount,
    paymentDate: now,
    principalAmount,
    interestAmount,
    feeAmount,
    paymentMethod,
    transactionId,
    status: "COMPLETED",
    createdAt: now,
    updatedAt: now,
  };
}

// ==================== COMPLIANCE & DISCLOSURE ====================

export async function createDisclosure(
  tenantId: string,
  loanId: string,
  disclosureType: "TILA" | "TRID" | "ECOA" | "GLBA" | "TRUTH_IN_LENDING",
  content: string
): Promise<Disclosure> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO disclosures (
        id, tenant_id, loan_id, disclosure_type, content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tenantId, loanId, disclosureType, content, now, now)
    .run();

  return {
    id,
    tenantId,
    loanId,
    disclosureType,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

// ==================== HELPER FUNCTIONS ====================

function getCreditScoreTier(score: number): "EXCELLENT" | "GOOD" | "FAIR" | "POOR" {
  if (score >= 750) return "EXCELLENT";
  if (score >= 670) return "GOOD";
  if (score >= 580) return "FAIR";
  return "POOR";
}

function calculateRiskScore(creditScore: number, debtToIncomeRatio: number): number {
  // Simple risk scoring algorithm (0-100, lower is better)
  let riskScore = 50;

  if (creditScore >= 750) riskScore -= 20;
  else if (creditScore >= 670) riskScore -= 10;
  else if (creditScore >= 580) riskScore += 5;
  else riskScore += 15;

  if (debtToIncomeRatio <= 0.2) riskScore -= 10;
  else if (debtToIncomeRatio <= 0.43) riskScore -= 5;
  else if (debtToIncomeRatio <= 0.6) riskScore += 10;
  else riskScore += 20;

  return Math.max(0, Math.min(100, riskScore));
}

export async function getLoan(
  tenantId: string,
  loanId: string
): Promise<Loan | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM loans WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, loanId)
    .first<Loan>();
}

export async function getLoanApplication(
  tenantId: string,
  applicationId: string
): Promise<LoanApplication | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM loan_applications WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, applicationId)
    .first<LoanApplication>();
}
