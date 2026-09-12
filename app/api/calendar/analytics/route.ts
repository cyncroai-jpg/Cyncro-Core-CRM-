import { coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });

    const db = coreDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    const next7Start = now.toISOString();
    const next7End = new Date(Date.now() + 7 * 86_400_000).toISOString();

    const [monthly, weekly, upcoming, noShows, cancelled, totalAll] = await Promise.all([
      db.prepare(`SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='NO_SHOW' THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
          SUM(COALESCE(price_cents,0)) AS revenue_cents
        FROM calendar_bookings WHERE starts_at >= ? AND starts_at <= ?`)
        .bind(monthStart, monthEnd).first<Record<string, number>>(),
      db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE starts_at >= ? AND starts_at < ? AND status IN ('CONFIRMED','RESCHEDULED')")
        .bind(weekStart.toISOString(), weekEnd.toISOString()).first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE starts_at >= ? AND starts_at < ? AND status IN ('CONFIRMED','RESCHEDULED')")
        .bind(next7Start, next7End).first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE status = 'NO_SHOW'").first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE status = 'CANCELLED'").first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE status NOT IN ('CANCELLED')").first<{ total: number }>(),
    ]);

    const total = Number(monthly?.total || 0);
    const completed = Number(monthly?.completed || 0);
    const noShow = Number(monthly?.no_shows || 0);
    const showRate = total > 0 ? Math.round(((total - noShow) / total) * 100) : 100;

    // Bookings per event type this month
    const { results: byType } = await db.prepare(`
      SELECT e.name AS event_name, e.color, COUNT(*) AS count
      FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id
      WHERE b.starts_at >= ? AND b.starts_at <= ? AND b.status NOT IN ('CANCELLED')
      GROUP BY b.event_type_id ORDER BY count DESC LIMIT 5`)
      .bind(monthStart, monthEnd).all<Record<string, unknown>>();

    // Upcoming bookings next 7 days with details
    const { results: upcomingList } = await db.prepare(`
      SELECT b.customer_name, b.starts_at, b.status, e.name AS event_name, e.color, b.assigned_to
      FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id
      WHERE b.starts_at >= ? AND b.starts_at < ? AND b.status IN ('CONFIRMED','RESCHEDULED')
      ORDER BY b.starts_at LIMIT 10`)
      .bind(next7Start, next7End).all<Record<string, unknown>>();

    return Response.json({
      thisMonth: {
        total,
        completed,
        noShows: noShow,
        cancelled: Number(monthly?.cancelled_count || 0),
        showRate,
        revenueCents: Number(monthly?.revenue_cents || 0),
      },
      thisWeek: Number(weekly?.total || 0),
      next7Days: Number(upcoming?.total || 0),
      allTime: {
        total: Number(totalAll?.total || 0),
        noShows: Number(noShows?.total || 0),
        cancelled: Number(cancelled?.total || 0),
      },
      byEventType: byType,
      upcomingList,
    });
  } catch (error) {
    console.error("calendar.analytics.failed", error);
    return Response.json({ error: "Unable to load analytics." }, { status: 500 });
  }
}
