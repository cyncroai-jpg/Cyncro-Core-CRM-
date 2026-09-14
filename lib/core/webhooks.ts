/**
 * Webhook Management & Delivery System (Phase 27)
 *
 * Comprehensive webhook infrastructure:
 * - Register webhook endpoints per tenant
 * - 15+ event types (contacts, deals, bookings, etc.)
 * - Retry logic with exponential backoff
 * - HMAC-SHA256 signature verification
 * - Delivery tracking and debugging
 * - Conditional delivery based on filters
 * - Auto-disable on repeated failures
 */
import crypto from "crypto";
import { coreDb } from "@/lib/core/db";

export type WebhookEventType =
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "deal.created"
  | "deal.updated"
  | "deal.won"
  | "deal.lost"
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "appointment.created"
  | "appointment.cancelled"
  | "appointment.rescheduled"
  | "appointment.completed"
  | "appointment.no_show"
  | "sequence.enrolled"
  | "sequence.completed"
  | "workflow.executed"
  | "form.submitted"
  | "activity.created";

export type WebhookStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "RETRYING";

export interface Webhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  status: WebhookStatus;
  headers?: Record<string, string>;
  filter?: Record<string, unknown>;
  maxRetries: number;
  timeout: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  tenantId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  attempt: number;
  nextRetryAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Create webhook */
export async function createWebhook(
  tenantId: string,
  name: string,
  url: string,
  events: WebhookEventType[],
  options?: {
    headers?: Record<string, string>;
    filter?: Record<string, unknown>;
    maxRetries?: number;
    timeout?: number;
  }
): Promise<Webhook> {
  const db = coreDb();
  const webhookId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();

  const webhook: Webhook = {
    id: webhookId,
    tenantId,
    name,
    url,
    events,
    secret,
    status: "ACTIVE",
    headers: options?.headers,
    filter: options?.filter,
    maxRetries: options?.maxRetries || 5,
    timeout: options?.timeout || 30000,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO webhooks
       (id, tenant_id, name, url, events, secret, status, headers, filter, max_retries, timeout, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      webhookId,
      tenantId,
      name,
      url,
      JSON.stringify(events),
      secret,
      "ACTIVE",
      options?.headers ? JSON.stringify(options.headers) : null,
      options?.filter ? JSON.stringify(options.filter) : null,
      options?.maxRetries || 5,
      options?.timeout || 30000,
      now,
      now
    )
    .run();

  return webhook;
}

/** Get webhook */
export async function getWebhook(
  tenantId: string,
  webhookId: string
): Promise<Webhook | null> {
  const db = coreDb();

  const result = await db
    .prepare(`SELECT * FROM webhooks WHERE id = ? AND tenant_id = ?`)
    .bind(webhookId, tenantId)
    .first<Record<string, unknown>>();

  if (!result) return null;

  return {
    id: String(result.id),
    tenantId: String(result.tenant_id),
    name: String(result.name),
    url: String(result.url),
    events: JSON.parse(String(result.events || "[]")),
    secret: String(result.secret),
    status: String(result.status) as WebhookStatus,
    headers: result.headers ? JSON.parse(String(result.headers)) : undefined,
    filter: result.filter ? JSON.parse(String(result.filter)) : undefined,
    maxRetries: Number(result.max_retries),
    timeout: Number(result.timeout),
    active: Boolean(result.active),
    createdAt: String(result.created_at),
    updatedAt: String(result.updated_at),
  };
}

/** List webhooks for tenant */
export async function listWebhooks(
  tenantId: string,
  active?: boolean
): Promise<Webhook[]> {
  const db = coreDb();

  let query = `SELECT * FROM webhooks WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (active !== undefined) {
    query += ` AND active = ?`;
    params.push(active ? 1 : 0);
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    url: String(row.url),
    events: JSON.parse(String(row.events || "[]")),
    secret: String(row.secret),
    status: String(row.status) as WebhookStatus,
    headers: row.headers ? JSON.parse(String(row.headers)) : undefined,
    filter: row.filter ? JSON.parse(String(row.filter)) : undefined,
    maxRetries: Number(row.max_retries),
    timeout: Number(row.timeout),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/** Queue webhook delivery */
export async function queueWebhookDelivery(
  webhookId: string,
  tenantId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<WebhookDelivery> {
  const db = coreDb();
  const deliveryId = crypto.randomUUID();
  const now = new Date().toISOString();

  const delivery: WebhookDelivery = {
    id: deliveryId,
    webhookId,
    tenantId,
    eventType,
    payload,
    status: "PENDING",
    attempt: 1,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO webhook_deliveries
       (id, webhook_id, tenant_id, event_type, payload, status, attempt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(
      deliveryId,
      webhookId,
      tenantId,
      eventType,
      JSON.stringify(payload),
      "PENDING",
      now
    )
    .run();

  return delivery;
}

/** Trigger webhooks for event */
export async function triggerWebhooks(
  tenantId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<string[]> {
  const webhooks = await listWebhooks(tenantId, true);
  const deliveryIds: string[] = [];

  for (const webhook of webhooks) {
    if (!webhook.events.includes(eventType)) continue;

    if (webhook.filter && !evaluateFilter(payload, webhook.filter)) continue;

    const delivery = await queueWebhookDelivery(
      webhook.id,
      tenantId,
      eventType,
      {
        id: crypto.randomUUID(),
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
      }
    );

    deliveryIds.push(delivery.id);
  }

  return deliveryIds;
}

function evaluateFilter(
  payload: Record<string, unknown>,
  filter: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (payload[key] !== value) return false;
  }
  return true;
}

/** Create HMAC signature */
export function createSignature(
  payload: string,
  secret: string
): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Mark delivery as delivered */
export async function markDelivered(
  deliveryId: string,
  statusCode: number,
  responseBody?: string
): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE webhook_deliveries
       SET status = ?, status_code = ?, response_body = ?, delivered_at = ?
       WHERE id = ?`
    )
    .bind("DELIVERED", statusCode, responseBody || null, new Date().toISOString(), deliveryId)
    .run();
}

