/**
 * Website Tracking Pixel
 *
 * POST /api/webhooks/website-pixel
 * Receives tracking events from website visitor pixel
 *
 * Query params:
 * - tenantId: required
 * - pageUrl: required
 * - referrer: optional
 * - timeOnPage: optional (seconds)
 * - eventType: optional (PAGE_VIEW, FORM_VIEW, PRODUCT_VIEW, VIDEO_PLAY, PURCHASE, CUSTOM)
 *
 * Headers:
 * - X-Visitor-Id: optional (tracks across sessions via cookie)
 * - User-Agent: automatically captured
 * - X-Forwarded-For: IP address (for proxy scenarios)
 */

import { ensureCoreSchema } from "@/lib/core/db";
import { trackWebsiteVisit, firePixelEvent, identifyWebsiteVisitor } from "@/lib/core/website-tracking";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    const pageUrl = url.searchParams.get("pageUrl");
    const referrer = url.searchParams.get("referrer");
    const timeOnPageStr = url.searchParams.get("timeOnPage");
    const eventType = url.searchParams.get("eventType") as
      | "PAGE_VIEW"
      | "FORM_VIEW"
      | "PRODUCT_VIEW"
      | "VIDEO_PLAY"
      | "PURCHASE"
      | "CUSTOM"
      | null;
    const email = url.searchParams.get("email");

    if (!tenantId || !pageUrl) {
      return Response.json(
        { error: "tenantId and pageUrl are required" },
        { status: 400 }
      );
    }

    // Get IP address
    const forwarded = request.headers.get("X-Forwarded-For");
    const ipAddress = forwarded
      ? forwarded.split(",")[0].trim()
      : request.headers.get("CF-Connecting-IP") || "127.0.0.1";

    // Get user agent
    const userAgent = request.headers.get("User-Agent") || "Unknown";

    // Parse time on page
    const timeOnPage = timeOnPageStr ? parseInt(timeOnPageStr, 10) : undefined;

    // Track visit
    const visitor = await trackWebsiteVisit(
      tenantId,
      ipAddress,
      pageUrl,
      userAgent,
      referrer || undefined,
      timeOnPage
    );

    // If email provided, identify visitor
    if (email) {
      await identifyWebsiteVisitor(tenantId, visitor.id, email);
    }

    // Fire specific event if provided
    if (eventType && eventType !== "PAGE_VIEW") {
      const eventData = await request.json().catch(() => ({}));
      await firePixelEvent(tenantId, visitor.id, eventType, eventData);
    }

    return Response.json(
      {
        visitorId: visitor.id,
        identified: visitor.identified,
        leadScore: visitor.leadScore,
        pageViews: visitor.pageViews,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("website.pixel.failed", error);
    return Response.json(
      { error: "Tracking failed" },
      { status: 500 }
    );
  }
}

/** OPTIONS for CORS */
export async function OPTIONS() {
  return Response.json(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
