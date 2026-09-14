/**
 * Advanced Analytics API
 *
 * All routes are on the single /api/analytics path — Next.js has no
 * catch-all segment under app/api/analytics, so the resource and id are
 * passed as query params instead of URL path segments.
 *
 * GET /api/analytics?section=portfolio — get portfolio metrics
 * GET /api/analytics?section=portfolio&id=:date — get portfolio metrics for date
 * POST /api/analytics?section=portfolio — create/update portfolio metrics
 * GET /api/analytics?section=customers — get customer metrics
 * POST /api/analytics?section=customers — create/update customer metrics
 * GET /api/analytics?section=credit-repair — get credit repair metrics
 * POST /api/analytics?section=credit-repair — create/update credit repair metrics
 * GET /api/analytics?section=revenue — get revenue metrics
 * POST /api/analytics?section=revenue — create/update revenue metrics
 * GET /api/analytics?section=risk — get risk analytics
 * POST /api/analytics?section=risk — create/update risk analytics
 * GET /api/analytics?section=dashboards — list analytics dashboards
 * POST /api/analytics?section=dashboards — create dashboard
 * PATCH /api/analytics?section=dashboards&id=:id — update dashboard
 * GET /api/analytics?section=alerts — list analytics alerts
 * POST /api/analytics?section=alerts — create alert
 * GET /api/analytics?section=exports — list export jobs
 * POST /api/analytics?section=exports — create export job
 * GET /api/analytics?section=exports&id=:jobId — get export job status
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

    if (section === "portfolio") {
      const db = coreDb();
      if (resourceId) {
        const metrics = await db
          .prepare(
            `SELECT * FROM portfolio_metrics
             WHERE tenant_id = ? AND metric_date = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!metrics) {
          return Response.json({ error: "Metrics not found" }, { status: 404 });
        }
        return Response.json({ metrics });
      } else {
        const metrics = await db
          .prepare(
            `SELECT * FROM portfolio_metrics
             WHERE tenant_id = ?
             ORDER BY metric_date DESC
             LIMIT 30`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ metrics: metrics.results || [] });
      }
    }

    if (section === "customers") {
      const db = coreDb();
      const metrics = await db
        .prepare(
          `SELECT * FROM customer_metrics
           WHERE tenant_id = ?
           ORDER BY customer_date DESC
           LIMIT 30`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ metrics: metrics.results || [] });
    }

    if (section === "credit-repair") {
      const db = coreDb();
      const metrics = await db
        .prepare(
          `SELECT * FROM credit_repair_metrics
           WHERE tenant_id = ?
           ORDER BY metric_date DESC
           LIMIT 30`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ metrics: metrics.results || [] });
    }

    if (section === "revenue") {
      const db = coreDb();
      const metrics = await db
        .prepare(
          `SELECT * FROM revenue_metrics
           WHERE tenant_id = ?
           ORDER BY revenue_date DESC
           LIMIT 30`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ metrics: metrics.results || [] });
    }

    if (section === "risk") {
      const db = coreDb();
      const metrics = await db
        .prepare(
          `SELECT * FROM risk_analytics
           WHERE tenant_id = ?
           ORDER BY analytics_date DESC
           LIMIT 30`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ metrics: metrics.results || [] });
    }

    if (section === "dashboards") {
      const db = coreDb();
      const dashboards = await db
        .prepare(
          `SELECT * FROM analytics_dashboards
           WHERE tenant_id = ?
           ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ dashboards: dashboards.results || [] });
    }

    if (section === "alerts") {
      const db = coreDb();
      const alerts = await db
        .prepare(
          `SELECT * FROM analytics_alerts
           WHERE tenant_id = ?
           ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all<any>();
      return Response.json({ alerts: alerts.results || [] });
    }

    if (section === "exports") {
      const db = coreDb();
      if (resourceId) {
        const job = await db
          .prepare(
            `SELECT * FROM export_jobs
             WHERE tenant_id = ? AND id = ?`
          )
          .bind(tenant.tenantId, resourceId)
          .first<any>();
        if (!job) {
          return Response.json({ error: "Export job not found" }, { status: 404 });
        }
        return Response.json({ job });
      } else {
        const jobs = await db
          .prepare(
            `SELECT * FROM export_jobs
             WHERE tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`
          )
          .bind(tenant.tenantId)
          .all<any>();
        return Response.json({ jobs: jobs.results || [] });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("analytics.get.failed", error);
    return Response.json(
      { error: "Unable to fetch analytics" },
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

    const body = (await request.json()) as Record<string, unknown>;
    const db = coreDb();

    if (section === "portfolio") {
      const metricDate = String(body.metricDate || new Date().toISOString().split("T")[0]);
      const totalLoansActive = Number(body.totalLoansActive || 0);
      const totalLoansPaidOff = Number(body.totalLoansPaidOff || 0);
      const totalLoansDefaulted = Number(body.totalLoansDefaulted || 0);
      const totalOriginated = Number(body.totalOriginated || totalLoansActive + totalLoansPaidOff + totalLoansDefaulted);
      const defaultRate = Number(body.defaultRate || 0);
      const portfolioYield = Number(body.portfolioYield || 0);
      const averageLoanAmount = Number(body.averageLoanAmount || 0);
      const averageInterestRate = Number(body.averageInterestRate || 0);
      const totalInterestCollected = Number(body.totalInterestCollected || 0);
      const totalRevenue = Number(body.totalRevenue || 0);

      const id = `pm-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO portfolio_metrics
           (id, tenant_id, metric_date, total_loans_active, total_loans_paid_off, total_loans_defaulted,
            total_originated, default_rate, portfolio_yield, average_loan_amount, average_interest_rate,
            total_interest_collected, total_revenue, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, metricDate, totalLoansActive, totalLoansPaidOff, totalLoansDefaulted,
          totalOriginated, defaultRate, portfolioYield, averageLoanAmount, averageInterestRate,
          totalInterestCollected, totalRevenue, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "portfolio_metrics",
        id,
        {
          resourceName: `Portfolio Metrics: ${metricDate}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metric: { id, ...body } }, { status: 201 });
    }

    if (section === "customers") {
      const customerDate = String(body.customerDate || new Date().toISOString().split("T")[0]);
      const totalCustomers = Number(body.totalCustomers || 0);
      const activeCustomers = Number(body.activeCustomers || totalCustomers);
      const newCustomers = Number(body.newCustomers || 0);
      const churnRate = Number(body.churnRate || 0);
      const customerLifetimeValue = Number(body.customerLifetimeValue || 0);
      const averageCustomerValue = Number(body.averageCustomerValue || 0);
      const retentionRate = Number(body.retentionRate || 0);
      const npsScore = body.npsScore ? Number(body.npsScore) : null;
      const satisfactionScore = body.satisfactionScore ? Number(body.satisfactionScore) : null;

      const id = `cm-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO customer_metrics
           (id, tenant_id, customer_date, total_customers, active_customers, new_customers, churn_rate,
            customer_lifetime_value, average_customer_value, retention_rate, nps_score, satisfaction_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, customerDate, totalCustomers, activeCustomers, newCustomers, churnRate,
          customerLifetimeValue, averageCustomerValue, retentionRate, npsScore, satisfactionScore, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "customer_metrics",
        id,
        {
          resourceName: `Customer Metrics: ${customerDate}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metric: { id, ...body } }, { status: 201 });
    }

    if (section === "credit-repair") {
      const metricDate = String(body.metricDate || new Date().toISOString().split("T")[0]);
      const totalDisputesFiled = Number(body.totalDisputesFiled || 0);
      const disputesResolved = Number(body.disputesResolved || 0);
      const disputesSuccessful = Number(body.disputesSuccessful || 0);
      const disputeSuccessRate = Number(body.disputeSuccessRate || 0);
      const averageResolutionDays = Number(body.averageResolutionDays || 0);
      const averageCreditScoreImprovement = Number(body.averageCreditScoreImprovement || 0);
      const totalClientsActive = Number(body.totalClientsActive || 0);
      const revenueFromDisputes = Number(body.revenueFromDisputes || 0);

      const id = `crm-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO credit_repair_metrics
           (id, tenant_id, metric_date, total_disputes_filed, disputes_resolved, disputes_successful,
            dispute_success_rate, average_resolution_days, average_credit_score_improvement, total_clients_active,
            revenue_from_disputes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, metricDate, totalDisputesFiled, disputesResolved, disputesSuccessful,
          disputeSuccessRate, averageResolutionDays, averageCreditScoreImprovement, totalClientsActive,
          revenueFromDisputes, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "credit_repair_metrics",
        id,
        {
          resourceName: `Credit Repair Metrics: ${metricDate}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metric: { id, ...body } }, { status: 201 });
    }

    if (section === "revenue") {
      const revenueDate = String(body.revenueDate || new Date().toISOString().split("T")[0]);
      const originationFees = Number(body.originationFees || 0);
      const interestRevenue = Number(body.interestRevenue || 0);
      const lateFees = Number(body.lateFees || 0);
      const prepaymentPenalties = Number(body.prepaymentPenalties || 0);
      const subscriptionRevenue = Number(body.subscriptionRevenue || 0);
      const totalRevenue = Number(body.totalRevenue || 0);
      const costOfFunds = Number(body.costOfFunds || 0);
      const operatingExpenses = Number(body.operatingExpenses || 0);
      const netRevenue = Number(body.netRevenue || 0);
      const profitMargin = Number(body.profitMargin || 0);

      const id = `rev-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO revenue_metrics
           (id, tenant_id, revenue_date, origination_fees, interest_revenue, late_fees, prepayment_penalties,
            subscription_revenue, total_revenue, cost_of_funds, operating_expenses, net_revenue, profit_margin, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, revenueDate, originationFees, interestRevenue, lateFees, prepaymentPenalties,
          subscriptionRevenue, totalRevenue, costOfFunds, operatingExpenses, netRevenue, profitMargin, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "revenue_metrics",
        id,
        {
          resourceName: `Revenue Metrics: ${revenueDate}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metric: { id, ...body } }, { status: 201 });
    }

    if (section === "risk") {
      const analyticsDate = String(body.analyticsDate || new Date().toISOString().split("T")[0]);
      const portfolioRiskScore = Number(body.portfolioRiskScore || 50);
      const delinquent30daysCount = Number(body.delinquent30daysCount || 0);
      const delinquent60daysCount = Number(body.delinquent60daysCount || 0);
      const delinquent90plusCount = Number(body.delinquent90plusCount || 0);
      const delinquencyRate = Number(body.delinquencyRate || 0);
      const predictiveDefaultRate = Number(body.predictiveDefaultRate || 0);
      const reserveRequirement = Number(body.reserveRequirement || 0);
      const concentrationRiskScore = Number(body.concentrationRiskScore || 0);
      const interestRateRiskScore = Number(body.interestRateRiskScore || 0);

      const id = `risk-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO risk_analytics
           (id, tenant_id, analytics_date, portfolio_risk_score, delinquent_30days_count, delinquent_60days_count,
            delinquent_90plus_count, delinquency_rate, predictive_default_rate, reserve_requirement,
            concentration_risk_score, interest_rate_risk_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, tenant.tenantId, analyticsDate, portfolioRiskScore, delinquent30daysCount, delinquent60daysCount,
          delinquent90plusCount, delinquencyRate, predictiveDefaultRate, reserveRequirement,
          concentrationRiskScore, interestRateRiskScore, now
        )
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "risk_analytics",
        id,
        {
          resourceName: `Risk Analytics: ${analyticsDate}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ metric: { id, ...body } }, { status: 201 });
    }

    if (section === "dashboards") {
      const name = cleanText(String(body.name || ""), 200);
      const dashboardType = String(body.dashboardType || "PORTFOLIO");
      const ownerId = String(body.ownerId || tenant.userId);
      const isDefault = body.isDefault ? 1 : 0;
      const configuration = JSON.stringify(body.configuration || {});
      const filters = JSON.stringify(body.filters || {});
      const refreshInterval = Number(body.refreshIntervalMinutes || 60);

      if (!name) {
        return Response.json({ error: "name is required" }, { status: 400 });
      }

      const id = `dash-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO analytics_dashboards
           (id, tenant_id, name, dashboard_type, owner_id, is_default, configuration, filters, refresh_interval_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, tenant.tenantId, name, dashboardType, ownerId, isDefault, configuration, filters, refreshInterval, now, now)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "analytics_dashboard",
        id,
        {
          resourceName: `Dashboard: ${name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ dashboard: { id, name, dashboardType } }, { status: 201 });
    }

    if (section === "alerts") {
      const name = cleanText(String(body.name || ""), 200);
      const alertType = String(body.alertType || "THRESHOLD");
      const metricName = String(body.metricName || "");
      const thresholdValue = Number(body.thresholdValue || 0);
      const comparisonOperator = String(body.comparisonOperator || "GREATER_THAN");
      const isActive = body.isActive !== false ? 1 : 0;
      const notifyVia = JSON.stringify(body.notifyVia || ["EMAIL"]);

      if (!name || !metricName) {
        return Response.json({ error: "name and metricName are required" }, { status: 400 });
      }

      const id = `alert-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO analytics_alerts
           (id, tenant_id, name, alert_type, metric_name, threshold_value, comparison_operator, is_active, notify_via, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, tenant.tenantId, name, alertType, metricName, thresholdValue, comparisonOperator, isActive, notifyVia, now, now)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "analytics_alert",
        id,
        {
          resourceName: `Alert: ${name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ alert: { id, name, alertType } }, { status: 201 });
    }

    if (section === "exports") {
      const jobName = cleanText(String(body.jobName || ""), 200);
      const exportType = String(body.exportType || "PORTFOLIO");
      const filters = JSON.stringify(body.filters || {});
      const format = String(body.format || "CSV");

      if (!jobName) {
        return Response.json({ error: "jobName is required" }, { status: 400 });
      }

      const id = `export-${Date.now()}`;
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO export_jobs
           (id, tenant_id, job_name, export_type, filters, format, status, requested_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, tenant.tenantId, jobName, exportType, filters, format, "PENDING", tenant.userId, now)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "export_job",
        id,
        {
          resourceName: `Export: ${jobName}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ job: { id, jobName, status: "PENDING" } }, { status: 201 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("analytics.post.failed", error);
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

    const body = (await request.json()) as Record<string, unknown>;
    const db = coreDb();

    if (section === "dashboards" && resourceId) {
      const name = body.name ? cleanText(String(body.name), 200) : undefined;
      const configuration = body.configuration ? JSON.stringify(body.configuration) : undefined;
      const filters = body.filters ? JSON.stringify(body.filters) : undefined;
      const refreshInterval = body.refreshIntervalMinutes ? Number(body.refreshIntervalMinutes) : undefined;

      const now = new Date().toISOString();
      const updates: string[] = [];
      const binds: any[] = [];

      if (name) {
        updates.push("name = ?");
        binds.push(name);
      }
      if (configuration) {
        updates.push("configuration = ?");
        binds.push(configuration);
      }
      if (filters) {
        updates.push("filters = ?");
        binds.push(filters);
      }
      if (refreshInterval) {
        updates.push("refresh_interval_minutes = ?");
        binds.push(refreshInterval);
      }

      if (updates.length === 0) {
        return Response.json({ error: "No updates provided" }, { status: 400 });
      }

      updates.push("updated_at = ?");
      binds.push(now);
      binds.push(tenant.tenantId);
      binds.push(resourceId);

      await db
        .prepare(
          `UPDATE analytics_dashboards SET ${updates.join(", ")} WHERE tenant_id = ? AND id = ?`
        )
        .bind(...binds)
        .run();

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "analytics_dashboard",
        resourceId,
        {
          resourceName: `Dashboard Updated`,
          status: "SUCCESS",
        }
      );

      return Response.json({ status: "updated" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("analytics.patch.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
