/**
 * Public event-tracking endpoint. No auth — this is called from landing
 * pages and embedded forms before anyone is identified. Resolves/creates
 * the visitor+session (first-party cookies), records the real event, and
 * denormalizes source/campaign onto it so attribution never needs a join.
 */
import { ensureGrowthSchema } from "@/lib/growth/db";
import { resolveVisitorSession, recordEvent, type GrowthEventType } from "@/lib/growth/events";
import { readCookie, setCookie, VISITOR_COOKIE, SESSION_COOKIE, VISITOR_MAX_AGE, SESSION_MAX_AGE } from "@/lib/growth/http";

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    const body = (await request.json()) as {
      eventType?: string; valueCents?: number; formId?: string; landingPageId?: string; linkId?: string;
      utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string;
      referrer?: string; landingPageUrl?: string; device?: string; metadata?: Record<string, unknown>;
    };
    const eventType = String(body.eventType || "").trim();
    if (!eventType) return Response.json({ error: "eventType is required." }, { status: 400 });

    const visitorCookie = readCookie(request, VISITOR_COOKIE);
    const sessionCookie = readCookie(request, SESSION_COOKIE);
    const { visitorId, sessionId } = await resolveVisitorSession(visitorCookie, sessionCookie, {
      utmSource: body.utmSource || null, utmMedium: body.utmMedium || null, utmCampaign: body.utmCampaign || null,
      utmContent: body.utmContent || null, utmTerm: body.utmTerm || null,
      referrer: body.referrer || request.headers.get("referer") || null,
      landingPageUrl: body.landingPageUrl || null, device: body.device || null,
    });

    if (eventType !== "session.started" && eventType !== "visitor.created") {
      await recordEvent({
        visitorId, sessionId, eventType: eventType as GrowthEventType,
        eventValueCents: body.valueCents || 0, formId: body.formId || null, landingPageId: body.landingPageId || null,
        linkId: body.linkId || null, metadata: body.metadata || {},
      });
    }

    const headers = new Headers();
    headers.append("Set-Cookie", setCookie(VISITOR_COOKIE, visitorId, VISITOR_MAX_AGE));
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE));
    return Response.json({ visitorId, sessionId }, { headers });
  } catch (error) {
    console.error("growth.track_failed", error);
    return Response.json({ error: "Unable to record event." }, { status: 500 });
  }
}
