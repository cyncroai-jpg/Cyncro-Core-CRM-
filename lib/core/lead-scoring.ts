/**
 * Lead Scoring & AI-powered Insights (Phase 46)
 *
 * Intelligent lead qualification and predictive analytics:
 * - Automated lead scoring based on engagement and firmographics
 * - Predictive lead conversion probability
 * - Lead quality assessment
 * - Engagement tracking and scoring
 * - Contact behavior analysis
 * - Churn risk prediction
 * - Next best action recommendations
 * - AI-powered lead insights
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type ScoringModel = "ENGAGEMENT" | "FIRMOGRAPHIC" | "BEHAVIORAL" | "PREDICTIVE";

export type LeadGrade = "A" | "B" | "C" | "D" | "F";

export interface LeadScore {
  id: string;
  tenantId: string;
  contactId: string;
  score: number; // 0-100
  grade: LeadGrade;
  conversionProbability: number; // 0-1 (0-100%)
  engagementScore: number;
  firmographicScore: number;
  behavioralScore: number;
  riskScore: number; // Churn risk 0-100
  factors?: Record<string, unknown>;
  lastRecalculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngagementMetric {
  contactId: string;
  tenantId: string;
  emailOpens: number;
  emailClicks: number;
  websiteVisits: number;
  pageViews: number;
  formSubmissions: number;
  callsReceived: number;
  meetingsScheduled: number;
  documentDownloads: number;
  timeSinceLastEngagement: number; // days
  engagementTrend: "INCREASING" | "STABLE" | "DECREASING";
  lastRecalculatedAt: string;
}

export interface FirmographicData {
  contactId: string;
  tenantId: string;
  companyName?: string;
  companySize?: "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+";
  industry?: string;
  annualRevenue?: number;
  yearFounded?: number;
  location?: string;
  website?: string;
  linkedinProfile?: string;
  jobTitle?: string;
  jobLevel?: "Executive" | "Manager" | "Individual Contributor" | "Other";
  department?: string;
  technologies?: string[];
  budget?: number;
}

export interface LeadInsight {
  id: string;
  tenantId: string;
  contactId: string;
  insightType: "OPPORTUNITY" | "RISK" | "RECOMMENDATION" | "TREND";
  title: string;
  description: string;
  confidence: number; // 0-1
  actionable: boolean;
  suggestedAction?: string;
  expectedImpact?: string;
  createdAt: string;
}

export interface ConversionPrediction {
  contactId: string;
  tenantId: string;
  probability: number; // 0-1
  timeToClose: number; // days estimate
  likelyCloseDateRange: {
    start: string;
    end: string;
  };
  keyFactors: string[];
  confidence: number; // 0-1
  lastUpdatedAt: string;
}

export interface AIRecommendation {
  id: string;
  tenantId: string;
  contactId: string;
  recommendationType:
    | "FOLLOW_UP"
    | "MEETING_PREP"
    | "PROPOSAL_SEND"
    | "PRICE_ADJUST"
    | "ADD_CHAMPION"
    | "ESCALATE";
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  estimatedValue?: number;
  expiresAt: string;
  createdAt: string;
}

/**
 * Calculate lead score for a contact
 */
