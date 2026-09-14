/**
 * Advanced Reporting & Business Intelligence (Phase 42)
 *
 * Enable data-driven decision making:
 * - Custom report builder
 * - Pre-built analytics dashboards
 * - KPI tracking and alerts
 * - Export to CSV, PDF, Excel
 * - Scheduled report delivery
 * - Real-time metrics and KPIs
 * - Cohort analysis
 * - Sales forecasting
 */

import crypto from "crypto";
import { coreDb } from "@/lib/core/db";

export type ReportType =
  | "SALES_PIPELINE"
  | "CONTACT_ACTIVITY"
  | "DEAL_ANALYSIS"
  | "REVENUE_FORECAST"
  | "TEAM_PERFORMANCE"
  | "CUSTOM";

export type MetricAggregation = "SUM" | "AVG" | "COUNT" | "MAX" | "MIN";

export type DashboardWidgetType =
  | "METRIC_CARD"
  | "CHART_BAR"
  | "CHART_LINE"
  | "CHART_PIE"
  | "TABLE"
  | "GAUGE";

export interface Report {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: ReportType;
  filters?: Record<string, unknown>;
  columns?: string[];
  enabled: boolean;
  owner?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportExecution {
  id: string;
  tenantId: string;
  reportId: string;
  executedBy?: string;
  data?: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  executedAt: string;
  completedAt?: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  error?: string;
}

export interface DashboardWidget {
  id: string;
  tenantId: string;
  dashboardId: string;
  name: string;
  type: DashboardWidgetType;
  reportId?: string;
  metric?: string;
  position: number;
  width: 1 | 2 | 3 | 4; // Grid width
  height: number;
  config?: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  owner?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KPI {
  id: string;
  tenantId: string;
  name: string;
  metric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  trend?: "UP" | "DOWN" | "STABLE";
  trendPercentage?: number;
  alertThreshold?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a custom report
 */
export async function createReport(
  tenantId: string,
  name: string,
  type: ReportType,
  filters?: Record<string, unknown>,
  columns?: string[],
  owner?: string
): Promise<Report> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const report: Report = {
    id,
    tenantId,
    name,
    type,
    filters,
    columns,
    enabled: true,
    owner,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO reports
       (id, tenant_id, name, type, filters, columns, enabled, owner, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      type,
      filters ? JSON.stringify(filters) : null,
      columns ? JSON.stringify(columns) : null,
      owner || null,
      now,
      now
    )
    .run();

  return report;
}

/**
 * Get report by ID
 */
export async function getReport(tenantId: string, reportId: string): Promise<Report | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM reports WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, reportId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    type: String(row.type) as ReportType,
    filters: row.filters ? JSON.parse(String(row.filters)) : undefined,
    columns: row.columns ? JSON.parse(String(row.columns)) : undefined,
    enabled: Boolean(row.enabled),
    owner: row.owner ? String(row.owner) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List all reports for tenant
 */
export async function listReports(tenantId: string): Promise<Report[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(`SELECT * FROM reports WHERE tenant_id = ? ORDER BY created_at DESC`)
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    type: String(row.type) as ReportType,
    filters: row.filters ? JSON.parse(String(row.filters)) : undefined,
    columns: row.columns ? JSON.parse(String(row.columns)) : undefined,
    enabled: Boolean(row.enabled),
    owner: row.owner ? String(row.owner) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Execute report and generate data
 */
export async function executeReport(
  tenantId: string,
  reportId: string,
  executedBy?: string
): Promise<ReportExecution> {
  const db = coreDb();
  const executionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get report
  const report = await getReport(tenantId, reportId);
  if (!report) {
    throw new Error("Report not found");
  }

  const execution: ReportExecution = {
    id: executionId,
    tenantId,
    reportId,
    executedBy,
    executedAt: now,
    status: "PENDING",
  };

  // Insert execution record
  await db
    .prepare(
      `INSERT INTO report_executions
       (id, tenant_id, report_id, executed_by, status, executed_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`
    )
    .bind(executionId, tenantId, reportId, executedBy || null, now)
    .run();

  // Generate report data based on type
  try {
    let reportData: Record<string, unknown>[] = [];
    let summary: Record<string, unknown> = {};

    switch (report.type) {
      case "SALES_PIPELINE":
        reportData = await generateSalesPipelineReport(tenantId, report.filters);
        summary = calculateSalesPipelineSummary(reportData);
        break;

      case "CONTACT_ACTIVITY":
        reportData = await generateContactActivityReport(tenantId, report.filters);
        summary = calculateActivitySummary(reportData);
        break;

      case "DEAL_ANALYSIS":
        reportData = await generateDealAnalysisReport(tenantId, report.filters);
        summary = calculateDealSummary(reportData);
        break;

      case "REVENUE_FORECAST":
        reportData = await generateRevenueForecastReport(tenantId, report.filters);
        summary = calculateForecastSummary(reportData);
        break;

      case "TEAM_PERFORMANCE":
        reportData = await generateTeamPerformanceReport(tenantId, report.filters);
        summary = calculateTeamSummary(reportData);
        break;

      default:
        reportData = [];
    }

    // Update execution with results
    const completedAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE report_executions
         SET status = 'COMPLETED', data = ?, summary = ?, completed_at = ?
         WHERE id = ?`
      )
      .bind(
        JSON.stringify(reportData),
        JSON.stringify(summary),
        completedAt,
        executionId
      )
      .run();

    return {
      ...execution,
      status: "COMPLETED",
      data: reportData,
      summary,
      completedAt,
    };
  } catch (err) {
    const error = String(err);
    await db
      .prepare(
        `UPDATE report_executions
         SET status = 'FAILED', error = ?, completed_at = ?
         WHERE id = ?`
      )
      .bind(error, new Date().toISOString(), executionId)
      .run();

    throw err;
  }
}

/**
 * Generate sales pipeline report
 */
async function generateSalesPipelineReport(
  tenantId: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT stage, COUNT(*) as count, SUM(COALESCE(value, 0)) as totalValue,
              AVG(COALESCE(value, 0)) as avgValue
       FROM crm_opportunities
       WHERE tenant_id = ?
       GROUP BY stage
       ORDER BY stage`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    stage: String(r.stage),
    count: Number(r.count),
    totalValue: Number(r.totalValue || 0),
    avgValue: Number(r.avgValue || 0),
  }));
}

/**
 * Generate contact activity report
 */
async function generateContactActivityReport(
  tenantId: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as activitiesCount,
        COUNT(DISTINCT contact_id) as uniqueContacts
       FROM crm_activities
       WHERE tenant_id = ?
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    date: String(r.date),
    activitiesCount: Number(r.activitiesCount),
    uniqueContacts: Number(r.uniqueContacts),
  }));
}

