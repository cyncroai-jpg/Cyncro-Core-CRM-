/**
 * Email Campaigns API
 *
 * GET /api/email-campaigns/templates — list email templates
 * POST /api/email-campaigns/templates — create template
 * GET /api/email-campaigns — list campaigns
 * POST /api/email-campaigns — create campaign
 * GET /api/email-campaigns/:id — get campaign details
 * POST /api/email-campaigns/:id/recipients — add recipients
 * POST /api/email-campaigns/:id/schedule — schedule sending
 * GET /api/email-campaigns/:id/analytics — get analytics
 * POST /api/email-campaigns/unsubscribe — unsubscribe email
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  createEmailCampaign,
  getEmailCampaign,
  addCampaignRecipient,
  getCampaignAnalytics,
  isEmailUnsubscribed,
  unsubscribeEmail,
  scheduleCampaignSend,
  type EmailTemplateType,
} from "@/lib/core/email-campaigns";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const campaignId = pathParts[3];
    const section = pathParts[4];

    if (campaignId === "templates") {
      // GET /api/email-campaigns/templates - list templates
      const type = url.searchParams.get("type") as EmailTemplateType | null;
      const templates = await listEmailTemplates(tenant.tenantId, type || undefined);
      return Response.json({ templates });
    }

    if (campaignId && section === "analytics") {
      // GET /api/email-campaigns/:id/analytics - get analytics
      const analytics = await getCampaignAnalytics(tenant.tenantId, campaignId);
      return Response.json({ analytics });
    }

    if (campaignId && !section) {
      // GET /api/email-campaigns/:id - get campaign details
      const campaign = await getEmailCampaign(tenant.tenantId, campaignId);
      if (!campaign) {
        return Response.json({ error: "Campaign not found" }, { status: 404 });
      }
      return Response.json({ campaign });
    }

    // GET /api/email-campaigns - list campaigns
    // (This would require a listEmailCampaigns function - simplified for now)
    return Response.json({ campaigns: [] });
  } catch (error) {
    console.error("email-campaigns.get.failed", error);
    return Response.json(
      { error: "Unable to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const campaignId = pathParts[3];
    const action = pathParts[4];
    const body = (await request.json()) as Record<string, unknown>;

    if (campaignId === "templates") {
      // POST /api/email-campaigns/templates - create template
      const name = cleanText(String(body.name || ""), 100);
      const type = (String(body.type || "MARKETING") as EmailTemplateType) || "MARKETING";
      const subject = cleanText(String(body.subject || ""), 200);
      const htmlContent = String(body.htmlContent || "");
      const previewText = body.previewText ? cleanText(String(body.previewText), 200) : undefined;
      const plainTextContent = body.plainTextContent ? cleanText(String(body.plainTextContent), 5000) : undefined;
      const variables = Array.isArray(body.variables) ? body.variables.map((v) => cleanText(String(v), 50)) : undefined;
      const tags = Array.isArray(body.tags) ? body.tags.map((t) => cleanText(String(t), 50)) : undefined;
      const category = body.category ? cleanText(String(body.category), 50) : undefined;

      if (!name || !subject || !htmlContent) {
        return Response.json(
          { error: "name, subject, and htmlContent are required" },
          { status: 400 }
        );
      }

      const template = await createEmailTemplate(
        tenant.tenantId,
        name,
        type,
        subject,
        htmlContent,
        tenant.email,
        previewText,
        plainTextContent,
        variables,
        tags,
        category
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "email_template",
        template.id,
        {
          resourceName: `Template: ${name}`,
          status: "SUCCESS",
          type,
        }
      );

      return Response.json({ template }, { status: 201 });
    }

    if (campaignId === "unsubscribe") {
      // POST /api/email-campaigns/unsubscribe - unsubscribe email
      const email = cleanText(String(body.email || ""), 100);
      const reason = body.reason ? cleanText(String(body.reason), 200) : undefined;

      if (!email) {
        return Response.json({ error: "email is required" }, { status: 400 });
      }

      await unsubscribeEmail(tenant.tenantId, email, reason);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "email_unsubscribe",
        `unsub-${email}`,
        {
          resourceName: `Unsubscribe: ${email}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ unsubscribed: true });
    }

    if (action === "recipients") {
      // POST /api/email-campaigns/:id/recipients - add recipients
      const recipients = body.recipients as Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        variables?: Record<string, unknown>;
      }>;

      if (!Array.isArray(recipients) || recipients.length === 0) {
        return Response.json(
          { error: "recipients array is required" },
          { status: 400 }
        );
      }

      const addedRecipients = [];

      for (const recipient of recipients) {
        // Check unsubscribe list
        const unsubscribed = await isEmailUnsubscribed(tenant.tenantId, recipient.email);
        if (!unsubscribed) {
          const added = await addCampaignRecipient(
            campaignId,
            tenant.tenantId,
            recipient.email,
            recipient.firstName,
            recipient.lastName,
            recipient.variables
          );
          addedRecipients.push(added);
        }
      }

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "ADD",
        "campaign_recipients",
        campaignId,
        {
          resourceName: `Recipients Added`,
          status: "SUCCESS",
          count: addedRecipients.length,
        }
      );

      return Response.json({ recipients: addedRecipients }, { status: 201 });
    }

    if (action === "schedule") {
      // POST /api/email-campaigns/:id/schedule - schedule sending
      const scheduledAt = String(body.scheduledAt || "");

      if (!scheduledAt) {
        return Response.json(
          { error: "scheduledAt is required" },
          { status: 400 }
        );
      }

      const campaign = await scheduleCampaignSend(tenant.tenantId, campaignId, scheduledAt);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "SCHEDULE",
        "email_campaign",
        campaignId,
        {
          resourceName: `Campaign Scheduled: ${campaign.name}`,
          status: "SUCCESS",
          scheduledAt,
        }
      );

      return Response.json({ campaign });
    }

    // POST /api/email-campaigns - create campaign
    const name = cleanText(String(body.name || ""), 100);
    const templateId = cleanText(String(body.templateId || ""), 50);
    const fromEmail = cleanText(String(body.fromEmail || ""), 100);
    const description = body.description ? cleanText(String(body.description), 500) : undefined;
    const fromName = body.fromName ? cleanText(String(body.fromName), 100) : undefined;
    const replyTo = body.replyTo ? cleanText(String(body.replyTo), 100) : undefined;

    if (!name || !templateId || !fromEmail) {
      return Response.json(
        { error: "name, templateId, and fromEmail are required" },
        { status: 400 }
      );
    }

    const campaign = await createEmailCampaign(
      tenant.tenantId,
      name,
      templateId,
      fromEmail,
      tenant.email,
      description,
      fromName,
      replyTo
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "email_campaign",
      campaign.id,
      {
        resourceName: `Campaign: ${name}`,
        status: "SUCCESS",
        template: templateId,
      }
    );

    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("email-campaigns.post.failed", error);
    return Response.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
