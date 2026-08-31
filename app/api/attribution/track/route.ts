import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = await request.json() as Record<string, unknown>, now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO attribution_touchpoints (id,visitor_id,contact_id,channel,source,medium,campaign,content,term,landing_page,referrer,click_id,event_type,event_value_cents,occurred_at,metadata,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), cleanText(body.visitorId, 120) || crypto.randomUUID(), cleanText(body.contactId, 80) || null,
      cleanText(body.channel, 50) || "WEB", cleanText(body.source, 120) || "Direct", cleanText(body.medium, 80) || null, cleanText(body.campaign, 160) || null,
      cleanText(body.content, 160) || null, cleanText(body.term, 160) || null, cleanText(body.landingPage, 500) || null,
      cleanText(body.referrer, 500) || null, cleanText(body.clickId, 250) || null, cleanText(body.eventType, 50) || "PAGE_VIEW",
      Math.max(0, Math.round(Number(body.value || 0) * 100)), now, JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}), now).run();
    return Response.json({ tracked: true });
  } catch {
    return Response.json({ error: "Event rejected." }, { status: 400 });
  }
}