/**
 * Generate deal analysis report
 */
async function generateDealAnalysisReport(
  tenantId: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT
        owner_id,
        COUNT(*) as dealsCount,
        SUM(COALESCE(value, 0)) as totalValue,
        AVG(COALESCE(value, 0)) as avgDealSize,
        COUNT(CASE WHEN stage = 'WON' THEN 1 END) as won,
        COUNT(CASE WHEN stage = 'LOST' THEN 1 END) as lost
       FROM crm_opportunities
       WHERE tenant_id = ?
       GROUP BY owner_id
       ORDER BY totalValue DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    ownerId: String(r.owner_id),
    dealsCount: Number(r.dealsCount),
    totalValue: Number(r.totalValue || 0),
    avgDealSize: Number(r.avgDealSize || 0),
    won: Number(r.won),
    lost: Number(r.lost),
  }));
}

/**
 * Generate revenue forecast report
 */
async function generateRevenueForecastReport(
  tenantId: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const db = coreDb();

  // Simplified forecast: current pipeline by stage weighted by conversion probability
  const conversionRates: Record<string, number> = {
    PROSPECTING: 0.1,
    QUALIFIED: 0.25,
    PROPOSAL: 0.5,
    NEGOTIATION: 0.75,
    CLOSED_WON: 1.0,
  };

  const { results } = await db
    .prepare(
      `SELECT stage, SUM(COALESCE(value, 0)) as stageValue, COUNT(*) as dealsCount
       FROM crm_opportunities
       WHERE tenant_id = ? AND stage != 'CLOSED_LOST'
       GROUP BY stage`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => {
    const stage = String(r.stage);
    const stageValue = Number(r.stageValue || 0);
    const rate = conversionRates[stage] || 0.5;
    return {
      stage,
      dealsCount: Number(r.dealsCount),
      stageValue,
      forecastedValue: Math.round(stageValue * rate),
      conversionRate: (rate * 100).toFixed(1),
    };
  });
}

