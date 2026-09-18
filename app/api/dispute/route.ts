/**
 * Cyncro Dispute — platform operations API (rounds, bureau records/tradelines,
 * documents, certified-mail tracking, tasks, notifications, team).
 *
 * Client roster/disputes/scores/payments/templates already live in
 * /api/credit-repair (lib/core/credit-repair.ts). Letter generation and the
 * FCRA template library already live in /api/fcra-compliance
 * (lib/core/fcra-compliance.ts). This route covers everything those two
 * don't: negative-item/tradeline tracking, dispute rounds that group items,
 * document metadata, certified-mail + bureau-response tracking, follow-up
 * tasks/deadlines, client notifications, and the team roster.
 *
 * A single Next.js route file (no catch-all segment) — resource, id and
 * action are query params instead of URL path segments.
 *
 * GET  /api/dispute?resource=rounds&clientId=X
 * POST /api/dispute?resource=rounds
 * PATCH /api/dispute?resource=rounds&id=X
 * GET  /api/dispute?resource=tradelines&clientId=X
 * POST /api/dispute?resource=tradelines
 * PATCH /api/dispute?resource=tradelines&id=X
 * GET  /api/dispute?resource=reports&clientId=X
 * POST /api/dispute?resource=reports
 * GET  /api/dispute?resource=items&roundId=X | &clientId=X
 * POST /api/dispute?resource=items
 * PATCH /api/dispute?resource=items&id=X
 * GET  /api/dispute?resource=documents&clientId=X
 * POST /api/dispute?resource=documents
 * DELETE /api/dispute?resource=documents&id=X
 * GET  /api/dispute?resource=mail
 * POST /api/dispute?resource=mail
 * PATCH /api/dispute?resource=mail&id=X
 * GET  /api/dispute?resource=tasks
 * POST /api/dispute?resource=tasks
 * PATCH /api/dispute?resource=tasks&id=X
 * GET  /api/dispute?resource=notifications&clientId=X
 * POST /api/dispute?resource=notifications
 * GET  /api/dispute?resource=team
 * GET  /api/dispute?resource=summary — dashboard metrics
 */

import { cleanText, ensureCoreSchema, getTenantContext, coreDb } from "@/lib/core/db";
import { logAuditAction } from "@/lib/core/audit";

