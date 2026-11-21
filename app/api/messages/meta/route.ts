/**
 * "Connect with Facebook" for Cyncro Messages.
 *   GET ?step=start    → owner/admin is sent to Facebook's login dialog (signed state carries the company)
 *   GET ?step=callback → code exchanged, every Page (and its linked Instagram account) saved as a channel and subscribed to the webhook
 */
import { ensureCoreSchema } from "@/lib/core/db";
import { requireTenantAction } from "@/lib/core/tenantAuth";
import { exchangeCode, listPages, metaAppConfigured, metaAppId, oauthBase, readState, signState, subscribePage, META_SCOPES } from "@/lib/messages/meta";
import { upsertChannel } from "@/lib/messages/inbox";

const redirectUri = (request: Request) => { const u = new URL(request.url); return `${u.origin}/api/messages/meta?step=callback`; };

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url); const step = url.searchParams.get("step") || "start";
    if (!metaAppConfigured()) return Response.json({ error: "The Cyncro Meta app isn't configured on this deployment yet." }, { status: 503 });
    if (step === "start") {
      const t = await requireTenantAction(request, "edit"); if (t instanceof Response) return t;
      if (t.role !== "OWNER" && t.role !== "ADMIN") return Response.json({ error: "Only an owner or admin can connect social accounts." }, { status: 403 });
      const state = await signState(t.tenantId);
      const dialog = new URL(`${oauthBase()}/dialog/oauth`);
      dialog.searchParams.set("client_id", metaAppId()); dialog.searchParams.set("redirect_uri", redirectUri(request)); dialog.searchParams.set("state", state); dialog.searchParams.set("scope", META_SCOPES.join(",")); dialog.searchParams.set("response_type", "code");
      if (url.searchParams.get("format") === "json") return Response.json({ url: dialog.toString() });
      return Response.redirect(dialog.toString(), 302);
    }
    if (step === "callback") {
      const tenantId = await readState(String(url.searchParams.get("state") || ""));
      if (!tenantId) return Response.redirect(new URL("/#messages?connected=meta&error=state", request.url).toString(), 302);
      if (url.searchParams.get("error")) return Response.redirect(new URL(`/#messages?connected=meta&error=${encodeURIComponent(String(url.searchParams.get("error_description") || url.searchParams.get("error")))}`, request.url).toString(), 302);
      const code = String(url.searchParams.get("code") || ""); if (!code) return Response.json({ error: "Missing code." }, { status: 400 });
      const user = await exchangeCode(code, redirectUri(request));
      const pages = await listPages(user.userToken);
      let saved = 0;
      for (const p of pages) {
        await upsertChannel(tenantId, { kind: "FACEBOOK", externalId: p.id, displayName: p.name, accessToken: p.access_token, metaUserId: user.userId }); saved++;
        if (p.instagram?.id) { await upsertChannel(tenantId, { kind: "INSTAGRAM", externalId: p.instagram.id, displayName: p.instagram.username ? `@${p.instagram.username}` : `${p.name} (Instagram)`, accessToken: p.access_token, metaUserId: user.userId }); saved++; }
        await subscribePage(p).catch(() => false);
      }
      if (url.searchParams.get("format") === "json") return Response.json({ saved, pages: pages.length });
      return Response.redirect(new URL(`/#messages?connected=meta&accounts=${saved}`, request.url).toString(), 302);
    }
    return Response.json({ error: "Unknown step." }, { status: 400 });
  } catch (error) {
    console.error("messages.meta_oauth_failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Facebook connection failed." }, { status: 500 });
  }
}