/**
 * Generate team performance report
 */
async function generateTeamPerformanceReport(
  tenantId: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT
        email,
        COUNT(DISTINCT contact_id) as contactsManaged,
        COUNT(DISTINCT CASE WHEN type = 'OPPORTUNITY' THEN id END) as dealsOwned,
        SUM(CASE WHEN type = 'OPPORTUNITY' THEN COALESCE(value, 0) ELSE 0 END) as totalPipeline,
        COUNT(CASE WHEN type = 'CALL' THEN 1 END) as callsMade,
        COUNT(CASE WHEN type = 'EMAIL' THEN 1 END) as emailsSent
       FROM crm_activities
       LEFT JOIN crm_opportunities ON crm_activities.entity_id = crm_opportunities.id
       WHERE crm_activities.tenant_id = ?
       GROUP BY email
       ORDER BY totalPipeline DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    email: String(r.email),
    contactsManaged: Number(r.contactsManaged || 0),
    dealsOwned: Number(r.dealsOwned || 0),
    totalPipeline: Number(r.totalPipeline || 0),
    callsMade: Number(r.callsMade || 0),
    emailsSent: Number(r.emailsSent || 0),
  }));
}

// Summary calculation functions
function calculateSalesPipelineSummary(data: Record<string, unknown>[]): Record<string, unknown> {
  const totalValue = (data as any[]).reduce((sum, d) => sum + (d.totalValue || 0), 0);
  const totalDeals = (data as any[]).reduce((sum, d) => sum + (d.count || 0), 0);
  return {
    totalPipeline: totalValue,
    totalDeals,
    avgDealSize: totalDeals > 0 ? totalValue / totalDeals : 0,
    stageCount: data.length,
  };
}

function calculateActivitySummary(data: Record<string, unknown>[]): Record<string, unknown> {
  const totalActivities = (data as any[]).reduce((sum, d) => sum + (d.activitiesCount || 0), 0);
  const totalContacts = (data as any[]).reduce((sum, d) => sum + (d.uniqueContacts || 0), 0);
  return {
    totalActivities,
    totalContacts,
    daysReported: data.length,
    avgActivitiesPerDay: data.length > 0 ? totalActivities / data.length : 0,
  };
}

function calculateDealSummary(data: Record<string, unknown>[]): Record<string, unknown> {
  const totalValue = (data as any[]).reduce((sum, d) => sum + (d.totalValue || 0), 0);
  const totalWon = (data as any[]).reduce((sum, d) => sum + (d.won || 0), 0);
  const totalLost = (data as any[]).reduce((sum, d) => sum + (d.lost || 0), 0);
  return {
    totalValue,
    topPerformer: data[0],
    totalDeals: (data as any[]).reduce((sum, d) => sum + (d.dealsCount || 0), 0),
    wonRate: totalWon + totalLost > 0 ? ((totalWon / (totalWon + totalLost)) * 100).toFixed(1) : 0,
  };
}

function calculateForecastSummary(data: Record<string, unknown>[]): Record<string, unknown> {
  const totalForecast = (data as any[]).reduce((sum, d) => sum + (d.forecastedValue || 0), 0);
  const totalStaged = (data as any[]).reduce((sum, d) => sum + (d.stageValue || 0), 0);
  return {
    totalForecastedRevenue: Math.round(totalForecast),
    totalStagedRevenue: Math.round(totalStaged),
    forecastAccuracy: ((totalForecast / totalStaged) * 100).toFixed(1),
  };
}

function calculateTeamSummary(data: Record<string, unknown>[]): Record<string, unknown> {
  const totalContacts = (data as any[]).reduce((sum, d) => sum + (d.contactsManaged || 0), 0);
  const totalDeals = (data as any[]).reduce((sum, d) => sum + (d.dealsOwned || 0), 0);
  const totalPipeline = (data as any[]).reduce((sum, d) => sum + (d.totalPipeline || 0), 0);
  return {
    teamSize: data.length,
    totalContacts,
    totalDeals,
    totalPipeline,
    avgDealPerPerson: data.length > 0 ? (totalDeals / data.length).toFixed(1) : 0,
  };
}

