/**
 * Advanced Reporting API
 *
 * GET /api/reporting/dashboards — list dashboards
 * POST /api/reporting/dashboards — create dashboard
 * PATCH /api/reporting/dashboards — update dashboard
 * GET /api/reporting/reports — list reports
 * POST /api/reporting/reports — create report
 * GET /api/reporting/reports?id=X&export=csv — generate and export report
 * POST /api/reporting/scheduled — schedule report delivery
 * GET /api/reporting/templates — get report templates
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createDashboard,
  getDashboard,
  createReport,
  generateReportData,
  scheduleReport,
  exportToCSV,
  exportToJSON,
  getReportTemplates,
} from "@/lib/core/reporting";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/reporting/[section]

    if (section === "dashboards") {
      // GET /api/reporting/dashboards
      const db = coreDb();
      const { results: dashboards } = await db
        .prepare(
          `SELECT * FROM dashboards WHERE tenant_id = ? ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all();

      return Response.json({
        dashboards: dashboards.map((d: Record<string, unknown>) => ({
          ...d,
          widgets: d.widgets ? JSON.parse(String(d.widgets)) : [],
        })),
      });
    }

    if (section === "reports") {
      // GET /api/reporting/reports or /api/reporting/reports?id=X
      const reportId = cleanText(url.searchParams.get("id"), 80);
      const exportFormat = cleanText(url.searchParams.get("export"), 10);
      const db = coreDb();

      if (reportId) {
        // Get specific report and generate data
        const report = await db
          .prepare(
            `SELECT * FROM reports WHERE id = ? AND tenant_id = ?`
          )
          .bind(reportId, tenant.tenantId)
          .first<Record<string, unknown>>();

        if (!report) {
          return Response.json({ error: "Report not found" }, { status: 404 });
        }

        const reportData = await generateReportData(
          tenant.tenantId,
          String(report.report_type)
        );

        // Export if requested
        if (exportFormat === "csv") {
          const csv = exportToCSV(reportData.columns, reportData.rows);
          return new Response(csv, {
            status: 200,
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="${report.name}.csv"`,
            },
          });
        }

        if (exportFormat === "json") {
          const json = exportToJSON(reportData.columns, reportData.rows);
          return new Response(json, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${report.name}.json"`,
            },
          });
        }

        return Response.json({
          report,
          data: reportData,
        });
      }

      // List all reports
      const { results: reports } = await db
        .prepare(
          `SELECT * FROM reports WHERE tenant_id = ? ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all();

      return Response.json({
        reports: reports.map((r: Record<string, unknown>) => ({
          ...r,
          filters: r.filters ? JSON.parse(String(r.filters)) : null,
          columns: r.columns ? JSON.parse(String(r.columns)) : null,
        })),
      });
    }

    if (section === "templates") {
      // GET /api/reporting/templates
      const templates = getReportTemplates();
      return Response.json({ templates });
    }

    if (section === "scheduled") {
      // GET /api/reporting/scheduled
      const db = coreDb();
      const { results: scheduled } = await db
        .prepare(
          `SELECT * FROM scheduled_reports WHERE tenant_id = ? ORDER BY created_at DESC`
        )
        .bind(tenant.tenantId)
        .all();

      return Response.json({
        scheduled: scheduled.map((s: Record<string, unknown>) => ({
          ...s,
          recipients: s.recipients ? JSON.parse(String(s.recipients)) : [],
        })),
      });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("reporting.get.failed", error);
    return Response.json(
      { error: "Unable to load reporting data" },
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
      // POST /api/reporting/dashboards
      const name = cleanText(String(body.name || ""), 160);
      const description = body.description ? cleanText(String(body.description), 500) : undefined;
      const widgets = Array.isArray(body.widgets) ? (body.widgets as any[]) : [];

      if (!name) {
        return Response.json({ error: "name is required" }, { status: 400 });
      }

      const dashboard = await createDashboard(
        tenant.tenantId,
        name,
        widgets,
        description,
        tenant.email
      );

      return Response.json(dashboard, { status: 201 });
    }

    if (section === "reports") {
      // POST /api/reporting/reports
      const name = cleanText(String(body.name || ""), 160);
      const reportType = cleanText(String(body.reportType || ""), 50);
      const filters = body.filters as Record<string, unknown> | undefined;
      const columns = Array.isArray(body.columns) ? (body.columns as string[]) : undefined;
      const sortBy = body.sortBy ? cleanText(String(body.sortBy), 50) : undefined;

      if (!name || !reportType) {
        return Response.json(
          { error: "name and reportType are required" },
          { status: 400 }
        );
      }

      const report = await createReport(
        tenant.tenantId,
        name,
        reportType,
        filters,
        columns,
        sortBy,
        tenant.email
      );

      return Response.json(report, { status: 201 });
    }

    if (section === "scheduled") {
      // POST /api/reporting/scheduled
      const reportId = cleanText(String(body.reportId || ""), 80);
      const recipients = Array.isArray(body.recipients) ? (body.recipients as string[]) : [];
      const frequency = String(body.frequency || "weekly");
      const format = String(body.format || "csv");

      if (!reportId || recipients.length === 0) {
        return Response.json(
          { error: "reportId and recipients are required" },
          { status: 400 }
        );
      }

      const scheduled = await scheduleReport(
        tenant.tenantId,
        reportId,
        recipients,
        frequency as "daily" | "weekly" | "monthly",
        format as "csv" | "pdf" | "json"
      );

      return Response.json(scheduled, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("reporting.post.failed", error);
    return Response.json(
      { error: "Unable to create reporting item" },
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
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "dashboards") {
      // PATCH /api/reporting/dashboards
      const dashboardId = cleanText(String(body.id || ""), 80);

      if (!dashboardId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const db = coreDb();
      const now = new Date().toISOString();

      const updates: [string, unknown][] = [];
      if (body.name) updates.push(["name", cleanText(String(body.name), 160)]);
      if (body.description !== undefined) {
        updates.push(["description", body.description ? cleanText(String(body.description), 500) : null]);
      }
      if (body.widgets) {
        updates.push(["widgets", JSON.stringify(body.widgets)]);
      }
      if (body.isDefault !== undefined) {
        updates.push(["is_default", body.isDefault ? 1 : 0]);
      }

      if (updates.length === 0) {
        return Response.json({ error: "No changes provided" }, { status: 400 });
      }

      updates.push(["updated_at", now]);

      const setClauses = updates.map(([col]) => `${col} = ?`).join(", ");
      const values = updates.map(([, val]) => val);
      values.push(dashboardId, tenant.tenantId);

      await db
        .prepare(
          `UPDATE dashboards SET ${setClauses} WHERE id = ? AND tenant_id = ?`
        )
        .bind(...values)
        .run();

      const updated = await getDashboard(tenant.tenantId, dashboardId);
      return Response.json(updated);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("reporting.patch.failed", error);
    return Response.json(
      { error: "Unable to update reporting item" },
      { status: 500 }
    );
  }
}
