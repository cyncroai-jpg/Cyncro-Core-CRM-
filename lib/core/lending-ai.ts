/**
 * AI-Assisted Underwriting
 *
 * Deterministic math (DTI, base risk score) is computed here, not by the
 * model — the model is used only for the judgment call a human underwriter
 * would otherwise make: reading the application holistically, flagging
 * inconsistencies, and recommending a decision and APR within the product's
 * own guardrails. It never finalizes a decision on its own; the result is a
 * recommendation an underwriter reviews and approves or overrides.
 */
import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";
import { getLoanApplication, getLoanProduct } from "@/lib/core/lending-platform";

export type AIUnderwritingResult = {
  recommendedDecision: "APPROVE" | "DECLINE" | "MANUAL_REVIEW";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  debtToIncomeRatio: number;
  ruleBasedRiskScore: number;
  recommendedAPR: number | null;
  recommendedMonthlyPayment: number | null;
  reasoning: string;
  redFlags: string[];
  confidence: "high" | "medium" | "low";
  generatedAt: string;
};

function getCreditScoreTier(score: number): "EXCELLENT" | "GOOD" | "FAIR" | "POOR" {
  if (score >= 750) return "EXCELLENT";
  if (score >= 670) return "GOOD";
  if (score >= 580) return "FAIR";
  return "POOR";
}

function ruleBasedRiskScore(creditScore: number, dti: number): number {
  let score = 50;
  if (creditScore >= 750) score -= 20;
  else if (creditScore >= 670) score -= 10;
  else if (creditScore >= 580) score += 5;
  else score += 15;
  if (dti <= 0.2) score -= 10;
  else if (dti <= 0.43) score -= 5;
  else if (dti <= 0.6) score += 10;
  else score += 20;
  return Math.max(0, Math.min(100, score));
}

function monthlyPayment(principalCents: number, annualRatePct: number, termMonths: number): number {
  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) return principalCents / termMonths;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return (principalCents * monthlyRate * factor) / (factor - 1);
}

