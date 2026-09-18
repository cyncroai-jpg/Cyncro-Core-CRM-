import { cleanText, coreDb, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const automationId = cleanText(new URL(request.url).searchParams.get("automationId"), 80);
    if (!automationId) return Response.json({ error: "automationId is required." }, { status: 400 });
    const { results } = await coreDb().prepare("SELECT * FROM gi_automation_runs WHERE automation_id=? ORDER BY created_at DESC LIMIT 50").bind(automationId).all();
    return Response.json({ runs: results });
  } catch (error) {
    console.error("growth.automations.runs_failed", error);
    return Response.json({ error: "Unable to load run history." }, { status: 500 });
  }
}
