/**
 * Webhook Delivery Processor & Retry Engine (Phase 29)
 *
 * Background worker for:
 * - Processing pending webhook deliveries
 * - Exponential backoff retry logic
 * - HTTP delivery with timeout and response tracking
 * - Auto-disable on repeated failures
 * - Dead letter queue for permanent failures
 * - Delivery attempt tracking and analytics
 */

import { coreDb } from "@/lib/core/db";
import {
  markDelivered,
  scheduleRetry,
  markFailed,
  getPendingDeliveries,
  getWebhook,
  disableIfTooManyFailures,
  WebhookDelivery,
  createSignature,
} from "@/lib/core/webhooks";

export interface DeliveryAttempt {
  deliveryId: string;
  webhookId: string;
  tenantId: string;
  attempt: number;
  statusCode?: number;
  error?: string;
  responseTime: number;
  timestamp: string;
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  errors: string[];
}

const MAX_RETRY_ATTEMPTS = 10;
const BASE_BACKOFF_SECONDS = 60; // Start at 1 minute
const MAX_BACKOFF_SECONDS = 3600; // Cap at 1 hour

/**
 * Calculate next retry time using exponential backoff
 * Backoff = BASE * (2 ^ (attempt - 1))
 */
function calculateBackoffSeconds(attempt: number): number {
  const backoff = BASE_BACKOFF_SECONDS * Math.pow(2, attempt - 1);
  return Math.min(backoff, MAX_BACKOFF_SECONDS);
}

/**
 * Deliver a single webhook with timeout and retries
 */
