/**
 * Public Landing Page Endpoint
 *
 * GET /api/public/landing?tenant=X&slug=Y
 * Returns landing page content for public access
 * Tracks page views and conversions
 */

import { ensureCoreSchema, coreDb } from "@/lib/core/db";
import { getLandingPageBySlug, trackPageView, trackConversion } from "@/lib/core/landing-pages";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();

    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get("tenant");
    const pageSlug = url.searchParams.get("slug");
    const trackConversionFlag = url.searchParams.get("conversion") === "1";

    if (!tenantSlug || !pageSlug) {
      return Response.json(
        { error: "tenant and slug are required" },
        { status: 400 }
      );
    }

    // Get tenant by slug
    const db = coreDb();
    const tenant = await db
      .prepare("SELECT id FROM tenants WHERE slug = ?")
      .bind(tenantSlug)
      .first<{ id: string }>();

    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Get landing page
    const page = await getLandingPageBySlug(tenant.id, pageSlug);

    if (!page) {
      return Response.json(
        { error: "Landing page not found" },
        { status: 404 }
      );
    }

    // Get visitor IP
    const forwarded = request.headers.get("X-Forwarded-For");
    const visitorIp = forwarded
      ? forwarded.split(",")[0].trim()
      : request.headers.get("CF-Connecting-IP") || "127.0.0.1";

    // Get UTM parameters
    const referrer = request.headers.get("Referer") || undefined;
    const utmSource = url.searchParams.get("utm_source") || undefined;
    const utmMedium = url.searchParams.get("utm_medium") || undefined;
    const utmCampaign = url.searchParams.get("utm_campaign") || undefined;

    // Track view or conversion
    if (trackConversionFlag) {
      await trackConversion(tenant.id, page.id, visitorIp);
    } else {
      await trackPageView(tenant.id, page.id, visitorIp, referrer, utmSource, utmMedium, utmCampaign);
    }

    // Return page data
    return Response.json(
      {
        page: {
          id: page.id,
          title: page.title,
          slug: page.slug,
          description: page.description,
          template: page.template,
          content: page.content,
          formId: page.formId,
          primaryColor: page.primaryColor,
          ogTitle: page.ogTitle,
          ogDescription: page.ogDescription,
          ogImage: page.ogImage,
        },
        tenantSlug,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("landing_page.public.failed", error);
    return Response.json(
      { error: "Unable to load landing page" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return Response.json(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
