import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    const name = cleanText(body.name, 200);
    if (!jobId || !name) return Response.json({ error: "Job id and material name are required." }, { status: 400 });
    const job = await coreDb().prepare("SELECT id FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, jobId).first();
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_job_materials (id,tenant_id,job_id,name,quantity,unit_cost_cents,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, t.tenantId, jobId, name, Number(body.quantity) || 1, Math.round(Number(body.unitCost || 0) * 100), now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.materials.create_failed", error);
    return Response.json({ error: "Unable to add material." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Material id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM dispatch_job_materials WHERE tenant_id=? AND id=?").bind(t.tenantId, id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("dispatch.materials.delete_failed", error);
    return Response.json({ error: "Unable to remove material." }, { status: 500 });
  }
}