async function deliverWebhook(
  delivery: WebhookDelivery,
  webhook: {
    id: string;
    url: string;
    secret: string;
    timeout: number;
    maxRetries: number;
  }
): Promise<{
  success: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const payload = JSON.stringify(delivery.payload);
    const signature = createSignature(payload, webhook.secret);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cyncro-Signature": signature,
        "X-Cyncro-Delivery-Id": delivery.id,
        "X-Cyncro-Event": delivery.eventType,
        "X-Cyncro-Webhook-Id": webhook.id,
        "User-Agent": "Cyncro-Webhook-Processor/1.0",
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    const responseBody = await response.text();

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        responseTime,
      };
    }

    return {
      success: false,
      statusCode: response.status,
      responseTime,
      error: `HTTP ${response.status}: ${responseBody.substring(0, 200)}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";

    return {
      success: false,
      responseTime,
      error: errorMessage.substring(0, 200),
    };
  }
}

/**
 * Process a single pending delivery
 */
async function processDelivery(delivery: WebhookDelivery): Promise<boolean> {
  try {
    const webhook = await getWebhook(delivery.tenantId, delivery.webhookId);
    if (!webhook) {
      // Webhook was deleted, mark as failed
      await markFailed(
        delivery.id,
        "Webhook endpoint no longer exists"
      );
      return false;
    }

    if (!webhook.active) {
      // Webhook is disabled, mark as failed
      await markFailed(delivery.id, "Webhook is disabled");
      return false;
    }

    // Attempt delivery
    const result = await deliverWebhook(delivery, {
      id: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      timeout: webhook.timeout,
      maxRetries: webhook.maxRetries,
    });

    if (result.success) {
      // Mark as delivered
      await markDelivered(delivery.id, result.statusCode || 200, undefined, result.responseTime);

      // Log successful delivery
      console.log(
        `Webhook delivered: ${delivery.webhookId} (${delivery.id}) - ${result.statusCode} in ${result.responseTime}ms`
      );

      return true;
    }

    // Handle failed delivery
    if (delivery.attempt >= webhook.maxRetries) {
      // Max retries exceeded
      await markFailed(delivery.id, result.error || "Max retries exceeded");

      // Check if webhook should be disabled
      const wasDisabled = await disableIfTooManyFailures(
        delivery.webhookId,
        10 // Disable after 10 failures
      );

      if (wasDisabled) {
        console.warn(
          `Webhook disabled due to repeated failures: ${delivery.webhookId}`
        );
      }

      console.error(
        `Webhook delivery failed (max retries): ${delivery.webhookId} (${delivery.id}) - ${result.error}`
      );

      return false;
    }

    // Schedule retry with exponential backoff
    const nextAttempt = delivery.attempt + 1;
    const backoffSeconds = calculateBackoffSeconds(nextAttempt);
    const nextRetryAt = new Date(
      Date.now() + backoffSeconds * 1000
    ).toISOString();

    await scheduleRetry(
      delivery.id,
      nextRetryAt,
      result.error || "Delivery failed"
    );

    console.log(
      `Webhook scheduled for retry: ${delivery.webhookId} (${delivery.id}) - attempt ${nextAttempt} in ${backoffSeconds}s`
    );

    return false; // Not yet successful, but retry scheduled
  } catch (error) {
    console.error(
      `Error processing webhook delivery ${delivery.id}:`,
      error
    );

    // Mark as failed on processor error
    await markFailed(
      delivery.id,
      error instanceof Error ? error.message : "Processor error"
    );

    return false;
  }
}

/**
 * Main webhook processor - processes all pending deliveries
 * Should be called periodically (e.g., every 30 seconds)
 */
export async function processWebhookQueue(
  limit: number = 100
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    errors: [],
  };

  try {
    // Get pending deliveries
    const deliveries = await getPendingDeliveries(limit);

    if (deliveries.length === 0) {
      console.log("No pending webhook deliveries");
      return result;
    }

    console.log(`Processing ${deliveries.length} pending webhook deliveries`);

    // Process each delivery
    for (const delivery of deliveries) {
      const success = await processDelivery(delivery);

      result.processed++;

      if (success) {
        result.succeeded++;
      } else if (delivery.status === "RETRYING") {
        result.retrying++;
      } else {
        result.failed++;
      }
    }

    console.log(
      `Webhook processing complete: ${result.succeeded} succeeded, ${result.retrying} retrying, ${result.failed} failed`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(errorMessage);
    console.error("Webhook queue processing error:", error);
  }

  return result;
}

/**
 * Get webhook delivery analytics for a tenant
 */
export async function getWebhookAnalytics(
  tenantId: string,
  days: number = 7
): Promise<{
  totalDeliveries: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  avgResponseTime: number;
  successRate: number;
  topWebhooks: Array<{
    webhookId: string;
    deliveryCount: number;
    successCount: number;
  }>;
}> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { results: stats } = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failure,
        SUM(CASE WHEN status = 'RETRYING' THEN 1 ELSE 0 END) as retrying,
        AVG(CAST(response_time_ms as FLOAT)) as avg_response_time
      FROM webhook_deliveries
      WHERE tenant_id = ? AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<{
      total: number;
      success: number;
      failure: number;
      retrying: number;
      avg_response_time: number;
    }>();

  const totalDeliveries = stats[0]?.total || 0;
  const successCount = stats[0]?.success || 0;
  const failureCount = stats[0]?.failure || 0;
  const retryCount = stats[0]?.retrying || 0;
  const avgResponseTime = stats[0]?.avg_response_time || 0;

  // Get top webhooks
  const { results: topWebhooks } = await db
    .prepare(
      `SELECT
        webhook_id,
        COUNT(*) as delivery_count,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as success_count
      FROM webhook_deliveries
      WHERE tenant_id = ? AND created_at > ?
      GROUP BY webhook_id
      ORDER BY delivery_count DESC
      LIMIT 10`
    )
    .bind(tenantId, startDate)
    .all<{
      webhook_id: string;
      delivery_count: number;
      success_count: number;
    }>();

  return {
    totalDeliveries,
    successCount,
    failureCount,
    retryCount,
    avgResponseTime: Math.round(avgResponseTime),
    successRate:
      totalDeliveries > 0 ? Math.round((successCount / totalDeliveries) * 100) : 0,
    topWebhooks: topWebhooks.map((w) => ({
      webhookId: w.webhook_id,
      deliveryCount: w.delivery_count,
      successCount: w.success_count,
    })),
  };
}

/**
 * Cleanup old completed deliveries to maintain performance
 */
export async function cleanupOldDeliveries(
  tenantId: string,
  daysOld: number = 30
): Promise<number> {
  const db = coreDb();
  const cutoffDate = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000
  ).toISOString();

  const result = await db
    .prepare(
      `DELETE FROM webhook_deliveries
       WHERE tenant_id = ? AND created_at < ? AND status = 'DELIVERED'`
    )
    .bind(tenantId, cutoffDate)
    .run();

  return result.meta?.changes || 0;
}
