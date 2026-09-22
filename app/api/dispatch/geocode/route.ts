import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { geocodeAddress } from "@/lib/core/geocode";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

// Backfills coordinates for jobs saved before geocoding existed. Nominatim asks
// for ~1 request/second, so this runs a small batch per call and the UI re-calls
// until nothing is left.
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const db = coreDb();
    const { results } = await db.prepare("SELECT id, address FROM dispatch_jobs WHERE tenant_id=? AND (lat IS NULL OR lng IS NULL) AND address <> '' ORDER BY scheduled_at DESC LIMIT 5").bind(t.tenantId).all<{ id: string; address: string }>();
    let geocoded = 0;
    for (const job of results) {
      const point = await geocodeAddress(job.address);
      if (point) {
        await db.prepare("UPDATE dispatch_jobs SET lat=?, lng=? WHERE id=?").bind(point.lat, point.lng, job.id).run();
        geocoded += 1;
      }
      if (results.length > 1) await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    const remaining = await db.prepare("SELECT COUNT(*) AS c FROM dispatch_jobs WHERE tenant_id=? AND (lat IS NULL OR lng IS NULL) AND address <> ''").bind(t.tenantId).first<{ c: number }>();
    return Response.json({ geocoded, remaining: Number(remaining?.c || 0) });
  } catch (error) {
    console.error("dispatch.geocode.failed", error);
    return Response.json({ error: "Unable to geocode jobs." }, { status: 500 });
  }
}
