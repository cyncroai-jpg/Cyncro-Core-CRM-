import { coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm")))
      return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const body = (await request.json()) as { query?: string };
    const q = (body.query || "").toLowerCase().trim();
    const now = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [crm, tasks, bookings, topOpps] = await Promise.all([
      db.prepare(`SELECT
        COUNT(DISTINCT c.id) AS contacts,
        COUNT(DISTINCT a.id) AS accounts,
        COUNT(DISTINCT o.id) AS opportunities,
        COALESCE(SUM(CASE WHEN o.stage NOT IN ('CLOSED WON','CLOSED LOST') THEN o.value_cents ELSE 0 END),0) AS pipeline_cents,
        COALESCE(SUM(CASE WHEN o.stage='CLOSED WON' THEN o.value_cents ELSE 0 END),0) AS won_cents,
        COUNT(CASE WHEN c.created_at >= ? THEN 1 END) AS new_contacts_week
        FROM crm_accounts a
        LEFT JOIN crm_contacts c ON c.account_id=a.id
        LEFT JOIN crm_opportunities o ON o.account_id=a.id`).bind(weekAgo).first<Record<string, unknown>>(),
      db.prepare(`SELECT
        COUNT(CASE WHEN status IN ('TODO','IN_PROGRESS') THEN 1 END) AS open_tasks,
        COUNT(CASE WHEN due_at <= ? AND status NOT IN ('DONE') THEN 1 END) AS overdue,
        COUNT(CASE WHEN status='DONE' THEN 1 END) AS done_tasks
        FROM work_tasks`).bind(now).first<Record<string, unknown>>(),
      db.prepare(`SELECT COUNT(*) AS today_count FROM calendar_bookings
        WHERE starts_at >= ? AND starts_at <= ? AND status='CONFIRMED'`).bind(todayStart.toISOString(), todayEnd.toISOString()).first<Record<string, unknown>>(),
      db.prepare(`SELECT o.title, o.value_cents, o.stage, c.full_name AS contact
        FROM crm_opportunities o LEFT JOIN crm_contacts c ON c.id=o.contact_id
        WHERE o.stage NOT IN ('CLOSED WON','CLOSED LOST')
        ORDER BY o.value_cents DESC LIMIT 3`).all<Record<string, unknown>>(),
    ]);

    const fmt = (cents: unknown) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const contacts = Number(crm?.contacts || 0);
    const pipeline = Number(crm?.pipeline_cents || 0);
    const won = Number(crm?.won_cents || 0);
    const newThisWeek = Number(crm?.new_contacts_week || 0);
    const openTasks = Number(tasks?.open_tasks || 0);
    const overdue = Number(tasks?.overdue || 0);
    const todayBookings = Number(bookings?.today_count || 0);
    const topDeals = topOpps.results || [];

    let answer = "";

    // Route to relevant insight based on query
    if (q.includes("call list") || q.includes("who should") || q.includes("priorit") || q.includes("focus")) {
      if (topDeals.length) {
        const deal = topDeals[0];
        answer = `Your highest-priority contact today is ${deal.contact || "a prospect"} — their deal (${deal.title}) is at ${deal.stage} stage worth ${fmt(deal.value_cents)}. ` +
          (overdue > 0 ? `You also have ${overdue} overdue task${overdue > 1 ? "s" : ""} that should be cleared first. ` : "") +
          `Total pipeline: ${fmt(pipeline)} across ${topDeals.length} active deals.`;
      } else {
        answer = `No open opportunities found yet. You have ${contacts} contact${contacts !== 1 ? "s" : ""} in the system — start by moving one into a deal.`;
      }
    } else if (q.includes("risk") || q.includes("at-risk") || q.includes("stuck") || q.includes("stall")) {
      const stalledDeals = topDeals.filter((d) => ["QUALIFIED", "PROPOSAL"].includes(String(d.stage)));
      if (stalledDeals.length) {
        answer = `${stalledDeals.length} deal${stalledDeals.length > 1 ? "s are" : " is"} stalled at Qualified or Proposal stage: ` +
          stalledDeals.map((d) => `${d.title} (${fmt(d.value_cents)})`).join(", ") +
          ". These need a follow-up activity or a stage push.";
      } else {
        answer = `No obviously stalled deals detected. Pipeline is ${fmt(pipeline)} with ${topDeals.length} active opportunities.`;
      }
    } else if (q.includes("draft") || q.includes("message") || q.includes("email") || q.includes("follow")) {
      if (topDeals.length) {
        const d = topDeals[0];
        answer = `For ${d.contact || "your top contact"}: "Hi, just wanted to follow up on the ${d.title} proposal at ${fmt(d.value_cents)}. Happy to adjust scope or timing — does ${new Date().toLocaleDateString("en-US", { weekday: "long" })} or early next week work for a 20-minute call?" ` +
          `I'd recommend logging this as a CALL activity once sent.`;
      } else {
        answer = "Open a contact record, choose New Activity → Call or Email, and I'll help you draft from there.";
      }
    } else if (q.includes("task") || q.includes("overdue") || q.includes("todo")) {
      answer = openTasks > 0
        ? `You have ${openTasks} open task${openTasks > 1 ? "s" : ""}${overdue > 0 ? ` — ${overdue} overdue` : ""}. Head to the CRM Work section to clear them. ${done ? `${tasks?.done_tasks} completed this cycle.` : ""}`
        : "No open tasks. You're clear — go win a deal.";
    } else if (q.includes("book") || q.includes("appoint") || q.includes("calendar") || q.includes("schedule") || q.includes("meeting")) {
      answer = todayBookings > 0
        ? `You have ${todayBookings} confirmed booking${todayBookings > 1 ? "s" : ""} today. Open the Calendar tab to see the full schedule and join links.`
        : "No confirmed bookings for today. Your calendar is open — share your booking link to fill it.";
    } else if (q.includes("pipeline") || q.includes("revenue") || q.includes("deal") || q.includes("money") || q.includes("value")) {
      answer = `Active pipeline: ${fmt(pipeline)} across ${topDeals.length} deal${topDeals.length !== 1 ? "s" : ""}. ` +
        (won > 0 ? `${fmt(won)} closed won so far. ` : "") +
        (newThisWeek > 0 ? `${newThisWeek} new contact${newThisWeek > 1 ? "s" : ""} added this week. ` : "") +
        (topDeals.length ? `Top deal: ${topDeals[0].title} at ${fmt(topDeals[0].value_cents)}.` : "");
    } else if (q.includes("contact") || q.includes("lead") || q.includes("prospect")) {
      answer = `${contacts} total contact${contacts !== 1 ? "s" : ""} across ${crm?.accounts || 0} account${Number(crm?.accounts) !== 1 ? "s" : ""}. ` +
        (newThisWeek > 0 ? `${newThisWeek} added this week. ` : "0 new contacts this week — time to prospect. ") +
        `Use Prospecting AI to find and score new leads instantly.`;
    } else {
      // Default business summary
      const urgent = [];
      if (overdue > 0) urgent.push(`${overdue} overdue task${overdue > 1 ? "s" : ""}`);
      if (topDeals.length > 0) urgent.push(`${fmt(pipeline)} active pipeline`);
      if (todayBookings > 0) urgent.push(`${todayBookings} booking${todayBookings > 1 ? "s" : ""} today`);
      answer = urgent.length
        ? `Right now: ${urgent.join(", ")}. ` +
          (topDeals.length ? `Highest-value deal: ${topDeals[0].contact || topDeals[0].title} at ${fmt(topDeals[0].value_cents)} (${topDeals[0].stage}).` : "")
        : `Workspace is quiet. ${contacts} contact${contacts !== 1 ? "s" : ""} in the CRM, ${fmt(pipeline)} in pipeline. Ask me about deals, tasks, bookings, or who to call first.`;
    }

    return Response.json({ answer });
  } catch (error) {
    console.error("prime.post_failed", error);
    return Response.json({ error: "Unable to process request." }, { status: 500 });
  }
}
