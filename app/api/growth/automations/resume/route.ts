/**
 * Manually resumes any automation runs a delay node has paused and whose
 * time has come. The real trigger for this is the existing 30-minute
 * Cloudflare cron (see worker/index.ts) — this endpoint exists so a
 * paused run can be advanced on demand instead of waiting for the clock,
 * both for testing and for a user who wants to force a check now.
 */
import { hasCrmAction } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { resumeGrowthAutomations } from "@/lib/growth/automationEngine";

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Permission required." }, { status: 403 });
    const result = await resumeGrowthAutomations();
    return Response.json(result);
  } catch (error) {
    console.error("growth.automations.resume_failed", error);
    return Response.json({ error: "Unable to resume automations." }, { status: 500 });
  }
}
