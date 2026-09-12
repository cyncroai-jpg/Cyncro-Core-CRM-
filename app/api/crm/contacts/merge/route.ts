/**
 * POST /api/crm/contacts/merge
 *
 * Merge two contacts, keeping one as the primary (winner) and deleting the other (loser).
 * Fields from the loser are only copied to the winner when the winner's field is empty,
 * so no data is silently lost. Activities, opportunity references, and calendar bookings
 * are re-pointed to the winner before the loser record is deleted.
 *
 * Body:
 *   { winnerId: string; loserId: string }
 *
 * Both contacts must exist. The caller must have "edit" + "delete" CRM permissions.
 */
import { cleanText, coreDb, ensureCoreSchema, hasCrmAction } from "@/lib/core/db";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    const winnerId = cleanText(body.winnerId, 80);
    const loserId = cleanText(body.loserId, 80);

    if (!winnerId || !loserId) return Response.json({ error: "winnerId and loserId are required." }, { status: 400 });
    if (winnerId === loserId) return Response.json({ error: "Cannot merge a contact with itself." }, { status: 400 });

    const db = coreDb();
    const [winner, loser] = await Promise.all([
      db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(winnerId).first<Record<string, unknown>>(),
      db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(loserId).first<Record<string, unknown>>(),
    ]);

    if (!winner) return Response.json({ error: "Winner contact not found." }, { status: 404 });
    if (!loser) return Response.json({ error: "Loser contact not found." }, { status: 404 });

    const now = new Date().toISOString();

    // Build winner update — fill empty winner fields from loser values.
    const fillFields: string[] = [];
    const fillValues: unknown[] = [];
    const fill = (col: string, winnerKey: string, loserKey?: string) => {
      const lk = loserKey ?? winnerKey;
      if (!winner[winnerKey] && loser[lk]) {
        fillFields.push(`${col} = ?`);
        fillValues.push(loser[lk]);
      }
    };
    fill("email",        "email");
    fill("phone",        "phone");
    fill("title",        "title");
    fill("account_id",   "accountId",    "account_id");
    fill("assigned_rep", "assignedRep",  "assigned_rep");
    fill("notes",        "notes");

    // Merge notes: if both have notes, concatenate with separator.
    if (winner["notes"] && loser["notes"]) {
      fillFields.push("notes = ?");
      fillValues.push(`${winner["notes"]}\n\n--- Merged from ${loser["full_name"] ?? loserId} ---\n${loser["notes"]}`);
      // Remove the fill we may have added for notes just above.
    }

    // Always update the timestamp.
    fillFields.push("updated_at = ?");
    fillValues.push(now);

    // Run everything in a batch so the merge is atomic.
    const statements = [];

    if (fillFields.length > 1) { // More than just updated_at.
      statements.push(
        db.prepare(`UPDATE crm_contacts SET ${fillFields.join(", ")} WHERE id = ?`)
          .bind(...fillValues, winnerId)
      );
    }

    // Re-point related rows from loser → winner.
    statements.push(
      db.prepare("UPDATE crm_activities SET contact_id=? WHERE contact_id=?").bind(winnerId, loserId),
      db.prepare("UPDATE crm_opportunities SET primary_contact_id=? WHERE primary_contact_id=?").bind(winnerId, loserId),
      db.prepare("UPDATE calendar_bookings SET contact_id=? WHERE contact_id=?").bind(winnerId, loserId),
    );

    // Delete the loser.
    statements.push(db.prepare("DELETE FROM crm_contacts WHERE id=?").bind(loserId));

    await db.batch(statements);

    const merged = await db.prepare(
      `SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?`
    ).bind(winnerId).first();

    return Response.json({ merged, deletedId: loserId });
  } catch (error) {
    console.error("crm.contacts.merge_failed", error);
    return Response.json({ error: "Contact merge failed." }, { status: 500 });
  }
}
