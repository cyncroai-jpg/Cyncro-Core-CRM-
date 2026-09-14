/**
 * Email Templates & Campaigns (Phase 45)
 *
 * Professional email marketing automation:
 * - Email template builder with variables
 * - Campaign management and scheduling
 * - Bulk email sending with rate limiting
 * - Open and click tracking
 * - A/B testing support
 * - Unsubscribe management (GDPR compliant)
 * - Email list segmentation
 * - Performance analytics and reporting
 * - Bounce handling and list cleanup
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "PAUSED"
  | "CANCELLED";

export type EmailTemplateType = "MARKETING" | "TRANSACTIONAL" | "WELCOME" | "NURTURE" | "CUSTOM";

export interface EmailTemplate {
  id: string;
  tenantId: string;
  name: string;
  type: EmailTemplateType;
  subject: string;
  previewText?: string;
  htmlContent: string;
  plainTextContent?: string;
  variables?: string[]; // {{firstName}}, {{email}}, etc.
  tags?: string[];
  category?: string;
  createdBy: string;
  lastModifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  tenantId: string;
  name: string;
  templateId: string;
  description?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  openCount: number;
  clickCount: number;
  testVariant?: "A" | "B";
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  tenantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  variables?: Record<string, unknown>;
  status: "PENDING" | "SENT" | "BOUNCED" | "UNSUBSCRIBED" | "FAILED";
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bounceType?: "HARD" | "SOFT";
  failureReason?: string;
}

export interface EmailTracking {
  id: string;
  campaignId: string;
  recipientId: string;
  trackingType: "OPEN" | "CLICK" | "BOUNCE";
  clickedUrl?: string;
  timestamp: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CampaignAnalytics {
  campaignId: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  bounceCount: number;
  bounceRate: number;
  openCount: number;
  openRate: number;
  clickCount: number;
  clickRate: number;
  unsubscribeCount: number;
  unsubscribeRate: number;
  averageOpenTime?: string;
}

export interface EmailUnsubscribe {
  id: string;
  tenantId: string;
  email: string;
  reason?: string;
  timestamp: string;
}

/**
 * Create email template
 */
export async function createEmailTemplate(
  tenantId: string,
  name: string,
  type: EmailTemplateType,
  subject: string,
  htmlContent: string,
  createdBy: string,
  previewText?: string,
  plainTextContent?: string,
  variables?: string[],
  tags?: string[],
  category?: string
): Promise<EmailTemplate> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const template: EmailTemplate = {
    id,
    tenantId,
    name,
    type,
    subject,
    previewText,
    htmlContent,
    plainTextContent,
    variables,
    tags,
    category,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO email_templates
       (id, tenant_id, name, type, subject, preview_text, html_content, plain_text_content, variables, tags, category, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      type,
      subject,
      previewText || null,
      htmlContent,
      plainTextContent || null,
      variables ? JSON.stringify(variables) : null,
      tags ? JSON.stringify(tags) : null,
      category || null,
      createdBy,
      now,
      now
    )
    .run();

  return template;
}

/**
 * Get email template
 */
