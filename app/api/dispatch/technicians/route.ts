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

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const { results } = await coreDb().prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.assigned_tech_id=t.id AND j.status NOT IN ('COMPLETE','INVOICED')) active_jobs,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.assigned_tech_id=t.id) total_jobs
      FROM dispatch_technicians t WHERE t.active=1 ORDER BY t.name
    `).all();
    return Response.json({ technicians: results });
  } catch (error) {
    console.error("dispatch.technicians.list_failed", error);
    return Response.json({ error: "Unable to load technicians." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Technician name is required." }, { status: 400 });
    const role = ["OWNER", "DISPATCHER", "MANAGER", "TECHNICIAN"].includes(String(body.role || "").toUpperCase()) ? String(body.role).toUpperCase() : "TECHNICIAN";
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO dispatch_technicians (id,name,email,phone,role,hourly_rate_cents,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)")
      .bind(id, name, cleanText(body.email, 254) || null, cleanText(body.phone, 40) || null, role, Math.round(Number(body.hourlyRate || 0) * 100), now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.technicians.create_failed", error);
    return Response.json({ error: "Unable to add technician." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Technician id is required." }, { status: 400 });
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) { updates.push("name=?"); vals.push(cleanText(body.name, 160)); }
    if (body.email !== undefined) { updates.push("email=?"); vals.push(cleanText(body.email, 254) || null); }
    if (body.phone !== undefined) { updates.push("phone=?"); vals.push(cleanText(body.phone, 40) || null); }
    if (body.role !== undefined) { updates.push("role=?"); vals.push(String(body.role).toUpperCase()); }
    if (body.active !== undefined) { updates.push("active=?"); vals.push(body.active ? 1 : 0); }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(id);
    await coreDb().prepare(`UPDATE dispatch_technicians SET ${updates.join(",")} WHERE id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.technicians.update_failed", error);
    return Response.json({ error: "Unable to update technician." }, { status: 500 });
  }
}
