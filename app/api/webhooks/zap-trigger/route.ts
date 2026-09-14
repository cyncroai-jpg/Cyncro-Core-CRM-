/**
 * Zap Trigger Webhook
 *
 * POST /api/webhooks/zap-trigger
 * Internal webhook to fire zap triggers
 * Called from other modules when events occur
 *
 * Query params:
 * - tenantId: required
 * - app: required (e.g., "cyncro", "slack", "hubspot")
 * - event: required (e.g., "contact.created", "deal.updated")
 * - data: JSON stringified trigger data
 */

import { ensureCoreSchema } from "@/lib/core/db";
import { fireZapTrigger } from "@/lib/core/integrations";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    const app = url.searchParams.get("app");
    const event = url.searchParams.get("event");
    const dataStr = url.searchParams.get("data");

    if (!tenantId || !app || !event) {
      return Response.json(
        { error: "tenantId, app, and event are required" },
        { status: 400 }
      );
    }

    let triggerData: Record<string, unknown> = {};
    if (dataStr) {
      try {
        triggerData = JSON.parse(dataStr);
      } catch {
        // Ignore parse errors
      }
    }

    // Fire zap trigger
    await fireZapTrigger(tenantId, app, event, triggerData);

    return Response.json({ triggered: true });
  } catch (error) {
    console.error("zap.trigger.failed", error);
    return Response.json(
      { error: "Trigger failed" },
      { status: 500 }
    );
  }
}
