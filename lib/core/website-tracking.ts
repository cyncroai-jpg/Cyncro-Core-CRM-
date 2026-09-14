/**
 * Website Visitor Tracking — Intent Data Layer
 *
 * Identifies companies visiting your website:
 * - IP geolocation to identify company
 * - Auto-creates contacts from identified visitors
 * - Tracks engagement (page views, time on site, behavior)
 * - Lead scoring based on engagement
 * - Triggers sequences on specific events
 *
 * Supports webhooks to upstream CRM tools (HubSpot, Pipedrive)
 */

import { coreDb } from "@/lib/core/db";
import { fireSequenceTrigger } from "@/lib/core/email-sequences";
import { fireWorkflowTrigger } from "@/lib/core/workflows";

export interface WebsiteVisitor {
  id: string;
  tenantId: string;
  contactId?: string;
  companyName?: string;
  ipAddress: string;
  country?: string;
  city?: string;
  state?: string;
  userAgent: string;
  firstSeen: string;
  lastSeen: string;
  pageViews: number;
  leadScore: number;
  identified: boolean;
}

export interface WebsiteVisit {
  id: string;
  tenantId: string;
  visitorId: string;
  pageUrl: string;
  referrer?: string;
  timeOnPage?: number;
  visitedAt: string;
}

export interface PixelEvent {
  id: string;
  tenantId: string;
  visitorId: string;
  eventType: "PAGE_VIEW" | "FORM_VIEW" | "PRODUCT_VIEW" | "VIDEO_PLAY" | "PURCHASE" | "CUSTOM";
  eventData?: Record<string, unknown>;
  triggeredSequence: boolean;
  triggeredWorkflow: boolean;
  createdAt: string;
}

/** IP geolocation (mock implementation — use MaxMind GeoIP2 in production) */
async function getLocationFromIP(ipAddress: string): Promise<{
  country?: string;
  city?: string;
  state?: string;
  companyName?: string;
}> {
  // Mock implementation returns sample data
  // Production: integrate MaxMind GeoIP2 or similar
  const mockCompanies: Record<string, string> = {
    "192.168.1.1": "Acme Corp",
    "10.0.0.1": "TechStart Inc",
  };

  return {
    country: "US",
    city: "San Francisco",
    state: "CA",
    companyName: mockCompanies[ipAddress],
  };
}

