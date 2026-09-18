import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

async function requireDispatchAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT role,active FROM workspace_members WHERE email=?").bind(email).first<{ role: string; active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

// Toggle clock in/out for a job. If an open entry (no clock_out_at) exists, closes it; otherwise opens one.
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    if (!jobId) return Response.json({ error: "Job id is required." }, { status: 400 });
    const db = coreDb();
    const now = new Date().toISOString();
    const open = await db.prepare("SELECT id FROM dispatch_job_time_entries WHERE job_id=? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1").bind(jobId).first<{ id: string }>();
    if (open) {
      await db.prepare("UPDATE dispatch_job_time_entries SET clock_out_at=? WHERE id=?").bind(now, open.id).run();
      return Response.json({ clockedIn: false });
    }
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO dispatch_job_time_entries (id,job_id,tech_id,clock_in_at,created_at) VALUES (?,?,?,?,?)")
      .bind(id, jobId, cleanText(body.techId, 80) || null, now, now).run();
    return Response.json({ clockedIn: true });
  } catch (error) {
    console.error("dispatch.time.toggle_failed", error);
    return Response.json({ error: "Unable to update time entry." }, { status: 500 });
  }
}
