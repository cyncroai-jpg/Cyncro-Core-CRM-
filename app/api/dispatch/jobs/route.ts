import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { geocodeAddress } from "@/lib/core/geocode";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";
import { syncGoogleJob } from "@/lib/dispatch/google";
import { emitAutomationEvent } from "@/lib/automations/engine";
import { linkContact } from "@/lib/automations/link";


const STATUSES = ["BOOKED", "ASSIGNED", "EN_ROUTE", "IN PROGRESS", "COMPLETE", "INVOICED", "CANCELLED"];

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
    const cust = await coreDb().prepare("SELECT name, email, phone FROM dispatch_customers WHERE id=?").bind(customerId).first<{ name: string; email: string | null; phone: string | null }>();
    if (cust) {
      const contactId = await linkContact(t.tenantId, { name: cust.name, email: cust.email, phone: cust.phone, source: "DISPATCH" });
      await emitAutomationEvent(t.tenantId, "JOB_CREATED", { contactId, jobId: id, serviceType, scheduledAt: scheduledAt || "", address, customerName: cust.name, customerEmail: cust.email || "", customerPhone: cust.phone || "", trigger: "JOB_CREATED" }).catch(() => 0);
    }
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
    const before = await coreDb().prepare("SELECT status, assigned_tech_id, scheduled_at FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, id).first<{ status: string; assigned_tech_id: string | null; scheduled_at: string | null }>();
    await coreDb().prepare(`UPDATE dispatch_jobs SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
    // Cross-product events: every meaningful change reaches the CRM contact and the automations.
    {
      const j = await coreDb().prepare("SELECT j.service_type, j.address, j.scheduled_at, j.status, j.assigned_tech_id, j.revenue_cents, c.name customer_name, c.email customer_email, c.phone customer_phone, c.contact_id, tech.name tech_name FROM dispatch_jobs j LEFT JOIN dispatch_customers c ON c.id=j.customer_id LEFT JOIN dispatch_technicians tech ON tech.id=j.assigned_tech_id WHERE j.id=? AND j.tenant_id=?").bind(id, t.tenantId).first<Record<string, unknown>>();
      if (j && before) {
        const contactId = String(j.contact_id || "") || await linkContact(t.tenantId, { name: String(j.customer_name || ""), email: j.customer_email as string | null, phone: j.customer_phone as string | null, source: "DISPATCH" });
        const base = { contactId, jobId: id, serviceType: String(j.service_type || ""), address: String(j.address || ""), scheduledAt: String(j.scheduled_at || ""), techName: String(j.tech_name || ""), customerName: String(j.customer_name || ""), customerEmail: String(j.customer_email || ""), customerPhone: String(j.customer_phone || "") };
        const newStatus = String(j.status || "");
        if (body.assignedTechId !== undefined && j.assigned_tech_id && j.assigned_tech_id !== before.assigned_tech_id) await emitAutomationEvent(t.tenantId, "JOB_ASSIGNED", { ...base, trigger: "JOB_ASSIGNED" }).catch(() => 0);
        if (newStatus === "EN_ROUTE" && before.status !== "EN_ROUTE") await emitAutomationEvent(t.tenantId, "JOB_EN_ROUTE", { ...base, trigger: "JOB_EN_ROUTE" }).catch(() => 0);
        if (body.scheduledAt !== undefined && String(j.scheduled_at || "") !== String(before.scheduled_at || "")) await emitAutomationEvent(t.tenantId, "JOB_RESCHEDULED", { ...base, trigger: "JOB_RESCHEDULED" }).catch(() => 0);
        if (newStatus === "COMPLETE" && before.status !== "COMPLETE" && Number(j.revenue_cents || 0) > 0 && j.customer_email) {
          // Draft the invoice from the job's revenue so nobody retypes it.
          const existing = await coreDb().prepare("SELECT invoice_id FROM dispatch_jobs WHERE id=?").bind(id).first<{ invoice_id: string | null }>();
          if (!existing?.invoice_id) {
            const invId = crypto.randomUUID(); const nowI = new Date().toISOString(); const number = `JOB-${Date.now().toString().slice(-8)}`;
            await coreDb().prepare("INSERT INTO crm_invoices (id,invoice_number,client_name,client_email,description,amount_cents,due_date,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,?,?)")
              .bind(invId, number, String(j.customer_name || ""), String(j.customer_email), `${String(j.service_type)} at ${String(j.address || "your address")}`.slice(0, 1000), Number(j.revenue_cents), new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), t.email, t.tenantId, nowI, nowI).run();
            await coreDb().prepare("UPDATE dispatch_jobs SET invoice_id=? WHERE id=?").bind(invId, id).run();
          }
        }
      }
    }
    const google = body.scheduledAt !== undefined || body.status !== undefined || body.assignedTechId !== undefined ? await syncGoogleJob(t.email, t.tenantId, id) : "skipped";
    if (String(body.status || "").toUpperCase() === "COMPLETE") {
      const done = await coreDb().prepare("SELECT j.service_type, j.customer_id, c.name customer_name, c.email customer_email, c.phone customer_phone FROM dispatch_jobs j LEFT JOIN dispatch_customers c ON c.id=j.customer_id WHERE j.id=?").bind(id).first<{ service_type: string; customer_id: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null }>();
      if (done) {
        // Dispatch customers live in their own table; link (or create) the CRM contact by email so automations can email/text them.
        let contactId = "";
        if (done.customer_email) {
          const existing = await coreDb().prepare("SELECT id FROM crm_contacts WHERE tenant_id=? AND lower(email)=lower(?)").bind(t.tenantId, done.customer_email).first<{ id: string }>();
          if (existing) contactId = existing.id;
          else { contactId = crypto.randomUUID(); const now2 = new Date().toISOString(); await coreDb().prepare("INSERT INTO crm_contacts (id,full_name,email,phone,lifecycle,source,tenant_id,created_at,updated_at) VALUES (?,?,?,?,'CUSTOMER','DISPATCH',?,?,?)").bind(contactId, done.customer_name || "Customer", done.customer_email, done.customer_phone, t.tenantId, now2, now2).run(); }
        }
        await emitAutomationEvent(t.tenantId, "JOB_COMPLETED", { contactId, jobId: id, serviceType: done.service_type, customerName: done.customer_name || "", customerEmail: done.customer_email || "", customerPhone: done.customer_phone || "", trigger: "JOB_COMPLETED" });
      }
    }
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
