import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { ensureProspectingSchema } from "@/lib/prospecting/db";

type ProspectRow = Record<string, unknown> & { id: string; business_name: string };

function jsonList(value: unknown) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String) : []; }
  catch { return []; }
}

async function defaultPipeline(now: string) {
  const db = coreDb();
  let pipeline = await db.prepare("SELECT id FROM crm_pipelines WHERE active=1 ORDER BY is_default DESC, created_at LIMIT 1").first<{ id: string }>();
  if (pipeline) return pipeline.id;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO crm_pipelines (id,name,description,is_default,active,created_at,updated_at) VALUES (?,'Sales Pipeline','Primary revenue pipeline',1,1,?,?)").bind(id, now, now).run();
  const stages = [["NEW LEAD", "#6B7280", 10], ["QUALIFIED", "#8B5CF6", 25], ["DISCOVERY", "#3B82F6", 40], ["PROPOSAL", "#F59E0B", 65], ["CLOSED WON", "#10B981", 100], ["CLOSED LOST", "#374151", 0]] as const;
  await db.batch(stages.map((stage, position) => db.prepare(`INSERT INTO crm_pipeline_stages
    (id,pipeline_id,name,color,position,probability,is_won,is_lost,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), id, stage[0], stage[1], position, stage[2], stage[0] === "CLOSED WON" ? 1 : 0, stage[0] === "CLOSED LOST" ? 1 : 0, now, now)));
  return id;
}

async function convertOne(prospectId: string, request: Request, pipelineId: string) {
  const db = coreDb();
  const prospect = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospectId).first<ProspectRow>();
  if (!prospect) return { prospectId, error: "Prospect not found." };
  const now = new Date().toISOString();
  const assignedRep = String(prospect.assigned_rep || requestUser(request));
  let account = await db.prepare("SELECT id FROM crm_accounts WHERE source_prospect_id = ? LIMIT 1").bind(prospectId).first<{ id: string }>();
  const duplicate = Boolean(account);
  const accountId = account?.id || crypto.randomUUID();
  if (!account) {
    await db.prepare(`INSERT INTO crm_accounts
      (id,name,domain,phone,address,category,owner_email,account_manager,source,source_prospect_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'PROSPECTING',?,?,?)`)
      .bind(accountId, prospect.business_name, prospect.domain, prospect.phone, prospect.address, prospect.category, assignedRep, assignedRep, prospectId, now, now).run();
    account = { id: accountId };
  } else {
    await db.prepare(`UPDATE crm_accounts SET name=?,domain=COALESCE(?,domain),phone=COALESCE(?,phone),address=?,category=?,account_manager=COALESCE(account_manager,?),updated_at=? WHERE id=?`)
      .bind(prospect.business_name, prospect.domain, prospect.phone, prospect.address, prospect.category, assignedRep, now, accountId).run();
  }

  const emails = jsonList(prospect.emails_json);
  const leadership = jsonList(prospect.leadership_json);
  const primaryName = leadership[0]?.split(" — ")[0] || `${prospect.business_name} Primary Contact`;
  const primaryTitle = leadership[0]?.split(" — ").slice(1).join(" — ") || "Business Lead";
  let contact = await db.prepare("SELECT id FROM crm_contacts WHERE account_id=? ORDER BY created_at LIMIT 1").bind(accountId).first<{ id: string }>();
  const contactId = contact?.id || crypto.randomUUID();
  if (!contact) {
    await db.prepare(`INSERT INTO crm_contacts
      (id,account_id,full_name,email,phone,title,lifecycle,assigned_rep,source,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'LEAD',?,'PROSPECTING',?,?,?)`)
      .bind(contactId, accountId, primaryName, emails[0] || null, prospect.phone || null, primaryTitle, assignedRep, prospect.why_call || prospect.next_action || null, now, now).run();
    contact = { id: contactId };
  } else {
    await db.prepare(`UPDATE crm_contacts SET email=COALESCE(?,email),phone=COALESCE(?,phone),assigned_rep=COALESCE(assigned_rep,?),notes=COALESCE(?,notes),updated_at=? WHERE id=?`)
      .bind(emails[0] || null, prospect.phone || null, assignedRep, prospect.why_call || prospect.next_action || null, now, contactId).run();
  }

  let opportunity = await db.prepare("SELECT id FROM crm_opportunities WHERE account_id=? AND source='PROSPECTING' LIMIT 1").bind(accountId).first<{ id: string }>();
  const opportunityId = opportunity?.id || crypto.randomUUID();
  if (!opportunity) {
    await db.prepare(`INSERT INTO crm_opportunities
      (id,account_id,primary_contact_id,pipeline_id,name,stage,value_cents,probability,assigned_rep,commission_rate_bps,commission_status,payment_status,collected_cents,residual_rate_bps,residual_months,source,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,'NEW LEAD',0,?,?,2000,'PENDING','UNPAID',0,0,0,'PROSPECTING',?,?,?)`)
      .bind(opportunityId, accountId, contactId, pipelineId, `${prospect.business_name} · Cyncro opportunity`, Math.max(10, Math.min(100, Number(prospect.opportunity_score || 10))), assignedRep, prospect.next_action || null, now, now).run();
    opportunity = { id: opportunityId };
  } else {
    await db.prepare(`UPDATE crm_opportunities SET probability=?,assigned_rep=COALESCE(assigned_rep,?),notes=COALESCE(?,notes),updated_at=? WHERE id=?`)
      .bind(Math.max(10, Math.min(100, Number(prospect.opportunity_score || 10))), assignedRep, prospect.next_action || null, now, opportunityId).run();
  }
  await db.prepare("UPDATE prospects SET status='ASSIGNED', assigned_rep=COALESCE(assigned_rep,?), updated_at=? WHERE id=?").bind(assignedRep, now, prospectId).run();
  return { prospectId, accountId, contactId, opportunityId, duplicate };
}

export async function POST(request: Request) {
  try {
    await Promise.all([ensureCoreSchema(), ensureProspectingSchema()]);
    const body = (await request.json()) as Record<string, unknown>;
    const single = cleanText(body.prospectId, 80);
    const requested = Array.isArray(body.prospectIds) ? body.prospectIds.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 250) : [];
    const prospectIds = [...new Set(single ? [single] : requested)];
    if (!prospectIds.length) return Response.json({ error: "At least one prospect is required." }, { status: 400 });
    const pipelineId = await defaultPipeline(new Date().toISOString());
    const results = [];
    for (const prospectId of prospectIds) results.push(await convertOne(prospectId, request, pipelineId));
    const successful = results.filter((item) => !item.error);
    if (single) {
      const item = successful[0];
      if (!item) return Response.json({ error: results[0]?.error || "Unable to convert this prospect." }, { status: 404 });
      return Response.json(item, { status: item.duplicate ? 200 : 201 });
    }
    return Response.json({ imported: successful.length, failed: results.length - successful.length, results }, { status: successful.length ? 201 : 422 });
  } catch (error) {
    console.error("crm.convert_prospect.failed", error);
    return Response.json({ error: "Unable to import prospect data into CRM." }, { status: 500 });
  }
}
