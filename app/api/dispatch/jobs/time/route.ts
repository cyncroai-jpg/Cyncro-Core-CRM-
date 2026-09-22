import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

/** GET ?from&to (ISO) or ?open=1: time entries with tech and job names, newest first. */
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const url = new URL(request.url);
    const open = url.searchParams.get("open") === "1";
    const from = cleanText(url.searchParams.get("from"), 40) || new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = cleanText(url.searchParams.get("to"), 40) || new Date(Date.now() + 86_400_000).toISOString();
    const { results } = await coreDb().prepare(`
      SELECT e.*, tech.name tech_name, j.service_type, j.address, c.name customer_name
      FROM dispatch_job_time_entries e
      LEFT JOIN dispatch_technicians tech ON tech.id=e.tech_id
      LEFT JOIN dispatch_jobs j ON j.id=e.job_id
      LEFT JOIN dispatch_customers c ON c.id=j.customer_id
      WHERE e.tenant_id=? AND (${open ? "e.clock_out_at IS NULL" : "e.clock_in_at BETWEEN ? AND ?"})
      ORDER BY e.clock_in_at DESC LIMIT 500`).bind(...(open ? [t.tenantId] : [t.tenantId, from, to])).all();
    return Response.json({ entries: results });
  } catch (error) {
    console.error("dispatch.time.list_failed", error);
    return Response.json({ error: "Unable to load time entries." }, { status: 500 });
  }
}

// Toggle clock in/out for a job. If an open entry (no clock_out_at) exists, closes it; otherwise opens one.
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    if (!jobId) return Response.json({ error: "Job id is required." }, { status: 400 });
    const db = coreDb();
    const job = await db.prepare("SELECT id FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, jobId).first();
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
    const now = new Date().toISOString();
    const techId = cleanText(body.techId, 80) || null;
    const open = techId
      ? await db.prepare("SELECT id FROM dispatch_job_time_entries WHERE tenant_id=? AND job_id=? AND tech_id=? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1").bind(t.tenantId, jobId, techId).first<{ id: string }>()
      : await db.prepare("SELECT id FROM dispatch_job_time_entries WHERE tenant_id=? AND job_id=? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1").bind(t.tenantId, jobId).first<{ id: string }>();
    if (open) {
      await db.prepare("UPDATE dispatch_job_time_entries SET clock_out_at=? WHERE id=?").bind(now, open.id).run();
      return Response.json({ clockedIn: false, entryId: open.id });
    }
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO dispatch_job_time_entries (id,tenant_id,job_id,tech_id,clock_in_at,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, t.tenantId, jobId, techId, now, now).run();
    if (body.startJob !== false) await db.prepare("UPDATE dispatch_jobs SET status=CASE WHEN status IN ('BOOKED','ASSIGNED') THEN 'IN PROGRESS' ELSE status END, updated_at=? WHERE tenant_id=? AND id=?").bind(now, t.tenantId, jobId).run();
    return Response.json({ clockedIn: true, entryId: id });
  } catch (error) {
    console.error("dispatch.time.toggle_failed", error);
    return Response.json({ error: "Unable to update time entry." }, { status: 500 });
  }
}
