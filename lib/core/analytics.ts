/**
 * Analytics & Reporting Engine
 *
 * Aggregates metrics from across Cyncro:
 * - Lead capture (forms, contacts)
 * - Email & SMS performance (opens, clicks, conversions)
 * - Workflow execution stats
 * - Booking conversion rates
 * - Revenue pipeline
 * - Team performance
 */

import { coreDb } from "@/lib/core/db";

export interface AnalyticsMetrics {
  period: {
    startDate: string;
    endDate: string;
  };
  leads: {
    total: number;
    bySource: Record<string, number>;
    byCampaign: Record<string, number>;
  };
  forms: {
    submissions: number;
    conversionRate: number;
    topPerformers: { name: string; submissions: number }[];
  };
  email: {
    sent: number;
    opened: number;
    openRate: number;
    clicked: number;
    clickRate: number;
    conversions: number;
  };
  sms: {
    sent: number;
    delivered: number;
    deliveryRate: number;
    conversions: number;
  };
  workflows: {
    executed: number;
    successful: number;
    failureRate: number;
    avgExecutionTime: number;
  };
  bookings: {
    total: number;
    completed: number;
    noShow: number;
    completionRate: number;
    revenue: number;
  };
  team: {
    activeMembers: number;
    topPerformers: {
      email: string;
      bookings: number;
      revenue: number;
    }[];
  };
}

/** Get analytics for a tenant over a date range */
export async function getTenantAnalytics(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<AnalyticsMetrics> {
  const db = coreDb();
  const start = new Date(startDate).toISOString();
  const end = new Date(endDate).toISOString();

  // Leads
  const { results: leadsResult } = await db.prepare(
    `SELECT COUNT(*) AS total FROM crm_contacts
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const leads = {
    total: Number(leadsResult[0]?.total || 0),
    bySource: {},
    byCampaign: {},
  };

  // Forms
  const { results: formSubmissions } = await db.prepare(
    `SELECT COUNT(*) AS total FROM form_submissions
     WHERE tenant_id = ? AND submitted_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const { results: formCount } = await db.prepare(
    `SELECT COUNT(*) AS total FROM forms WHERE tenant_id = ?`
  ).bind(tenantId).all<{ total: number }>();

  const forms = {
    submissions: Number(formSubmissions[0]?.total || 0),
    conversionRate: formCount[0]?.total ?
      (Number(formSubmissions[0]?.total || 0) / Number(formCount[0]?.total)) * 100 : 0,
    topPerformers: [],
  };

  // Email sequences
  const { results: emailSent } = await db.prepare(
    `SELECT COUNT(*) AS total FROM email_sequence_events
     WHERE tenant_id = ? AND event_type = 'SENT' AND created_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const { results: emailOpened } = await db.prepare(
    `SELECT COUNT(*) AS total FROM email_sequence_events
     WHERE tenant_id = ? AND event_type = 'OPENED' AND created_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const sentCount = Number(emailSent[0]?.total || 0);
  const openedCount = Number(emailOpened[0]?.total || 0);

  const email = {
    sent: sentCount,
    opened: openedCount,
    openRate: sentCount ? (openedCount / sentCount) * 100 : 0,
    clicked: 0, // Would track from link clicks
    clickRate: 0,
    conversions: 0, // Would track from booking creation after email
  };

  // SMS
  const { results: smsSent } = await db.prepare(
    `SELECT COUNT(*) AS total FROM sms_sequence_events
     WHERE tenant_id = ? AND event_type = 'SENT' AND created_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const sms = {
    sent: Number(smsSent[0]?.total || 0),
    delivered: Number(smsSent[0]?.total || 0), // Assume delivered for now
    deliveryRate: 100,
    conversions: 0,
  };

  // Workflows
  const { results: workflowExecutions } = await db.prepare(
    `SELECT COUNT(*) AS total FROM workflow_executions
     WHERE tenant_id = ? AND started_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const { results: workflowSuccessful } = await db.prepare(
    `SELECT COUNT(*) AS total FROM workflow_executions
     WHERE tenant_id = ? AND status = 'COMPLETED' AND started_at BETWEEN ? AND ?`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const executionCount = Number(workflowExecutions[0]?.total || 0);
  const successCount = Number(workflowSuccessful[0]?.total || 0);

  const workflows = {
    executed: executionCount,
    successful: successCount,
    failureRate: executionCount ? ((executionCount - successCount) / executionCount) * 100 : 0,
    avgExecutionTime: 0, // Would calculate from execution logs
  };

  // Bookings
  const { results: bookingsTotal } = await db.prepare(
    `SELECT COUNT(*) AS total FROM calendar_bookings
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ? AND status = 'CONFIRMED'`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const { results: bookingsCompleted } = await db.prepare(
    `SELECT COUNT(*) AS total FROM calendar_bookings
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ? AND status = 'COMPLETED'`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const { results: bookingsNoShow } = await db.prepare(
    `SELECT COUNT(*) AS total FROM calendar_bookings
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ? AND status = 'NO_SHOW'`
  ).bind(tenantId, start, end).all<{ total: number }>();

  const totalBookings = Number(bookingsTotal[0]?.total || 0);
  const completedBookings = Number(bookingsCompleted[0]?.total || 0);

  const bookings = {
    total: totalBookings,
    completed: completedBookings,
    noShow: Number(bookingsNoShow[0]?.total || 0),
    completionRate: totalBookings ? (completedBookings / totalBookings) * 100 : 0,
    revenue: 0, // Would calculate from deals linked to bookings
  };

  // Team
  const { results: teamMembers } = await db.prepare(
    `SELECT COUNT(*) AS total FROM tenant_members WHERE tenant_id = ? AND active = 1`
  ).bind(tenantId).all<{ total: number }>();

  const team = {
    activeMembers: Number(teamMembers[0]?.total || 0),
    topPerformers: [],
  };

  return {
    period: { startDate: start, endDate: end },
    leads,
    forms,
    email,
    sms,
    workflows,
    bookings,
    team,
  };
}

/** Get dashboard summary (30-day snapshot) */
export async function getDashboardSummary(tenantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return getTenantAnalytics(
    tenantId,
    thirtyDaysAgo.toISOString(),
    now.toISOString(),
  );
}
