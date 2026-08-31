import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

const models = new Set(["FIRST_TOUCH", "LAST_TOUCH", "LINEAR", "TIME_DECAY", "POSITION_BASED", "CUSTOM"]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const db = coreDb();
    const [touchpoints, spend, settings, print, reports] = await Promise.all([
      db.prepare(`SELECT t.*,c.full_name contact_name,o.name opportunity_name FROM attribution_touchpoints t
        LEFT JOIN crm_contacts c ON c.id=t.contact_id LEFT JOIN crm_opportunities o ON o.id=t.opportunity_id
        ORDER BY t.occurred_at DESC LIMIT 250`).all(),
      db.prepare("SELECT * FROM attribution_spend ORDER BY period_end DESC LIMIT 100").all(),
      db.prepare("SELECT * FROM attribution_settings WHERE workspace_key='default'").first(),
      db.prepare("SELECT * FROM attribution_print_campaigns ORDER BY created_at DESC").all(),
      db.prepare("SELECT * FROM attribution_reports ORDER BY updated_at DESC").all(),
    ]);
    return Response.json({ touchpoints: touchpoints.results, spend: spend.results, printCampaigns:print.results, reports:reports.results, settings: settings || { model: "LAST_TOUCH", lookback_days: 90, currency: "USD" } });
  } catch (error) {
    console.error("attribution.list_failed", error);
    return Response.json({ error: "Unable to load attribution." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, now = new Date().toISOString(), db = coreDb();
    const kind=cleanText(body.kind,20).toUpperCase();
    if(kind==="REPORT"){
      const name=cleanText(body.name,160);if(!name)return Response.json({error:"Report name required."},{status:400});
      await db.prepare("INSERT INTO attribution_reports (id,name,dimensions,metrics,filters,date_range,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),name,JSON.stringify(Array.isArray(body.dimensions)?body.dimensions:[]),JSON.stringify(Array.isArray(body.metrics)?body.metrics:[]),JSON.stringify(body.filters&&typeof body.filters==="object"?body.filters:{}),cleanText(body.dateRange,20)||"90D","workspace",now,now).run();
    } else if(kind==="PRINT"){
      const name=cleanText(body.name,160),destination=cleanText(body.destinationUrl,500),code=(cleanText(body.code,40)||crypto.randomUUID().slice(0,8)).toUpperCase();if(!name||!destination)return Response.json({error:"Campaign and destination are required."},{status:400});
      await db.prepare("INSERT INTO attribution_print_campaigns (id,name,code,destination_url,distribution_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),name,code,destination,Math.max(0,Number(body.distributionCount||0)),now,now).run();
    } else if (kind === "SPEND") {
      const campaign = cleanText(body.campaign, 160), platform = cleanText(body.platform, 50);
      if (!campaign || !platform) return Response.json({ error: "Platform and campaign are required." }, { status: 400 });
      await db.prepare(`INSERT INTO attribution_spend (id,platform,account_name,campaign,spend_cents,impressions,clicks,period_start,period_end,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), platform, cleanText(body.accountName, 120) || null, campaign,
        Math.max(0, Math.round(Number(body.spend || 0) * 100)), Math.max(0, Number(body.impressions || 0)), Math.max(0, Number(body.clicks || 0)),
        cleanText(body.periodStart, 30) || now.slice(0,10), cleanText(body.periodEnd, 30) || now.slice(0,10), now, now).run();
    } else {
      await db.prepare(`INSERT INTO attribution_touchpoints (id,visitor_id,contact_id,opportunity_id,channel,source,medium,campaign,content,term,landing_page,referrer,click_id,event_type,event_value_cents,occurred_at,metadata,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), cleanText(body.visitorId, 120) || crypto.randomUUID(), cleanText(body.contactId, 80) || null,
        cleanText(body.opportunityId, 80) || null, cleanText(body.channel, 50) || "DIRECT", cleanText(body.source, 120) || "Direct",
        cleanText(body.medium, 80) || null, cleanText(body.campaign, 160) || null, cleanText(body.content, 160) || null, cleanText(body.term, 160) || null,
        cleanText(body.landingPage, 500) || null, cleanText(body.referrer, 500) || null, cleanText(body.clickId, 250) || null,
        cleanText(body.eventType, 50) || "PAGE_VIEW", Math.max(0, Math.round(Number(body.value || 0) * 100)), cleanText(body.occurredAt, 40) || now,
        JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}), now).run();
    }
    return Response.json({ saved: true }, { status: 201 });
  } catch (error) {
    console.error("attribution.create_failed", error);
    return Response.json({ error: "Unable to save attribution data." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, model = cleanText(body.model, 40).toUpperCase();
    if (!models.has(model)) return Response.json({ error: "Invalid attribution model." }, { status: 400 });
    await coreDb().prepare(`INSERT INTO attribution_settings (workspace_key,model,lookback_days,currency,updated_at) VALUES ('default',?,?,?,?)
      ON CONFLICT(workspace_key) DO UPDATE SET model=excluded.model,lookback_days=excluded.lookback_days,currency=excluded.currency,updated_at=excluded.updated_at`)
      .bind(model, Math.min(365, Math.max(1, Number(body.lookbackDays || 90))), cleanText(body.currency, 8) || "USD", new Date().toISOString()).run();
    return Response.json({ saved: true });
  } catch (error) {
    console.error("attribution.settings_failed", error);
    return Response.json({ error: "Unable to save attribution settings." }, { status: 500 });
  }
}
