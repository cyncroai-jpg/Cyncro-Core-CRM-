import { config } from "@/lib/dispatch/config";
import { DispatchError } from "@/lib/dispatch/errors";
import { log } from "@/lib/dispatch/logger";
import { failure, ok, requestId } from "@/lib/dispatch/response";
import { clientIp, rateLimit, verifyHmac } from "@/lib/dispatch/security";
import { serviceRpc } from "@/lib/dispatch/supabase";
import { validateSms } from "@/lib/dispatch/validation";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384)
      throw new DispatchError(400, "BAD_REQUEST", "Webhook body is too large.");
    const cfg = config(true);
    await verifyHmac(request, raw, cfg.smsWebhookSecret);
    if (!cfg.smsEncryptionKey)
      throw new DispatchError(
        503,
        "UPSTREAM_UNAVAILABLE",
        "SMS encryption is not configured.",
      );
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new DispatchError(400, "BAD_REQUEST", "Webhook body is invalid.");
    }
    const sms = validateSms(parsed);

    await rateLimit("sms-provider-ip", clientIp(request), 300, 60);
    await rateLimit("sms-sender", sms.from, 12, 600);

    const result = (await serviceRpc("dispatch_ingest_sms", {
      p_from: sms.from,
      p_body: sms.body,
      p_provider_message_id: sms.providerMessageId,
      p_request_id: id,
      p_encryption_key: cfg.smsEncryptionKey,
    })) as { duplicate?: boolean; conversation_id?: string; queued?: boolean };

    log("info", result.duplicate ? "sms.duplicate" : "sms.accepted", {
      requestId: id,
      conversationId: result.conversation_id,
    });
    return ok(
      {
        accepted: true,
        duplicate: Boolean(result.duplicate),
        queued: result.queued !== false,
      },
      id,
      202,
    );
  } catch (error) {
    return failure(error, id, "sms.inbound.failed");
  }
}
