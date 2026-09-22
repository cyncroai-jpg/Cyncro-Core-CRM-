import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    const text = cleanText(body.body, 4000);
    if (!jobId || !text) return Response.json({ error: "Job id and note text are required." }, { status: 400 });
    const job = await coreDb().prepare("SELECT id FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, jobId).first();
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_job_notes (id,tenant_id,job_id,author,body,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, t.tenantId, jobId, t.email, text, now).run();
    return Response.json({ id, created_at: now }, { status: 201 });
  } catch (error) {
    console.error("dispatch.notes.create_failed", error);
    return Response.json({ error: "Unable to save note." }, { status: 500 });
  }
}
