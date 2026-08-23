import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

const esc = (value: unknown) => String(value || "").replaceAll("\\","\\\\").replaceAll("\n","\\n").replaceAll(",","\\,").replaceAll(";","\\;");
const stamp = (value: unknown) => new Date(String(value)).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");

export async function GET(request: Request) {
  try {
    await ensureCoreSchema(); const token = cleanText(new URL(request.url).searchParams.get("token"),160);
    const feed = token ? await coreDb().prepare("SELECT owner FROM calendar_feeds WHERE token=?").bind(token).first<{owner:string}>() : null;
    if (!feed) return new Response("Calendar feed not found",{status:404});
    const { results } = await coreDb().prepare(`SELECT b.*,e.name AS event_name FROM calendar_bookings b JOIN calendar_event_types e ON e.id=b.event_type_id
      WHERE b.assigned_to=? AND b.status IN ('CONFIRMED','RESCHEDULED') ORDER BY b.starts_at`).bind(feed.owner).all<Record<string,unknown>>();
    const events = results.map(item => ["BEGIN:VEVENT",`UID:${esc(item.id)}@cyncro`,`DTSTAMP:${stamp(item.updated_at)}`,`DTSTART:${stamp(item.starts_at)}`,`DTEND:${stamp(item.ends_at)}`,`SUMMARY:${esc(item.event_name)} · ${esc(item.customer_name)}`,`DESCRIPTION:${esc(`${item.customer_email || ""} ${item.customer_phone || ""} ${item.notes || ""}`)}`,`LOCATION:${esc(item.meeting_address || item.video_platform || item.location_mode)}`,"END:VEVENT"].join("\r\n"));
    const body = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Cyncro//Universal Calendar//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Cyncro Appointments",...events,"END:VCALENDAR"].join("\r\n");
    return new Response(body,{headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"no-store","Content-Disposition":"inline; filename=cyncro-calendar.ics"}});
  } catch (error) {
    console.error("calendar.feed.failed",error); return new Response("Unable to load calendar feed",{status:500});
  }
}
