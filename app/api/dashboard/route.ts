import { coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const email = requestUser(request);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const [crm, bookings, tasks, chatUnread, recentActivity, upcomingBookings, recentContacts] = await Promise.all([
      db.prepare(`SELECT
        COUNT(DISTINCT a.id) AS accounts,
        COUNT(DISTINCT c.id) AS contacts,
        COUNT(DISTINCT o.id) AS opportunities,
        COALESCE(SUM(CASE WHEN o.stage NOT IN ('CLOSED WON','CLOSED LOST') THEN o.value_cents ELSE 0 END),0) AS pipeline_cents,
        COALESCE(SUM(CASE WHEN o.stage='CLOSED WON' THEN o.value_cents ELSE 0 END),0) AS won_cents,
        COUNT(CASE WHEN c.created_at >= ? THEN 1 END) AS new_contacts_week
        FROM crm_accounts a
        LEFT JOIN crm_contacts c ON c.account_id=a.id
        LEFT JOIN crm_opportunities o ON o.account_id=a.id`).bind(weekStart.toISOString()).first<Record<string, unknown>>(),
      db.prepare(`SELECT COUNT(*) AS today_count,
        COUNT(CASE WHEN status='CONFIRMED' THEN 1 END) AS confirmed
        FROM calendar_bookings WHERE starts_at >= ? AND starts_at <= ? AND status != 'CANCELLED'`).bind(todayStart.toISOString(), todayEnd.toISOString()).first<Record<string, unknown>>(),
      db.prepare(`SELECT
        COUNT(CASE WHEN status='TODO' OR status='IN_PROGRESS' THEN 1 END) AS open_tasks,
        COUNT(CASE WHEN status='DONE' THEN 1 END) AS done_tasks,
        COUNT(CASE WHEN due_at <= ? AND status NOT IN ('DONE') THEN 1 END) AS overdue
        FROM work_tasks WHERE assignee=? OR assignee IS NULL`).bind(new Date().toISOString(), email).first<Record<string, unknown>>(),
      db.prepare(`SELECT COALESCE(SUM(unread),0) AS total FROM (
        SELECT COUNT(*) AS unread FROM team_chat_messages m
        WHERE m.channel_id IN (
          SELECT c.id FROM team_chat_channels c
          LEFT JOIN team_chat_channel_members tcm ON tcm.channel_id=c.id AND tcm.member_email=?
          WHERE c.archived=0 AND (c.type='PUBLIC' OR tcm.member_email=?)
        ) AND m.deleted_at IS NULL
        AND m.created_at > COALESCE((SELECT r.last_read_at FROM team_chat_reads r WHERE r.channel_id=m.channel_id AND r.member_email=?),'1970-01-01')
      )`).bind(email, email, email).first<Record<string, unknown>>(),
      db.prepare(`SELECT a.type AS activity_type, a.title, a.created_at, c.full_name AS contact_name
        FROM crm_activities a JOIN crm_contacts c ON c.id=a.contact_id
        ORDER BY a.created_at DESC LIMIT 5`).all<Record<string, unknown>>(),
      db.prepare(`SELECT b.*, et.name AS event_type_name FROM calendar_bookings b
        JOIN calendar_event_types et ON et.id=b.event_type_id
        WHERE b.starts_at >= ? AND b.status='CONFIRMED'
        ORDER BY b.starts_at ASC LIMIT 5`).bind(new Date().toISOString()).all<Record<string, unknown>>(),
      db.prepare(`SELECT c.id, c.full_name, c.email, c.lifecycle, c.created_at, a.name AS company
        FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id
        ORDER BY c.created_at DESC LIMIT 8`).all<Record<string, unknown>>(),
    ]);
    return Response.json({ crm, bookings, tasks, chatUnread, recentActivity: recentActivity.results, upcomingBookings: upcomingBookings.results, recentContacts: recentContacts.results });
  } catch (error) {
    console.error("dashboard.get_failed", error);
    return Response.json({ error: "Dashboard unavailable." }, { status: 500 });
  }
}
