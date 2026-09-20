import {
  cleanText,
  coreDb,
  ensureCoreSchema,
} from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
const allowed = new Set(["CALL", "SMS", "EMAIL"]);
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url),
      channel = cleanText(url.searchParams.get("channel"), 20).toUpperCase(),
      query = cleanText(url.searchParams.get("q"), 120);
    let sql = "SELECT * FROM crm_sales_playbooks WHERE active=1 AND tenant_id=?",
      values: unknown[] = [tenant.tenantId];
    if (channel && allowed.has(channel)) {
      sql += " AND channel=?";
      values.push(channel);
    }
    if (query) {
      sql +=
        " AND (lower(name) LIKE ? OR lower(content) LIKE ? OR lower(category) LIKE ?)";
      const term = `%${query.toLowerCase()}%`;
      values.push(term, term, term);
    }
    sql += " ORDER BY category,name";
    const result = await coreDb()
      .prepare(sql)
      .bind(...values)
      .all();
    return Response.json({ playbooks: result.results });
  } catch (error) {
    console.error("playbooks.list_failed", error);
    return Response.json(
      { error: "Unable to load sales playbooks." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>,
      name = cleanText(body.name, 160),
      channel = cleanText(body.channel, 20).toUpperCase(),
      category = cleanText(body.category, 80) || "General",
      content = cleanText(body.content, 10000);
    if (!name || !allowed.has(channel) || !content)
      return Response.json(
        { error: "Name, call/SMS/email channel, and content are required." },
        { status: 400 },
      );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await coreDb()
      .prepare(
        "INSERT INTO crm_sales_playbooks (id,name,channel,category,stage,subject,content,objection,tags,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        name,
        channel,
        category,
        cleanText(body.stage, 40) || "ANY",
        cleanText(body.subject, 200) || null,
        content,
        cleanText(body.objection, 500) || null,
        JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        tenant.email,
        tenant.tenantId,
        now,
        now,
      )
      .run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("playbooks.create_failed", error);
    return Response.json(
      { error: "Unable to save sales playbook." },
      { status: 500 },
    );
  }
}
export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>,
      id = cleanText(body.id, 80),
      action = cleanText(body.action, 30).toUpperCase();
    if (!id)
      return Response.json(
        { error: "Playbook id is required." },
        { status: 400 },
      );
    const owned = await coreDb().prepare("SELECT id FROM crm_sales_playbooks WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
    if (!owned) return Response.json({ error: "Playbook not found." }, { status: 404 });
    if (action === "DUPLICATE") {
      const original = await coreDb().prepare("SELECT * FROM crm_sales_playbooks WHERE id=?").bind(id).first<Record<string,unknown>>();
      if (!original) return Response.json({ error: "Playbook not found." }, { status: 404 });
      const newId = crypto.randomUUID(); const now = new Date().toISOString();
      await coreDb().prepare(`INSERT INTO crm_sales_playbooks (id,name,channel,category,stage,subject,content,objection,tags,active,usage_count,success_count,created_by,tenant_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,0,0,?,?,?,?)`)
        .bind(newId, `${String(original.name||"Playbook")} (copy)`, original.channel, original.category, original.stage, original.subject, original.content, original.objection, original.tags||"[]", tenant.email, tenant.tenantId, now, now).run();
      const copy = await coreDb().prepare("SELECT * FROM crm_sales_playbooks WHERE id=?").bind(newId).first();
      return Response.json({ playbook: copy }, { status: 201 });
    }
    if (action === "USE" || action === "WON") {
      const outcome = action === "WON" ? "WON" : "USED",
        now = new Date().toISOString();
      await coreDb().batch([
        coreDb()
          .prepare(
            `UPDATE crm_sales_playbooks SET usage_count=usage_count+1,success_count=success_count+${action === "WON" ? 1 : 0},updated_at=? WHERE id=?`,
          )
          .bind(now, id),
        coreDb()
          .prepare(
            "INSERT INTO crm_playbook_activity (id,playbook_id,contact_id,opportunity_id,channel,outcome,used_by,created_at) SELECT ?,id,?,?,channel,?,?,? FROM crm_sales_playbooks WHERE id=?",
          )
          .bind(
            crypto.randomUUID(),
            cleanText(body.contactId, 80) || null,
            cleanText(body.opportunityId, 80) || null,
            outcome,
            tenant.email,
            now,
            id,
          ),
      ]);
      return Response.json({ saved: true });
    }
    const fields: string[] = [],
      values: unknown[] = [];
    const add = (key: string, value: unknown) => {
      fields.push(`${key}=?`);
      values.push(value);
    };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.channel !== undefined) {
      const channel = cleanText(body.channel, 20).toUpperCase();
      if (!allowed.has(channel))
        return Response.json({ error: "Invalid channel." }, { status: 400 });
      add("channel", channel);
    }
    if (body.category !== undefined)
      add("category", cleanText(body.category, 80));
    if (body.stage !== undefined) add("stage", cleanText(body.stage, 40));
    if (body.subject !== undefined)
      add("subject", cleanText(body.subject, 200) || null);
    if (body.content !== undefined)
      add("content", cleanText(body.content, 10000));
    if (body.objection !== undefined)
      add("objection", cleanText(body.objection, 500) || null);
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb()
      .prepare(`UPDATE crm_sales_playbooks SET ${fields.join(",")} WHERE id=?`)
      .bind(...values)
      .run();
    return Response.json({ saved: true });
  } catch (error) {
    console.error("playbooks.update_failed", error);
    return Response.json(
      { error: "Unable to update sales playbook." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "delete");
    if (tenant instanceof Response) return tenant;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Playbook id is required." }, { status: 400 });
    await coreDb().prepare("UPDATE crm_sales_playbooks SET active=0,updated_at=? WHERE id=? AND tenant_id=?").bind(new Date().toISOString(), id, tenant.tenantId).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("playbooks.delete_failed", error);
    return Response.json({ error: "Unable to delete sales playbook." }, { status: 500 });
  }
}
