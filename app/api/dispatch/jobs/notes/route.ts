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

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    const text = cleanText(body.body, 4000);
    if (!jobId || !text) return Response.json({ error: "Job id and note text are required." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_job_notes (id,job_id,author,body,created_at) VALUES (?,?,?,?,?)")
      .bind(id, jobId, requestUser(request), text, now).run();
    return Response.json({ id, created_at: now }, { status: 201 });
  } catch (error) {
    console.error("dispatch.notes.create_failed", error);
    return Response.json({ error: "Unable to save note." }, { status: 500 });
  }
}
