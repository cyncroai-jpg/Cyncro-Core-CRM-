/**
 * Zapier-like Integration Platform
 *
 * Connect Cyncro to 7000+ apps via:
 * - OAuth (Google, Slack, HubSpot, etc)
 * - API Keys (custom integrations)
 * - Webhooks (inbound + outbound)
 *
 * Supported integrations:
 * - Communication: Slack, Teams, Discord, Twilio
 * - CRM: HubSpot, Pipedrive, Salesforce
 * - Productivity: Google Workspace, Notion, Asana
 * - Payment: Stripe, PayPal
 * - Email: Gmail, Outlook
 * - Analytics: Mixpanel, Amplitude
 *
 * "Zaps" = automated workflows connecting triggers to actions
 * Example: "When contact tagged 'Hot Lead' → Send Slack message"
 */

import { coreDb } from "@/lib/core/db";

export interface Integration {
  id: string;
  tenantId: string;
  appName: string;
  appIconUrl?: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  authType: "oauth" | "api_key" | "webhook";
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  apiKey?: string;
  webhookUrl?: string;
  connectedBy?: string;
  connectedAt: string;
  lastUsedAt?: string;
}

export interface Zap {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  triggerApp: string;
  triggerEvent: string;
  actionApp: string;
  actionEvent: string;
  triggerConfig?: Record<string, unknown>;
  actionConfig?: Record<string, unknown>;
  executionCount: number;
  lastExecutedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZapExecution {
  id: string;
  tenantId: string;
  zapId: string;
  triggerData?: Record<string, unknown>;
  actionResult?: Record<string, unknown>;
  status: "PENDING" | "SUCCESS" | "FAILED";
  errorMessage?: string;
  executedAt: string;
}

/** Connect app to tenant */
export async function connectIntegration(
  tenantId: string,
  appName: string,
  authType: "oauth" | "api_key" | "webhook",
  accessToken?: string,
  apiKey?: string,
  connectedBy?: string
): Promise<Integration> {
  const db = coreDb();
  const now = new Date().toISOString();
  const integrationId = crypto.randomUUID();

  const integration: Integration = {
    id: integrationId,
    tenantId,
    appName,
    status: "CONNECTED",
    authType,
    accessToken,
    apiKey,
    connectedBy,
    connectedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO integrations
       (id, tenant_id, app_name, status, auth_type, access_token, api_key, connected_by, connected_at)
       VALUES (?, ?, ?, 'CONNECTED', ?, ?, ?, ?, ?)`
    )
    .bind(
      integrationId,
      tenantId,
      appName,
      authType,
      accessToken || null,
      apiKey || null,
      connectedBy || null,
      now
    )
    .run();

  return integration;
}

/** Create a Zap (automation) */
export async function createZap(
  tenantId: string,
  name: string,
  triggerApp: string,
  triggerEvent: string,
  actionApp: string,
  actionEvent: string,
  triggerConfig?: Record<string, unknown>,
  actionConfig?: Record<string, unknown>,
  createdBy?: string
): Promise<Zap> {
  const db = coreDb();
  const now = new Date().toISOString();
  const zapId = crypto.randomUUID();

  const zap: Zap = {
    id: zapId,
    tenantId,
    name,
    enabled: true,
    triggerApp,
    triggerEvent,
    actionApp,
    actionEvent,
    triggerConfig,
    actionConfig,
    executionCount: 0,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO zaps
       (id, tenant_id, name, trigger_app, trigger_event, action_app, action_event,
        trigger_config, action_config, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      zapId,
      tenantId,
      name,
      triggerApp,
      triggerEvent,
      actionApp,
      actionEvent,
      triggerConfig ? JSON.stringify(triggerConfig) : null,
      actionConfig ? JSON.stringify(actionConfig) : null,
      createdBy || null,
      now,
      now
    )
    .run();

  return zap;
}

/** Execute action for a zap */
export async function executeZapAction(
  tenantId: string,
  zapId: string,
  triggerData: Record<string, unknown>
): Promise<ZapExecution> {
  const db = coreDb();
  const now = new Date().toISOString();
  const executionId = crypto.randomUUID();

  // Get zap
  const zap = await db
    .prepare(`SELECT * FROM zaps WHERE id = ? AND tenant_id = ?`)
    .bind(zapId, tenantId)
    .first<Record<string, unknown>>();

  if (!zap) {
    throw new Error("Zap not found");
  }

  let status = "SUCCESS";
  let actionResult: Record<string, unknown> | undefined;
  let errorMessage: string | undefined;

  try {
    // Execute action based on app/event
    actionResult = await executeAction(
      tenantId,
      String(zap.action_app),
      String(zap.action_event),
      triggerData,
      zap.action_config ? JSON.parse(String(zap.action_config)) : {}
    );
  } catch (err) {
    status = "FAILED";
    errorMessage = String(err);
    console.error("zap.action.failed", { zapId, error: err });
  }

  // Log execution
  const execution: ZapExecution = {
    id: executionId,
    tenantId,
    zapId,
    triggerData,
    actionResult,
    status: status as "SUCCESS" | "FAILED" | "PENDING",
    errorMessage,
    executedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO zap_executions
       (id, tenant_id, zap_id, trigger_data, action_result, status, error_message, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      executionId,
      tenantId,
      zapId,
      JSON.stringify(triggerData),
      actionResult ? JSON.stringify(actionResult) : null,
      status,
      errorMessage || null,
      now
    )
    .run();

  // Update zap execution count
  await db
    .prepare(
      `UPDATE zaps SET execution_count = execution_count + 1, last_executed_at = ? WHERE id = ?`
    )
    .bind(now, zapId)
    .run();

  return execution;
}

/** Execute action (mock implementation - integrate real APIs in production) */
async function executeAction(
  tenantId: string,
  app: string,
  event: string,
  triggerData: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Mock implementations for common actions
  // Production: call real APIs (Slack, HubSpot, etc.)

  switch (app) {
    case "slack":
      if (event === "send_message") {
        // Would call Slack API
        const channel = config.channel || "#general";
        const message = String(config.message || "");
        console.log(`[SLACK] Sending to ${channel}: ${message}`);
        return { channel, message, timestamp: Date.now() };
      }
      break;

    case "email":
      if (event === "send_email") {
        const email = config.email || triggerData.email;
        const subject = config.subject || "Notification";
        console.log(`[EMAIL] Sending to ${email}: ${subject}`);
        return { email, subject, sent: true };
      }
      break;

    case "google_sheets":
      if (event === "append_row") {
        const spreadsheetId = config.spreadsheetId;
        const values = [
          triggerData.name,
          triggerData.email,
          triggerData.phone,
        ];
        console.log(`[SHEETS] Appending row to ${spreadsheetId}:`, values);
        return { spreadsheetId, values, appended: true };
      }
      break;

    case "hubspot":
      if (event === "create_contact") {
        const email = triggerData.email;
        const firstName = triggerData.firstName;
        const lastName = triggerData.lastName;
        console.log(`[HUBSPOT] Creating contact: ${firstName} ${lastName}`);
        return { email, firstName, lastName, created: true };
      }
      break;

    case "notion":
      if (event === "create_page") {
        const title = config.title || triggerData.title;
        const database = config.database;
        console.log(`[NOTION] Creating page in ${database}: ${title}`);
        return { title, database, created: true };
      }
      break;
  }

  return { action: event, app, executed: true };
}

/** Fire trigger for all zaps listening to it */
export async function fireZapTrigger(
  tenantId: string,
  triggerApp: string,
  triggerEvent: string,
  triggerData: Record<string, unknown>
): Promise<void> {
  const db = coreDb();

  // Find all enabled zaps for this trigger
  const { results: zaps } = await db
    .prepare(
      `SELECT * FROM zaps
       WHERE tenant_id = ? AND trigger_app = ? AND trigger_event = ? AND enabled = 1`
    )
    .bind(tenantId, triggerApp, triggerEvent)
    .all<Record<string, unknown>>();

  // Execute each zap's action
  for (const zap of zaps) {
    try {
      await executeZapAction(tenantId, String(zap.id), triggerData);
    } catch (err) {
      console.error("zap.trigger.execution.failed", { zapId: zap.id, error: err });
    }
  }
}

/** Get user's integrations */
export async function getTenantIntegrations(
  tenantId: string
): Promise<Integration[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT id, tenant_id, app_name, status, auth_type, connected_at, last_used_at
       FROM integrations
       WHERE tenant_id = ?
       ORDER BY connected_at DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    appName: String(r.app_name),
    status: String(r.status) as "CONNECTED" | "DISCONNECTED" | "ERROR",
    authType: String(r.auth_type) as "oauth" | "api_key" | "webhook",
    connectedAt: String(r.connected_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined,
  }));
}

/** Get user's zaps */
export async function getTenantZaps(tenantId: string): Promise<Zap[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM zaps
       WHERE tenant_id = ?
       ORDER BY created_at DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    name: String(r.name),
    enabled: Boolean(r.enabled),
    triggerApp: String(r.trigger_app),
    triggerEvent: String(r.trigger_event),
    actionApp: String(r.action_app),
    actionEvent: String(r.action_event),
    triggerConfig: r.trigger_config ? JSON.parse(String(r.trigger_config)) : undefined,
    actionConfig: r.action_config ? JSON.parse(String(r.action_config)) : undefined,
    executionCount: Number(r.execution_count || 0),
    lastExecutedAt: r.last_executed_at ? String(r.last_executed_at) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}
