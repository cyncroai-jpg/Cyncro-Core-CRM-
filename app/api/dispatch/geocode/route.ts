import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { geocodeAddress } from "@/lib/core/geocode";

async function requireDispatchAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT role,active FROM workspace_members WHERE email=?").bind(email).first<{ role: string; active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

// Backfills coordinates for jobs saved before geocoding existed. Nominatim asks
// for ~1 request/second, so this runs a small batch per call and the UI re-calls
// until nothing is left.
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const db = coreDb();
    const { results } = await db.prepare("SELECT id, address FROM dispatch_jobs WHERE (lat IS NULL OR lng IS NULL) AND address <> '' ORDER BY scheduled_at DESC LIMIT 5").all<{ id: string; address: string }>();
    let geocoded = 0;
    for (const job of results) {
      const point = await geocodeAddress(job.address);
      if (point) {
        await db.prepare("UPDATE dispatch_jobs SET lat=?, lng=? WHERE id=?").bind(point.lat, point.lng, job.id).run();
        geocoded += 1;
      }
      if (results.length > 1) await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    const remaining = await db.prepare("SELECT COUNT(*) AS c FROM dispatch_jobs WHERE (lat IS NULL OR lng IS NULL) AND address <> ''").first<{ c: number }>();
    return Response.json({ geocoded, remaining: Number(remaining?.c || 0) });
  } catch (error) {
    console.error("dispatch.geocode.failed", error);
    return Response.json({ error: "Unable to geocode jobs." }, { status: 500 });
  }
}
