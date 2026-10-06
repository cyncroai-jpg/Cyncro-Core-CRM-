import { cleanText, resolveRequestEmail } from "@/lib/core/db";
import { parseFilters } from "@/lib/smart-money/engine";
import { smartMoneyDb } from "@/lib/smart-money/db";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const { results } = await smartMoneyDb()
      .prepare("SELECT * FROM sm_screens ORDER BY created_at DESC LIMIT 100")
      .all<{ id: string; name: string; filters_json: string; created_by: string | null; created_at: string }>();
    return Response.json({
      screens: results.map((row) => ({ id: row.id, name: row.name, filters: JSON.parse(row.filters_json), createdBy: row.created_by, createdAt: row.created_at })),
    });
  } catch (error) {
    return smartMoneyError("screens", error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const body = (await request.json()) as { name?: unknown; filters?: Record<string, unknown> };
    const name = cleanText(body.name, 80);
    if (!name) return Response.json({ error: "Name your screen." }, { status: 400 });
    const filters = parseFilters(body.filters || {});
    const id = crypto.randomUUID();
    await smartMoneyDb()
      .prepare("INSERT INTO sm_screens (id,name,filters_json,created_by,created_at) VALUES (?,?,?,?,?)")
      .bind(id, name, JSON.stringify(filters), await resolveRequestEmail(request), new Date().toISOString())
      .run();
    return Response.json({ id, name, filters }, { status: 201 });
  } catch (error) {
    return smartMoneyError("save-screen", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const id = new URL(request.url).searchParams.get("id") || "";
    await smartMoneyDb().prepare("DELETE FROM sm_screens WHERE id=?").bind(id).run();
    return Response.json({ removed: id });
  } catch (error) {
    return smartMoneyError("delete-screen", error);
  }
}