export async function getEmailTemplate(
  tenantId: string,
  templateId: string
): Promise<EmailTemplate | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM email_templates WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, templateId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    type: String(row.type) as EmailTemplateType,
    subject: String(row.subject),
    previewText: row.preview_text ? String(row.preview_text) : undefined,
    htmlContent: String(row.html_content),
    plainTextContent: row.plain_text_content ? String(row.plain_text_content) : undefined,
    variables: row.variables ? JSON.parse(String(row.variables)) : undefined,
    tags: row.tags ? JSON.parse(String(row.tags)) : undefined,
    category: row.category ? String(row.category) : undefined,
    createdBy: String(row.created_by),
    lastModifiedBy: row.last_modified_by ? String(row.last_modified_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List email templates
 */
export async function listEmailTemplates(
  tenantId: string,
  type?: EmailTemplateType
): Promise<EmailTemplate[]> {
  const db = coreDb();

  let query = `SELECT * FROM email_templates WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (type) {
    query += ` AND type = ?`;
    params.push(type);
  }

  query += ` ORDER BY created_at DESC`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    type: String(row.type) as EmailTemplateType,
    subject: String(row.subject),
    previewText: row.preview_text ? String(row.preview_text) : undefined,
    htmlContent: String(row.html_content),
    plainTextContent: row.plain_text_content ? String(row.plain_text_content) : undefined,
    variables: row.variables ? JSON.parse(String(row.variables)) : undefined,
    tags: row.tags ? JSON.parse(String(row.tags)) : undefined,
    category: row.category ? String(row.category) : undefined,
    createdBy: String(row.created_by),
    lastModifiedBy: row.last_modified_by ? String(row.last_modified_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Create email campaign
 */
export async function createEmailCampaign(
  tenantId: string,
  name: string,
  templateId: string,
  fromEmail: string,
  createdBy: string,
  description?: string,
  fromName?: string,
  replyTo?: string
): Promise<EmailCampaign> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get template to retrieve subject
  const template = await getEmailTemplate(tenantId, templateId);
  if (!template) {
    throw new Error("Template not found");
  }

  const campaign: EmailCampaign = {
    id,
    tenantId,
    name,
    templateId,
    description,
    fromEmail,
    fromName,
    replyTo,
    subject: template.subject,
    status: "DRAFT",
    recipientCount: 0,
    sentCount: 0,
    bounceCount: 0,
    unsubscribeCount: 0,
    openCount: 0,
    clickCount: 0,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO email_campaigns
       (id, tenant_id, name, template_id, description, from_email, from_name, reply_to, subject, status, recipient_count, sent_count, bounce_count, unsubscribe_count, open_count, click_count, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, 0, 0, 0, 0, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      templateId,
      description || null,
      fromEmail,
      fromName || null,
      replyTo || null,
      template.subject,
      createdBy,
      now,
      now
    )
    .run();

  return campaign;
}

/**
 * Get email campaign
 */
export async function getEmailCampaign(
  tenantId: string,
  campaignId: string
): Promise<EmailCampaign | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM email_campaigns WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, campaignId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    templateId: String(row.template_id),
    description: row.description ? String(row.description) : undefined,
    fromEmail: String(row.from_email),
    fromName: row.from_name ? String(row.from_name) : undefined,
    replyTo: row.reply_to ? String(row.reply_to) : undefined,
    subject: String(row.subject),
    status: String(row.status) as CampaignStatus,
    recipientCount: Number(row.recipient_count),
    sentCount: Number(row.sent_count),
    bounceCount: Number(row.bounce_count),
    unsubscribeCount: Number(row.unsubscribe_count),
    openCount: Number(row.open_count),
    clickCount: Number(row.click_count),
    testVariant: row.test_variant ? (String(row.test_variant) as "A" | "B") : undefined,
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Add recipients to campaign
 */
export async function addCampaignRecipient(
  campaignId: string,
  tenantId: string,
  email: string,
  firstName?: string,
  lastName?: string,
  variables?: Record<string, unknown>
): Promise<CampaignRecipient> {
  const db = coreDb();
  const id = crypto.randomUUID();

  const recipient: CampaignRecipient = {
    id,
    campaignId,
    tenantId,
    email,
    firstName,
    lastName,
    variables,
    status: "PENDING",
  };

  await db
    .prepare(
      `INSERT INTO campaign_recipients
       (id, campaign_id, tenant_id, email, first_name, last_name, variables, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    )
    .bind(
      id,
      campaignId,
      tenantId,
      email,
      firstName || null,
      lastName || null,
      variables ? JSON.stringify(variables) : null
    )
    .run();

  return recipient;
}

/**
 * Get campaign analytics
 */
export async function getCampaignAnalytics(
  tenantId: string,
  campaignId: string
): Promise<CampaignAnalytics> {
  const db = coreDb();

  const campaign = await getEmailCampaign(tenantId, campaignId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  // Get detailed tracking stats
  const { results: trackingStats } = await db
    .prepare(
      `SELECT tracking_type, COUNT(*) as count FROM email_tracking
       WHERE campaign_id = ?
       GROUP BY tracking_type`
    )
    .bind(campaignId)
    .all<{ tracking_type: string; count: number }>();

  const trackingMap: Record<string, number> = {};
  for (const stat of trackingStats) {
    trackingMap[stat.tracking_type] = stat.count;
  }

  const deliveredCount = campaign.sentCount - campaign.bounceCount;
  const openCount = trackingMap["OPEN"] || campaign.openCount;
  const clickCount = trackingMap["CLICK"] || campaign.clickCount;

  return {
    campaignId,
    recipientCount: campaign.recipientCount,
    sentCount: campaign.sentCount,
    deliveredCount,
    bounceCount: campaign.bounceCount,
    bounceRate: campaign.sentCount > 0 ? (campaign.bounceCount / campaign.sentCount) * 100 : 0,
    openCount,
    openRate: deliveredCount > 0 ? (openCount / deliveredCount) * 100 : 0,
    clickCount,
    clickRate: openCount > 0 ? (clickCount / openCount) * 100 : 0,
    unsubscribeCount: campaign.unsubscribeCount,
    unsubscribeRate: campaign.sentCount > 0 ? (campaign.unsubscribeCount / campaign.sentCount) * 100 : 0,
  };
}

/**
 * Track email event (open, click, bounce)
 */
export async function trackEmailEvent(
  campaignId: string,
  recipientId: string,
  trackingType: "OPEN" | "CLICK" | "BOUNCE",
  clickedUrl?: string,
  userAgent?: string,
  ipAddress?: string
): Promise<EmailTracking> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const tracking: EmailTracking = {
    id,
    campaignId,
    recipientId,
    trackingType,
    clickedUrl,
    timestamp,
    userAgent,
    ipAddress,
  };

  await db
    .prepare(
      `INSERT INTO email_tracking
       (id, campaign_id, recipient_id, tracking_type, clicked_url, timestamp, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      campaignId,
      recipientId,
      trackingType,
      clickedUrl || null,
      timestamp,
      userAgent || null,
      ipAddress || null
    )
    .run();

  return tracking;
}

/**
 * Add email to unsubscribe list
 */
export async function unsubscribeEmail(
  tenantId: string,
  email: string,
  reason?: string
): Promise<EmailUnsubscribe> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const unsubscribe: EmailUnsubscribe = {
    id,
    tenantId,
    email,
    reason,
    timestamp,
  };

  await db
    .prepare(
      `INSERT OR IGNORE INTO email_unsubscribes
       (id, tenant_id, email, reason, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, tenantId, email, reason || null, timestamp)
    .run();

  return unsubscribe;
}

/**
 * Check if email is unsubscribed
 */
export async function isEmailUnsubscribed(
  tenantId: string,
  email: string
): Promise<boolean> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT id FROM email_unsubscribes WHERE tenant_id = ? AND email = ?`
    )
    .bind(tenantId, email)
    .first<{ id: string }>();

  return !!row;
}

/**
 * Get unsubscribe list
 */
export async function getUnsubscribeList(tenantId: string): Promise<EmailUnsubscribe[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM email_unsubscribes WHERE tenant_id = ? ORDER BY timestamp DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    email: String(row.email),
    reason: row.reason ? String(row.reason) : undefined,
    timestamp: String(row.timestamp),
  }));
}

/**
 * Schedule campaign for sending
 */
export async function scheduleCampaignSend(
  tenantId: string,
  campaignId: string,
  scheduledAt: string
): Promise<EmailCampaign> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE email_campaigns
       SET status = 'SCHEDULED', scheduled_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    )
    .bind(scheduledAt, now, tenantId, campaignId)
    .run();

  const campaign = await getEmailCampaign(tenantId, campaignId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  return campaign;
}
