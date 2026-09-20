import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { geocodeAddress } from "@/lib/core/geocode";

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

const STATUSES = ["BOOKED", "ASSIGNED", "IN PROGRESS", "COMPLETE", "INVOICED", "CANCELLED"];

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const job = await db.prepare(`
        SELECT j.*, c.name customer_name, c.phone customer_phone, c.email customer_email, t.name tech_name
        FROM dispatch_jobs j
        LEFT JOIN dispatch_customers c ON c.id=j.customer_id
        LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
        WHERE j.id=?
      `).bind(id).first();
      if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
      const notes = await db.prepare("SELECT * FROM dispatch_job_notes WHERE job_id=? ORDER BY created_at DESC").bind(id).all();
      const materials = await db.prepare("SELECT * FROM dispatch_job_materials WHERE job_id=? ORDER BY created_at").bind(id).all();
      const time = await db.prepare("SELECT * FROM dispatch_job_time_entries WHERE job_id=? ORDER BY clock_in_at DESC").bind(id).all();
      const invoice = await db.prepare("SELECT * FROM dispatch_invoices WHERE job_id=?").bind(id).first();
      return Response.json({ job, notes: notes.results, materials: materials.results, time: time.results, invoice });
    }
    const { results } = await db.prepare(`
      SELECT j.*, c.name customer_name, t.name tech_name
      FROM dispatch_jobs j
      LEFT JOIN dispatch_customers c ON c.id=j.customer_id
      LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
      ORDER BY j.scheduled_at DESC LIMIT 200
    `).all();
    return Response.json({ jobs: results });
  } catch (error) {
    console.error("dispatch.jobs.list_failed", error);
    return Response.json({ error: "Unable to load jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const customerId = cleanText(body.customerId, 80);
    const serviceType = cleanText(body.serviceType, 200);
    const address = cleanText(body.address, 300);
    const scheduledAt = cleanText(body.scheduledAt, 40);
    if (!customerId || !serviceType || !address || !scheduledAt) {
      return Response.json({ error: "Customer, service type, address, and schedule time are required." }, { status: 400 });
    }
    const assignedTechId = cleanText(body.assignedTechId, 80) || null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO dispatch_jobs
      (id,customer_id,property_id,service_type,description,address,scheduled_at,status,assigned_tech_id,revenue_cents,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id, customerId, cleanText(body.propertyId, 80) || null, serviceType, cleanText(body.description, 2000) || null,
        address, scheduledAt, assignedTechId ? "ASSIGNED" : "BOOKED", assignedTechId,
        Math.round(Number(body.revenue || 0) * 100), Number(body.estimatedMinutes) || null, now, now,
      ).run();
    const point = await geocodeAddress(address);
    if (point) await coreDb().prepare("UPDATE dispatch_jobs SET lat=?, lng=? WHERE id=?").bind(point.lat, point.lng, id).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.jobs.create_failed", error);
    return Response.json({ error: "Unable to create job." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Job id is required." }, { status: 400 });
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!STATUSES.includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
      updates.push("status=?"); vals.push(status);
    }
    if (body.assignedTechId !== undefined) { updates.push("assigned_tech_id=?"); vals.push(cleanText(body.assignedTechId, 80) || null); }
    if (body.scheduledAt !== undefined) { updates.push("scheduled_at=?"); vals.push(cleanText(body.scheduledAt, 40)); }
    if (body.description !== undefined) { updates.push("description=?"); vals.push(cleanText(body.description, 2000) || null); }
    if (body.revenue !== undefined) { updates.push("revenue_cents=?"); vals.push(Math.round(Number(body.revenue) * 100)); }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(id);
    await coreDb().prepare(`UPDATE dispatch_jobs SET ${updates.join(",")} WHERE id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.jobs.update_failed", error);
    return Response.json({ error: "Unable to update job." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Job id is required." }, { status: 400 });
    await coreDb().batch([
      coreDb().prepare("DELETE FROM dispatch_job_notes WHERE job_id=?").bind(id),
      coreDb().prepare("DELETE FROM dispatch_job_materials WHERE job_id=?").bind(id),
      coreDb().prepare("DELETE FROM dispatch_job_time_entries WHERE job_id=?").bind(id),
      coreDb().prepare("DELETE FROM dispatch_jobs WHERE id=?").bind(id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("dispatch.jobs.delete_failed", error);
    return Response.json({ error: "Unable to cancel job." }, { status: 500 });
  }
}