export async function performAIUnderwriting(
  tenantId: string,
  applicationId: string,
): Promise<AIUnderwritingResult> {
  // getLoanApplication/getLoanProduct do `SELECT *` and assert a camelCase TS
  // type over a raw D1 row, which is actually snake_case at runtime (D1
  // doesn't rename columns) — the type assertion has zero runtime effect.
  // Read the real column names here instead of trusting those interfaces.
  const applicationRaw = await getLoanApplication(tenantId, applicationId) as unknown as Record<string, unknown> | null;
  if (!applicationRaw) throw new Error("Application not found");
  const productRaw = await getLoanProduct(tenantId, String(applicationRaw.product_id)) as unknown as Record<string, unknown> | null;
  if (!productRaw) throw new Error("Loan product not found");

  const application = {
    requestedAmount: Number(applicationRaw.requested_amount || 0),
    requestedTerm: Number(applicationRaw.requested_term || 0),
    purpose: String(applicationRaw.purpose || ""),
  };
  const product = {
    name: String(productRaw.name || ""),
    type: String(productRaw.type || ""),
    minAmount: Number(productRaw.min_amount || 0),
    maxAmount: Number(productRaw.max_amount || 0),
    minTerm: Number(productRaw.min_term || 0),
    maxTerm: Number(productRaw.max_term || 0),
    baseInterestRate: Number(productRaw.base_interest_rate || 0),
    minCreditScore: Number(productRaw.min_credit_score || 0),
    minIncome: Number(productRaw.min_income || 0),
    maxDti: Number(productRaw.max_dti || 1),
  };

  const annualIncomeCents = Number(applicationRaw.annual_income_cents || 0);
  const monthlyDebtCents = Number(applicationRaw.monthly_debt_payments_cents || 0);
  const creditScore = Number(applicationRaw.self_reported_credit_score || 0);
  const monthlyIncomeCents = annualIncomeCents / 12;
  const dti = monthlyIncomeCents > 0 ? monthlyDebtCents / monthlyIncomeCents : 1;
  const baseRisk = ruleBasedRiskScore(creditScore || 580, dti);

  const cfEnv = env as Record<string, string | undefined>;
  const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  const fallback: AIUnderwritingResult = {
    recommendedDecision: "MANUAL_REVIEW",
    riskLevel: baseRisk >= 65 ? "VERY_HIGH" : baseRisk >= 45 ? "HIGH" : baseRisk >= 25 ? "MEDIUM" : "LOW",
    debtToIncomeRatio: Math.round(dti * 1000) / 1000,
    ruleBasedRiskScore: baseRisk,
    recommendedAPR: null,
    recommendedMonthlyPayment: null,
    reasoning: "AI underwriting is not configured (no ANTHROPIC_API_KEY). Rule-based risk score computed from self-reported data only — a human underwriter must review this application manually.",
    redFlags: annualIncomeCents === 0 ? ["No income reported"] : [],
    confidence: "low",
    generatedAt: new Date().toISOString(),
  };
  if (!apiKey) return fallback;

  const prompt = `You are an underwriting analyst for a licensed consumer lender. Analyze this loan application and return ONLY a JSON object (no markdown, no explanation) with these exact keys:
- recommendedDecision: "APPROVE" | "DECLINE" | "MANUAL_REVIEW"
- recommendedAPR: number (percent, within the product's rate band unless declining; null if declining)
- reasoning: 2-4 sentences explaining the recommendation in plain English, referencing the actual numbers
- redFlags: array of specific concerns (empty array if none) — e.g. income/purpose mismatch, DTI above policy, thin credit history
- confidence: "high" | "medium" | "low"

Loan product policy:
- Product: ${product.name} (${product.type})
- Amount range: $${(product.minAmount / 100).toLocaleString()} - $${(product.maxAmount / 100).toLocaleString()}
- Term range: ${product.minTerm}-${product.maxTerm} months
- Base rate: ${product.baseInterestRate}%
- Minimum credit score policy: ${product.minCreditScore}
- Minimum income policy: $${(product.minIncome / 100).toLocaleString()}/year
- Maximum DTI policy: ${(product.maxDti * 100).toFixed(0)}%

Applicant:
- Requested amount: $${(application.requestedAmount / 100).toLocaleString()}
- Requested term: ${application.requestedTerm} months
- Stated purpose: ${application.purpose}
- Annual income: ${annualIncomeCents ? `$${(annualIncomeCents / 100).toLocaleString()}` : "not provided"}
- Monthly existing debt payments: ${monthlyDebtCents ? `$${(monthlyDebtCents / 100).toLocaleString()}` : "not provided"}
- Employment status: ${application.employmentStatus || "not provided"}
- Self-reported credit score: ${creditScore || "not provided"} (tier: ${creditScore ? getCreditScoreTier(creditScore) : "unknown"})
- Calculated debt-to-income ratio: ${(dti * 100).toFixed(1)}%
- Rule-based risk score (0-100, lower is better): ${baseRisk}

Decline if credit score, income, or DTI clearly fail the product's own policy thresholds above, or if key financial data is missing. Recommend MANUAL_REVIEW rather than APPROVE for any borderline or unusual case — you are assisting a human underwriter, not replacing their final sign-off.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      console.warn("lending.ai_underwriting.failed", response.status);
      return fallback;
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/^```json\s*|```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      recommendedDecision: "APPROVE" | "DECLINE" | "MANUAL_REVIEW";
      recommendedAPR: number | null;
      reasoning: string;
      redFlags: string[];
      confidence: "high" | "medium" | "low";
    };
    const recommendedAPR = parsed.recommendedDecision === "DECLINE" ? null : parsed.recommendedAPR;
    const recommendedMonthlyPayment = recommendedAPR != null
      ? Math.round(monthlyPayment(application.requestedAmount, recommendedAPR, application.requestedTerm))
      : null;
    return {
      recommendedDecision: parsed.recommendedDecision,
      riskLevel: baseRisk >= 65 ? "VERY_HIGH" : baseRisk >= 45 ? "HIGH" : baseRisk >= 25 ? "MEDIUM" : "LOW",
      debtToIncomeRatio: Math.round(dti * 1000) / 1000,
      ruleBasedRiskScore: baseRisk,
      recommendedAPR,
      recommendedMonthlyPayment,
      reasoning: parsed.reasoning,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      confidence: parsed.confidence || "medium",
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("lending.ai_underwriting.parse_failed", error);
    return fallback;
  }
}

export async function saveAIRecommendation(tenantId: string, applicationId: string, result: AIUnderwritingResult): Promise<void> {
  await coreDb()
    .prepare("UPDATE loan_applications SET ai_recommendation = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
    .bind(JSON.stringify(result), new Date().toISOString(), tenantId, applicationId)
    .run();
}