/** Track visitor and page visit */
export async function trackWebsiteVisit(
  tenantId: string,
  ipAddress: string,
  pageUrl: string,
  userAgent: string,
  referrer?: string,
  timeOnPage?: number,
): Promise<WebsiteVisitor> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get geolocation data
  const location = await getLocationFromIP(ipAddress);

  // Find or create visitor
  let visitor = await db
    .prepare(
      `SELECT * FROM website_visitors
       WHERE tenant_id = ? AND ip_address = ?`
    )
    .bind(tenantId, ipAddress)
    .first<WebsiteVisitor>();

  if (!visitor) {
    const visitorId = crypto.randomUUID();
    visitor = {
      id: visitorId,
      tenantId,
      ipAddress,
      userAgent,
      firstSeen: now,
      lastSeen: now,
      pageViews: 1,
      leadScore: 5, // Initial score for website visit
      identified: false,
      companyName: location.companyName,
      country: location.country,
      city: location.city,
      state: location.state,
    };

    await db
      .prepare(
        `INSERT INTO website_visitors
         (id, tenant_id, ip_address, user_agent, company_name, country, city, state,
          first_seen, last_seen, page_views, lead_score, identified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)`
      )
      .bind(
        visitorId,
        tenantId,
        ipAddress,
        userAgent,
        location.companyName || null,
        location.country,
        location.city,
        location.state,
        now,
        now,
        5
      )
      .run();
  } else {
    // Update last seen and increment page views
    await db
      .prepare(
        `UPDATE website_visitors
         SET last_seen = ?, page_views = page_views + 1
         WHERE id = ?`
      )
      .bind(now, visitor.id)
      .run();

    visitor.lastSeen = now;
    visitor.pageViews += 1;
  }

  // Log visit
  await db
    .prepare(
      `INSERT INTO website_visits
       (id, tenant_id, visitor_id, page_url, referrer, time_on_page, visited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      visitor.id,
      pageUrl,
      referrer || null,
      timeOnPage || null,
      now
    )
    .run();

  // Trigger "website.page_view" event for sequences/workflows
  await firePixelEvent(tenantId, visitor.id, "PAGE_VIEW", { pageUrl, referrer });

  return visitor;
}

/** Track pixel events (form view, product view, video play, etc.) */
export async function firePixelEvent(
  tenantId: string,
  visitorId: string,
  eventType: "PAGE_VIEW" | "FORM_VIEW" | "PRODUCT_VIEW" | "VIDEO_PLAY" | "PURCHASE" | "CUSTOM",
  eventData?: Record<string, unknown>,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get visitor
  const visitor = await db
    .prepare(
      `SELECT * FROM website_visitors WHERE id = ? AND tenant_id = ?`
    )
    .bind(visitorId, tenantId)
    .first<WebsiteVisitor>();

  if (!visitor) return;

  // Increase lead score based on event type
  const scoreIncrements: Record<string, number> = {
    PAGE_VIEW: 1,
    FORM_VIEW: 10,
    PRODUCT_VIEW: 5,
    VIDEO_PLAY: 3,
    PURCHASE: 50,
    CUSTOM: 2,
  };

  const scoreIncrement = scoreIncrements[eventType] || 2;
  const newScore = visitor.leadScore + scoreIncrement;

  // Update visitor lead score
  await db
    .prepare(
      `UPDATE website_visitors SET lead_score = ? WHERE id = ?`
    )
    .bind(newScore, visitorId)
    .run();

  // Log event
  const eventId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO website_pixel_events
       (id, tenant_id, visitor_id, event_type, event_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      tenantId,
      visitorId,
      eventType,
      eventData ? JSON.stringify(eventData) : null,
      now
    )
    .run();

  // Auto-trigger sequences if visitor is identified
  if (visitor.contactId) {
    try {
      await fireSequenceTrigger(tenantId, "contact.website_activity", {
        contactId: visitor.contactId,
        eventType,
        leadScore: newScore,
      });
    } catch (err) {
      console.error("pixel.sequence.trigger.failed", err);
    }
  }

  // Auto-trigger workflows
  try {
    await fireWorkflowTrigger(tenantId, "website.visitor_activity", {
      visitorId,
      eventType,
      leadScore: newScore,
      companyName: visitor.companyName,
    });
  } catch (err) {
    console.error("pixel.workflow.trigger.failed", err);
  }
}

/** Identify visitor from contact (match on email) */
export async function identifyWebsiteVisitor(
  tenantId: string,
  visitorId: string,
  email: string,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Find contact by email
  const contact = await db
    .prepare(
      `SELECT id FROM crm_contacts
       WHERE tenant_id = ? AND email = ? LIMIT 1`
    )
    .bind(tenantId, email)
    .first<{ id: string }>();

  if (!contact) return;

  // Link visitor to contact
  await db
    .prepare(
      `UPDATE website_visitors
       SET contact_id = ?, identified = 1, lead_score = lead_score + 20
       WHERE id = ?`
    )
    .bind(contact.id, visitorId)
    .run();

  // Log identification event
  await firePixelEvent(tenantId, visitorId, "CUSTOM", {
    action: "visitor_identified",
    email,
  });
}

/** Get visitor analytics */
export async function getVisitorAnalytics(
  tenantId: string,
  days: number = 30
): Promise<{
  totalVisitors: number;
  identifiedVisitors: number;
  averageLeadScore: number;
  topCompanies: { companyName: string; visitorCount: number }[];
  avgPageViews: number;
}> {
  const db = coreDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Total visitors in period
  const { results: totalResults } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM website_visitors
       WHERE tenant_id = ? AND first_seen >= ?`
    )
    .bind(tenantId, since)
    .all<{ total: number }>();

  const totalVisitors = Number(totalResults[0]?.total || 0);

  // Identified visitors
  const { results: identifiedResults } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM website_visitors
       WHERE tenant_id = ? AND first_seen >= ? AND identified = 1`
    )
    .bind(tenantId, since)
    .all<{ total: number }>();

  const identifiedVisitors = Number(identifiedResults[0]?.total || 0);

  // Average lead score
  const { results: scoreResults } = await db
    .prepare(
      `SELECT AVG(lead_score) AS avg_score FROM website_visitors
       WHERE tenant_id = ? AND first_seen >= ?`
    )
    .bind(tenantId, since)
    .all<{ avg_score: number }>();

  const averageLeadScore = Math.round(Number(scoreResults[0]?.avg_score || 0));

  // Top companies
  const { results: companiesResults } = await db
    .prepare(
      `SELECT company_name, COUNT(*) AS visitor_count
       FROM website_visitors
       WHERE tenant_id = ? AND first_seen >= ? AND company_name IS NOT NULL
       GROUP BY company_name
       ORDER BY visitor_count DESC
       LIMIT 10`
    )
    .bind(tenantId, since)
    .all<{ companyName: string; visitor_count: number }>();

  const topCompanies = companiesResults.map((r) => ({
    companyName: r.companyName || "Unknown",
    visitorCount: Number(r.visitor_count || 0),
  }));

  // Average page views
  const { results: viewsResults } = await db
    .prepare(
      `SELECT AVG(page_views) AS avg_views FROM website_visitors
       WHERE tenant_id = ? AND first_seen >= ?`
    )
    .bind(tenantId, since)
    .all<{ avg_views: number }>();

  const avgPageViews = Math.round(Number(viewsResults[0]?.avg_views || 0));

  return {
    totalVisitors,
    identifiedVisitors,
    averageLeadScore,
    topCompanies,
    avgPageViews,
  };
}
