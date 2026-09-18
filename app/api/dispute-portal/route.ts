/**
 * Cyncro Dispute — client-facing portal API. Unauthenticated, gated by the
 * per-client portal_token (a random UUID generated from the rep-facing
 * Client Portal view). Read-only status + a place to log document uploads;
 * never exposes other clients or tenant-internal data.
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

async function clientForToken(token: string) {
  if (!token) return null;
  const db = coreDb();
  return db
    .prepare("SELECT id, tenant_id, first_name, last_name, email, subscription_status, credit_score_current, credit_score_goal, credit_score_starting, onboarding_status FROM credit_repair_clients WHERE portal_token=?")
    .bind(token)
    .first<{ id: string; tenant_id: string; first_name: string; last_name: string; email: string; subscription_status: string; credit_score_current: number | null; credit_score_goal: number | null; credit_score_starting: number | null; onboarding_status: string }>();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const token = cleanText(new URL(request.url).searchParams.get("token"), 80);
    const client = await clientForToken(token || "");
    if (!client) return Response.json({ error: "Invalid or expired portal link." }, { status: 404 });
    const db = coreDb();
    const [rounds, items, scores, documents, notifications] = await Promise.all([
      db.prepare("SELECT id, round_number, credit_bureau, status, opened_at, closed_at FROM dispute_rounds WHERE client_id=? ORDER BY round_number DESC").bind(client.id).all(),
      db.prepare(`SELECT i.id, i.status, i.dispute_reason, i.outcome, i.created_at, t.creditor_name
                  FROM dispute_items i JOIN dispute_tradelines t ON t.id=i.tradeline_id
                  WHERE i.client_id=? ORDER BY i.created_at DESC`).bind(client.id).all(),
      db.prepare("SELECT recorded_date, equifax_score, experian_score, transunion_score, average_score FROM credit_score_records WHERE client_id=? ORDER BY recorded_date DESC LIMIT 12").bind(client.id).all(),
      db.prepare("SELECT id, doc_type, file_name, created_at FROM dispute_documents WHERE client_id=? ORDER BY created_at DESC").bind(client.id).all(),
      db.prepare("SELECT subject, body, created_at FROM dispute_notifications WHERE client_id=? ORDER BY created_at DESC LIMIT 20").bind(client.id).all(),
    ]);
    return Response.json({
      client: {
        firstName: client.first_name, lastName: client.last_name, email: client.email,
        subscriptionStatus: client.subscription_status, onboardingStatus: client.onboarding_status,
        scoreCurrent: client.credit_score_current, scoreGoal: client.credit_score_goal, scoreStarting: client.credit_score_starting,
      },
      rounds: rounds.results || [],
      items: items.results || [],
      scoreHistory: scores.results || [],
      documents: documents.results || [],
      notifications: notifications.results || [],
    });
  } catch (error) {
    console.error("dispute_portal.get_failed", error);
    return Response.json({ error: "Unable to load your portal." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const token = cleanText(body.token, 80);
    const client = await clientForToken(token || "");
    if (!client) return Response.json({ error: "Invalid or expired portal link." }, { status: 404 });
    const docType = cleanText(body.docType, 40);
    const fileName = cleanText(body.fileName, 300);
    if (!docType || !fileName) return Response.json({ error: "docType and fileName are required." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO dispute_documents (id,tenant_id,client_id,doc_type,file_name,notes,uploaded_by,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id, client.tenant_id, client.id, docType, fileName, cleanText(body.notes, 1000) || null, `client:${client.email}`, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispute_portal.post_failed", error);
    return Response.json({ error: "Unable to submit." }, { status: 500 });
  }
}
