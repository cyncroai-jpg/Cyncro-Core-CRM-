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
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const customer = await db.prepare("SELECT * FROM dispatch_customers WHERE id=?").bind(id).first();
      const properties = await db.prepare("SELECT * FROM dispatch_properties WHERE customer_id=? ORDER BY created_at").bind(id).all();
      const jobs = await db.prepare("SELECT * FROM dispatch_jobs WHERE customer_id=? ORDER BY scheduled_at DESC").bind(id).all();
      return Response.json({ customer, properties: properties.results, jobs: jobs.results });
    }
    const { results } = await db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM dispatch_properties p WHERE p.customer_id=c.id) property_count,
        (SELECT COUNT(*) FROM dispatch_jobs j WHERE j.customer_id=c.id) job_count
      FROM dispatch_customers c ORDER BY c.created_at DESC
    `).all();
    return Response.json({ customers: results });
  } catch (error) {
    console.error("dispatch.customers.list_failed", error);
    return Response.json({ error: "Unable to load customers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Customer name is required." }, { status: 400 });
    const address = cleanText(body.address, 300);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();
    const statements = [
      db.prepare("INSERT INTO dispatch_customers (id,name,phone,email,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(id, name, cleanText(body.phone, 40) || null, cleanText(body.email, 254) || null, cleanText(body.notes, 2000) || null, now, now),
    ];
    let propertyId: string | null = null;
    if (address) {
      propertyId = crypto.randomUUID();
      statements.push(
        db.prepare("INSERT INTO dispatch_properties (id,customer_id,address,city,state,zip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(propertyId, id, address, cleanText(body.city, 100) || null, cleanText(body.state, 40) || null, cleanText(body.zip, 20) || null, now, now),
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
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
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
    vals.push(id);
    await coreDb().prepare(`UPDATE dispatch_customers SET ${updates.join(",")} WHERE id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.customers.update_failed", error);
    return Response.json({ error: "Unable to update customer." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Customer id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM dispatch_customers WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("dispatch.customers.delete_failed", error);
    return Response.json({ error: "Unable to delete customer." }, { status: 500 });
  }
}
