/**
 * Reporting & Business Intelligence API
 *
 * GET /api/reports — list reports
 * POST /api/reports — create report
 * GET /api/reports/:id — get report details
 * POST /api/reports/:id/execute — execute report
 * GET /api/dashboards — list dashboards
 * POST /api/dashboards — create dashboard
 * GET /api/kpis — list KPIs
 * POST /api/kpis — create/update KPI
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createReport,
  getReport,
  listReports,
  executeReport,
  createDashboard,
  getDashboard,
  addDashboardWidget,
  setKPI,
  getKPIs,
  type ReportType,
  type DashboardWidgetType,
} from "@/lib/core/reporting";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/reports/[section]

    if (section === "dashboards") {
      // GET /api/reports/dashboards - list dashboards
      const dashboardId = url.searchParams.get("id");
      if (dashboardId) {
        const dashboard = await getDashboard(tenant.tenantId, dashboardId);
        if (!dashboard) {
          return Response.json({ error: "Dashboard not found" }, { status: 404 });
        }
        return Response.json({ dashboard });
      }
      // List dashboards would require additional DB query
      return Response.json({ dashboards: [] });
    }

    if (section === "kpis") {
      // GET /api/reports/kpis - list KPIs
      const kpis = await getKPIs(tenant.tenantId);
      return Response.json({ kpis });
    }

    // GET /api/reports - list all reports
    const reports = await listReports(tenant.tenantId);
    return Response.json({ reports, total: reports.length });
  } catch (error) {
    console.error("reports.get.failed", error);
    return Response.json(
      { error: "Unable to fetch reports" },
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
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "dashboards") {
      // POST /api/reports/dashboards - create dashboard
      const name = cleanText(String(body.name || ""), 100);
      const description = body.description ? cleanText(String(body.description), 500) : undefined;

      if (!name) {
        return Response.json(
          { error: "name is required" },
          { status: 400 }
        );
      }

      const dashboard = await createDashboard(
        tenant.tenantId,
        name,
        tenant.email,
        description
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dashboard",
        dashboard.id,
        {
          resourceName: `Dashboard: ${name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ dashboard }, { status: 201 });
    }

    if (section === "widgets") {
      // POST /api/reports/widgets - add widget to dashboard
      const dashboardId = cleanText(String(body.dashboardId || ""), 50);
      const widgetName = cleanText(String(body.name || ""), 100);
      const type = String(body.type || "METRIC_CARD") as DashboardWidgetType;
      const position = Number(body.position || 0);
      const width = Math.min(Math.max(Number(body.width || 2), 1), 4) as 1 | 2 | 3 | 4;
      const height = Math.max(Number(body.height || 3), 1);

      if (!dashboardId || !widgetName) {
        return Response.json(
          { error: "dashboardId and name are required" },
          { status: 400 }
        );
      }

      const widget = await addDashboardWidget(
        tenant.tenantId,
        dashboardId,
        widgetName,
        type,
        position,
        width,
        height,
        body.reportId ? cleanText(String(body.reportId), 50) : undefined,
        body.metric ? cleanText(String(body.metric), 50) : undefined,
        body.config as Record<string, unknown> | undefined
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "dashboard_widget",
        widget.id,
        {
          resourceName: `Widget: ${widgetName}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ widget }, { status: 201 });
    }

    if (section === "kpis") {
      // POST /api/reports/kpis - create/update KPI
      const name = cleanText(String(body.name || ""), 100);
      const metric = cleanText(String(body.metric || ""), 50);
      const targetValue = Number(body.targetValue || 0);
      const currentValue = Number(body.currentValue || 0);
      const unit = cleanText(String(body.unit || ""), 20);
      const alertThreshold = body.alertThreshold ? Number(body.alertThreshold) : undefined;

      if (!name || !metric || !unit) {
        return Response.json(
          { error: "name, metric, and unit are required" },
          { status: 400 }
        );
      }

      const kpi = await setKPI(
        tenant.tenantId,
        name,
        metric,
        targetValue,
        currentValue,
        unit,
        alertThreshold
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "kpi",
        kpi.id,
        {
          resourceName: `KPI: ${name}`,
          status: "SUCCESS",
          currentValue,
          targetValue,
        }
      );

      return Response.json({ kpi }, { status: 201 });
    }

    // POST /api/reports - create report
    const name = cleanText(String(body.name || ""), 100);
    const type = String(body.type || "CUSTOM") as ReportType;
    const filters = body.filters as Record<string, unknown> | undefined;
    const columns = Array.isArray(body.columns)
      ? body.columns.map((c) => cleanText(String(c), 50))
      : undefined;

    if (!name) {
      return Response.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const report = await createReport(
      tenant.tenantId,
      name,
      type,
      filters,
      columns,
      tenant.email
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "report",
      report.id,
      {
        resourceName: `Report: ${name}`,
        status: "SUCCESS",
        type,
      }
    );

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    console.error("reports.post.failed", error);
    return Response.json(
      { error: "Unable to create report" },
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
    const parts = url.pathname.split("/");
    const reportId = parts[3];
    const action = parts[4];

    if (!reportId) {
      return Response.json({ error: "reportId is required" }, { status: 400 });
    }

    if (action === "execute") {
      // PATCH /api/reports/:id/execute - execute report
      const execution = await executeReport(reportId, tenant.tenantId, tenant.email);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "EXECUTE",
        "report",
        reportId,
        {
          resourceName: `Report Execution`,
          status: execution.status,
          executionId: execution.id,
        }
      );

      return Response.json({ execution });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("reports.patch.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