export async function calculateLeadScore(
  tenantId: string,
  contactId: string
): Promise<LeadScore> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get engagement metrics
  const engagement = await getEngagementMetrics(tenantId, contactId);
  const firmographic = await getFirmographicData(tenantId, contactId);

  // Calculate component scores (0-100)
  const engagementScore = calculateEngagementScore(engagement);
  const firmographicScore = calculateFirmographicScore(firmographic);
  const behavioralScore = calculateBehavioralScore(engagement);

  // Combined score (weighted average)
  const score = Math.round(
    engagementScore * 0.4 + firmographicScore * 0.35 + behavioralScore * 0.25
  );

  // Convert to grade
  const grade = scoreToGrade(score);

  // Calculate conversion probability
  const conversionProbability = score / 100;

  // Calculate churn risk (inverse of engagement trend)
  const riskScore = calculateChurnRisk(engagement);

  const leadScore: LeadScore = {
    id,
    tenantId,
    contactId,
    score,
    grade,
    conversionProbability,
    engagementScore,
    firmographicScore,
    behavioralScore,
    riskScore,
    factors: {
      emailEngagement: engagement?.emailOpens || 0,
      websiteActivity: engagement?.pageViews || 0,
      recentActivity: engagement?.timeSinceLastEngagement || 0,
      company: firmographic?.companyName || "Unknown",
      jobLevel: firmographic?.jobLevel || "Unknown",
    },
    lastRecalculatedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Save to database
  await db
    .prepare(
      `INSERT OR REPLACE INTO lead_scores
       (id, tenant_id, contact_id, score, grade, conversion_probability, engagement_score, firmographic_score, behavioral_score, risk_score, factors, last_recalculated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      contactId,
      score,
      grade,
      conversionProbability,
      engagementScore,
      firmographicScore,
      behavioralScore,
      riskScore,
      JSON.stringify(leadScore.factors),
      now,
      now,
      now
    )
    .run();

  return leadScore;
}

/**
 * Get lead score for a contact
 */
export async function getLeadScore(tenantId: string, contactId: string): Promise<LeadScore | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM lead_scores WHERE tenant_id = ? AND contact_id = ?`)
    .bind(tenantId, contactId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    contactId: String(row.contact_id),
    score: Number(row.score),
    grade: String(row.grade) as LeadGrade,
    conversionProbability: Number(row.conversion_probability),
    engagementScore: Number(row.engagement_score),
    firmographicScore: Number(row.firmographic_score),
    behavioralScore: Number(row.behavioral_score),
    riskScore: Number(row.risk_score),
    factors: row.factors ? JSON.parse(String(row.factors)) : undefined,
    lastRecalculatedAt: String(row.last_recalculated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Get engagement metrics for contact
 */
export async function getEngagementMetrics(
  tenantId: string,
  contactId: string
): Promise<EngagementMetric | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM engagement_metrics WHERE tenant_id = ? AND contact_id = ?`)
    .bind(tenantId, contactId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    contactId: String(row.contact_id),
    tenantId: String(row.tenant_id),
    emailOpens: Number(row.email_opens || 0),
    emailClicks: Number(row.email_clicks || 0),
    websiteVisits: Number(row.website_visits || 0),
    pageViews: Number(row.page_views || 0),
    formSubmissions: Number(row.form_submissions || 0),
    callsReceived: Number(row.calls_received || 0),
    meetingsScheduled: Number(row.meetings_scheduled || 0),
    documentDownloads: Number(row.document_downloads || 0),
    timeSinceLastEngagement: Number(row.time_since_last_engagement || 999),
    engagementTrend: String(row.engagement_trend || "STABLE") as "INCREASING" | "STABLE" | "DECREASING",
    lastRecalculatedAt: String(row.last_recalculated_at),
  };
}

/**
 * Get firmographic data for contact
 */
export async function getFirmographicData(
  tenantId: string,
  contactId: string
): Promise<FirmographicData | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM firmographic_data WHERE tenant_id = ? AND contact_id = ?`)
    .bind(tenantId, contactId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    contactId: String(row.contact_id),
    tenantId: String(row.tenant_id),
    companyName: row.company_name ? String(row.company_name) : undefined,
    companySize: row.company_size ? (String(row.company_size) as any) : undefined,
    industry: row.industry ? String(row.industry) : undefined,
    annualRevenue: row.annual_revenue ? Number(row.annual_revenue) : undefined,
    yearFounded: row.year_founded ? Number(row.year_founded) : undefined,
    location: row.location ? String(row.location) : undefined,
    website: row.website ? String(row.website) : undefined,
    linkedinProfile: row.linkedin_profile ? String(row.linkedin_profile) : undefined,
    jobTitle: row.job_title ? String(row.job_title) : undefined,
    jobLevel: row.job_level ? (String(row.job_level) as any) : undefined,
    department: row.department ? String(row.department) : undefined,
    technologies: row.technologies ? JSON.parse(String(row.technologies)) : undefined,
    budget: row.budget ? Number(row.budget) : undefined,
  };
}

/**
 * Create AI-powered recommendation
 */
export async function createRecommendation(
  tenantId: string,
  contactId: string,
  type: AIRecommendation["recommendationType"],
  title: string,
  description: string,
  priority: "HIGH" | "MEDIUM" | "LOW",
  expiresInDays: number = 7,
  estimatedValue?: number
): Promise<AIRecommendation> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const recommendation: AIRecommendation = {
    id,
    tenantId,
    contactId,
    recommendationType: type,
    title,
    description,
    priority,
    estimatedValue,
    expiresAt,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO ai_recommendations
       (id, tenant_id, contact_id, recommendation_type, title, description, priority, estimated_value, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      contactId,
      type,
      title,
      description,
      priority,
      estimatedValue || null,
      expiresAt,
      now
    )
    .run();

  return recommendation;
}

/**
 * Get active recommendations for contact
 */
export async function getRecommendations(
  tenantId: string,
  contactId: string
): Promise<AIRecommendation[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM ai_recommendations
       WHERE tenant_id = ? AND contact_id = ?
       AND datetime(expires_at) > datetime('now')
       ORDER BY priority DESC, created_at DESC`
    )
    .bind(tenantId, contactId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    contactId: String(row.contact_id),
    recommendationType: String(row.recommendation_type) as AIRecommendation["recommendationType"],
    title: String(row.title),
    description: String(row.description),
    priority: String(row.priority) as "HIGH" | "MEDIUM" | "LOW",
    estimatedValue: row.estimated_value ? Number(row.estimated_value) : undefined,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }));
}

/**
 * Calculate lead insights
 */
export async function generateLeadInsights(
  tenantId: string,
  contactId: string
): Promise<LeadInsight[]> {
  const insights: LeadInsight[] = [];
  const score = await getLeadScore(tenantId, contactId);
  const engagement = await getEngagementMetrics(tenantId, contactId);

  if (!score || !engagement) return insights;

  const now = new Date().toISOString();

  // High engagement opportunity
  if (score.engagementScore > 70 && score.score < 60) {
    insights.push({
      id: crypto.randomUUID(),
      tenantId,
      contactId,
      insightType: "OPPORTUNITY",
      title: "High Engagement - Low Score",
      description: "Contact shows strong engagement but has low overall score. May indicate good fit with timing issues.",
      confidence: 0.85,
      actionable: true,
      suggestedAction: "Schedule a meeting to align on needs and timeline",
      expectedImpact: "Could increase lead score by 20+ points",
      createdAt: now,
    });
  }

  // Churn risk
  if (score.riskScore > 60) {
    insights.push({
      id: crypto.randomUUID(),
      tenantId,
      contactId,
      insightType: "RISK",
      title: "Churn Risk Detected",
      description: "Contact engagement is declining. May indicate lost interest.",
      confidence: 0.8,
      actionable: true,
      suggestedAction: "Reach out with new value proposition or case study",
      expectedImpact: "Could prevent deal loss",
      createdAt: now,
    });
  }

  // Rapid growth
  if (engagement.engagementTrend === "INCREASING" && score.score > 50) {
    insights.push({
      id: crypto.randomUUID(),
      tenantId,
      contactId,
      insightType: "OPPORTUNITY",
      title: "Rapidly Increasing Engagement",
      description: "Contact engagement is trending upward. Strong buying signal.",
      confidence: 0.9,
      actionable: true,
      suggestedAction: "Accelerate sales process and move to proposal",
      expectedImpact: "High probability of near-term close",
      createdAt: now,
    });
  }

  return insights;
}

// ============ HELPER FUNCTIONS ============

function calculateEngagementScore(engagement: EngagementMetric | null): number {
  if (!engagement) return 0;

  const weights = {
    emailOpens: 0.15,
    emailClicks: 0.15,
    websiteVisits: 0.2,
    pageViews: 0.15,
    formSubmissions: 0.2,
    callsReceived: 0.1,
    meetingsScheduled: 0.05,
  };

  let score = 0;
  score += Math.min(engagement.emailOpens / 2, 100) * weights.emailOpens;
  score += Math.min(engagement.emailClicks / 2, 100) * weights.emailClicks;
  score += Math.min(engagement.websiteVisits / 3, 100) * weights.websiteVisits;
  score += Math.min(engagement.pageViews / 5, 100) * weights.pageViews;
  score += Math.min(engagement.formSubmissions * 10, 100) * weights.formSubmissions;
  score += Math.min(engagement.callsReceived * 20, 100) * weights.callsReceived;
  score += Math.min(engagement.meetingsScheduled * 30, 100) * weights.meetingsScheduled;

  return Math.min(Math.round(score), 100);
}

function calculateFirmographicScore(firmographic: FirmographicData | null): number {
  if (!firmographic) return 40; // Default score if no firmographic data

  let score = 50;

  // Company size bonus
  const sizeScores: Record<string, number> = {
    "1-10": 20,
    "11-50": 40,
    "51-200": 60,
    "201-500": 80,
    "501-1000": 90,
    "1000+": 100,
  };
  if (firmographic.companySize) {
    score += (sizeScores[firmographic.companySize] - 50) * 0.3;
  }

  // Job level bonus
  if (firmographic.jobLevel === "Executive") score += 15;
  else if (firmographic.jobLevel === "Manager") score += 10;

  // Budget indicator
  if (firmographic.budget && firmographic.budget > 50000) score += 20;

  return Math.min(Math.round(score), 100);
}

function calculateBehavioralScore(engagement: EngagementMetric | null): number {
  if (!engagement) return 30;

  let score = 50;

  // Recency bonus
  if (engagement.timeSinceLastEngagement < 7) score += 30;
  else if (engagement.timeSinceLastEngagement < 14) score += 20;
  else if (engagement.timeSinceLastEngagement < 30) score += 10;
  else if (engagement.timeSinceLastEngagement > 60) score -= 30;

  // Trend bonus
  if (engagement.engagementTrend === "INCREASING") score += 20;
  else if (engagement.engagementTrend === "DECREASING") score -= 20;

  return Math.min(Math.max(score, 0), 100);
}

function calculateChurnRisk(engagement: EngagementMetric | null): number {
  if (!engagement) return 50;

  let risk = 50;

  // Recency factor
  if (engagement.timeSinceLastEngagement > 60) risk += 30;
  else if (engagement.timeSinceLastEngagement > 30) risk += 15;
  else if (engagement.timeSinceLastEngagement < 7) risk -= 20;

  // Trend factor
  if (engagement.engagementTrend === "DECREASING") risk += 20;
  else if (engagement.engagementTrend === "INCREASING") risk -= 30;

  return Math.min(Math.max(risk, 0), 100);
}

function scoreToGrade(score: number): LeadGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "F";
}
