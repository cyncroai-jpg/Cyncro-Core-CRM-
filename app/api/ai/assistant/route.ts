/**
 * Cyncro AI assistant, per teammate inside their company.
 *   GET                       → history, pending actions, usage, configured?
 *   POST { message, screen }  → one turn
 *   POST ?action=approve { id } / ?action=dismiss { id }
 *   DELETE                    → clear this teammate's memory
 */
import { cleanText, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { aiConfigured, approve, ask, dismiss, forget, history, pendingFor, usageFor } from "@/lib/ai/assistant";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const [h, p, u, on] = await Promise.all([history(tenant, 40), pendingFor(tenant), usageFor(tenant.tenantId), aiConfigured()]);
    return Response.json({ configured: on, history: h, pending: p, usage: u });
  } catch (error) {
    console.error("ai.assistant.get_failed", error);
    return Response.json({ error: "Unable to load the assistant." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const action = new URL(request.url).searchParams.get("action");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (action === "approve") {
      const r = await approve(tenant, cleanText(body.id, 80));
      const failed = r.result && typeof r.result === "object" && "error" in (r.result as Record<string, unknown>);
      return Response.json({ done: !failed, summary: r.summary, result: r.result }, { status: failed ? 409 : 200 });
    }
    if (action === "dismiss") { await dismiss(tenant, cleanText(body.id, 80)); return Response.json({ dismissed: true }); }
    const reply = await ask(tenant, String(body.message || ""), cleanText(body.screen, 200));
    return Response.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant hit a problem.";
    const status = /isn't switched on|used its/.test(message) ? 503 : /no longer pending|Say something/.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    await forget(tenant);
    return Response.json({ cleared: true });
  } catch (error) {
    console.error("ai.assistant.delete_failed", error);
    return Response.json({ error: "Unable to clear the conversation." }, { status: 500 });
  }
}
