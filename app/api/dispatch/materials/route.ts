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
    const name = cleanText(body.name, 200);
    if (!jobId || !name) return Response.json({ error: "Job id and material name are required." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_job_materials (id,job_id,name,quantity,unit_cost_cents,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, jobId, name, Number(body.quantity) || 1, Math.round(Number(body.unitCost || 0) * 100), now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.materials.create_failed", error);
    return Response.json({ error: "Unable to add material." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Material id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM dispatch_job_materials WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("dispatch.materials.delete_failed", error);
    return Response.json({ error: "Unable to remove material." }, { status: 500 });
  }
}
