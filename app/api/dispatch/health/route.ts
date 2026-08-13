import { requestId, ok } from "@/lib/dispatch/response";

export async function GET(request: Request) {
  const id = requestId(request);
  const connected = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
  );
  return ok(
    {
      status: connected ? "ready" : "configuration_required",
      service: "cyncro-dispatch",
      checks: {
        api: "healthy",
        database: connected ? "configured" : "not_configured",
        sms: process.env.SMS_WEBHOOK_SECRET ? "configured" : "not_configured",
      },
      timestamp: new Date().toISOString(),
    },
    id,
  );
}
