/**
 * Website Visitors API
 *
 * GET /api/website — list website visitors
 * GET /api/website?id=X — get visitor details
 * GET /api/website?analytics=1 — get visitor analytics
 * POST /api/website?identify=1 — identify visitor by email
 */

import {
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import { getVisitorAnalytics, identifyWebsiteVisitor } from "@/lib/core/website-tracking";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const visitorId = url.searchParams.get("id");
    const analyticsFlag = url.searchParams.get("analytics") === "1";

    if (analyticsFlag) {
      // GET /api/website?analytics=1 — visitor analytics
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      const analytics = await getVisitorAnalytics(tenant.tenantId, days);
      return Response.json(analytics);
    }

    if (visitorId) {
      // GET /api/website?id=X — get visitor + visits
      const db = coreDb();
      const visitor = await db
        .prepare(
          `SELECT * FROM website_visitors
           WHERE id = ? AND tenant_id = ?`
        )
        .bind(visitorId, tenant.tenantId)
        .first();

      if (!visitor) {
        return Response.json({ error: "Visitor not found" }, { status: 404 });
      }

      // Get recent visits
      const { results: visits } = await db
        .prepare(
          `SELECT * FROM website_visits
           WHERE visitor_id = ?
           ORDER BY visited_at DESC
           LIMIT 50`
        )
        .bind(visitorId)
        .all();

      // Get events
      const { results: events } = await db
        .prepare(
          `SELECT id, event_type, event_data, created_at FROM website_pixel_events
           WHERE visitor_id = ?
           ORDER BY created_at DESC
           LIMIT 50`
        )
        .bind(visitorId)
        .all();

      return Response.json({
        visitor,
        visits,
        events: events.map((e: Record<string, unknown>) => ({
          ...e,
          eventData: e.event_data ? JSON.parse(String(e.event_data)) : null,
        })),
      });
    }

    // GET /api/website — list all visitors (paginated)
    const db = coreDb();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const sortBy = url.searchParams.get("sortBy") || "last_seen";
    const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";

    const validSort = ["last_seen", "lead_score", "page_views", "first_seen"];
    const sortColumn = validSort.includes(sortBy) ? sortBy : "last_seen";

    const { results: visitors } = await db
      .prepare(
        `SELECT * FROM website_visitors
         WHERE tenant_id = ?
         ORDER BY ${sortColumn} ${order}
         LIMIT ? OFFSET ?`
      )
      .bind(tenant.tenantId, limit, offset)
      .all();

    return Response.json({ visitors, limit, offset });
  } catch (error) {
    console.error("website.get.failed", error);
    return Response.json(
      { error: "Unable to load website data" },
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
    const identifyFlag = url.searchParams.get("identify") === "1";

    if (identifyFlag) {
      // POST /api/website?identify=1 — identify visitor
      const body = (await request.json()) as Record<string, unknown>;
      const visitorId = body.visitorId as string;
      const email = body.email as string;

      if (!visitorId || !email) {
        return Response.json(
          { error: "visitorId and email are required" },
          { status: 400 }
        );
      }

      await identifyWebsiteVisitor(tenant.tenantId, visitorId, email);

      return Response.json({
        success: true,
        visitorId,
        email,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("website.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
