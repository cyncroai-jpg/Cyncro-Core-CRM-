import { cleanText, coreDb, ensureCoreSchema, isWorkspaceOwner, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url); const rep = cleanText(url.searchParams.get("rep"), 160); const pipelineId = cleanText(url.searchParams.get("pipelineId"), 80);
    const db = coreDb();
    const statement = rep
      ? db.prepare(`SELECT o.*, a.name AS account_name, c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone FROM crm_opportunities o
          JOIN crm_accounts a ON a.id = o.account_id LEFT JOIN crm_contacts c ON c.id = o.primary_contact_id
          WHERE o.assigned_rep = ? ORDER BY o.updated_at DESC`).bind(rep)
      : pipelineId ? db.prepare(`SELECT o.*, a.name AS account_name, c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone FROM crm_opportunities o
          JOIN crm_accounts a ON a.id = o.account_id LEFT JOIN crm_contacts c ON c.id = o.primary_contact_id
          WHERE o.pipeline_id = ? ORDER BY o.updated_at DESC`).bind(pipelineId)
      : db.prepare(`SELECT o.*, a.name AS account_name, c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone FROM crm_opportunities o
          JOIN crm_accounts a ON a.id = o.account_id LEFT JOIN crm_contacts c ON c.id = o.primary_contact_id ORDER BY o.updated_at DESC`);
    const results = (await statement.all()).results as Record<string, unknown>[];
    if (!(await isWorkspaceOwner(request))) for (const row of results) {
      delete row.commission_rate_bps; delete row.commission_status; delete row.residual_rate_bps; delete row.residual_months; delete row.residual_flat_cents; delete row.paid_at;
    }
    return Response.json({ opportunities: results });
  } catch (error) {
    console.error("crm.opportunities.list_failed", error);
    return Response.json({ error: "Unable to load opportunities." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const accountId = cleanText(body.accountId, 80); const name = cleanText(body.name, 180);
    const stage = cleanText(body.stage, 80).toUpperCase() || "NEW LEAD";
    const pipelineId = cleanText(body.pipelineId, 80) || null;
    if (!accountId || !name || !stage) return Response.json({ error: "Account, name, and valid stage are required." }, { status: 400 });
    const valueCents = Math.max(0, Math.round(Number(body.value || 0) * 100));
    const commissionRateBps = Math.min(3000, Math.max(2000, Math.round(Number(body.commissionRate || 20) * 100)));
    const residualFlatCents = Math.min(5000, Math.max(2500, Math.round(Number(body.residualFlat || 25) * 100)));
    const probability = Math.min(100, Math.max(0, Math.round(Number(body.probability || 10))));
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO crm_opportunities
      (id, account_id, primary_contact_id, pipeline_id, name, stage, value_cents, cost_cents, probability, assigned_rep, commission_rate_bps,
       commission_status, payment_status, collected_cents, residual_rate_bps, residual_months, residual_flat_cents, expected_close_date, source, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, accountId, cleanText(body.primaryContactId, 80) || null, pipelineId, name, stage, valueCents, Math.max(0, Math.round(Number(body.cost || 0) * 100)), probability,
        cleanText(body.assignedRep, 160) || requestUser(request), commissionRateBps, cleanText(body.paymentStatus, 30).toUpperCase() || "UNPAID",
        Math.max(0, Math.round(Number(body.collected || 0) * 100)), 0, 0, residualFlatCents, cleanText(body.expectedCloseDate, 20) || null,
        cleanText(body.source, 80) || "MANUAL", cleanText(body.notes, 5000) || null, now, now).run();
    return Response.json({ opportunity: await coreDb().prepare("SELECT * FROM crm_opportunities WHERE id = ?").bind(id).first() }, { status: 201 });
  } catch (error) {
    console.error("crm.opportunities.create_failed", error);
    return Response.json({ error: "Unable to create opportunity." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>; const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Opportunity id is required." }, { status: 400 });
    const updates = body.updates && typeof body.updates === "object" ? body.updates as Record<string, unknown> : {};
    const compensationKeys = ["commissionRate","commissionStatus","residualRate","residualMonths","residualFlat","collected","paymentStatus"];
    if (compensationKeys.some((key) => updates[key] !== undefined) && !(await isWorkspaceOwner(request))) return Response.json({ error: "Owner permission is required to view or change compensation." }, { status: 403 });
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.name !== undefined) { const name = cleanText(updates.name, 180); if (!name) return Response.json({ error: "Opportunity name is required." }, { status: 400 }); add("name", name); }
    if (updates.stage !== undefined) { const stage = cleanText(updates.stage, 80).toUpperCase(); if (!stage) return Response.json({ error: "Invalid pipeline stage." }, { status: 400 }); add("stage", stage); }
    if (updates.pipelineId !== undefined) add("pipeline_id", cleanText(updates.pipelineId, 80) || null);
    if (updates.value !== undefined) add("value_cents", Math.max(0, Math.round(Number(updates.value) * 100)));
    if (updates.cost !== undefined) add("cost_cents", Math.max(0, Math.round(Number(updates.cost) * 100)));
    if (updates.source !== undefined) add("source", cleanText(updates.source, 80) || "MANUAL");
    if (updates.probability !== undefined) add("probability", Math.min(100, Math.max(0, Math.round(Number(updates.probability)))));
    if (updates.assignedRep !== undefined) add("assigned_rep", cleanText(updates.assignedRep, 160) || null);
    if (updates.commissionRate !== undefined) add("commission_rate_bps", Math.min(3000, Math.max(2000, Math.round(Number(updates.commissionRate) * 100))));
    if (updates.commissionStatus !== undefined) add("commission_status", cleanText(updates.commissionStatus, 30).toUpperCase());
    if (updates.paymentStatus !== undefined) { const status = cleanText(updates.paymentStatus, 30).toUpperCase(); add("payment_status", status); if (status === "PAID") add("paid_at", new Date().toISOString()); }
    if (updates.collected !== undefined) add("collected_cents", Math.max(0, Math.round(Number(updates.collected) * 100)));
    if (updates.residualRate !== undefined) add("residual_rate_bps", Math.min(10000, Math.max(0, Math.round(Number(updates.residualRate) * 100))));
    if (updates.residualMonths !== undefined) add("residual_months", Math.max(0, Math.round(Number(updates.residualMonths))));
    if (updates.residualFlat !== undefined) add("residual_flat_cents", Math.min(5000, Math.max(2500, Math.round(Number(updates.residualFlat) * 100))));
    if (updates.notes !== undefined) add("notes", cleanText(updates.notes, 5000) || null);
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    await coreDb().prepare(`UPDATE crm_opportunities SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    return Response.json({ opportunity: await coreDb().prepare("SELECT * FROM crm_opportunities WHERE id = ?").bind(id).first() });
  } catch (error) {
    console.error("crm.opportunities.update_failed", error);
    return Response.json({ error: "Unable to update opportunity." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Opportunity id is required." }, { status: 400 });
    const db = coreDb();
    const existing = await db.prepare("SELECT id FROM crm_opportunities WHERE id=?").bind(id).first();
    if (!existing) return Response.json({ error: "Opportunity not found." }, { status: 404 });
    await db.prepare("DELETE FROM crm_opportunities WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("crm.opportunities.delete_failed", error);
    return Response.json({ error: "Unable to delete opportunity." }, { status: 500 });
  }
}
