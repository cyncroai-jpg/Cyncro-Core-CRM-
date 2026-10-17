/** GET /api/launch — platform owner only: which live-site secrets are set, so you know what is still off. Never returns values. */
import { env } from "cloudflare:workers";
import { ensureCoreSchema } from "@/lib/core/db";
import { isPlatformOwner } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await isPlatformOwner(request))) return Response.json({ error: "Platform owner only." }, { status: 403 });
    const e = env as unknown as Record<string, string | undefined>;
    const has = (k: string) => Boolean(e[k]);
    const groups = [
      { name: "Email (Resend)", keys: ["RESEND_API_KEY", "EMAIL_FROM"], unlocks: "invites, booking confirmations, contracts, reminders, password reset" },
      { name: "Payments (Stripe)", keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_SCALE", "STRIPE_PRICE_AGENCY"], unlocks: "paid plans, agency billing, customer invoices" },
      { name: "Cyncro AI", keys: ["ANTHROPIC_API_KEY"], unlocks: "assistant, agents, texting Cyncro" },
      { name: "Texting (Twilio)", keys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"], unlocks: "SMS automations, inbound texts" },
      { name: "Google", keys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], unlocks: "calendar sync, Gmail sending" },
      { name: "Prospecting", keys: ["SERPER_API_KEY"], unlocks: "business search" },
    ].map((g) => ({ ...g, set: g.keys.filter(has), missing: g.keys.filter((k) => !has(k)), ready: g.keys.every(has) }));
    return Response.json({ groups, readyToCharge: groups[1].ready && groups[0].ready });
  } catch (error) { console.error("launch.get_failed", error); return Response.json({ error: "Unable to check." }, { status: 500 }); }
}
