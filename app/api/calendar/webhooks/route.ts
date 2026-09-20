import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";

const VALID_EVENTS = new Set([
  "appointment.created",
  "appointment.cancelled",
  "appointment.rescheduled",
  "appointment.completed",
  "appointment.no_show",
]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const endpointId = cleanText(url.searchParams.get("endpointId"), 80);
    if (endpointId) {
      const owned = await coreDb().prepare("SELECT id FROM calendar_webhook_endpoints WHERE id = ? AND tenant_id = ?").bind(endpointId, tenant.tenantId).first();
      if (!owned) return Response.json({ error: "Endpoint not found." }, { status: 404 });
      // Fetch recent deliveries for this endpoint
      const { results } = await coreDb().prepare(
        "SELECT id, event, status, response_code, attempt_count, delivered_at, next_retry_at, created_at FROM calendar_webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT 50"
      ).bind(endpointId).all();
      return Response.json({ deliveries: results });
    }
    const { results } = await coreDb().prepare(
      "SELECT id, name, url, events, active, created_by, created_at FROM calendar_webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC"
    ).bind(tenant.tenantId).all();
    return Response.json({ endpoints: results });
  } catch (error) {
    console.error("calendar.webhooks.list_failed", error);
    return Response.json({ error: "Unable to load webhooks." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const url = cleanText(body.url, 500);
    if (!name || !url) return Response.json({ error: "Name and URL are required." }, { status: 400 });
    try { new URL(url); } catch { return Response.json({ error: "URL is not valid." }, { status: 400 }); }
    const events: string[] = Array.isArray(body.events)
      ? (body.events as unknown[]).map(String).filter(e => VALID_EVENTS.has(e))
      : [];
    // Generate a random signing secret
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const secret = Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO calendar_webhook_endpoints
      (id, name, url, secret, events, active, created_by, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(id, name, url, secret, JSON.stringify(events), tenant.email, tenant.tenantId, now, now).run();
    // Return the secret once — it won't be shown again
    return Response.json({ id, secret, signingKey: `sha256=${secret}` }, { status: 201 });
  } catch (error) {
    console.error("calendar.webhooks.create_failed", error);
    return Response.json({ error: "Unable to create webhook endpoint." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Endpoint id is required." }, { status: 400 });
    const owned = await coreDb().prepare("SELECT id FROM calendar_webhook_endpoints WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
    if (!owned) return Response.json({ error: "Endpoint not found." }, { status: 404 });
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.url !== undefined) {
      const u = cleanText(body.url, 500);
      try { new URL(u); add("url", u); } catch { return Response.json({ error: "URL is not valid." }, { status: 400 }); }
    }
    if (Array.isArray(body.events)) {
      const evts = (body.events as unknown[]).map(String).filter(e => VALID_EVENTS.has(e));
      add("events", JSON.stringify(evts));
    }
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb().prepare(`UPDATE calendar_webhook_endpoints SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const ep = await coreDb().prepare("SELECT id, name, url, events, active FROM calendar_webhook_endpoints WHERE id = ?").bind(id).first();
    return ep ? Response.json({ endpoint: ep }) : Response.json({ error: "Endpoint not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.webhooks.update_failed", error);
    return Response.json({ error: "Unable to update webhook endpoint." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "delete");
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Endpoint id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM calendar_webhook_endpoints WHERE id = ? AND tenant_id = ?").bind(id, tenant.tenantId).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("calendar.webhooks.delete_failed", error);
    return Response.json({ error: "Unable to delete webhook endpoint." }, { status: 500 });
  }
}
