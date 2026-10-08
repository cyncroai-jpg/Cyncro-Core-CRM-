/** Starter kits. GET lists them; POST { key } installs one into this company (owner/admin). */
import { cleanText, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { KITS, installKit } from "@/lib/snapshots/kits";

export async function GET(request: Request) {
  try { await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    return Response.json({ kits: KITS.map((k) => ({ key: k.key, name: k.name, for: k.for, blurb: k.blurb, counts: { stages: k.pipeline.stages.length, eventTypes: k.eventTypes.length, forms: k.forms.length, workflows: k.workflows.length } })) });
  } catch (error) { console.error("kits.get_failed", error); return Response.json({ error: "Unable to load kits." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    if (t.role !== "OWNER" && t.role !== "ADMIN") return Response.json({ error: "Only an owner or admin can install a kit." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { key?: string };
    const key = cleanText(body.key, 40); if (!KITS.some((k) => k.key === key)) return Response.json({ error: "Unknown starter kit." }, { status: 400 });
    return Response.json({ installed: await installKit(t.tenantId, key, t.email), key }, { status: 201 });
  } catch (error) { console.error("kits.post_failed", error); return Response.json({ error: "Kit install failed." }, { status: 500 }); }
}
