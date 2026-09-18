/**
 * Public redirect + click-tracking endpoint for Cyncro tracked links.
 * GET /api/growth/go?slug=demo -> logs a real click event, then 302s to
 * the link's real destination URL, carrying the link's source/medium as
 * this visitor's session attribution so downstream form syncs and
 * attribution reports connect back to this exact link.
 */
import { coreDb, cleanText } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { resolveVisitorSession, recordEvent } from "@/lib/growth/events";
import { readCookie, setCookie, VISITOR_COOKIE, SESSION_COOKIE, VISITOR_MAX_AGE, SESSION_MAX_AGE } from "@/lib/growth/http";

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    const slug = cleanText(new URL(request.url).searchParams.get("slug"), 80);
    if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
    const db = coreDb();
    const link = await db.prepare("SELECT * FROM gi_tracked_links WHERE slug=?").bind(slug).first<Record<string, unknown>>();
    if (!link) return Response.json({ error: "Link not found." }, { status: 404 });

    const visitorCookie = readCookie(request, VISITOR_COOKIE);
    const sessionCookie = readCookie(request, SESSION_COOKIE);
    const { visitorId, sessionId } = await resolveVisitorSession(visitorCookie, sessionCookie, {
      source: String(link.source || "link"), medium: String(link.medium || "tracked-link"),
      referrer: request.headers.get("referer") || null,
    });
    await db.prepare("UPDATE gi_tracked_links SET clicks = clicks + 1 WHERE id=?").bind(link.id).run();
    await recordEvent({ visitorId, sessionId, eventType: "link.clicked", linkId: String(link.id), source: String(link.source || "link"), campaign: cleanText(String(link.campaign_id || ""), 80) || null });

    const headers = new Headers({ Location: String(link.destination_url) });
    headers.append("Set-Cookie", setCookie(VISITOR_COOKIE, visitorId, VISITOR_MAX_AGE));
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("growth.go_failed", error);
    return Response.json({ error: "Unable to resolve link." }, { status: 500 });
  }
}
