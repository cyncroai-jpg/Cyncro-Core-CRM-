import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";
import { googleConnected, syncGoogleJob } from "@/lib/dispatch/google";

/** GET: is my Google Calendar connected and how many jobs are mirrored there. */
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const status = await googleConnected(t.email);
    const synced = await coreDb().prepare("SELECT COUNT(*) AS c, MAX(updated_at) AS last FROM dispatch_google_events WHERE owner=?").bind(t.email).first<{ c: number; last: string | null }>();
    return Response.json({ ...status, syncedJobs: Number(synced?.c || 0), lastSyncAt: synced?.last || null, connectUrl: "/api/integrations/google-calendar/connect" });
  } catch (error) {
    console.error("dispatch.google.status_failed", error);
    return Response.json({ error: "Unable to read Google Calendar status." }, { status: 500 });
  }
}

/** POST { jobId? }: push one job, or every job from today onward, to my Google Calendar. */
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const status = await googleConnected(t.email);
    if (!status.connected) return Response.json({ error: "Connect your Google Calendar first (Calendar → Connect Google Calendar), then sync." }, { status: 409 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const one = cleanText(body.jobId, 80);
    const ids = one ? [one] : (await coreDb().prepare("SELECT id FROM dispatch_jobs WHERE tenant_id=? AND status<>'CANCELLED' AND scheduled_at >= ? ORDER BY scheduled_at LIMIT 200")
      .bind(t.tenantId, new Date(Date.now() - 86_400_000).toISOString()).all<{ id: string }>()).results.map((r) => r.id);
    const tally = { created: 0, updated: 0, cancelled: 0, failed: 0 };
    for (const id of ids) {
      const r = await syncGoogleJob(t.email, t.tenantId, id);
      if (r === "created" || r === "updated" || r === "cancelled" || r === "failed") tally[r]++;
      if (r === "not_connected") return Response.json({ error: "Google token expired. Reconnect Google Calendar." }, { status: 409 });
    }
    return Response.json({ ...tally, total: ids.length });
  } catch (error) {
    console.error("dispatch.google.sync_failed", error);
    return Response.json({ error: "Unable to sync to Google Calendar." }, { status: 500 });
  }
}
