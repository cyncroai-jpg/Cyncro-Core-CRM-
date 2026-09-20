import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const from = cleanText(url.searchParams.get("from"), 40) || new Date().toISOString();
    const to = cleanText(url.searchParams.get("to"), 40) || new Date(Date.now() + 90 * 86_400_000).toISOString();
    const { results } = await coreDb()
      .prepare("SELECT * FROM calendar_blocked_times WHERE tenant_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at")
      .bind(tenant.tenantId, to, from).all();
    return Response.json({ blockedTimes: results });
  } catch (error) {
    console.error("calendar.blocked_times.list_failed", error);
    return Response.json({ error: "Unable to load blocked times." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const startsAt = new Date(String(body.startsAt || ""));
    const endsAt = new Date(String(body.endsAt || ""));
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt)
      return Response.json({ error: "Valid start and end times are required (end must be after start)." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb()
      .prepare(`INSERT INTO calendar_blocked_times (id, event_type_id, starts_at, ends_at, reason, all_day, created_by, tenant_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        cleanText(body.eventTypeId, 80) || null,
        startsAt.toISOString(),
        endsAt.toISOString(),
        cleanText(body.reason, 300) || null,
        body.allDay ? 1 : 0,
        tenant.email,
        tenant.tenantId,
        now,
      ).run();
    return Response.json({ id, saved: true }, { status: 201 });
  } catch (error) {
    console.error("calendar.blocked_times.create_failed", error);
    return Response.json({ error: "Unable to block time." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "delete");
    if (tenant instanceof Response) return tenant;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Blocked time id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM calendar_blocked_times WHERE id = ? AND tenant_id = ?").bind(id, tenant.tenantId).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("calendar.blocked_times.delete_failed", error);
    return Response.json({ error: "Unable to remove blocked time." }, { status: 500 });
  }
}
