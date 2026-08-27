import { env } from "cloudflare:workers";
import { coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const values = env as unknown as Record<string, unknown>;
    const eventTypes = (await coreDb().prepare("SELECT id,name,slug,duration_minutes,active FROM calendar_event_types WHERE active=1 ORDER BY name").all()).results;
    const origin = new URL(request.url).origin;
    const googleConnection = await coreDb().prepare("SELECT account_email FROM calendar_oauth_connections WHERE owner=? AND provider='GOOGLE'").bind(requestUser(request)).first<{account_email?:string}>();
    return Response.json({
      connections: {
        meta: Boolean(values.META_APP_ID && values.META_APP_SECRET && values.META_PAGE_ACCESS_TOKEN),
        twilio: Boolean(values.TWILIO_ACCOUNT_SID && values.TWILIO_AUTH_TOKEN && values.TWILIO_PHONE_NUMBER),
        resend: Boolean(values.RESEND_API_KEY && values.EMAIL_FROM),
        googleCalendar: Boolean(googleConnection),
        framer: Boolean(values.FRAMER_WEBHOOK_SECRET),
        stripe: Boolean(values.STRIPE_SECRET_KEY),
      },
      eventTypes: eventTypes.map((item) => ({ ...item, bookingUrl: `${origin}/?event=${encodeURIComponent(String(item.slug))}#book` })),
      framerWebhookUrl: `${origin}/api/integrations/framer`,
      googleCalendarConfigured: Boolean(values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET),
      googleCalendarAccount: googleConnection?.account_email || null,
      currentUser: requestUser(request),
    });
  } catch (error) {
    console.error("integrations.status_failed", error);
    return Response.json({ error: "Unable to load integration status." }, { status: 500 });
  }
}
