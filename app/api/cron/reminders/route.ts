/**
 * Appointment reminder cron handler.
 *
 * Cloudflare triggers this route on a schedule (every 30 minutes).
 * It scans upcoming CONFIRMED/RESCHEDULED bookings and sends:
 *   - 24-hour reminders  (reminder_24h_sent = 0, booking starts 22–26 h from now)
 *   - 1-hour reminders   (reminder_1h_sent  = 0, booking starts 45–75 min from now)
 *
 * The route is also callable via GET with a secret header for manual testing:
 *   curl -H "x-cron-secret: <CRON_SECRET>" https://your-domain.com/api/cron/reminders
 */

import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { sendEmail, bookingReminderEmail } from "@/lib/core/email";
import { env } from "cloudflare:workers";

type Env = Record<string, string | undefined>;

function cronSecret(): string | null {
  return (env as Env).CRON_SECRET || null;
}

async function runReminders(): Promise<{ sent24h: number; sent1h: number; errors: number }> {
  await ensureCoreSchema();
  const db = coreDb();
  const now = new Date();
  let sent24h = 0, sent1h = 0, errors = 0;

  // ── 24-hour window: booking starts between 22h and 26h from now ───────────
  const window24Start = new Date(now.getTime() + 22 * 60 * 60 * 1000).toISOString();
  const window24End   = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

  const { results: results24h } = await db.prepare(`
    SELECT b.id, b.customer_name, b.customer_email, b.starts_at, b.timezone,
           b.location_mode, b.video_platform, b.meeting_address, b.assigned_to,
           e.name AS event_name
    FROM calendar_bookings b
    JOIN calendar_event_types e ON e.id = b.event_type_id
    WHERE b.status IN ('CONFIRMED','RESCHEDULED')
      AND b.reminder_24h_sent = 0
      AND b.customer_email IS NOT NULL
      AND b.starts_at >= ? AND b.starts_at < ?
  `).bind(window24Start, window24End).all<{
    id: string; customer_name: string; customer_email: string;
    starts_at: string; timezone: string; location_mode: string;
    video_platform: string | null; meeting_address: string | null;
    assigned_to: string; event_name: string;
  }>();

  for (const booking of results24h) {
    try {
      const { subject, html } = bookingReminderEmail({
        customerName: booking.customer_name,
        eventName: booking.event_name,
        startsAt: booking.starts_at,
        timezone: booking.timezone || "UTC",
        locationMode: booking.location_mode,
        videoPlatform: booking.video_platform,
        meetingAddress: booking.meeting_address,
        assignedTo: booking.assigned_to,
        hoursUntil: 24,
      });
      const ok = await sendEmail({ to: booking.customer_email, subject, html });
      if (ok) {
        await db.prepare("UPDATE calendar_bookings SET reminder_24h_sent=1 WHERE id=?").bind(booking.id).run();
        sent24h++;
      }
    } catch (err) {
      console.error("cron.reminder_24h.failed", booking.id, err);
      errors++;
    }
  }

  // ── 1-hour window: booking starts between 45 min and 75 min from now ──────
  const window1hStart = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
  const window1hEnd   = new Date(now.getTime() + 75 * 60 * 1000).toISOString();

  const { results: results1h } = await db.prepare(`
    SELECT b.id, b.customer_name, b.customer_email, b.starts_at, b.timezone,
           b.location_mode, b.video_platform, b.meeting_address, b.assigned_to,
           e.name AS event_name
    FROM calendar_bookings b
    JOIN calendar_event_types e ON e.id = b.event_type_id
    WHERE b.status IN ('CONFIRMED','RESCHEDULED')
      AND b.reminder_1h_sent = 0
      AND b.customer_email IS NOT NULL
      AND b.starts_at >= ? AND b.starts_at < ?
  `).bind(window1hStart, window1hEnd).all<{
    id: string; customer_name: string; customer_email: string;
    starts_at: string; timezone: string; location_mode: string;
    video_platform: string | null; meeting_address: string | null;
    assigned_to: string; event_name: string;
  }>();

  for (const booking of results1h) {
    try {
      const { subject, html } = bookingReminderEmail({
        customerName: booking.customer_name,
        eventName: booking.event_name,
        startsAt: booking.starts_at,
        timezone: booking.timezone || "UTC",
        locationMode: booking.location_mode,
        videoPlatform: booking.video_platform,
        meetingAddress: booking.meeting_address,
        assignedTo: booking.assigned_to,
        hoursUntil: 1,
      });
      const ok = await sendEmail({ to: booking.customer_email, subject, html });
      if (ok) {
        await db.prepare("UPDATE calendar_bookings SET reminder_1h_sent=1 WHERE id=?").bind(booking.id).run();
        sent1h++;
      }
    } catch (err) {
      console.error("cron.reminder_1h.failed", booking.id, err);
      errors++;
    }
  }

  return { sent24h, sent1h, errors };
}

// ── GET: manual trigger (protected by CRON_SECRET header) ───────────────────
export async function GET(request: Request) {
  const secret = cronSecret();
  if (secret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
  }
  try {
    const result = await runReminders();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("cron.reminders.failed", error);
    return Response.json({ error: "Reminder job failed." }, { status: 500 });
  }
}

// ── POST: called by the Cloudflare Cron Trigger (via worker/index.ts) ────────
export async function POST(_request: Request) {
  try {
    const result = await runReminders();
    console.info("cron.reminders.done", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("cron.reminders.failed", error);
    return Response.json({ error: "Reminder job failed." }, { status: 500 });
  }
}

// Export runReminders so the worker scheduled handler can call it directly
export { runReminders };
