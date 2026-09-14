/**
 * Landing Pages Builder
 *
 * Creates high-converting landing pages with:
 * - Drag-and-drop page builder
 * - Pre-built templates
 * - Built-in forms
 * - One-click checkout integration
 * - A/B testing
 * - Analytics & conversion tracking
 * - SEO optimizations
 *
 * Templates:
 * - Webinar (webinars, demos, virtual events)
 * - Product Launch (new feature announcement)
 * - Lead Magnet (ebook, checklist, template)
 * - Sales (high-converting sales pages)
 * - Waitlist (beta product signup)
 * - Event (conference, workshop signup)
 */

import { coreDb } from "@/lib/core/db";
import { fireSequenceTrigger } from "@/lib/core/email-sequences";
import { fireWorkflowTrigger } from "@/lib/core/workflows";

export type LandingPageTemplate =
  | "blank"
  | "webinar"
  | "product_launch"
  | "lead_magnet"
  | "sales"
  | "waitlist"
  | "event";

export interface LandingPageSection {
  id: string;
  type: "hero" | "features" | "cta" | "form" | "testimonials" | "faq" | "footer";
  content?: Record<string, unknown>;
  order: number;
}

export interface LandingPage {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  description?: string;
  template: LandingPageTemplate;
  published: boolean;
  content?: Record<string, unknown>;
  formId?: string;
  primaryColor?: string;
  faviconUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  views: number;
  conversions: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Create landing page */
export async function createLandingPage(
  tenantId: string,
  title: string,
  slug: string,
  template: LandingPageTemplate = "blank",
  createdBy?: string,
  description?: string,
  formId?: string
): Promise<LandingPage> {
  const db = coreDb();
  const now = new Date().toISOString();
  const pageId = crypto.randomUUID();

  // Generate default content based on template
  const defaultContent = getTemplateContent(template);

  const page: LandingPage = {
    id: pageId,
    tenantId,
    title,
    slug,
    description,
    template,
    published: false,
    content: defaultContent,
    formId,
    views: 0,
    conversions: 0,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO landing_pages
       (id, tenant_id, title, slug, description, template, content, form_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      pageId,
      tenantId,
      title,
      slug,
      description || null,
      template,
      JSON.stringify(defaultContent),
      formId || null,
      createdBy || null,
      now,
      now
    )
    .run();

  return page;
}

/** Update landing page */
export async function updateLandingPage(
  tenantId: string,
  pageId: string,
  updates: Partial<LandingPage>
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.title) {
    setClauses.push("title = ?");
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push("description = ?");
    values.push(updates.description || null);
  }
  if (updates.content) {
    setClauses.push("content = ?");
    values.push(JSON.stringify(updates.content));
  }
  if (updates.published !== undefined) {
    setClauses.push("published = ?");
    values.push(updates.published ? 1 : 0);
  }
  if (updates.primaryColor) {
    setClauses.push("primary_color = ?");
    values.push(updates.primaryColor);
  }
  if (updates.formId !== undefined) {
    setClauses.push("form_id = ?");
    values.push(updates.formId || null);
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = ?");
  values.push(now);
  values.push(pageId);
  values.push(tenantId);

  await db
    .prepare(
      `UPDATE landing_pages SET ${setClauses.join(", ")} WHERE id = ? AND tenant_id = ?`
    )
    .bind(...values)
    .run();
}

/** Get landing page by slug */
export async function getLandingPageBySlug(
  tenantId: string,
  slug: string
): Promise<LandingPage | null> {
  const db = coreDb();

  const page = await db
    .prepare(
      `SELECT * FROM landing_pages
       WHERE tenant_id = ? AND slug = ? AND published = 1`
    )
    .bind(tenantId, slug)
    .first<Record<string, unknown>>();

  if (!page) return null;

  return normalizeLandingPage(page);
}

/** Track page view */
export async function trackPageView(
  tenantId: string,
  pageId: string,
  visitorIp: string,
  referrer?: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Increment page views
  await db
    .prepare(
      `UPDATE landing_pages SET views = views + 1 WHERE id = ? AND tenant_id = ?`
    )
    .bind(pageId, tenantId)
    .run();

  // Log analytics event
  await db
    .prepare(
      `INSERT INTO landing_page_analytics
       (id, tenant_id, page_id, visitor_ip, referrer, utm_source, utm_medium, utm_campaign, viewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      pageId,
      visitorIp,
      referrer || null,
      utmSource || null,
      utmMedium || null,
      utmCampaign || null,
      now
    )
    .run();
}

/** Track conversion (form submission from page) */
export async function trackConversion(
  tenantId: string,
  pageId: string,
  visitorIp: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Increment conversions
  await db
    .prepare(
      `UPDATE landing_pages SET conversions = conversions + 1 WHERE id = ? AND tenant_id = ?`
    )
    .bind(pageId, tenantId)
    .run();

  // Log conversion
  await db
    .prepare(
      `INSERT INTO landing_page_analytics
       (id, tenant_id, page_id, visitor_ip, converted, viewed_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .bind(crypto.randomUUID(), tenantId, pageId, visitorIp, now)
    .run();

  // Trigger workflow on conversion
  try {
    await fireWorkflowTrigger(tenantId, "landing_page.conversion", {
      pageId,
      visitorIp,
    });
  } catch (err) {
    console.error("landing_page.workflow.trigger.failed", err);
  }
}

/** Get landing page analytics */
export async function getLandingPageAnalytics(
  tenantId: string,
  pageId: string,
  days: number = 30
): Promise<{
  views: number;
  conversions: number;
  conversionRate: number;
  topReferrers: Array<{ referrer: string; views: number }>;
  topCampaigns: Array<{ campaign: string; conversions: number }>;
}> {
  const db = coreDb();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  // Page stats
  const { results: statsResults } = await db
    .prepare(
      `SELECT views, conversions FROM landing_pages WHERE id = ? AND tenant_id = ?`
    )
    .bind(pageId, tenantId)
    .all<{ views: number; conversions: number }>();

  const stats = statsResults[0] || { views: 0, conversions: 0 };
  const views = Number(stats.views || 0);
  const conversions = Number(stats.conversions || 0);
  const conversionRate = views > 0 ? (conversions / views) * 100 : 0;

  // Top referrers
  const { results: referrerResults } = await db
    .prepare(
      `SELECT referrer, COUNT(*) AS views FROM landing_page_analytics
       WHERE page_id = ? AND viewed_at >= ?
       GROUP BY referrer
       ORDER BY views DESC
       LIMIT 5`
    )
    .bind(pageId, since)
    .all<{ referrer: string; views: number }>();

  const topReferrers = referrerResults
    .filter((r) => r.referrer)
    .map((r) => ({
      referrer: r.referrer || "Direct",
      views: Number(r.views || 0),
    }));

  // Top campaigns
  const { results: campaignResults } = await db
    .prepare(
      `SELECT utm_campaign, COUNT(*) AS conversions FROM landing_page_analytics
       WHERE page_id = ? AND converted = 1 AND viewed_at >= ?
       GROUP BY utm_campaign
       ORDER BY conversions DESC
       LIMIT 5`
    )
    .bind(pageId, since)
    .all<{ utm_campaign: string; conversions: number }>();

  const topCampaigns = campaignResults
    .filter((c) => c.utm_campaign)
    .map((c) => ({
      campaign: c.utm_campaign || "Untagged",
      conversions: Number(c.conversions || 0),
    }));

  return {
    views,
    conversions,
    conversionRate: Math.round(conversionRate * 100) / 100,
    topReferrers,
    topCampaigns,
  };
}

/** Helper: Get default content for template */
function getTemplateContent(
  template: LandingPageTemplate
): Record<string, unknown> {
  const templates: Record<LandingPageTemplate, Record<string, unknown>> = {
    blank: {
      sections: [
        {
          type: "hero",
          content: { headline: "Welcome", subheadline: "Add your copy here" },
        },
      ],
    },
    webinar: {
      sections: [
        {
          type: "hero",
          content: {
            headline: "Join Our Exclusive Webinar",
            subheadline: "Learn insider secrets from industry experts",
          },
        },
        {
          type: "features",
          content: {
            items: [
              "Actionable strategies",
              "Live Q&A session",
              "Exclusive resources",
            ],
          },
        },
      ],
    },
    product_launch: {
      sections: [
        {
          type: "hero",
          content: { headline: "Something Amazing is Coming", image_url: "" },
        },
        { type: "features", content: { items: ["New Feature 1", "New Feature 2"] } },
      ],
    },
    lead_magnet: {
      sections: [
        {
          type: "hero",
          content: { headline: "Get Your Free Resource", description: "" },
        },
        { type: "form", content: { form_type: "lead_capture" } },
      ],
    },
    sales: {
      sections: [
        { type: "hero", content: { headline: "Solve Your Problem", cta_text: "Get Started" } },
        { type: "testimonials", content: { count: 3 } },
        { type: "cta", content: { text: "Buy Now", button_color: "#007bff" } },
      ],
    },
    waitlist: {
      sections: [
        { type: "hero", content: { headline: "Join the Waitlist", coming_soon: true } },
        { type: "form", content: { form_type: "waitlist" } },
      ],
    },
    event: {
      sections: [
        { type: "hero", content: { headline: "Register Now", event_date: "" } },
        { type: "features", content: { items: ["Schedule", "Speakers", "Location"] } },
        { type: "form", content: { form_type: "event_registration" } },
      ],
    },
  };

  return templates[template] || templates.blank;
}

/** Helper: Normalize database row to LandingPage type */
function normalizeLandingPage(row: Record<string, unknown>): LandingPage {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    title: String(row.title),
    slug: String(row.slug),
    description: row.description ? String(row.description) : undefined,
    template: (row.template || "blank") as LandingPageTemplate,
    published: Boolean(row.published),
    content: row.content ? JSON.parse(String(row.content)) : undefined,
    formId: row.form_id ? String(row.form_id) : undefined,
    primaryColor: row.primary_color ? String(row.primary_color) : undefined,
    views: Number(row.views || 0),
    conversions: Number(row.conversions || 0),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
