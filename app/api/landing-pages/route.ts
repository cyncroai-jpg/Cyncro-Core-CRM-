/**
 * Landing Pages API
 *
 * GET /api/landing-pages — list landing pages
 * GET /api/landing-pages?id=X — get page details
 * GET /api/landing-pages?analytics=1&id=X — get page analytics
 * POST /api/landing-pages — create landing page
 * PATCH /api/landing-pages — update landing page
 * DELETE /api/landing-pages?id=X — delete landing page
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createLandingPage,
  updateLandingPage,
  getLandingPageAnalytics,
} from "@/lib/core/landing-pages";
import { hasFeatureAccess } from "@/lib/core/billing";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pageId = cleanText(url.searchParams.get("id"), 80);
    const analyticsFlag = url.searchParams.get("analytics") === "1";

    if (analyticsFlag && pageId) {
      // GET /api/landing-pages?analytics=1&id=X
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      const analytics = await getLandingPageAnalytics(tenant.tenantId, pageId, days);
      return Response.json(analytics);
    }

    if (pageId) {
      // GET /api/landing-pages?id=X
      const db = coreDb();
      const page = await db
        .prepare(
          `SELECT * FROM landing_pages WHERE id = ? AND tenant_id = ?`
        )
        .bind(pageId, tenant.tenantId)
        .first();

      if (!page) {
        return Response.json({ error: "Page not found" }, { status: 404 });
      }

      return Response.json({
        ...page,
        content: page.content ? JSON.parse(String(page.content)) : null,
      });
    }

    // GET /api/landing-pages — list all
    const db = coreDb();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const { results: pages } = await db
      .prepare(
        `SELECT * FROM landing_pages
         WHERE tenant_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(tenant.tenantId, limit, offset)
      .all();

    return Response.json({
      pages: pages.map((p: Record<string, unknown>) => ({
        ...p,
        content: p.content ? JSON.parse(String(p.content)) : null,
      })),
      limit,
      offset,
    });
  } catch (error) {
    console.error("landing_pages.get.failed", error);
    return Response.json(
      { error: "Unable to load landing pages" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check feature access
    const hasFeature = await hasFeatureAccess(tenant.tenantId, "customDomain");
    if (!hasFeature) {
      return Response.json(
        { error: "Upgrade to Pro plan to create landing pages" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const title = cleanText(String(body.title || ""), 160);
    const slug = cleanText(String(body.slug || ""), 80)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const template = (body.template as string) || "blank";
    const description = body.description ? cleanText(String(body.description), 500) : undefined;
    const formId = body.formId ? cleanText(String(body.formId), 80) : undefined;

    if (!title || !slug) {
      return Response.json(
        { error: "title and slug are required" },
        { status: 400 }
      );
    }

    const page = await createLandingPage(
      tenant.tenantId,
      title,
      slug,
      template as any,
      tenant.email,
      description,
      formId
    );

    return Response.json(page, { status: 201 });
  } catch (error) {
    console.error("landing_pages.create.failed", error);
    return Response.json(
      { error: "Unable to create landing page" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const pageId = cleanText(String(body.id || ""), 80);

    if (!pageId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.title) updates.title = cleanText(String(body.title), 160);
    if (body.content) updates.content = body.content;
    if (body.description !== undefined) {
      updates.description = body.description
        ? cleanText(String(body.description), 500)
        : undefined;
    }
    if (body.published !== undefined) updates.published = Boolean(body.published);
    if (body.primaryColor) updates.primaryColor = cleanText(String(body.primaryColor), 10);
    if (body.formId !== undefined) {
      updates.formId = body.formId ? cleanText(String(body.formId), 80) : undefined;
    }

    await updateLandingPage(tenant.tenantId, pageId, updates as any);

    // Fetch updated page
    const db = coreDb();
    const page = await db
      .prepare(
        `SELECT * FROM landing_pages WHERE id = ? AND tenant_id = ?`
      )
      .bind(pageId, tenant.tenantId)
      .first();

    return Response.json({
      ...page,
      content: page.content ? JSON.parse(String(page.content)) : null,
    });
  } catch (error) {
    console.error("landing_pages.update.failed", error);
    return Response.json(
      { error: "Unable to update landing page" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pageId = cleanText(url.searchParams.get("id"), 80);

    if (!pageId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    await db
      .prepare(
        "DELETE FROM landing_pages WHERE id = ? AND tenant_id = ?"
      )
      .bind(pageId, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("landing_pages.delete.failed", error);
    return Response.json(
      { error: "Unable to delete landing page" },
      { status: 500 }
    );
  }
}
