/**
 * Analytics API
 *
 * GET /api/analytics — get analytics for date range
 * GET /api/analytics?summary=1 — get 30-day dashboard summary
 */

import {
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  getTenantAnalytics,
  getDashboardSummary,
} from "@/lib/core/analytics";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const summary = url.searchParams.get("summary") === "1";
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    let analytics;

    if (summary) {
      // GET /api/analytics?summary=1 — 30-day snapshot
      analytics = await getDashboardSummary(tenant.tenantId);
    } else if (startDate && endDate) {
      // GET /api/analytics?startDate=2026-08-14&endDate=2026-09-14
      try {
        analytics = await getTenantAnalytics(tenant.tenantId, startDate, endDate);
      } catch {
        return Response.json(
          { error: "Invalid date format (use ISO 8601)" },
          { status: 400 }
        );
      }
    } else {
      return Response.json(
        { error: "Provide summary=1 or both startDate and endDate parameters" },
        { status: 400 }
      );
    }

    return Response.json(analytics);
  } catch (error) {
    console.error("analytics.get.failed", error);
    return Response.json(
      { error: "Unable to load analytics" },
      { status: 500 }
    );
  }
}
