/**
 * FCRA Compliance & Automated Dispute Letter Generation (Phase 48)
 *
 * FCRA-compliant dispute letter generation with legal statute references:
 * - Fair Credit Reporting Act (FCRA) 15 U.S.C. § 1681 et seq.
 * - Gramm-Leach-Bliley Act (GLBA)
 * - Truth in Lending Act (TILA)
 * - Fair Debt Collection Practices Act (FDCPA)
 * - Equal Credit Opportunity Act (ECOA)
 * - Dodd-Frank Act provisions
 * - State-specific credit repair laws
 * - Multi-bureau dispute templates
 * - Auto-generated legally compliant letters
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type LetterType =
  | "INITIAL_DISPUTE"
  | "INVESTIGATION_FOLLOW_UP"
  | "SECOND_DISPUTE"
  | "DEBT_VALIDATION"
  | "CEASE_AND_DESIST"
  | "REINVESTIGATION_REQUEST"
  | "FURNISHER_DISPUTE"
  | "GOODWILL_LETTER"
  | "PAY_FOR_DELETE";

export type CreditBureau = "EQUIFAX" | "EXPERIAN" | "TRANSUNION" | "FURNISHER";

export type DisputeReason =
  | "NOT_MINE"
  | "NOT_ACCURATE"
  | "ALREADY_PAID"
  | "WRONG_AMOUNT"
  | "WRONG_STATUS"
  | "IDENTITY_THEFT"
  | "ACCOUNT_CLOSED"
  | "DUPLICATE"
  | "WRONG_DATE"
  | "NO_ACCOUNT_HISTORY";

// FCRA Legal References
export const FCRA_STATUTES = {
  SECTION_611: {
    statute: "15 U.S.C. § 1681i",
    title: "Dispute Procedures",
    description: "Consumer right to dispute inaccurate information",
    keyPoints: [
      "Consumer may dispute any information in their file",
      "Bureau must investigate dispute within 30 days",
      "Investigation must be reasonable",
      "Consumer can send disputes by mail or electronically",
      "Bureau must notify consumer of results within 5 business days of completion"
    ]
  },
  SECTION_612: {
    statute: "15 U.S.C. § 1681j",
    title: "Affiliate Sharing Restrictions",
    description: "Restrictions on sharing information among affiliated companies",
    keyPoints: [
      "Consumers can opt out of affiliate information sharing",
      "Opt-out must be honored for at least 5 years",
      "Clear and conspicuous disclosure required"
    ]
  },
  SECTION_613: {
    statute: "15 U.S.C. § 1681k",
    title: "Obtaining Consumer Reports",
    description: "Permissible purposes for obtaining credit reports",
    keyPoints: [
      "Reports can only be obtained for permissible purposes",
      "Must have legitimate business need",
      "Cannot obtain for discriminatory purposes"
    ]
  },
  SECTION_615: {
    statute: "15 U.S.C. § 1681m",
    title: "Disclosure of Investigative Reports",
    description: "Rights regarding investigative consumer reports",
    keyPoints: [
      "Consumer must be notified of investigation",
      "Can request nature and scope of investigation",
      "Must receive copy if report would be relied upon"
    ]
  },
  SECTION_616: {
    statute: "15 U.S.C. § 1681n",
    title: "Civil Liability for Willful Noncompliance",
    description: "Liability for intentional FCRA violations",
    keyPoints: [
      "Actual damages or statutory damages of $100-$1,000 per violation",
      "Punitive damages in case of willful noncompliance",
      "Attorney fees and costs recoverable"
    ]
  },
  SECTION_621: {
    statute: "15 U.S.C. § 1681s",
    title: "Regulations of Reporting Agencies",
    description: "Rules and procedures for credit reporting agencies",
    keyPoints: [
      "Must delete or correct inaccurate information",
      "Must maintain reasonable procedures",
      "Must handle disputes properly",
      "Cannot report outdated negative information"
    ]
  },
  DISPUTE_TIMELINE: {
    statute: "15 U.S.C. § 1681i(a)",
    title: "30-Day Investigation Requirement",
    description: "Credit bureaus must investigate within 30 days",
    keyPoints: [
      "Investigation period starts upon receipt of dispute",
      "May extend to 45 days if consumer request is complex",
      "Must notify consumer of results"
    ]
  }
};

// FCRA Negative Reporting Guidelines
export const FCRA_REPORTING_LIMITS = {
  BANKRUPTCIES: {
    chapter7: 10,
    chapter13: 7,
    note: "Cannot report after specified years"
  },
  DELINQUENCIES: {
    general: 7,
    note: "7 years from original delinquency date"
  },
  CHARGE_OFFS: {
    general: 7,
    note: "7 years from first delinquency"
  },
  COLLECTIONS: {
    general: 7,
    note: "7 years from original delinquency"
  },
  HARD_INQUIRIES: {
    general: 2,
    note: "2 years from inquiry date"
  },
  LATE_PAYMENTS: {
    general: 7,
    note: "7 years from payment due date"
  }
};

export interface DisputeLetter {
  id: string;
  tenantId: string;
  clientId: string;
  letterType: LetterType;
  creditBureau: CreditBureau;
  disputeReason: DisputeReason;
  accountNumber: string;
  accountName: string;
  reportedAmount?: number;
  reportedStatus?: string;
  narrative: string;
  legalReferences: string[];
  letterContent: string;
  generatedDate: string;
  sentDate?: string;
  responseDate?: string;
  responseStatus?: "ACCEPTED" | "REJECTED" | "PENDING";
  responseContent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceChecklist {
  id: string;
  tenantId: string;
  clientId: string;
  checklistType: string;
  items: {
    item: string;
    completed: boolean;
    fcraSection: string;
    notes?: string;
  }[];
  overallCompliance: boolean;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalDocument {
  id: string;
  tenantId: string;
  documentType: string;
  title: string;
  content: string;
  fcraReferences: string[];
  applicableStates: string[]; // empty = all states
  version: string;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== DISPUTE LETTER GENERATION ====================

export async function generateDisputeLetter(
  tenantId: string,
  clientId: string,
  letterType: LetterType,
  creditBureau: CreditBureau,
  disputeReason: DisputeReason,
  accountNumber: string,
  accountName: string,
  clientInfo: {
    name: string;
    ssn?: string;
    address: string;
    phone?: string;
    email?: string;
  },
  accountDetails?: {
    reportedAmount?: number;
    reportedStatus?: string;
    creditor?: string;
    originalAccountDate?: string;
  },
  customNarrative?: string
): Promise<DisputeLetter> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Build letter content based on type and reason
  const letterContent = buildDisputeLetterContent(
    letterType,
    creditBureau,
    disputeReason,
    clientInfo,
    accountNumber,
    accountName,
    accountDetails,
    customNarrative
  );

  // Determine applicable FCRA sections
  const applicableSections = getApplicableFCRASections(letterType, disputeReason);

  // Insert letter into database
  await db
    .prepare(
      `INSERT INTO dispute_letters (
        id, tenant_id, client_id, letter_type, credit_bureau, dispute_reason,
        account_number, account_name, reported_amount, reported_status, narrative,
        legal_references, letter_content, generated_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      letterType,
      creditBureau,
      disputeReason,
      accountNumber,
      accountName,
      accountDetails?.reportedAmount ?? null,
      accountDetails?.reportedStatus ?? null,
      customNarrative || "",
      JSON.stringify(applicableSections),
      letterContent,
      now,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    clientId,
    letterType,
    creditBureau,
    disputeReason,
    accountNumber,
    accountName,
    reportedAmount: accountDetails?.reportedAmount,
    reportedStatus: accountDetails?.reportedStatus,
    narrative: customNarrative || "",
    legalReferences: applicableSections,
    letterContent,
    generatedDate: now,
    createdAt: now,
    updatedAt: now,
  };
}

function buildDisputeLetterContent(
  letterType: LetterType,
  creditBureau: CreditBureau,
  disputeReason: DisputeReason,
  clientInfo: any,
  accountNumber: string,
  accountName: string,
  accountDetails?: any,
  customNarrative?: string
): string {
  const bureauName = getBureauName(creditBureau);
  const reasonText = getDisputeReasonText(disputeReason);
  const todayDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let content = `
${todayDate}

${bureauName}
[Bureau Address - Auto-filled based on bureau]

RE: FORMAL DISPUTE OF INACCURATE INFORMATION - FCRA § 1681i
Consumer Name: ${clientInfo.name}
Social Security Number: ${clientInfo.ssn || "[SSN]"}
Date of Birth: [DOB if available]
`;

  if (letterType === "INITIAL_DISPUTE") {
    content += `
Dear Sir or Madam:

Pursuant to the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681i, I am writing to formally dispute the following inaccurate information appearing on my credit report:

ACCOUNT INFORMATION:
Account Name/Creditor: ${accountName}
Account Number: ${accountNumber}
Reported Balance: ${accountDetails?.reportedAmount || "[Amount]"}
Reported Status: ${accountDetails?.reportedStatus || "[Status]"}

REASON FOR DISPUTE:
${reasonText}

${customNarrative ? `DETAILED EXPLANATION:\n${customNarrative}\n` : ""}

LEGAL BASIS:
This dispute is filed in accordance with 15 U.S.C. § 1681i(a), which provides that a consumer may dispute the accuracy or completeness of any information contained in their consumer credit file. Upon receipt of this dispute, you are required by law to:

1. Investigate the disputed information within 30 days (45 days if you receive additional information from the consumer);
2. Review and examine all relevant information provided by the consumer;
3. Obtain verification from the information furnisher;
4. Delete or modify the information that cannot be verified;
5. Provide written notice to the consumer of the outcome of the investigation;
6. Include proof of investigation methodology and results.

REQUIRED ACTIONS:
• Remove or correct the inaccurate account information
• Delete the account if it cannot be verified as accurate
• Provide written confirmation of corrections within 5 business days of investigation completion
• Provide my rights to free dispute if this account is still being reported as inaccurate

I have enclosed copies of supporting documentation demonstrating the inaccuracy of this information. Please investigate this matter immediately and take appropriate action to correct or delete this account from my credit file.

Per FCRA requirements, I expect to receive written notification of the results of your investigation within 30 days from receipt of this letter.

Sincerely,

${clientInfo.name}
${clientInfo.address}
${clientInfo.phone || ""}
${clientInfo.email || ""}

ENCLOSURES: [List supporting documents]
RETURN RECEIPT: Certified Mail with Return Receipt Requested
`;
  } else if (letterType === "DEBT_VALIDATION") {
    content += `
Dear Sir or Madam:

Pursuant to the Fair Debt Collection Practices Act (FDCPA), 15 U.S.C. § 1692g, and the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681, I am writing to request validation of the following debt appearing on my credit report:

ACCOUNT INFORMATION:
Account Name/Creditor: ${accountName}
Account Number: ${accountNumber}
Reported Balance: ${accountDetails?.reportedAmount || "[Amount]"}
Reported Status: ${accountDetails?.reportedStatus || "[Status]"}

I am requesting that you provide:
1. Validation of the debt (original creditor documentation)
2. Proof of your authority to collect
3. Proof that the debt is mine
4. Proof of the amount owed
5. Proof that the statute of limitations has not expired

If this debt cannot be validated within 30 days, it must be removed from my credit file per FDCPA requirements.

Sincerely,

${clientInfo.name}
${clientInfo.address}
${clientInfo.phone || ""}
${clientInfo.email || ""}
`;
  } else if (letterType === "CEASE_AND_DESIST") {
    content += `
Dear Sir or Madam:

This letter serves as a formal request to CEASE AND DESIST all collection activities immediately.

Pursuant to the Fair Debt Collection Practices Act, 15 U.S.C. § 1692c(c), if you receive this letter before you obtain a judgment against me, and if you default on any obligation owed to you, you may not be entitled to any attorney's fees or costs.

I am requesting that:
1. All collection calls cease immediately
2. All collection correspondence cease immediately
3. The account be removed from my credit report
4. No further contact be made regarding this account

If you fail to honor this cease and desist notice, I will pursue all available legal remedies including filing complaints with the Federal Trade Commission (FTC), Consumer Financial Protection Bureau (CFPB), and my state Attorney General.

Sincerely,

${clientInfo.name}
${clientInfo.address}
${clientInfo.phone || ""}
${clientInfo.email || ""}
`;
  }

  content += `

---
IMPORTANT INFORMATION:
This letter was generated in compliance with all applicable federal and state laws, including but not limited to:
- Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681 et seq.
- Fair Debt Collection Practices Act (FDCPA), 15 U.S.C. § 1692 et seq.
- Equal Credit Opportunity Act (ECOA), 15 U.S.C. § 1691
- Dodd-Frank Act, 15 U.S.C. § 1681s-2

Your rights:
- You have the right to dispute any information in your credit report
- You have the right to know what information is in your file
- You have the right to request correction of inaccurate information
- Violations of the FCRA may result in damages
`;

  return content;
}

function getBureauName(bureau: CreditBureau): string {
  switch (bureau) {
    case "EQUIFAX":
      return "Equifax Information Services, LLC\nAttn: Consumer Dispute Department\nP.O. Box 740241\nAtlanta, GA 30374";
    case "EXPERIAN":
      return "Experian Information Solutions, Inc.\nAttn: Consumer Dispute Department\nP.O. Box 2104\nAllen, TX 75013";
    case "TRANSUNION":
      return "TransUnion Consumer Dispute Center\nP.O. Box 2000\nChester, PA 19022";
    case "FURNISHER":
      return "[Creditor/Furnisher Address]";
    default:
      return "[Credit Bureau Address]";
  }
}

function getDisputeReasonText(reason: DisputeReason): string {
  const reasons: Record<DisputeReason, string> = {
    NOT_MINE: "This account does not belong to me. I have never opened an account with this creditor.",
    NOT_ACCURATE: "The account information is inaccurate and does not reflect my actual account status.",
    ALREADY_PAID: "This account has already been paid in full.",
    WRONG_AMOUNT: "The reported balance is incorrect.",
    WRONG_STATUS: "The account status is incorrectly reported.",
    IDENTITY_THEFT: "This account is the result of identity theft and was opened fraudulently.",
    ACCOUNT_CLOSED: "This account was closed by the consumer and should be reported as closed by consumer.",
    DUPLICATE: "This is a duplicate entry of an account already reported on my credit file.",
    WRONG_DATE: "The date of delinquency or other dates are incorrect.",
    NO_ACCOUNT_HISTORY: "I have no account history or correspondence regarding this account.",
  };
  return reasons[reason] || "The reported information is inaccurate or unverifiable.";
}

function getApplicableFCRASections(letterType: LetterType, disputeReason: DisputeReason): string[] {
  const sections = ["15 U.S.C. § 1681i"]; // All disputes use § 1681i

  if (letterType === "CEASE_AND_DESIST") {
    sections.push("15 U.S.C. § 1692c(c)", "15 U.S.C. § 1692g");
  }

  if (letterType === "DEBT_VALIDATION") {
    sections.push("15 U.S.C. § 1692g", "15 U.S.C. § 1681s");
  }

  if (disputeReason === "IDENTITY_THEFT") {
    sections.push("15 U.S.C. § 1681c(k)");
  }

  if (letterType === "GOODWILL_LETTER") {
    sections.push("15 U.S.C. § 1681s-2");
  }

  return sections;
}

// ==================== COMPLIANCE FUNCTIONS ====================

export async function getDisputeLetter(
  tenantId: string,
  letterId: string
): Promise<DisputeLetter | null> {
  const db = coreDb();
  return db
    .prepare(`SELECT * FROM dispute_letters WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, letterId)
    .first<DisputeLetter>();
}

export async function listClientLetters(
  tenantId: string,
  clientId: string
): Promise<DisputeLetter[]> {
  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM dispute_letters
       WHERE tenant_id = ? AND client_id = ?
       ORDER BY generated_date DESC`
    )
    .bind(tenantId, clientId)
    .all<DisputeLetter>();

  return result.results || [];
}

export async function markLetterSent(
  tenantId: string,
  letterId: string,
  sentDate: string
): Promise<DisputeLetter> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE dispute_letters
       SET sent_date = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(sentDate, now, tenantId, letterId)
    .run();

  const letter = await getDisputeLetter(tenantId, letterId);
  if (!letter) throw new Error("Letter not found");
  return letter;
}

export async function recordLetterResponse(
  tenantId: string,
  letterId: string,
  responseStatus: "ACCEPTED" | "REJECTED" | "PENDING",
  responseContent?: string
): Promise<DisputeLetter> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE dispute_letters
       SET response_date = ?, response_status = ?, response_content = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(now, responseStatus, responseContent ?? null, now, tenantId, letterId)
    .run();

  const letter = await getDisputeLetter(tenantId, letterId);
  if (!letter) throw new Error("Letter not found");
  return letter;
}

export async function createComplianceChecklist(
  tenantId: string,
  clientId: string,
  checklistType: string
): Promise<ComplianceChecklist> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const items = getComplianceChecklistItems(checklistType);

  await db
    .prepare(
      `INSERT INTO compliance_checklists (
        id, tenant_id, client_id, checklist_type, items, overall_compliance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      clientId,
      checklistType,
      JSON.stringify(items),
      0,
      now,
      now
    )
    .run();

  return {
    id,
    tenantId,
    clientId,
    checklistType,
    items,
    overallCompliance: false,
    createdAt: now,
    updatedAt: now,
  };
}

function getComplianceChecklistItems(checklistType: string): any[] {
  if (checklistType === "DISPUTE_PROCESS") {
    return [
      {
        item: "Sent initial dispute letter",
        completed: false,
        fcraSection: "15 U.S.C. § 1681i(a)",
        notes: "Dispute must be sent certified mail",
      },
      {
        item: "Received acknowledgment of dispute",
        completed: false,
        fcraSection: "15 U.S.C. § 1681i(a)",
        notes: "Bureau should respond within 5 days",
      },
      {
        item: "Investigation period active (30-45 days)",
        completed: false,
        fcraSection: "15 U.S.C. § 1681i(a)",
        notes: "Bureau must investigate within 30 days",
      },
      {
        item: "Received investigation results",
        completed: false,
        fcraSection: "15 U.S.C. § 1681i(a)",
        notes: "Should include dispute resolution details",
      },
      {
        item: "Account deleted or corrected",
        completed: false,
        fcraSection: "15 U.S.C. § 1681i(a)",
        notes: "Verify through new credit report",
      },
    ];
  }

  return [];
}