/**
 * Create a dashboard
 */
export async function createDashboard(
  tenantId: string,
  name: string,
  owner?: string,
  description?: string
): Promise<Dashboard> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const dashboard: Dashboard = {
    id,
    tenantId,
    name,
    description,
    widgets: [],
    owner,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO dashboards
       (id, tenant_id, name, description, owner, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(id, tenantId, name, description || null, owner || null, now, now)
    .run();

  return dashboard;
}

/**
 * Add widget to dashboard
 */
export async function addDashboardWidget(
  tenantId: string,
  dashboardId: string,
  name: string,
  type: DashboardWidgetType,
  position: number,
  width: 1 | 2 | 3 | 4,
  height: number,
  reportId?: string,
  metric?: string,
  config?: Record<string, unknown>
): Promise<DashboardWidget> {
  const db = coreDb();
  const id = crypto.randomUUID();

  const widget: DashboardWidget = {
    id,
    tenantId,
    dashboardId,
    name,
    type,
    reportId,
    metric,
    position,
    width,
    height,
    config,
  };

  await db
    .prepare(
      `INSERT INTO dashboard_widgets
       (id, tenant_id, dashboard_id, name, type, report_id, metric, position, width, height, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      dashboardId,
      name,
      type,
      reportId || null,
      metric || null,
      position,
      width,
      height,
      config ? JSON.stringify(config) : null
    )
    .run();

  return widget;
}

/**
 * Get dashboard with widgets
 */
export async function getDashboard(tenantId: string, dashboardId: string): Promise<Dashboard | null> {
  const db = coreDb();

  const dashboard = await db
    .prepare(`SELECT * FROM dashboards WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, dashboardId)
    .first<Record<string, unknown>>();

  if (!dashboard) return null;

  const { results: widgets } = await db
    .prepare(
      `SELECT * FROM dashboard_widgets WHERE tenant_id = ? AND dashboard_id = ? ORDER BY position`
    )
    .bind(tenantId, dashboardId)
    .all<Record<string, unknown>>();

  return {
    id: String(dashboard.id),
    tenantId: String(dashboard.tenant_id),
    name: String(dashboard.name),
    description: dashboard.description ? String(dashboard.description) : undefined,
    owner: dashboard.owner ? String(dashboard.owner) : undefined,
    isPublic: Boolean(dashboard.is_public),
    createdAt: String(dashboard.created_at),
    updatedAt: String(dashboard.updated_at),
    widgets: widgets.map((w) => ({
      id: String(w.id),
      tenantId: String(w.tenant_id),
      dashboardId: String(w.dashboard_id),
      name: String(w.name),
      type: String(w.type) as DashboardWidgetType,
      reportId: w.report_id ? String(w.report_id) : undefined,
      metric: w.metric ? String(w.metric) : undefined,
      position: Number(w.position),
      width: Number(w.width) as 1 | 2 | 3 | 4,
      height: Number(w.height),
      config: w.config ? JSON.parse(String(w.config)) : undefined,
    })),
  };
}

/**
 * Create or track a KPI
 */
export async function setKPI(
  tenantId: string,
  name: string,
  metric: string,
  targetValue: number,
  currentValue: number,
  unit: string,
  alertThreshold?: number
): Promise<KPI> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Calculate trend
  const previousKPI = await db
    .prepare(`SELECT current_value FROM kpis WHERE tenant_id = ? AND metric = ? ORDER BY updated_at DESC LIMIT 1`)
    .bind(tenantId, metric)
    .first<{ current_value: number }>();

  let trend: "UP" | "DOWN" | "STABLE" | undefined;
  let trendPercentage: number | undefined;

  if (previousKPI) {
    const prev = previousKPI.current_value;
    const curr = currentValue;
    trendPercentage = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    trend = curr > prev ? "UP" : curr < prev ? "DOWN" : "STABLE";
  }

  const kpi: KPI = {
    id,
    tenantId,
    name,
    metric,
    targetValue,
    currentValue,
    unit,
    trend,
    trendPercentage,
    alertThreshold,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO kpis
       (id, tenant_id, name, metric, target_value, current_value, unit, trend, trend_percentage, alert_threshold, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      metric,
      targetValue,
      currentValue,
      unit,
      trend || null,
      trendPercentage || null,
      alertThreshold || null,
      now,
      now
    )
    .run();

  return kpi;
}

/**
 * Get KPIs for tenant
 */
export async function getKPIs(tenantId: string): Promise<KPI[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(`SELECT * FROM kpis WHERE tenant_id = ? ORDER BY metric`)
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    metric: String(row.metric),
    targetValue: Number(row.target_value),
    currentValue: Number(row.current_value),
    unit: String(row.unit),
    trend: row.trend ? (String(row.trend) as "UP" | "DOWN" | "STABLE") : undefined,
    trendPercentage: row.trend_percentage ? Number(row.trend_percentage) : undefined,
    alertThreshold: row.alert_threshold ? Number(row.alert_threshold) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

// ==================== REPORT DATA / EXPORT / TEMPLATES / SCHEDULING ====================

/** Generate tabular {columns, rows} data for a report type, for on-demand viewing or export. */
export async function generateReportData(
  tenantId: string,
  reportType: string,
  filters?: Record<string, unknown>
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  let rows: Record<string, unknown>[] = [];
  switch (reportType) {
    case "SALES_PIPELINE":
      rows = await generateSalesPipelineReport(tenantId, filters);
      break;
    case "CONTACT_ACTIVITY":
      rows = await generateContactActivityReport(tenantId, filters);
      break;
    case "DEAL_ANALYSIS":
      rows = await generateDealAnalysisReport(tenantId, filters);
      break;
    case "REVENUE_FORECAST":
      rows = await generateRevenueForecastReport(tenantId, filters);
      break;
    case "TEAM_PERFORMANCE":
      rows = await generateTeamPerformanceReport(tenantId, filters);
      break;
    default:
      rows = [];
  }
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { columns, rows };
}

/** Serialize columns/rows as a CSV string. */
export function exportToCSV(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(","));
  return [header, ...body].join("\n");
}

/** Serialize rows as a pretty-printed JSON string. */
export function exportToJSON(columns: string[], rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

/** Static catalog of built-in report templates available to every tenant. */
export function getReportTemplates(): {
  type: ReportType;
  name: string;
  description: string;
}[] {
  return [
    { type: "SALES_PIPELINE", name: "Sales Pipeline", description: "Open opportunities by stage, value, and age." },
    { type: "CONTACT_ACTIVITY", name: "Contact Activity", description: "Calls, emails, meetings, and tasks logged per contact." },
    { type: "DEAL_ANALYSIS", name: "Deal Analysis", description: "Win/loss breakdown and deal velocity." },
    { type: "REVENUE_FORECAST", name: "Revenue Forecast", description: "Projected revenue from weighted open pipeline." },
    { type: "TEAM_PERFORMANCE", name: "Team Performance", description: "Rep-by-rep quota attainment and activity volume." },
  ];
}

/** Create a recurring delivery schedule for an existing report. */
export async function scheduleReport(
  tenantId: string,
  reportId: string,
  recipients: string[],
  frequency: "daily" | "weekly" | "monthly",
  format: "csv" | "pdf" | "json"
): Promise<{
  id: string;
  tenantId: string;
  reportId: string;
  recipients: string[];
  frequency: string;
  format: string;
  nextRunAt: string;
  createdAt: string;
}> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const intervalMs =
    frequency === "daily" ? 24 * 60 * 60 * 1000 :
    frequency === "monthly" ? 30 * 24 * 60 * 60 * 1000 :
    7 * 24 * 60 * 60 * 1000;
  const nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  await db
    .prepare(
      `INSERT INTO scheduled_reports
       (id, tenant_id, report_id, recipients, frequency, format, next_run_at, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(id, tenantId, reportId, JSON.stringify(recipients), frequency, format, nextRunAt, now)
    .run();

  return {
    id,
    tenantId,
    reportId,
    recipients,
    frequency,
    format,
    nextRunAt,
    createdAt: now,
  };
}