/** Schedule retry for failed delivery */
export async function scheduleRetry(
  deliveryId: string,
  nextRetryAt: string,
  error: string
): Promise<void> {
  const db = coreDb();
  const delivery = await db
    .prepare(`SELECT attempt FROM webhook_deliveries WHERE id = ?`)
    .bind(deliveryId)
    .first<{ attempt: number }>();

  const nextAttempt = (delivery?.attempt || 1) + 1;

  await db
    .prepare(
      `UPDATE webhook_deliveries
       SET status = ?, next_retry_at = ?, attempt = ?, error = ?
       WHERE id = ?`
    )
    .bind("RETRYING", nextRetryAt, nextAttempt, error, deliveryId)
    .run();
}

/** Mark delivery as failed */
export async function markFailed(
  deliveryId: string,
  error: string
): Promise<void> {
  const db = coreDb();
  await db
    .prepare(`UPDATE webhook_deliveries SET status = ?, error = ? WHERE id = ?`)
    .bind("FAILED", error, deliveryId)
    .run();
}

/** Get pending deliveries */
export async function getPendingDeliveries(
  limit: number = 100
): Promise<WebhookDelivery[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM webhook_deliveries
       WHERE status IN ('PENDING', 'RETRYING')
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .bind(new Date().toISOString(), limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    webhookId: String(row.webhook_id),
    tenantId: String(row.tenant_id),
    eventType: String(row.event_type) as WebhookEventType,
    payload: JSON.parse(String(row.payload)),
    status: String(row.status) as DeliveryStatus,
    statusCode: row.status_code ? Number(row.status_code) : undefined,
    responseBody: row.response_body ? String(row.response_body) : undefined,
    error: row.error ? String(row.error) : undefined,
    attempt: Number(row.attempt),
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : undefined,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
    createdAt: String(row.created_at),
  }));
}

/** Get delivery history */
export async function getDeliveryHistory(
  webhookId: string,
  limit: number = 50
): Promise<WebhookDelivery[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM webhook_deliveries
       WHERE webhook_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(webhookId, limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    webhookId: String(row.webhook_id),
    tenantId: String(row.tenant_id),
    eventType: String(row.event_type) as WebhookEventType,
    payload: JSON.parse(String(row.payload)),
    status: String(row.status) as DeliveryStatus,
    statusCode: row.status_code ? Number(row.status_code) : undefined,
    responseBody: row.response_body ? String(row.response_body) : undefined,
    error: row.error ? String(row.error) : undefined,
    attempt: Number(row.attempt),
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : undefined,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
    createdAt: String(row.created_at),
  }));
}

/** Disable webhook on repeated failures */
export async function disableIfTooManyFailures(
  webhookId: string,
  failureThreshold: number = 10
): Promise<boolean> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM webhook_deliveries
       WHERE webhook_id = ? AND status = 'FAILED'`
    )
    .bind(webhookId)
    .all<{ count: number }>();

  const failureCount = results[0]?.count || 0;

  if (failureCount >= failureThreshold) {
    await db
      .prepare(`UPDATE webhooks SET active = 0, status = ? WHERE id = ?`)
      .bind("DISABLED", webhookId)
      .run();
    return true;
  }

  return false;
}
