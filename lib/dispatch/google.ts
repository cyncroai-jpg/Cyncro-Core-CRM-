import { coreDb } from "@/lib/core/db";
import { googleAccessToken } from "@/lib/core/google-calendar";

type JobRow = {
  id: string; service_type: string; description: string | null; address: string; scheduled_at: string; status: string;
  estimated_minutes: number | null; customer_name: string | null; customer_email: string | null; tech_name: string | null;
};

/** Is this user's Google account connected (calendar scope granted through the Calendar module)? */
export async function googleConnected(owner: string) {
  const row = await coreDb().prepare("SELECT account_email FROM calendar_oauth_connections WHERE owner=? AND provider='GOOGLE'").bind(owner).first<{ account_email: string | null }>();
  return row ? { connected: true, email: row.account_email } : { connected: false, email: null };
}

/**
 * One-way push of a dispatch job to the connected user's primary Google Calendar.
 * Creates the event the first time, patches it afterwards, cancels it when the job is cancelled.
 * Returns what happened so callers can report honestly; never throws.
 */
export async function syncGoogleJob(owner: string, tenantId: string, jobId: string): Promise<"created" | "updated" | "cancelled" | "not_connected" | "not_found" | "failed"> {
  try {
    const token = await googleAccessToken(owner);
    if (!token) return "not_connected";
    const db = coreDb();
    const job = await db.prepare(`SELECT j.id, j.service_type, j.description, j.address, j.scheduled_at, j.status, j.estimated_minutes,
        c.name customer_name, c.email customer_email, t.name tech_name
      FROM dispatch_jobs j LEFT JOIN dispatch_customers c ON c.id=j.customer_id LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
      WHERE j.tenant_id=? AND j.id=?`).bind(tenantId, jobId).first<JobRow>();
    if (!job) return "not_found";
    const existing = await db.prepare("SELECT external_event_id FROM dispatch_google_events WHERE job_id=? AND owner=?").bind(jobId, owner).first<{ external_event_id: string }>();
    const cancelled = job.status === "CANCELLED";
    if (cancelled && !existing) return "cancelled";
    const start = new Date(job.scheduled_at);
    if (Number.isNaN(start.valueOf())) return "failed";
    const end = new Date(start.getTime() + Math.max(15, Number(job.estimated_minutes) || 60) * 60_000);
    const endpoint = existing
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existing.external_event_id)}`
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const body = {
      summary: `${job.service_type} · ${job.customer_name || "Customer"}`,
      description: [job.description, job.tech_name ? `Tech: ${job.tech_name}` : null, `Status: ${job.status}`, "Scheduled in Cyncro Dispatch"].filter(Boolean).join("\n"),
      location: job.address,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      status: cancelled ? "cancelled" : "confirmed",
    };
    const response = await fetch(endpoint, { method: existing ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { console.error("dispatch.google.sync_failed", response.status, (await response.text()).slice(0, 200)); return "failed"; }
    const event = (await response.json()) as { id?: string };
    const now = new Date().toISOString();
    if (!existing && event.id) await db.prepare("INSERT INTO dispatch_google_events (job_id,owner,external_event_id,updated_at) VALUES (?,?,?,?)").bind(jobId, owner, event.id, now).run();
    else if (existing) await db.prepare("UPDATE dispatch_google_events SET updated_at=? WHERE job_id=? AND owner=?").bind(now, jobId, owner).run();
    return cancelled ? "cancelled" : existing ? "updated" : "created";
  } catch (error) {
    console.error("dispatch.google.sync_exception", error);
    return "failed";
  }
}