function id() {
  return crypto.randomUUID();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const clientId = url.searchParams.get("clientId") || undefined;
    const roundId = url.searchParams.get("roundId") || undefined;
    const id = url.searchParams.get("id") || undefined;

    if (resource === "rounds") {
      if (id) {
        const round = await db.prepare("SELECT * FROM dispute_rounds WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first();
        if (!round) return Response.json({ error: "Round not found." }, { status: 404 });
        return Response.json({ round });
      }
      const q = clientId
        ? db.prepare("SELECT * FROM dispute_rounds WHERE tenant_id=? AND client_id=? ORDER BY round_number DESC").bind(tenant.tenantId, clientId)
        : db.prepare("SELECT * FROM dispute_rounds WHERE tenant_id=? ORDER BY opened_at DESC LIMIT 100").bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ rounds: results });
    }

    if (resource === "tradelines") {
      if (id) {
        const tradeline = await db.prepare("SELECT * FROM dispute_tradelines WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first();
        if (!tradeline) return Response.json({ error: "Tradeline not found." }, { status: 404 });
        return Response.json({ tradeline });
      }
      const q = clientId
        ? db.prepare("SELECT * FROM dispute_tradelines WHERE tenant_id=? AND client_id=? ORDER BY created_at DESC").bind(tenant.tenantId, clientId)
        : db.prepare("SELECT * FROM dispute_tradelines WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ tradelines: results });
    }

    if (resource === "reports") {
      const q = clientId
        ? db.prepare("SELECT * FROM dispute_bureau_reports WHERE tenant_id=? AND client_id=? ORDER BY report_date DESC").bind(tenant.tenantId, clientId)
        : db.prepare("SELECT * FROM dispute_bureau_reports WHERE tenant_id=? ORDER BY report_date DESC LIMIT 100").bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ reports: results });
    }

    if (resource === "items") {
      const cols = `i.*, t.creditor_name, t.account_number, t.reported_status, c.first_name, c.last_name`;
      const join = `FROM dispute_items i
                     JOIN dispute_tradelines t ON t.id=i.tradeline_id
                     JOIN credit_repair_clients c ON c.id=i.client_id`;
      const q = roundId
        ? db.prepare(`SELECT ${cols} ${join} WHERE i.tenant_id=? AND i.round_id=? ORDER BY i.created_at`).bind(tenant.tenantId, roundId)
        : clientId
          ? db.prepare(`SELECT ${cols} ${join} WHERE i.tenant_id=? AND i.client_id=? ORDER BY i.created_at DESC`).bind(tenant.tenantId, clientId)
          : db.prepare(`SELECT ${cols} ${join} WHERE i.tenant_id=? ORDER BY i.created_at DESC LIMIT 200`).bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ items: results });
    }

    if (resource === "documents") {
      const q = clientId
        ? db.prepare("SELECT * FROM dispute_documents WHERE tenant_id=? AND client_id=? ORDER BY created_at DESC").bind(tenant.tenantId, clientId)
        : db.prepare("SELECT * FROM dispute_documents WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ documents: results });
    }

    if (resource === "mail") {
      const q = clientId
        ? db.prepare(`SELECT m.*, l.letter_type, l.credit_bureau, l.account_name
                       FROM dispute_mail_tracking m JOIN dispute_letters l ON l.id=m.letter_id
                       WHERE m.tenant_id=? AND m.client_id=? ORDER BY m.created_at DESC`).bind(tenant.tenantId, clientId)
        : db.prepare(`SELECT m.*, l.letter_type, l.credit_bureau, l.account_name
                       FROM dispute_mail_tracking m JOIN dispute_letters l ON l.id=m.letter_id
                       WHERE m.tenant_id=? ORDER BY m.created_at DESC LIMIT 200`).bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ mail: results });
    }

    if (resource === "tasks") {
      const status = url.searchParams.get("status") || undefined;
      let q;
      if (status) q = db.prepare("SELECT * FROM dispute_tasks WHERE tenant_id=? AND status=? ORDER BY due_date").bind(tenant.tenantId, status);
      else q = db.prepare("SELECT * FROM dispute_tasks WHERE tenant_id=? ORDER BY (due_date IS NULL), due_date").bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ tasks: results });
    }

    if (resource === "notifications") {
      if (!clientId) return Response.json({ error: "clientId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM dispute_notifications WHERE tenant_id=? AND client_id=? ORDER BY created_at DESC").bind(tenant.tenantId, clientId).all();
      return Response.json({ notifications: results });
    }

    if (resource === "team") {
      const { results } = await db.prepare("SELECT id, email, display_name, role, active FROM tenant_members WHERE tenant_id=? ORDER BY display_name").bind(tenant.tenantId).all();
      return Response.json({ team: results });
    }

    if (resource === "summary") {
      const [clients, openItems, dueTasks, mailInTransit, correctedItems] = await Promise.all([
        db.prepare("SELECT COUNT(*) c FROM credit_repair_clients WHERE tenant_id=?").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM dispute_items WHERE tenant_id=? AND status NOT IN ('RESOLVED_DELETED','RESOLVED_VERIFIED_ACCURATE','CLOSED')").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM dispute_tasks WHERE tenant_id=? AND status='OPEN' AND due_date IS NOT NULL AND due_date <= ?").bind(tenant.tenantId, new Date(Date.now() + 7 * 86400000).toISOString()).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM dispute_mail_tracking WHERE tenant_id=? AND status='MAILED'").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM dispute_items WHERE tenant_id=? AND status='RESOLVED_DELETED'").bind(tenant.tenantId).first<{ c: number }>(),
      ]);
      return Response.json({
        activeClients: Number(clients?.c || 0),
        openItems: Number(openItems?.c || 0),
        tasksDueSoon: Number(dueTasks?.c || 0),
        mailInTransit: Number(mailInTransit?.c || 0),
        itemsCorrected: Number(correctedItems?.c || 0),
      });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("dispute.get_failed", error);
    return Response.json({ error: "Unable to load Cyncro Dispute data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "rounds") {
      const clientId = cleanText(body.clientId, 80);
      const bureau = cleanText(body.creditBureau, 20);
      if (!clientId || !bureau) return Response.json({ error: "clientId and creditBureau are required." }, { status: 400 });
      const last = await db.prepare("SELECT MAX(round_number) n FROM dispute_rounds WHERE tenant_id=? AND client_id=?").bind(tenant.tenantId, clientId).first<{ n: number | null }>();
      const roundNumber = Number(last?.n || 0) + 1;
      const rid = id();
      await db.prepare(`INSERT INTO dispute_rounds (id,tenant_id,client_id,round_number,credit_bureau,status,opened_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(rid, tenant.tenantId, clientId, roundNumber, bureau, "OPEN", now, now, now).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "dispute", rid, { resourceName: `Round ${roundNumber} · ${bureau}` });
      return Response.json({ id: rid, roundNumber }, { status: 201 });
    }

    if (resource === "tradelines") {
      const clientId = cleanText(body.clientId, 80);
      const creditorName = cleanText(body.creditorName, 200);
      if (!clientId || !creditorName) return Response.json({ error: "clientId and creditorName are required." }, { status: 400 });
      const tid = id();
      await db.prepare(`INSERT INTO dispute_tradelines
        (id,tenant_id,client_id,creditor_name,account_number,account_type,balance_cents,reported_status,bureaus_reporting,is_negative,negative_reason,opened_date,source,report_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          tid, tenant.tenantId, clientId, creditorName,
          cleanText(body.accountNumber, 80) || null,
          cleanText(body.accountType, 60) || null,
          body.balanceCents !== undefined ? Math.round(Number(body.balanceCents)) : null,
          cleanText(body.reportedStatus, 100) || null,
          JSON.stringify(Array.isArray(body.bureausReporting) ? body.bureausReporting : []),
          body.isNegative === false ? 0 : 1,
          cleanText(body.negativeReason, 500) || null,
          cleanText(body.openedDate, 20) || null,
          cleanText(body.source, 20) || "MANUAL",
          cleanText(body.reportId, 80) || null,
          now, now,
        ).run();
      return Response.json({ id: tid }, { status: 201 });
    }

    if (resource === "reports") {
      const clientId = cleanText(body.clientId, 80);
      const bureau = cleanText(body.creditBureau, 20);
      const reportDate = cleanText(body.reportDate, 20) || now.slice(0, 10);
      if (!clientId || !bureau) return Response.json({ error: "clientId and creditBureau are required." }, { status: 400 });
      const rid = id();
      await db.prepare(`INSERT INTO dispute_bureau_reports (id,tenant_id,client_id,credit_bureau,report_date,file_name,notes,uploaded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(rid, tenant.tenantId, clientId, bureau, reportDate, cleanText(body.fileName, 300) || null, cleanText(body.notes, 2000) || null, tenant.email, now).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "dispute", rid, { resourceName: `${bureau} report intake` });
      return Response.json({ id: rid }, { status: 201 });
    }

    if (resource === "items") {
      const clientId = cleanText(body.clientId, 80);
      const roundId = cleanText(body.roundId, 80);
      const tradelineId = cleanText(body.tradelineId, 80);
      const reason = cleanText(body.disputeReason, 60);
      if (!clientId || !roundId || !tradelineId || !reason) {
        return Response.json({ error: "clientId, roundId, tradelineId, and disputeReason are required." }, { status: 400 });
      }
      const iid = id();
      await db.prepare(`INSERT INTO dispute_items (id,tenant_id,client_id,round_id,tradeline_id,dispute_reason,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(iid, tenant.tenantId, clientId, roundId, tradelineId, reason, "PREPARING", now, now).run();
      return Response.json({ id: iid }, { status: 201 });
    }

    if (resource === "documents") {
      const clientId = cleanText(body.clientId, 80);
      const docType = cleanText(body.docType, 40);
      const fileName = cleanText(body.fileName, 300);
      if (!clientId || !docType || !fileName) return Response.json({ error: "clientId, docType, and fileName are required." }, { status: 400 });
      const did = id();
      await db.prepare(`INSERT INTO dispute_documents (id,tenant_id,client_id,doc_type,file_name,notes,uploaded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(did, tenant.tenantId, clientId, docType, fileName, cleanText(body.notes, 1000) || null, tenant.email, now).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "dispute", did, { resourceName: `${docType} document: ${fileName}` });
      return Response.json({ id: did }, { status: 201 });
    }

    if (resource === "mail") {
      const letterId = cleanText(body.letterId, 80);
      const clientId = cleanText(body.clientId, 80);
      if (!letterId || !clientId) return Response.json({ error: "letterId and clientId are required." }, { status: 400 });
      const mid = id();
      await db.prepare(`INSERT INTO dispute_mail_tracking
        (id,tenant_id,letter_id,client_id,carrier,tracking_number,status,response_due_date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          mid, tenant.tenantId, letterId, clientId,
          cleanText(body.carrier, 40) || "USPS_CERTIFIED",
          cleanText(body.trackingNumber, 60) || null,
          "PREPARING",
          cleanText(body.responseDueDate, 20) || null,
          now, now,
        ).run();
      return Response.json({ id: mid }, { status: 201 });
    }

    if (resource === "tasks") {
      const title = cleanText(body.title, 300);
      if (!title) return Response.json({ error: "title is required." }, { status: 400 });
      const tid = id();
      await db.prepare(`INSERT INTO dispute_tasks (id,tenant_id,client_id,title,due_date,status,assigned_to,related_item_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          tid, tenant.tenantId, cleanText(body.clientId, 80) || null, title,
          cleanText(body.dueDate, 20) || null, "OPEN",
          cleanText(body.assignedTo, 254) || null, cleanText(body.relatedItemId, 80) || null,
          now, now,
        ).run();
      return Response.json({ id: tid }, { status: 201 });
    }

    if (resource === "notifications") {
      const clientId = cleanText(body.clientId, 80);
      const subject = cleanText(body.subject, 300);
      const message = cleanText(body.body, 4000);
      if (!clientId || !subject || !message) return Response.json({ error: "clientId, subject, and body are required." }, { status: 400 });
      const nid = id();
      await db.prepare(`INSERT INTO dispute_notifications (id,tenant_id,client_id,channel,subject,body,created_at)
        VALUES (?,?,?,?,?,?,?)`).bind(nid, tenant.tenantId, clientId, cleanText(body.channel, 20) || "EMAIL", subject, message, now).run();
      return Response.json({ id: nid }, { status: 201 });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("dispute.post_failed", error);
    return Response.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const recordId = url.searchParams.get("id");
    if (!recordId) return Response.json({ error: "id is required." }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "rounds") {
      const status = cleanText(body.status, 20);
      if (!status) return Response.json({ error: "status is required." }, { status: 400 });
      await db.prepare("UPDATE dispute_rounds SET status=?, closed_at=?, updated_at=? WHERE tenant_id=? AND id=?")
        .bind(status, status === "CLOSED" ? now : null, now, tenant.tenantId, recordId).run();
      return Response.json({ updated: true });
    }

    if (resource === "tradelines") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.reportedStatus !== undefined) { updates.push("reported_status=?"); vals.push(cleanText(body.reportedStatus, 100) || null); }
      if (body.balanceCents !== undefined) { updates.push("balance_cents=?"); vals.push(Math.round(Number(body.balanceCents))); }
      if (body.isNegative !== undefined) { updates.push("is_negative=?"); vals.push(body.isNegative ? 1 : 0); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, recordId);
      await db.prepare(`UPDATE dispute_tradelines SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "items") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 40)); }
      if (body.letterId !== undefined) { updates.push("letter_id=?"); vals.push(cleanText(body.letterId, 80) || null); }
      if (body.outcome !== undefined) { updates.push("outcome=?"); vals.push(cleanText(body.outcome, 40) || null); }
      if (body.outcomeNotes !== undefined) { updates.push("outcome_notes=?"); vals.push(cleanText(body.outcomeNotes, 2000) || null); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, recordId);
      await db.prepare(`UPDATE dispute_items SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "UPDATE", "dispute", recordId, { changes: [{ field: "status", before: null, after: body.status ?? null }] });
      return Response.json({ updated: true });
    }

    if (resource === "mail") {
      const status = cleanText(body.status, 30);
      if (!status) return Response.json({ error: "status is required." }, { status: 400 });
      const updates = ["status=?", "updated_at=?"];
      const vals: unknown[] = [status, now];
      if (body.trackingNumber !== undefined) { updates.push("tracking_number=?"); vals.push(cleanText(body.trackingNumber, 60) || null); }
      if (status === "MAILED") { updates.push("mailed_at=?"); vals.push(now); }
      if (status === "DELIVERED") { updates.push("delivered_at=?"); vals.push(now); }
      vals.push(tenant.tenantId, recordId);
      await db.prepare(`UPDATE dispute_mail_tracking SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      if (status === "MAILED") {
        await db.prepare("UPDATE dispute_letters SET sent_date=?, updated_at=? WHERE id=?").bind(now, now, (await db.prepare("SELECT letter_id FROM dispute_mail_tracking WHERE id=?").bind(recordId).first<{ letter_id: string }>())?.letter_id).run();
      }
      return Response.json({ updated: true });
    }

    if (resource === "tasks") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 20)); }
      if (body.dueDate !== undefined) { updates.push("due_date=?"); vals.push(cleanText(body.dueDate, 20) || null); }
      if (body.assignedTo !== undefined) { updates.push("assigned_to=?"); vals.push(cleanText(body.assignedTo, 254) || null); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, recordId);
      await db.prepare(`UPDATE dispute_tasks SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "letters") {
      // Letter body lives in dispute_letters (owned by /api/fcra-compliance for
      // generation); editing is handled here so the review/edit loop stays with
      // the rest of Cyncro Dispute's mutations. Only editable before it's mailed.
      const content = cleanText(body.letterContent, 20000);
      if (!content) return Response.json({ error: "letterContent is required." }, { status: 400 });
      const letter = await db.prepare("SELECT sent_date FROM dispute_letters WHERE tenant_id=? AND id=?").bind(tenant.tenantId, recordId).first<{ sent_date: string | null }>();
      if (!letter) return Response.json({ error: "Letter not found." }, { status: 404 });
      if (letter.sent_date) return Response.json({ error: "This letter has already been mailed and can no longer be edited." }, { status: 409 });
      await db.prepare("UPDATE dispute_letters SET letter_content=?, updated_at=? WHERE tenant_id=? AND id=?").bind(content, now, tenant.tenantId, recordId).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "UPDATE", "dispute", recordId, { resourceName: "Letter edited before mailing" });
      return Response.json({ updated: true });
    }

    if (resource === "clients") {
      // Team assignment lives on credit_repair_clients (owned by /api/credit-repair
      // for everything else); handled here since it's Dispute-platform-specific.
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.assignedRep !== undefined) { updates.push("assigned_rep=?"); vals.push(cleanText(body.assignedRep, 254) || null); }
      if (body.generatePortalToken) { updates.push("portal_token=?"); vals.push(crypto.randomUUID()); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, recordId);
      await db.prepare(`UPDATE credit_repair_clients SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      const row = await db.prepare("SELECT portal_token FROM credit_repair_clients WHERE id=?").bind(recordId).first<{ portal_token: string | null }>();
      return Response.json({ updated: true, portalToken: row?.portal_token || null });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("dispute.patch_failed", error);
    return Response.json({ error: "Unable to update." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const recordId = url.searchParams.get("id");
    if (!recordId) return Response.json({ error: "id is required." }, { status: 400 });

    if (resource === "documents") {
      await db.prepare("DELETE FROM dispute_documents WHERE tenant_id=? AND id=?").bind(tenant.tenantId, recordId).run();
      return Response.json({ deleted: true });
    }
    if (resource === "tasks") {
      await db.prepare("DELETE FROM dispute_tasks WHERE tenant_id=? AND id=?").bind(tenant.tenantId, recordId).run();
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("dispute.delete_failed", error);
    return Response.json({ error: "Unable to delete." }, { status: 500 });
  }
}
