import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const customer = await db.prepare("SELECT * FROM dispatch_customers WHERE tenant_id=? AND id=?").bind(t.tenantId, id).first();
      if (!customer) return Response.json({ error: "Customer not found." }, { status: 404 });
      const properties = await db.prepare("SELECT * FROM dispatch_properties WHERE tenant_id=? AND customer_id=? ORDER BY created_at").bind(t.tenantId, id).all();
      const jobs = await db.prepare("SELECT * FROM dispatch_jobs WHERE tenant_id=? AND customer_id=? ORDER BY scheduled_at DESC").bind(t.tenantId, id).all();
      return Response.json({ customer, properties: properties.results, jobs: jobs.results });
    }
    const { results } = await db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM dispatch_properties p WHERE p.customer_id=c.id) property_count,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.customer_id=c.id) job_count
      FROM dispatch_customers c WHERE c.tenant_id=? ORDER BY c.created_at DESC
    `).bind(t.tenantId).all();
    return Response.json({ customers: results });
  } catch (error) {
    console.error("dispatch.customers.list_failed", error);
    return Response.json({ error: "Unable to load customers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Customer name is required." }, { status: 400 });
    const address = cleanText(body.address, 300);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();
    const statements = [
      db.prepare("INSERT INTO dispatch_customers (id,tenant_id,name,phone,email,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, t.tenantId, name, cleanText(body.phone, 40) || null, cleanText(body.email, 254) || null, cleanText(body.notes, 2000) || null, now, now),
    ];
    let propertyId: string | null = null;
    if (address) {
      propertyId = crypto.randomUUID();
      statements.push(
        db.prepare("INSERT INTO dispatch_properties (id,tenant_id,customer_id,address,city,state,zip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(propertyId, t.tenantId, id, address, cleanText(body.city, 100) || null, cleanText(body.state, 40) || null, cleanText(body.zip, 20) || null, now, now),
      );
    }
    await db.batch(statements);
    return Response.json({ id, propertyId }, { status: 201 });
  } catch (error) {
    console.error("dispatch.customers.create_failed", error);
    return Response.json({ error: "Unable to create customer." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Customer id is required." }, { status: 400 });
    const updates: string[] = [];
    const vals: unknown[] = [];
    for (const [key, col] of [["name", "name"], ["phone", "phone"], ["email", "email"], ["notes", "notes"]] as const) {
      if (body[key] !== undefined) { updates.push(`${col}=?`); vals.push(cleanText(body[key], col === "notes" ? 2000 : 254) || null); }
    }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(t.tenantId, id);
    await coreDb().prepare(`UPDATE dispatch_customers SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.customers.update_failed", error);
    return Response.json({ error: "Unable to update customer." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Customer id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM dispatch_customers WHERE tenant_id=? AND id=?").bind(t.tenantId, id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("dispatch.customers.delete_failed", error);
    return Response.json({ error: "Unable to delete customer." }, { status: 500 });
  }
}
