import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";

type Booking = Record<string, unknown>;
const values = () => env as unknown as Record<string, string | undefined>;

async function accessToken(owner: string) {
  const row = await coreDb().prepare("SELECT * FROM calendar_oauth_connections WHERE owner=? AND provider='GOOGLE'").bind(owner).first<Record<string, unknown>>();
  if (!row) return null;
  if (new Date(String(row.expires_at)).getTime() > Date.now() + 60_000) return String(row.access_token);
  if (!row.refresh_token) return null;
  const config = values();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID || "", client_secret: config.GOOGLE_CLIENT_SECRET || "", refresh_token: String(row.refresh_token), grant_type: "refresh_token" }) });
  if (!response.ok) return null;
  const token = await response.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  await coreDb().prepare("UPDATE calendar_oauth_connections SET access_token=?,expires_at=?,updated_at=? WHERE owner=?").bind(token.access_token, expiresAt, new Date().toISOString(), owner).run();
  return token.access_token;
}

export async function syncGoogleBooking(owner: string, booking: Booking) {
  try {
    const token = await accessToken(owner);
    if (!token) return;
    const existing = await coreDb().prepare("SELECT external_event_id FROM calendar_external_events WHERE booking_id=?").bind(String(booking.id)).first<{ external_event_id: string }>();
    const cancelled = String(booking.status) === "CANCELLED";
    const endpoint = existing ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existing.external_event_id)}` : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const response = await fetch(endpoint, { method: existing ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ summary: `${booking.event_name || "Cyncro appointment"} · ${booking.customer_name}`, description: String(booking.notes || "Booked through Cyncro Core"), location: String(booking.meeting_address || booking.video_url || ""), start: { dateTime: booking.starts_at, timeZone: booking.timezone }, end: { dateTime: booking.ends_at, timeZone: booking.timezone }, status: cancelled ? "cancelled" : "confirmed", attendees: booking.customer_email ? [{ email: booking.customer_email }] : [] }) });
    if (!response.ok) { console.error("google_calendar.sync_failed", response.status, await response.text()); return; }
    const event = await response.json() as { id?: string };
    if (!existing && event.id) await coreDb().prepare("INSERT INTO calendar_external_events (booking_id,provider,external_event_id,owner,updated_at) VALUES (?,'GOOGLE',?,?,?)").bind(String(booking.id), event.id, owner, new Date().toISOString()).run();
    else if (existing) await coreDb().prepare("UPDATE calendar_external_events SET updated_at=? WHERE booking_id=?").bind(new Date().toISOString(), String(booking.id)).run();
  } catch (error) { console.error("google_calendar.sync_exception", error); }
}
