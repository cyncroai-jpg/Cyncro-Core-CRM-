/**
 * Cyncro Automotive — Service Department API.
 *
 * A single Next.js route file (no catch-all segment) — resource, id and
 * action are query params instead of URL path segments.
 *
 * GET  /api/automotive-service?resource=technicians
 * POST /api/automotive-service?resource=technicians
 * GET  /api/automotive-service?resource=parts
 * POST /api/automotive-service?resource=parts
 * PATCH /api/automotive-service?resource=parts&id=X
 * GET  /api/automotive-service?resource=appointments
 * POST /api/automotive-service?resource=appointments
 * PATCH /api/automotive-service?resource=appointments&id=X
 * GET  /api/automotive-service?resource=repair-orders[&id=X]
 * POST /api/automotive-service?resource=repair-orders
 * PATCH /api/automotive-service?resource=repair-orders&id=X
 * GET  /api/automotive-service?resource=lines&roId=X
 * POST /api/automotive-service?resource=lines
 * DELETE /api/automotive-service?resource=lines&id=X
 * GET  /api/automotive-service?resource=summary
 */
import { cleanText, ensureCoreSchema, getTenantContext, coreDb } from "@/lib/core/db";

function uid() {
  return crypto.randomUUID();
}

async function recomputeRoTotals(db: ReturnType<typeof coreDb>, roId: string) {
  const lines = await db.prepare("SELECT line_type, quantity, unit_price_cents FROM service_ro_lines WHERE ro_id=?").bind(roId).all<{ line_type: string; quantity: number; unit_price_cents: number }>();
  let laborCents = 0, partsCents = 0, subletCents = 0;
  for (const l of lines.results || []) {
    const amount = Math.round(l.quantity * l.unit_price_cents);
    if (l.line_type === "LABOR") laborCents += amount;
    else if (l.line_type === "PART") partsCents += amount;
    else subletCents += amount;
  }
  const ro = await db.prepare("SELECT tax_cents FROM service_repair_orders WHERE id=?").bind(roId).first<{ tax_cents: number }>();
  const totalCents = laborCents + partsCents + subletCents + Number(ro?.tax_cents || 0);
  await db.prepare("UPDATE service_repair_orders SET labor_cents=?, parts_cents=?, sublet_cents=?, total_cents=?, updated_at=? WHERE id=?")
    .bind(laborCents, partsCents, subletCents, totalCents, new Date().toISOString(), roId).run();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id") || undefined;
    const roId = url.searchParams.get("roId") || undefined;

    if (resource === "technicians") {
      const { results } = await db.prepare("SELECT * FROM service_technicians WHERE tenant_id=? ORDER BY name").bind(tenant.tenantId).all();
      return Response.json({ technicians: results });
    }

    if (resource === "parts") {
      const { results } = await db.prepare("SELECT * FROM service_parts WHERE tenant_id=? ORDER BY part_number").bind(tenant.tenantId).all();
      return Response.json({ parts: results });
    }

    if (resource === "appointments") {
      const { results } = await db.prepare("SELECT * FROM service_appointments WHERE tenant_id=? ORDER BY scheduled_at").bind(tenant.tenantId).all();
      return Response.json({ appointments: results });
    }

    if (resource === "repair-orders") {
      if (id) {
        const ro = await db.prepare(`SELECT r.*, t.name AS technician_name FROM service_repair_orders r LEFT JOIN service_technicians t ON t.id=r.technician_id WHERE r.tenant_id=? AND r.id=?`).bind(tenant.tenantId, id).first();
        if (!ro) return Response.json({ error: "Repair order not found." }, { status: 404 });
        const lines = await db.prepare("SELECT * FROM service_ro_lines WHERE ro_id=? ORDER BY created_at").bind(id).all();
        return Response.json({ repairOrder: ro, lines: lines.results });
      }
      const { results } = await db.prepare(`SELECT r.*, t.name AS technician_name FROM service_repair_orders r LEFT JOIN service_technicians t ON t.id=r.technician_id WHERE r.tenant_id=? ORDER BY r.opened_at DESC LIMIT 200`).bind(tenant.tenantId).all();
      return Response.json({ repairOrders: results });
    }

    if (resource === "lines") {
      if (!roId) return Response.json({ error: "roId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM service_ro_lines WHERE tenant_id=? AND ro_id=? ORDER BY created_at").bind(tenant.tenantId, roId).all();
      return Response.json({ lines: results });
    }

    if (resource === "summary") {
      const [open, waitingParts, dueToday, revenueRow] = await Promise.all([
        db.prepare("SELECT COUNT(*) c FROM service_repair_orders WHERE tenant_id=? AND status NOT IN ('INVOICED','CLOSED')").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM service_repair_orders WHERE tenant_id=? AND status='WAITING_PARTS'").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM service_appointments WHERE tenant_id=? AND date(scheduled_at)=date('now')").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COALESCE(SUM(total_cents),0) c FROM service_repair_orders WHERE tenant_id=? AND status IN ('INVOICED','CLOSED')").bind(tenant.tenantId).first<{ c: number }>(),
      ]);
      return Response.json({
        openRepairOrders: Number(open?.c || 0),
        waitingOnParts: Number(waitingParts?.c || 0),
        appointmentsToday: Number(dueToday?.c || 0),
        totalServiceRevenueCents: Number(revenueRow?.c || 0),
      });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_service.get_failed", error);
    return Response.json({ error: "Unable to load service data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "technicians") {
      const name = cleanText(body.name, 200);
      if (!name) return Response.json({ error: "name is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO service_technicians (id,tenant_id,name,email,specialty,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)`)
        .bind(id, tenant.tenantId, name, cleanText(body.email, 254) || null, cleanText(body.specialty, 200) || null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "parts") {
      const partNumber = cleanText(body.partNumber, 60);
      if (!partNumber) return Response.json({ error: "partNumber is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO service_parts (id,tenant_id,part_number,description,quantity_on_hand,reorder_threshold,cost_cents,price_cents,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, partNumber, cleanText(body.description, 300) || null,
          Number(body.quantityOnHand || 0), Number(body.reorderThreshold || 0),
          Math.round(Number(body.cost || 0) * 100), Math.round(Number(body.price || 0) * 100), now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "appointments") {
      const customerName = cleanText(body.customerName, 200);
      const scheduledAt = cleanText(body.scheduledAt, 40);
      if (!customerName || !scheduledAt) return Response.json({ error: "customerName and scheduledAt are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO service_appointments
        (id,tenant_id,customer_id,customer_name,customer_phone,vehicle_description,vin,requested_service,scheduled_at,advisor_email,status,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, cleanText(body.customerId, 80) || null, customerName, cleanText(body.customerPhone, 40) || null,
          cleanText(body.vehicleDescription, 200) || null, cleanText(body.vin, 20) || null, cleanText(body.requestedService, 500) || null,
          scheduledAt, cleanText(body.advisorEmail, 254) || tenant.email, "SCHEDULED", cleanText(body.notes, 1000) || null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "repair-orders") {
      const customerName = cleanText(body.customerName, 200);
      if (!customerName) return Response.json({ error: "customerName is required." }, { status: 400 });
      const id = uid();
      const countRow = await db.prepare("SELECT COUNT(*) c FROM service_repair_orders WHERE tenant_id=?").bind(tenant.tenantId).first<{ c: number }>();
      const roNumber = `RO-${String(1000 + Number(countRow?.c || 0) + 1)}`;
      await db.prepare(`INSERT INTO service_repair_orders
        (id,tenant_id,ro_number,customer_id,customer_name,customer_phone,vin,year,make,model,mileage_in,advisor_email,technician_id,
         complaint,status,promised_at,opened_at,labor_cents,parts_cents,sublet_cents,tax_cents,total_cents,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,0,?,?)`)
        .bind(
          id, tenant.tenantId, roNumber, cleanText(body.customerId, 80) || null, customerName, cleanText(body.customerPhone, 40) || null,
          cleanText(body.vin, 20) || null, body.year !== undefined ? Number(body.year) : null, cleanText(body.make, 60) || null, cleanText(body.model, 60) || null,
          body.mileageIn !== undefined ? Number(body.mileageIn) : null, cleanText(body.advisorEmail, 254) || tenant.email,
          cleanText(body.technicianId, 80) || null, cleanText(body.complaint, 1000) || null, "OPEN",
          cleanText(body.promisedAt, 40) || null, now, now, now,
        ).run();
      return Response.json({ id, roNumber }, { status: 201 });
    }

    if (resource === "lines") {
      const roId = cleanText(body.roId, 80);
      const lineType = cleanText(body.lineType, 20);
      const description = cleanText(body.description, 300);
      if (!roId || !lineType || !description) return Response.json({ error: "roId, lineType, and description are required." }, { status: 400 });
      const id = uid();
      const partId = cleanText(body.partId, 80) || null;
      await db.prepare(`INSERT INTO service_ro_lines (id,tenant_id,ro_id,line_type,description,part_id,quantity,unit_price_cents,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, roId, lineType, description, partId, Number(body.quantity || 1), Math.round(Number(body.unitPrice || 0) * 100), now).run();
      if (partId) {
        await db.prepare("UPDATE service_parts SET quantity_on_hand = quantity_on_hand - ?, updated_at=? WHERE id=?").bind(Number(body.quantity || 1), now, partId).run();
      }
      await recomputeRoTotals(db, roId);
      return Response.json({ id }, { status: 201 });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_service.post_failed", error);
    return Response.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "parts") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.quantityOnHand !== undefined) { updates.push("quantity_on_hand=?"); vals.push(Number(body.quantityOnHand)); }
      if (body.price !== undefined) { updates.push("price_cents=?"); vals.push(Math.round(Number(body.price) * 100)); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE service_parts SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "appointments") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 20)); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE service_appointments SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "repair-orders") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) {
        const status = cleanText(body.status, 20);
        updates.push("status=?"); vals.push(status);
        if (status === "CLOSED" || status === "INVOICED") { updates.push("closed_at=?"); vals.push(now); }
      }
      if (body.technicianId !== undefined) { updates.push("technician_id=?"); vals.push(cleanText(body.technicianId, 80) || null); }
      if (body.cause !== undefined) { updates.push("cause=?"); vals.push(cleanText(body.cause, 1000) || null); }
      if (body.correction !== undefined) { updates.push("correction=?"); vals.push(cleanText(body.correction, 1000) || null); }
      if (body.taxCents !== undefined) { updates.push("tax_cents=?"); vals.push(Math.round(Number(body.taxCents))); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE service_repair_orders SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      if (body.taxCents !== undefined) await recomputeRoTotals(db, id);
      return Response.json({ updated: true });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_service.patch_failed", error);
    return Response.json({ error: "Unable to update." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    if (resource === "lines") {
      const row = await db.prepare("SELECT ro_id FROM service_ro_lines WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first<{ ro_id: string }>();
      await db.prepare("DELETE FROM service_ro_lines WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).run();
      if (row) await recomputeRoTotals(db, row.ro_id);
      return Response.json({ deleted: true });
    }
    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_service.delete_failed", error);
    return Response.json({ error: "Unable to delete." }, { status: 500 });
  }
}
