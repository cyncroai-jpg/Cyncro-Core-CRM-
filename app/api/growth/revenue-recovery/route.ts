import { coreDb, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

/**
 * Real revenue-recovery detection: stale opportunities, abandoned form
 * submissions, unpaid closed-won deals. Every figure here is a
 * "recoverable opportunity", never presented as guaranteed revenue.
 */
export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

    const staleOpportunities = await db.prepare(`SELECT id, name, stage, value_cents, assigned_rep, updated_at FROM crm_opportunities
      WHERE stage NOT IN ('CLOSED WON','CLOSED LOST') AND updated_at < ? ORDER BY value_cents DESC LIMIT 50`).bind(staleCutoff).all();

    const abandonedForms = await db.prepare(`SELECT s.id, s.form_id, f.name AS form_name, s.started_at, s.answers_json FROM gi_form_submissions s
      JOIN gi_forms f ON f.id = s.form_id WHERE s.status='ABANDONED' ORDER BY s.started_at DESC LIMIT 50`).all();

    const unpaidClosedWon = await db.prepare(`SELECT id, name, value_cents, collected_cents, assigned_rep, paid_at FROM crm_opportunities
      WHERE stage='CLOSED WON' AND payment_status != 'PAID' ORDER BY value_cents DESC LIMIT 50`).all();

    const staleValue = (staleOpportunities.results || []).reduce((s, r) => s + Number((r as Record<string, unknown>).value_cents || 0), 0);
    const unpaidValue = (unpaidClosedWon.results || []).reduce((s, r) => s + (Number((r as Record<string, unknown>).value_cents || 0) - Number((r as Record<string, unknown>).collected_cents || 0)), 0);

    return Response.json({
      staleOpportunities: staleOpportunities.results || [],
      abandonedForms: abandonedForms.results || [],
      unpaidClosedWon: unpaidClosedWon.results || [],
      totals: {
        recoverableCount: (staleOpportunities.results?.length || 0) + (abandonedForms.results?.length || 0) + (unpaidClosedWon.results?.length || 0),
        potentialPipelineCents: staleValue + unpaidValue,
      },
      disclaimer: "These are recoverable opportunities based on real stale/abandoned/unpaid records — not guaranteed revenue.",
    });
  } catch (error) {
    console.error("growth.revenue_recovery.load_failed", error);
    return Response.json({ error: "Unable to load revenue recovery data." }, { status: 500 });
  }
}
