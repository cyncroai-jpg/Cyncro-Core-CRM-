/**
 * Automation Webhook™ delivery engine — Cyncro Universal Calendar™
 *
 * Signs every outbound payload with HMAC-SHA256 so receivers can verify
 * authenticity. Delivers to all active endpoints subscribed to the event.
 * Non-blocking: all errors are caught and logged; a failed delivery is
 * recorded in calendar_webhook_deliveries for later inspection / retry.
 *
 * Events fired:
 *   appointment.created      — new booking confirmed
 *   appointment.cancelled    — booking cancelled
 *   appointment.rescheduled  — booking rescheduled
 *   appointment.completed    — outcome marked completed
 *   appointment.no_show      — outcome marked no-show
 */
import { coreDb } from "@/lib/core/db";

export type WebhookEvent =
  | "appointment.created"
  | "appointment.cancelled"
  | "appointment.rescheduled"
  | "appointment.completed"
  | "appointment.no_show";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deliver a webhook event to all active subscribed endpoints.
 * Fire-and-forget — call with `void dispatchWebhookEvent(...)` from route handlers.
 */
export async function dispatchWebhookEvent(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const db = coreDb();
    const { results: endpoints } = await db.prepare(
      "SELECT * FROM calendar_webhook_endpoints WHERE active = 1"
    ).all<{ id: string; url: string; secret: string; events: string; name: string }>();
    if (!endpoints.length) return;

    const payload: WebhookPayload = { event, timestamp: new Date().toISOString(), data };
    const body = JSON.stringify(payload);
    const now = new Date().toISOString();

    for (const ep of endpoints) {
      let subscribedEvents: string[] = [];
      try { subscribedEvents = JSON.parse(ep.events); } catch { subscribedEvents = []; }
      // Empty events array = subscribe to all
      if (subscribedEvents.length > 0 && !subscribedEvents.includes(event)) continue;

      const deliveryId = crypto.randomUUID();
      const sig = await hmacSha256(ep.secret, body);

      // Optimistic insert as PENDING
      await db.prepare(`INSERT INTO calendar_webhook_deliveries
        (id, endpoint_id, event, payload, status, attempt_count, created_at)
        VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`)
        .bind(deliveryId, ep.id, event, body, now).run();

      // Attempt delivery (30s timeout)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Cyncro-Event": event,
            "X-Cyncro-Signature": `sha256=${sig}`,
            "X-Cyncro-Delivery": deliveryId,
            "User-Agent": "Cyncro-Webhooks/1.0",
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const responseBody = await res.text().catch(() => "");
        const status = res.ok ? "DELIVERED" : "FAILED";
        await db.prepare(`UPDATE calendar_webhook_deliveries
          SET status = ?, response_code = ?, response_body = ?, attempt_count = 1, delivered_at = ?, updated_at = ?
          WHERE id = ?`)
          .bind(status, res.status, responseBody.slice(0, 2000), res.ok ? now : null, now, deliveryId).run();
        if (!res.ok) {
          // Schedule one retry 60s from now
          const retryAt = new Date(Date.now() + 60_000).toISOString();
          await db.prepare("UPDATE calendar_webhook_deliveries SET next_retry_at = ? WHERE id = ?")
            .bind(retryAt, deliveryId).run();
        }
      } catch (err) {
        console.error("webhook.delivery.failed", { deliveryId, endpoint: ep.url, error: String(err) });
        const retryAt = new Date(Date.now() + 60_000).toISOString();
        await db.prepare(`UPDATE calendar_webhook_deliveries
          SET status = 'FAILED', attempt_count = 1, response_body = ?, next_retry_at = ?, updated_at = ?
          WHERE id = ?`)
          .bind(String(err).slice(0, 2000), retryAt, now, deliveryId).run();
      }
    }
  } catch (err) {
    // Never throw — webhook dispatch is always fire-and-forget
    console.error("webhook.dispatch.error", err);
  }
}
