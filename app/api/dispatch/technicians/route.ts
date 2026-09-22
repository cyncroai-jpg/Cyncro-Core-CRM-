import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const { results } = await coreDb().prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.assigned_tech_id=t.id AND j.status NOT IN ('COMPLETE','INVOICED')) active_jobs,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.assigned_tech_id=t.id) total_jobs
      FROM dispatch_technicians t WHERE t.tenant_id=? AND t.active=1 ORDER BY t.name
    `).bind(t.tenantId).all();
    return Response.json({ technicians: results });
  } catch (error) {
    console.error("dispatch.technicians.list_failed", error);
    return Response.json({ error: "Unable to load technicians." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Technician name is required." }, { status: 400 });
    const role = ["OWNER", "DISPATCHER", "MANAGER", "TECHNICIAN", "LEAD"].includes(String(body.role || "").toUpperCase()) ? String(body.role).toUpperCase() : "TECHNICIAN";
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_technicians (id,tenant_id,name,email,phone,role,hourly_rate_cents,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)")
      .bind(id, t.tenantId, name, cleanText(body.email, 254) || null, cleanText(body.phone, 40) || null, role, Math.round(Number(body.hourlyRate || 0) * 100), now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.technicians.create_failed", error);
    return Response.json({ error: "Unable to add technician." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Technician id is required." }, { status: 400 });
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) { updates.push("name=?"); vals.push(cleanText(body.name, 160)); }
    if (body.email !== undefined) { updates.push("email=?"); vals.push(cleanText(body.email, 254) || null); }
    if (body.phone !== undefined) { updates.push("phone=?"); vals.push(cleanText(body.phone, 40) || null); }
    if (body.role !== undefined) { updates.push("role=?"); vals.push(String(body.role).toUpperCase()); }
    if (body.hourlyRate !== undefined) { updates.push("hourly_rate_cents=?"); vals.push(Math.round(Number(body.hourlyRate || 0) * 100)); }
    if (body.active !== undefined) { updates.push("active=?"); vals.push(body.active ? 1 : 0); }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(t.tenantId, id);
    await coreDb().prepare(`UPDATE dispatch_technicians SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.technicians.update_failed", error);
    return Response.json({ error: "Unable to update technician." }, { status: 500 });
  }
}
