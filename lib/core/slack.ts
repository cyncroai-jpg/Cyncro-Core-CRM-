/**
 * Native Slack Integration
 *
 * Bring Cyncro into Slack:
 * - Interactive notifications (new leads, closed deals, etc)
 * - Slash commands (/cyncro contact lookup, /cyncro log activity)
 * - Button interactions (Mark as Won, Schedule Follow-up, etc)
 * - Modal forms (create task, add note, update deal)
 * - App home with daily summary and quick actions
 * - Threaded conversations for context
 *
 * In production, integrate with Slack API (webhook + bot tokens)
 */

import { coreDb } from "@/lib/core/db";

export interface SlackConnection {
  id: string;
  tenantId: string;
  workspaceId: string;
  workspaceName?: string;
  botToken?: string;
  scope?: string;
  installedBy?: string;
  installedAt: string;
  lastUsedAt?: string;
}

export interface SlackNotification {
  id: string;
  tenantId: string;
  slackWorkspaceId?: string;
  channelId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  messageTs?: string;
  sentAt: string;
}

/** Connect Slack workspace */
export async function connectSlackWorkspace(
  tenantId: string,
  workspaceId: string,
  botToken: string,
  workspaceName?: string,
  installedBy?: string
): Promise<SlackConnection> {
  const db = coreDb();
  const now = new Date().toISOString();
  const connectionId = crypto.randomUUID();

  const connection: SlackConnection = {
    id: connectionId,
    tenantId,
    workspaceId,
    workspaceName,
    botToken,
    installedBy,
    installedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO slack_connections
       (id, tenant_id, workspace_id, workspace_name, bot_token, installed_by, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      connectionId,
      tenantId,
      workspaceId,
      workspaceName || null,
      botToken,
      installedBy || null,
      now
    )
    .run();

  return connection;
}

/** Get Slack connection for tenant */
export async function getSlackConnection(
  tenantId: string
): Promise<SlackConnection | null> {
  const db = coreDb();

  const connection = await db
    .prepare(
      `SELECT * FROM slack_connections WHERE tenant_id = ? LIMIT 1`
    )
    .bind(tenantId)
    .first<Record<string, unknown>>();

  if (!connection) return null;

  return {
    id: String(connection.id),
    tenantId: String(connection.tenant_id),
    workspaceId: String(connection.workspace_id),
    workspaceName: connection.workspace_name ? String(connection.workspace_name) : undefined,
    botToken: connection.bot_token ? String(connection.bot_token) : undefined,
    installedAt: String(connection.installed_at),
    lastUsedAt: connection.last_used_at ? String(connection.last_used_at) : undefined,
  };
}

/** Send Slack notification */
export async function sendSlackNotification(
  tenantId: string,
  channelId: string,
  message: string,
  blocks?: unknown[],
  eventType?: string,
  resourceType?: string,
  resourceId?: string
): Promise<SlackNotification> {
  const db = coreDb();
  const now = new Date().toISOString();
  const notificationId = crypto.randomUUID();

  // In production, call Slack API to send message
  // For now, just log to database
  console.log(`[SLACK] Sending to ${channelId}:`, message);

  const notification: SlackNotification = {
    id: notificationId,
    tenantId,
    channelId,
    eventType: eventType || "notification",
    resourceType,
    resourceId,
    sentAt: now,
  };

  await db
    .prepare(
      `INSERT INTO slack_notifications
       (id, tenant_id, channel_id, event_type, resource_type, resource_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      notificationId,
      tenantId,
      channelId,
      eventType || "notification",
      resourceType || null,
      resourceId || null,
      now
    )
    .run();

  return notification;
}

/** Notify on new lead/contact */
export async function notifyNewLead(
  tenantId: string,
  contact: Record<string, unknown>
): Promise<void> {
  const connection = await getSlackConnection(tenantId);
  if (!connection) return;

  const message = `🎯 New Lead: ${contact.name || contact.email}`;
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*New Lead Created*\n${contact.name || "Unknown"}\n${contact.email || "No email"}\n${contact.phone || "No phone"}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in Cyncro" },
          value: String(contact.id),
          action_id: "view_contact",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Schedule Follow-up" },
          value: String(contact.id),
          action_id: "schedule_followup",
        },
      ],
    },
  ];

  await sendSlackNotification(
    tenantId,
    "leads", // Default channel
    message,
    blocks,
    "lead.created",
    "contact",
    String(contact.id)
  );
}

/** Notify on deal update */
export async function notifyDealUpdate(
  tenantId: string,
  deal: Record<string, unknown>,
  previousStage?: string
): Promise<void> {
  const connection = await getSlackConnection(tenantId);
  if (!connection) return;

  const stage = deal.stage || "Unknown";
  const emoji = stage === "won" ? "🎉" : stage === "lost" ? "😞" : "📊";

  const message = `${emoji} Deal Updated: ${deal.name || "Untitled"}`;
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Deal: ${deal.name}*\n💰 Value: $${deal.value || 0}\n📍 Stage: ${stage}${previousStage ? ` (was ${previousStage})` : ""}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View" },
          value: String(deal.id),
          action_id: "view_deal",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Log Activity" },
          value: String(deal.id),
          action_id: "log_activity",
        },
      ],
    },
  ];

  await sendSlackNotification(
    tenantId,
    "deals", // Default channel
    message,
    blocks,
    "deal.updated",
    "opportunity",
    String(deal.id)
  );
}

/** Notify on booking */
export async function notifyBooking(
  tenantId: string,
  booking: Record<string, unknown>,
  contact?: Record<string, unknown>
): Promise<void> {
  const connection = await getSlackConnection(tenantId);
  if (!connection) return;

  const contactName = contact?.name || contact?.email || "Unknown";
  const message = `📅 New Booking from ${contactName}`;
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*New Booking*\nContact: ${contactName}\nTime: ${booking.start_time || "TBD"}\nEvent: ${booking.event_name || "Calendar Event"}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Booking" },
          value: String(booking.id),
          action_id: "view_booking",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Send Reminder" },
          value: String(booking.id),
          action_id: "send_reminder",
        },
      ],
    },
  ];

  await sendSlackNotification(
    tenantId,
    "bookings", // Default channel
    message,
    blocks,
    "booking.created",
    "booking",
    String(booking.id)
  );
}

/** Create interactive button response */
export function createButtonResponse(
  action: string,
  resourceId: string,
  resourceType: string
): Record<string, unknown> {
  return {
    action,
    resourceId,
    resourceType,
    timestamp: new Date().toISOString(),
  };
}

/** Get daily summary for Slack app home */
export async function getDailySummary(
  tenantId: string
): Promise<{
  newLeads: number;
  dealsUpdated: number;
  bookingsToday: number;
  upcomingFollowups: number;
}> {
  const db = coreDb();
  const today = new Date().toISOString().split("T")[0];

  // New leads today
  const { results: leadsResults } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM crm_contacts
       WHERE tenant_id = ? AND DATE(created_at) = ?`
    )
    .bind(tenantId, today)
    .all<{ total: number }>();

  // Deals updated today
  const { results: dealsResults } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM crm_opportunities
       WHERE tenant_id = ? AND DATE(updated_at) = ?`
    )
    .bind(tenantId, today)
    .all<{ total: number }>();

  // Bookings today
  const { results: bookingsResults } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM calendar_bookings
       WHERE tenant_id = ? AND DATE(start_time) = ?`
    )
    .bind(tenantId, today)
    .all<{ total: number }>();

  return {
    newLeads: Number(lealsResults[0]?.total || 0),
    dealsUpdated: Number(dealsResults[0]?.total || 0),
    bookingsToday: Number(bookingsResults[0]?.total || 0),
    upcomingFollowups: 0, // Would calculate from tasks/activities
  };
}
