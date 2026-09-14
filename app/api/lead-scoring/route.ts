/**
 * Lead Scoring & AI-powered Insights API
 *
 * GET /api/lead-scoring — list lead scores
 * GET /api/lead-scoring/:contactId — get lead score
 * POST /api/lead-scoring/:contactId/recalculate — recalculate lead score
 * GET /api/lead-scoring/:contactId/metrics — get engagement metrics
 * POST /api/lead-scoring/:contactId/metrics — update engagement metrics
 * GET /api/lead-scoring/:contactId/firmographics — get firmographic data
 * POST /api/lead-scoring/:contactId/firmographics — update firmographic data
 * GET /api/lead-scoring/:contactId/recommendations — get AI recommendations
 * GET /api/lead-scoring/:contactId/insights — get lead insights
 * POST /api/lead-scoring/:contactId/insights — create lead insight
 * GET /api/lead-scoring/:contactId/predictions — get conversion predictions
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
  coreDb,
} from "@/lib/core/db";
import {
  calculateLeadScore,
  getLeadScore,
  getEngagementMetrics,
  getFirmographicData,
  createRecommendation,
  getRecommendations,
  generateLeadInsights,
} from "@/lib/core/lead-scoring";
import { logAuditAction } from "@/lib/core/audit";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const contactId = pathParts[3];
    const section = pathParts[4];

    if (contactId === undefined) {
      // GET /api/lead-scoring - list all lead scores for tenant
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM lead_scores
           WHERE tenant_id = ?
           ORDER BY score DESC
           LIMIT 100`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ scores: result.results || [] });
    }

    if (section === "metrics") {
      // GET /api/lead-scoring/:contactId/metrics - get engagement metrics
      const metrics = await getEngagementMetrics(tenant.tenantId, contactId);
      if (!metrics) {
        return Response.json({ error: "Metrics not found" }, { status: 404 });
      }
      return Response.json({ metrics });
    }

    if (section === "firmographics") {
      // GET /api/lead-scoring/:contactId/firmographics - get firmographic data
      const firmographics = await getFirmographicData(tenant.tenantId, contactId);
      if (!firmographics) {
        return Response.json({ error: "Firmographic data not found" }, { status: 404 });
      }
      return Response.json({ firmographics });
    }

    if (section === "recommendations") {
      // GET /api/lead-scoring/:contactId/recommendations - get AI recommendations
      const recommendations = await getRecommendations(tenant.tenantId, contactId);
      return Response.json({ recommendations });
    }

    if (section === "insights") {
      // GET /api/lead-scoring/:contactId/insights - get lead insights
      const db = coreDb();
      const result = await db
        .prepare(
          `SELECT * FROM lead_insights
           WHERE tenant_id = ? AND contact_id = ?
           ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId, contactId)
        .all<any>();
      return Response.json({ insights: result.results || [] });
    }

    if (section === "predictions") {
      // GET /api/lead-scoring/:contactId/predictions - get conversion predictions
      const db = coreDb();
      const prediction = await db
        .prepare(
          `SELECT * FROM conversion_predictions
           WHERE tenant_id = ? AND contact_id = ?`
        )
        .bind(tenant.tenantId, contactId)
        .first<any>();
      if (!prediction) {
        return Response.json({ error: "Prediction not found" }, { status: 404 });
      }
      return Response.json({ prediction });
    }

    if (contactId && !section) {
      // GET /api/lead-scoring/:contactId - get lead score
      const score = await getLeadScore(tenant.tenantId, contactId);
      if (!score) {
        return Response.json({ error: "Lead score not found" }, { status: 404 });
      }
      return Response.json({ score });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("lead-scoring.get.failed", error);
    return Response.json(
      { error: "Unable to fetch lead scoring data" },
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
    const contactId = pathParts[3];
    const action = pathParts[4];
    const body = (await request.json()) as Record<string, unknown>;

    const db = coreDb();

    if (action === "recalculate") {
      // POST /api/lead-scoring/:contactId/recalculate - recalculate lead score
      const score = await calculateLeadScore(tenant.tenantId, contactId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "RECALCULATE",
        "lead_score",
        contactId,
        {
          resourceName: `Lead Score Recalculated`,
          status: "SUCCESS",
          score: score.score,
          grade: score.grade,
        }
      );

      return Response.json({ score });
    }

    if (action === "metrics") {
      // POST /api/lead-scoring/:contactId/metrics - update engagement metrics
      const emailOpens = Number(body.emailOpens || 0);
      const emailClicks = Number(body.emailClicks || 0);
      const websiteVisits = Number(body.websiteVisits || 0);
      const pageViews = Number(body.pageViews || 0);
      const formSubmissions = Number(body.formSubmissions || 0);
      const callsReceived = Number(body.callsReceived || 0);
      const meetingsScheduled = Number(body.meetingsScheduled || 0);
      const documentDownloads = Number(body.documentDownloads || 0);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Upsert engagement metrics
      try {
        // Try to insert
        await db
          .prepare(
            `INSERT INTO engagement_metrics (
              id, tenant_id, contact_id, email_opens, email_clicks, website_visits,
              page_views, form_submissions, calls_received, meetings_scheduled,
              document_downloads, last_activity_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            tenant.tenantId,
            contactId,
            emailOpens,
            emailClicks,
            websiteVisits,
            pageViews,
            formSubmissions,
            callsReceived,
            meetingsScheduled,
            documentDownloads,
            now,
            now,
            now
          )
          .run();
      } catch {
        // If insert fails, try update
        await db
          .prepare(
            `UPDATE engagement_metrics SET
              email_opens = email_opens + ?,
              email_clicks = email_clicks + ?,
              website_visits = website_visits + ?,
              page_views = page_views + ?,
              form_submissions = form_submissions + ?,
              calls_received = calls_received + ?,
              meetings_scheduled = meetings_scheduled + ?,
              document_downloads = document_downloads + ?,
              last_activity_date = ?,
              updated_at = ?
            WHERE tenant_id = ? AND contact_id = ?`
          )
          .bind(
            emailOpens,
            emailClicks,
            websiteVisits,
            pageViews,
            formSubmissions,
            callsReceived,
            meetingsScheduled,
            documentDownloads,
            now,
            now,
            tenant.tenantId,
            contactId
          )
          .run();
      }

      // Recalculate lead score
      const score = await calculateLeadScore(tenant.tenantId, contactId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "engagement_metrics",
        contactId,
        {
          resourceName: `Engagement Metrics Updated`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metrics: { emailOpens, emailClicks, websiteVisits }, score }, { status: 201 });
    }

    if (action === "firmographics") {
      // POST /api/lead-scoring/:contactId/firmographics - update firmographic data
      const companySize = body.companySize ? cleanText(String(body.companySize), 50) : undefined;
      const industry = body.industry ? cleanText(String(body.industry), 100) : undefined;
      const revenueRange = body.revenueRange ? cleanText(String(body.revenueRange), 50) : undefined;
      const companyAge = body.companyAge ? Number(body.companyAge) : undefined;
      const geographicLocation = body.geographicLocation ? cleanText(String(body.geographicLocation), 100) : undefined;
      const technologyStack = body.technologyStack ? cleanText(String(body.technologyStack), 500) : undefined;
      const budgetAlignment = body.budgetAlignment ? cleanText(String(body.budgetAlignment), 50) : undefined;
      const solutionFitScore = body.solutionFitScore ? Number(body.solutionFitScore) : 50;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Upsert firmographic data
      try {
        // Try to insert
        await db
          .prepare(
            `INSERT INTO firmographic_data (
              id, tenant_id, contact_id, company_size, industry, revenue_range,
              company_age, geographic_location, technology_stack, budget_alignment,
              solution_fit_score, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            tenant.tenantId,
            contactId,
            companySize,
            industry,
            revenueRange,
            companyAge,
            geographicLocation,
            technologyStack,
            budgetAlignment,
            solutionFitScore,
            now,
            now
          )
          .run();
      } catch {
        // If insert fails, try update
        await db
          .prepare(
            `UPDATE firmographic_data SET
              company_size = COALESCE(?, company_size),
              industry = COALESCE(?, industry),
              revenue_range = COALESCE(?, revenue_range),
              company_age = COALESCE(?, company_age),
              geographic_location = COALESCE(?, geographic_location),
              technology_stack = COALESCE(?, technology_stack),
              budget_alignment = COALESCE(?, budget_alignment),
              solution_fit_score = ?,
              updated_at = ?
            WHERE tenant_id = ? AND contact_id = ?`
          )
          .bind(
            companySize,
            industry,
            revenueRange,
            companyAge,
            geographicLocation,
            technologyStack,
            budgetAlignment,
            solutionFitScore,
            now,
            tenant.tenantId,
            contactId
          )
          .run();
      }

      // Recalculate lead score
      const score = await calculateLeadScore(tenant.tenantId, contactId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "firmographic_data",
        contactId,
        {
          resourceName: `Firmographic Data Updated`,
          status: "SUCCESS",
        }
      );

      return Response.json({ firmographics: { companySize, industry }, score }, { status: 201 });
    }

    if (action === "insights") {
      // POST /api/lead-scoring/:contactId/insights - create lead insight
      const insightType = cleanText(String(body.insightType || ""), 50);
      const title = cleanText(String(body.title || ""), 200);
      const description = cleanText(String(body.description || ""), 1000);
      const confidenceScore = Math.min(1, Math.max(0, Number(body.confidenceScore || 0.5)));
      const suggestedActions = Array.isArray(body.suggestedActions)
        ? body.suggestedActions.map((a) => cleanText(String(a), 200))
        : [];

      if (!insightType || !title || !description) {
        return Response.json(
          { error: "insightType, title, and description are required" },
          { status: 400 }
        );
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO lead_insights (
            id, tenant_id, contact_id, insight_type, title, description,
            confidence_score, suggested_actions, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          tenant.tenantId,
          contactId,
          insightType,
          title,
          description,
          confidenceScore,
          JSON.stringify(suggestedActions),
          now,
          now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "lead_insight",
        id,
        {
          resourceName: `Insight: ${title}`,
          status: "SUCCESS",
          type: insightType,
        }
      );

      return Response.json(
        { id, insightType, title, description, confidenceScore },
        { status: 201 }
      );
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("lead-scoring.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
