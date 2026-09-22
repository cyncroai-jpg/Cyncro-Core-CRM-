import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { geocodeAddress } from "@/lib/core/geocode";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";
import { syncGoogleJob } from "@/lib/dispatch/google";

const STATUSES = ["BOOKED", "ASSIGNED", "IN PROGRESS", "COMPLETE", "INVOICED", "CANCELLED"];

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const job = await db.prepare(`
        SELECT j.*, c.name customer_name, c.phone customer_phone, c.email customer_email, t.name tech_name
        FROM dispatch_jobs j
        LEFT JOIN dispatch_customers c ON c.id=j.customer_id
        LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
        WHERE j.tenant_id=? AND j.id=?
      `).bind(t.tenantId, id).first();
      if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
      const notes = await db.prepare("SELECT * FROM dispatch_job_notes WHERE job_id=? ORDER BY created_at DESC").bind(id).all();
      const materials = await db.prepare("SELECT * FROM dispatch_job_materials WHERE job_id=? ORDER BY created_at").bind(id).all();
      const time = await db.prepare("SELECT * FROM dispatch_job_time_entries WHERE job_id=? ORDER BY clock_in_at DESC").bind(id).all();
      const invoice = await db.prepare("SELECT * FROM dispatch_invoices WHERE job_id=?").bind(id).first();
      return Response.json({ job, notes: notes.results, materials: materials.results, time: time.results, invoice });
    }
    if (url.searchParams.get("summary") === "1") {
      // Work-order readiness in one query: documentation, labor and billing per job.
      const { results } = await db.prepare(`
        SELECT j.*, c.name customer_name, c.phone customer_phone, t.name tech_name,
          (SELECT COUNT(*) FROM dispatch_job_notes n WHERE n.job_id=j.id) AS notes_count,
          (SELECT COUNT(*) FROM dispatch_job_materials m WHERE m.job_id=j.id) AS materials_count,
          (SELECT COALESCE(SUM(m.quantity*m.unit_cost_cents),0) FROM dispatch_job_materials m WHERE m.job_id=j.id) AS materials_cents,
          (SELECT COALESCE(SUM((julianday(COALESCE(e.clock_out_at, CURRENT_TIMESTAMP)) - julianday(e.clock_in_at))*1440),0) FROM dispatch_job_time_entries e WHERE e.job_id=j.id) AS labor_minutes,
          (SELECT COUNT(*) FROM dispatch_job_time_entries e WHERE e.job_id=j.id AND e.clock_out_at IS NULL) AS open_clocks,
          (SELECT i.status FROM dispatch_invoices i WHERE i.job_id=j.id ORDER BY i.created_at DESC LIMIT 1) AS invoice_status,
          (SELECT i.amount_cents FROM dispatch_invoices i WHERE i.job_id=j.id ORDER BY i.created_at DESC LIMIT 1) AS invoice_cents,
          (SELECT i.id FROM dispatch_invoices i WHERE i.job_id=j.id ORDER BY i.created_at DESC LIMIT 1) AS invoice_id
        FROM dispatch_jobs j
        LEFT JOIN dispatch_customers c ON c.id=j.customer_id
        LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
        WHERE j.tenant_id=?
        ORDER BY j.scheduled_at DESC LIMIT 300
      `).bind(t.tenantId).all();
      return Response.json({ jobs: results });
    }
    const { results } = await db.prepare(`
      SELECT j.*, c.name customer_name, t.name tech_name
      FROM dispatch_jobs j
      LEFT JOIN dispatch_customers c ON c.id=j.customer_id
      LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id
      WHERE j.tenant_id=?
      ORDER BY j.scheduled_at DESC LIMIT 200
    `).bind(t.tenantId).all();
    return Response.json({ jobs: results });
  } catch (error) {
    console.error("dispatch.jobs.list_failed", error);
    return Response.json({ error: "Unable to load jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const customerId = cleanText(body.customerId, 80);
    const serviceType = cleanText(body.serviceType, 200);
    const address = cleanText(body.address, 300);
    const scheduledAt = cleanText(body.scheduledAt, 40);
    if (!customerId || !serviceType || !address || !scheduledAt) {
      return Response.json({ error: "Customer, service type, address, and schedule time are required." }, { status: 400 });
    }
    const owner = await coreDb().prepare("SELECT id FROM dispatch_customers WHERE tenant_id=? AND id=?").bind(t.tenantId, customerId).first();
    if (!owner) return Response.json({ error: "Customer not found." }, { status: 404 });
    const assignedTechId = cleanText(body.assignedTechId, 80) || null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO dispatch_jobs
      (id,tenant_id,customer_id,property_id,service_type,description,address,scheduled_at,status,assigned_tech_id,revenue_cents,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id, t.tenantId, customerId, cleanText(body.propertyId, 80) || null, serviceType, cleanText(body.description, 2000) || null,
        address, scheduledAt, assignedTechId ? "ASSIGNED" : "BOOKED", assignedTechId,
        Math.round(Number(body.revenue || 0) * 100), Number(body.estimatedMinutes) || null, now, now,
      ).run();
    const point = await geocodeAddress(address);
    if (point) await coreDb().prepare("UPDATE dispatch_jobs SET lat=?, lng=? WHERE id=?").bind(point.lat, point.lng, id).run();
    const google = await syncGoogleJob(t.email, t.tenantId, id);
    return Response.json({ id, google }, { status: 201 });
  } catch (error) {
    console.error("dispatch.jobs.create_failed", error);
    return Response.json({ error: "Unable to create job." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
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
    vals.push(t.tenantId, id);
    await coreDb().prepare(`UPDATE dispatch_jobs SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
    const google = body.scheduledAt !== undefined || body.status !== undefined || body.assignedTechId !== undefined ? await syncGoogleJob(t.email, t.tenantId, id) : "skipped";
    return Response.json({ updated: true, google });
  } catch (error) {
    console.error("dispatch.jobs.update_failed", error);
    return Response.json({ error: "Unable to update job." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Job id is required." }, { status: 400 });
    const own = await coreDb().prepare("SELECT id FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, id).first();
    if (!own) return Response.json({ error: "Job not found." }, { status: 404 });
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
