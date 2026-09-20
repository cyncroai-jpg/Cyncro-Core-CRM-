/**
 * POST /api/dispatch/seed-demo — populates realistic sample records (real
 * customers, properties, technicians, jobs across different real stages,
 * and an invoice) so every Dispatch view has something to show. No-ops if
 * the shared Dispatch workspace already has customers.
 */
import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
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

function uid() {
  return crypto.randomUUID();
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const db = coreDb();
    const now = new Date().toISOString();

    const existing = await db.prepare("SELECT COUNT(*) c FROM dispatch_customers").first<{ c: number }>();
    if (Number(existing?.c || 0) > 0) {
      return Response.json({ seeded: false, reason: "Dispatch already has customers — seed only runs on an empty workspace." });
    }

    const mkCustomer = async (name: string, phone: string, email: string) => {
      const id = uid();
      await db.prepare("INSERT INTO dispatch_customers (id,name,phone,email,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .bind(id, name, phone, email, now, now).run();
      return id;
    };
    const mkProperty = async (customerId: string, address: string, city: string, state: string, zip: string) => {
      const id = uid();
      await db.prepare("INSERT INTO dispatch_properties (id,customer_id,address,city,state,zip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, customerId, address, city, state, zip, now, now).run();
      return id;
    };
    const mkTech = async (name: string, email: string, role: string, rate: number) => {
      const id = uid();
      await db.prepare("INSERT INTO dispatch_technicians (id,name,email,role,hourly_rate_cents,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)")
        .bind(id, name, email, role, rate * 100, now, now).run();
      return id;
    };

    const [cust1, cust2, cust3] = await Promise.all([
      mkCustomer("Nadia Farrow", "555-0134", "nadia.farrow@example.com"),
      mkCustomer("Grant Whitfield", "555-0156", "grant.whitfield@example.com"),
      mkCustomer("Yolanda Cruz", "555-0179", "yolanda.cruz@example.com"),
    ]);
    const [prop1, prop2, prop3] = await Promise.all([
      mkProperty(cust1, "218 Larkspur Ave", "Denver", "CO", "80209"),
      mkProperty(cust2, "77 Foxglove Ct", "Denver", "CO", "80211"),
      mkProperty(cust3, "4400 Redwood Blvd", "Denver", "CO", "80207"),
    ]);
    const [tech1, tech2] = await Promise.all([
      mkTech("Ray Nakamura", "ray.nakamura@example.com", "TECHNICIAN", 38),
      mkTech("Bianca Solis", "bianca.solis@example.com", "LEAD", 46),
    ]);

    // Job 1 — booked, unassigned, upcoming
    const job1 = uid();
    await db.prepare(`INSERT INTO dispatch_jobs (id,customer_id,property_id,service_type,description,address,scheduled_at,status,revenue_cents,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(job1, cust1, prop1, "HVAC tune-up", "Annual furnace inspection and filter replacement", "218 Larkspur Ave, Denver, CO 80209",
        new Date(Date.now() + 2 * 86400000).toISOString(), "BOOKED", 18500, 90, now, now).run();

    // Job 2 — assigned and in progress, with a note and a clocked-in time entry
    const job2 = uid();
    await db.prepare(`INSERT INTO dispatch_jobs (id,customer_id,property_id,service_type,description,address,scheduled_at,status,assigned_tech_id,revenue_cents,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(job2, cust2, prop2, "Water heater replacement", "Replacing 12-year-old unit, customer reports inconsistent hot water", "77 Foxglove Ct, Denver, CO 80211",
        now, "IN PROGRESS", tech1, 142000, 180, now, now).run();
    await db.prepare("INSERT INTO dispatch_job_notes (id,job_id,author,body,created_at) VALUES (?,?,?,?,?)")
      .bind(uid(), job2, "Ray Nakamura", "Old unit drained and removed. New unit on site, starting install.", now).run();
    await db.prepare("INSERT INTO dispatch_job_time_entries (id,job_id,tech_id,clock_in_at,created_at) VALUES (?,?,?,?,?)")
      .bind(uid(), job2, tech1, now, now).run();
    await db.prepare("INSERT INTO dispatch_job_materials (id,job_id,name,quantity,unit_cost_cents,created_at) VALUES (?,?,?,?,?,?)")
      .bind(uid(), job2, "50-gal water heater unit", 1, 68000, now).run();

    // Job 3 — complete and invoiced, paid
    const job3 = uid();
    await db.prepare(`INSERT INTO dispatch_jobs (id,customer_id,property_id,service_type,description,address,scheduled_at,status,assigned_tech_id,revenue_cents,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(job3, cust3, prop3, "Drain cleaning", "Kitchen sink draining slowly, cleared main line clog", "4400 Redwood Blvd, Denver, CO 80207",
        new Date(Date.now() - 3 * 86400000).toISOString(), "INVOICED", tech2, 24500, 60, now, now).run();
    await db.prepare("INSERT INTO dispatch_job_time_entries (id,job_id,tech_id,clock_in_at,clock_out_at,created_at) VALUES (?,?,?,?,?,?)")
      .bind(uid(), job3, tech2, new Date(Date.now() - 3 * 86400000).toISOString(), new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(), now).run();
    await db.prepare(`INSERT INTO dispatch_invoices (id,job_id,customer_id,amount_cents,status,issued_at,paid_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(uid(), job3, cust3, 24500, "PAID", new Date(Date.now() - 3 * 86400000).toISOString(), now, now, now).run();

    for (const [jobId, address] of [[job1, "218 Larkspur Ave, Denver, CO 80209"], [job2, "77 Foxglove Ct, Denver, CO 80211"], [job3, "4400 Redwood Blvd, Denver, CO 80207"]] as const) {
      const point = await geocodeAddress(address);
      if (point) await db.prepare("UPDATE dispatch_jobs SET lat=?, lng=? WHERE id=?").bind(point.lat, point.lng, jobId).run();
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    return Response.json({ seeded: true }, { status: 201 });
  } catch (error) {
    console.error("dispatch.seed_demo.failed", error);
    return Response.json({ error: "Unable to load demo data." }, { status: 500 });
  }
}
