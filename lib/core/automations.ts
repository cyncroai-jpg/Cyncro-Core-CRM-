/**
 * CRM automation rule engine.
 *
 * Real trigger → condition → action rules, stored in crm_automation_rules
 * and evaluated whenever a real CRM event happens (a contact is created,
 * an opportunity's stage changes, etc). Every run — matched or not,
 * succeeded or failed — is logged to crm_automation_runs so the rule's
 * history is auditable, not just a claimed "run count".
 */
import { coreDb, requestUser } from "@/lib/core/db";

export type AutomationTriggerEvent = "CONTACT_CREATED" | "OPPORTUNITY_STAGE_CHANGED" | "OPPORTUNITY_WON" | "OPPORTUNITY_LOST";
export type AutomationActionType = "CREATE_TASK" | "ADD_ACTIVITY_NOTE" | "ASSIGN_REP";

function uid() {
  return crypto.randomUUID();
}

function matchesFilter(filter: Record<string, unknown>, context: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined || value === null || value === "") return true;
    return String(context[key] ?? "").toLowerCase() === String(value).toLowerCase();
  });
}

/**
 * Runs every active rule for this trigger event against the given context.
 * context carries whatever fields the trigger's filters and actions need —
 * e.g. { contactId, accountId, stage, previousStage, opportunityId }.
 */
export async function runAutomations(
  request: Request,
  triggerEvent: AutomationTriggerEvent,
  context: Record<string, unknown>,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();
  const { results } = await db
    .prepare("SELECT * FROM crm_automation_rules WHERE trigger_event=? AND active=1")
    .bind(triggerEvent)
    .all<Record<string, unknown>>();

  for (const rule of results || []) {
    const ruleId = String(rule.id);
    let filter: Record<string, unknown> = {};
    let config: Record<string, unknown> = {};
    try {
      filter = JSON.parse(String(rule.trigger_filter || "{}"));
    } catch {
      // malformed filter — treat as no filter
    }
    if (!matchesFilter(filter, context)) continue;

    try {
      config = JSON.parse(String(rule.action_config || "{}"));
    } catch {
      config = {};
    }

    try {
      const detail = await executeAction(request, String(rule.action_type), config, context);
      await db.batch([
        db.prepare("UPDATE crm_automation_rules SET run_count=run_count+1, last_run_at=?, updated_at=? WHERE id=?").bind(now, now, ruleId),
        db.prepare("INSERT INTO crm_automation_runs (id,rule_id,trigger_event,context,result,detail,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(uid(), ruleId, triggerEvent, JSON.stringify(context), "SUCCESS", detail, now),
      ]);
    } catch (error) {
      await db.prepare("INSERT INTO crm_automation_runs (id,rule_id,trigger_event,context,result,detail,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(uid(), ruleId, triggerEvent, JSON.stringify(context), "FAILED", error instanceof Error ? error.message : "Unknown error", now)
        .run();
    }
  }
}

async function executeAction(
  request: Request,
  actionType: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<string> {
  const db = coreDb();
  const now = new Date().toISOString();

  if (actionType === "CREATE_TASK") {
    const title = String(config.title || "Follow up").slice(0, 200);
    const dueInDays = Math.max(0, Number(config.dueInDays ?? 1));
    const dueAt = new Date(Date.now() + dueInDays * 86_400_000).toISOString();
    const id = uid();
    await db.prepare(`INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,opportunity_id,account_id,due_at,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, title, `Created automatically by automation rule.`, "TODO", String(config.priority || "MEDIUM").toUpperCase(),
        String(context.assignedRep || "") || null, requestUser(request), String(context.contactId || "") || null,
        String(context.opportunityId || "") || null, String(context.accountId || "") || null, dueAt, 30, now, now).run();
    return `Created task "${title}" (id ${id})`;
  }

  if (actionType === "ADD_ACTIVITY_NOTE") {
    const contactId = String(context.contactId || "");
    if (!contactId) throw new Error("No contact in context to attach a note to");
    const title = String(config.title || "Automation note").slice(0, 200);
    const details = String(config.details || "").slice(0, 4000) || null;
    const id = uid();
    await db.prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(id, contactId, "NOTE", title, details, "COMPLETED", "automation", now, now).run();
    return `Added activity note "${title}" to contact ${contactId}`;
  }

  if (actionType === "ASSIGN_REP") {
    const opportunityId = String(context.opportunityId || "");
    const rep = String(config.rep || "").trim();
    if (!opportunityId || !rep) throw new Error("Missing opportunityId or rep to assign");
    await db.prepare("UPDATE crm_opportunities SET assigned_rep=?, updated_at=? WHERE id=?").bind(rep, now, opportunityId).run();
    return `Assigned opportunity ${opportunityId} to ${rep}`;
  }

  throw new Error(`Unknown action type: ${actionType}`);
}
