/**
 * POST /api/crm/demo — fills an EMPTY company with a believable HVAC business
 * (owner only): a sales pipeline, 12 contacts with accounts, open and won deals,
 * appointment types with availability, bookings this week, dispatch techs and
 * jobs, invoices, tasks, team chat, a starter kit's automations, two agents.
 * Every row is a normal record. Refuses when the company already has contacts.
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { installKit } from "@/lib/snapshots/kits";
import { createAgent } from "@/lib/ai/agents";

const uid = () => crypto.randomUUID();
const iso = (d: Date) => d.toISOString();
const at = (daysFromNow: number, hour: number, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); d.setHours(hour, minute, 0, 0); return d; };
const ago = (days: number) => iso(new Date(Date.now() - days * 86_400_000));

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireTenant(request); if (t instanceof Response) return t;
    if (t.role !== "OWNER") return Response.json({ error: "Only an owner can load demo data." }, { status: 403 });
    const db = coreDb(); const T = t.tenantId; const now = iso(new Date());
    const existing = await db.prepare("SELECT COUNT(*) AS n FROM crm_contacts WHERE tenant_id=?").bind(T).first<{ n: number }>();
    if (Number(existing?.n || 0) > 0) return Response.json({ error: "This company already has contacts. Demo data only loads into an empty company." }, { status: 409 });

    await db.prepare("UPDATE tenants SET name=?, settings_json=? WHERE id=?").bind("Summit Air & Heat", JSON.stringify({ timezone: "America/New_York", phone: "(561) 555-0142", website: "https://summitairheat.com", address: "1200 Okeechobee Blvd, West Palm Beach, FL", senderName: "Summit Air & Heat", brandColor: "#a91f39", businessHours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" }, apps: ["dispatch", "growth", "messages"] }), T).run();
    const kit = await installKit(T, "field_service", t.email);
    const pipe = await db.prepare("SELECT id FROM crm_pipelines WHERE tenant_id=? AND name='Service pipeline'").bind(T).first<{ id: string }>();
    const stages = ["NEW REQUEST", "ESTIMATE SCHEDULED", "ESTIMATE SENT", "APPROVED", "JOB SCHEDULED", "CLOSED WON", "CLOSED WON", "CLOSED LOST"];
    const people: [string, string, string, string, string, number, number, string][] = [
      ["Dana Ortiz", "Palm Harbor Homes", "dana@palmharborhomes.com", "(561) 555-0101", "Property manager", 18500, 0, "CUSTOMER"],
      ["Marcus Bell", "Bell Family", "marcus.bell@gmail.com", "(561) 555-0117", "", 7200, 1, "LEAD"],
      ["Priya Nair", "Nair Dental", "priya@nairdental.com", "(561) 555-0133", "Owner", 12400, 2, "LEAD"],
      ["Tom Alvarez", "Alvarez Residence", "talvarez@outlook.com", "(561) 555-0148", "", 4800, 3, "LEAD"],
      ["Lena Park", "Park & Co Realty", "lena@parkrealty.com", "(561) 555-0159", "Broker", 9900, 4, "CUSTOMER"],
      ["Chris Dawson", "Dawson Residence", "cdawson@yahoo.com", "(561) 555-0162", "", 6400, 5, "CUSTOMER"],
      ["Aisha Rahman", "Rahman Residence", "aisha.r@gmail.com", "(561) 555-0171", "", 3900, 6, "CUSTOMER"],
      ["Victor Huang", "Huang Residence", "vhuang@me.com", "(561) 555-0180", "", 5600, 7, "LEAD"],
      ["Grace Kim", "Lakeside Cafe", "grace@lakesidecafe.com", "(561) 555-0194", "Owner", 15200, 1, "LEAD"],
      ["Sam Reyes", "Reyes Residence", "sam.reyes@gmail.com", "(561) 555-0206", "", 2900, 0, "LEAD"],
      ["Nora Fields", "Fields Pediatrics", "nora@fieldspeds.com", "(561) 555-0215", "Office manager", 21000, 3, "LEAD"],
      ["Eli Thompson", "Thompson Residence", "eli.t@gmail.com", "(561) 555-0228", "", 4100, 2, "LEAD"],
    ];
    const contacts: { id: string; name: string; email: string; phone: string; accountId: string }[] = [];
    for (const [i, p] of people.entries()) {
      const accountId = uid(); const id = uid(); const created = ago(30 - i * 2);
      await db.prepare("INSERT INTO crm_accounts (id, name, owner_email, source, status, tenant_id, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?,?)").bind(accountId, p[1], t.email, "WEBSITE", T, created, created).run();
      await db.prepare("INSERT INTO crm_contacts (id, account_id, full_name, email, phone, title, lifecycle, assigned_rep, source, notes, tags, lead_score, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, accountId, p[0], p[2], p[3], p[4] || null, p[7], t.email, i % 3 === 0 ? "WEBSITE" : i % 3 === 1 ? "REFERRAL" : "GOOGLE", null, JSON.stringify(i % 4 === 0 ? ["qualified"] : []), 20 + i * 6, T, created, created).run();
      const stage = stages[p[6]];
      await db.prepare("INSERT INTO crm_opportunities (id, account_id, primary_contact_id, pipeline_id, name, stage, value_cents, probability, assigned_rep, commission_rate_bps, commission_status, payment_status, collected_cents, residual_rate_bps, residual_months, source, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,2000,'PENDING',?,?,0,0,'WEBSITE',?,?,?)")
        .bind(uid(), accountId, id, pipe?.id || null, `${p[1]} · ${["AC replacement", "Duct cleaning", "Mini-split install", "Furnace repair", "Maintenance plan", "Heat pump install"][i % 6]}`, stage, p[5] * 100, stage === "CLOSED WON" ? 100 : stage === "CLOSED LOST" ? 0 : [10, 30, 50, 80, 90][p[6]] || 10, t.email, stage === "CLOSED WON" ? "PAID" : "UNPAID", stage === "CLOSED WON" ? p[5] * 100 : 0, T, created, ago(Math.max(0, 6 - i))).run();
      await db.prepare("INSERT INTO crm_activities (id, contact_id, activity_type, title, details, status, created_by, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,'COMPLETED',?,?,?,?)").bind(uid(), id, i % 2 ? "CALL" : "NOTE", i % 2 ? "Called about the estimate" : "Came in from the website form", i % 2 ? "Left a voicemail, will try again tomorrow." : "Wants a quote before the summer rush.", t.email, T, ago(Math.max(0, 5 - i)), ago(Math.max(0, 5 - i))).run();
      contacts.push({ id, name: p[0], email: p[2], phone: p[3], accountId });
    }
    // availability + bookings this week
    const ets = (await db.prepare("SELECT id, name, duration_minutes FROM calendar_event_types WHERE tenant_id=?").bind(T).all<{ id: string; name: string; duration_minutes: number }>()).results;
    for (const et of ets) for (const wd of [1, 2, 3, 4, 5]) await db.prepare("INSERT INTO calendar_availability (id, event_type_id, weekday, start_time, end_time, timezone, active, tenant_id) VALUES (?,?,?,?,?,?,1,?)").bind(uid(), et.id, wd, "08:00", "17:00", "America/New_York", T).run();
    const est = ets.find((e) => /estimate/i.test(e.name)) || ets[0]; const visit = ets.find((e) => /visit/i.test(e.name)) || ets[0];
    const slots: [number, number, number, typeof est][] = [[0, 10, 0, est], [0, 14, 30, visit], [1, 9, 0, est], [1, 13, 0, visit], [2, 11, 0, est], [3, 15, 0, visit], [4, 10, 0, est]];
    for (const [i, s] of slots.entries()) { const c = contacts[(i + 1) % contacts.length]; const start = at(s[0], s[1], s[2]); const end = new Date(start.getTime() + Number(s[3].duration_minutes || 45) * 60_000);
      await db.prepare("INSERT INTO calendar_bookings (id, event_type_id, contact_id, customer_name, customer_email, customer_phone, starts_at, ends_at, timezone, location_mode, status, notes, created_by, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'IN_PERSON','CONFIRMED',?,?,?,?,?)").bind(uid(), s[3].id, c.id, c.name, c.email, c.phone, iso(start), iso(end), "America/New_York", null, t.email, T, now, now).run(); }
    // dispatch
    const techs = [["Luis Herrera", "luis@summitairheat.com", "(561) 555-0301"], ["Jamal Carter", "jamal@summitairheat.com", "(561) 555-0302"], ["Beth Nguyen", "beth@summitairheat.com", "(561) 555-0303"]];
    const techIds: string[] = [];
    for (const tech of techs) { const id = uid(); techIds.push(id); await db.prepare("INSERT INTO dispatch_technicians (id, tenant_id, name, email, phone, role, hourly_rate_cents, created_at, updated_at) VALUES (?,?,?,?,?,'TECHNICIAN',4200,?,?)").bind(id, T, tech[0], tech[1], tech[2], now, now).run(); }
    const addrs = ["412 Flamingo Dr, West Palm Beach", "88 Lakeview Ave, Lake Worth", "2301 Palm Beach Lakes Blvd", "17 Sunset Ln, Jupiter", "950 Clematis St, West Palm Beach", "63 Harbor Way, Boynton Beach"];
    for (const [i, c] of contacts.slice(0, 6).entries()) { const cid = uid(); await db.prepare("INSERT INTO dispatch_customers (id, tenant_id, name, phone, email, contact_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(cid, T, c.name, c.phone, c.email, c.id, now, now).run();
      const when = at(i < 2 ? 0 : i - 1, 8 + (i % 4) * 2); const status = i === 0 ? "EN_ROUTE" : i === 1 ? "IN_PROGRESS" : i < 4 ? "ASSIGNED" : "BOOKED";
      await db.prepare("INSERT INTO dispatch_jobs (id, tenant_id, customer_id, service_type, description, address, scheduled_at, status, assigned_tech_id, revenue_cents, estimated_minutes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(), T, cid, ["AC tune-up", "Compressor replacement", "Duct cleaning", "Thermostat install", "Refrigerant recharge", "Mini-split install"][i], "Customer reports warm air from vents.", addrs[i], iso(when), status, i < 4 ? techIds[i % 3] : null, [18900, 240000, 45000, 32000, 28000, 690000][i], 90, now, now).run(); }
    // invoices + tasks + chat
    for (const [i, c] of [contacts[0], contacts[4], contacts[5], contacts[6]].entries()) await db.prepare("INSERT INTO crm_invoices (id, invoice_number, client_name, client_email, description, amount_cents, due_date, status, created_by, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(), `SAH-${Date.now().toString().slice(-5)}${i}`, c.name, c.email, ["AC replacement, 3-ton Carrier", "Annual maintenance plan", "Compressor replacement", "Duct cleaning"][i], [1850000, 99000, 240000, 45000][i], iso(at(i === 2 ? -9 : 14 - i * 3, 0)).slice(0, 10), i === 0 ? "PAID" : i === 2 ? "SENT" : i === 3 ? "SENT" : "DRAFT", t.email, T, ago(12 - i), now).run();
    for (const [i, title] of ["Call Marcus Bell about the estimate", "Send Priya the mini-split proposal", "Order filters for Thursday's jobs", "Follow up: Nora Fields walkthrough"].entries()) await db.prepare("INSERT INTO work_tasks (id, title, details, status, priority, assignee, reporter, contact_id, due_at, estimated_minutes, tenant_id, created_at, updated_at) VALUES (?,?,?,'TODO',?,?,?,?,?,20,?,?,?)").bind(uid(), title, null, i === 0 ? "HIGH" : "MEDIUM", t.email, t.email, contacts[[1, 2, 0, 10][i]].id, iso(at(i, 12)), T, now, now).run();
    const ch = uid(); await db.prepare("INSERT INTO team_chat_channels (id, name, type, description, created_by, archived, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,0,?,?,?)").bind(ch, "dispatch", "PUBLIC", "Today's jobs and techs", t.email, T, now, now).run();
    for (const [i, m] of [["Luis Herrera", "On my way to Flamingo Dr, ETA 20."], ["Jamal Carter", "Bell job: compressor's shot, quoting replacement."], ["Beth Nguyen", "Finished Lakeview early, free after 2 if anyone needs a hand."]].entries()) await db.prepare("INSERT INTO team_chat_messages (id, channel_id, author_email, author_name, body, thread_parent_id, attachments_json, crm_link_type, crm_link_id, created_at, updated_at) VALUES (?,?,?,?,?,NULL,'[]',NULL,NULL,?,?)").bind(uid(), ch, techs[i][1], m[0], m[1], iso(new Date(Date.now() - (3 - i) * 1800_000)), now).run();
    // agents
    const agents: string[] = [];
    for (const key of ["lead_qualifier", "daily_briefing"]) { try { const a = await createAgent(T, t.email, { templateKey: key }); agents.push(a.name); } catch { /* skip */ } }
    return Response.json({ loaded: true, company: "Summit Air & Heat", contacts: contacts.length, bookings: slots.length, jobs: 6, invoices: 4, kit, agents }, { status: 201 });
  } catch (error) { console.error("crm.demo_failed", error); return Response.json({ error: error instanceof Error ? error.message : "Demo load failed." }, { status: 500 }); }
}
