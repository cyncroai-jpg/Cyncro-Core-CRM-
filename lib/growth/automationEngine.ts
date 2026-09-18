/**
 * Growth Intelligence visual automation engine — walks a real node graph
 * (trigger → condition branches → delay → action) stored as nodes/edges,
 * same shape a React Flow canvas produces. Delay nodes really pause
 * execution (status WAITING + resume_at) and are resumed by the existing
 * 30-minute Cloudflare cron trigger (see worker/index.ts) — there is no
 * fake "delay" that secretly runs immediately.
 */
import { coreDb } from "@/lib/core/db";
import { createFollowUpTask, addActivityNote } from "@/lib/growth/crmSync";

export type GrowthAutomationTrigger = "FORM_SUBMITTED" | "CONTACT_CREATED" | "OPPORTUNITY_CREATED";

export interface FlowNode {
  id: string;
  type: "trigger" | "condition" | "action" | "delay";
  data: Record<string, unknown>;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // "yes" | "no" for condition nodes
}

function uid() {
  return crypto.randomUUID();
}

async function loadContactContext(contactId: string | undefined): Promise<Record<string, unknown> | null> {
  if (!contactId) return null;
  return (await coreDb().prepare("SELECT * FROM crm_contacts WHERE id=?").bind(contactId).first<Record<string, unknown>>()) || null;
}
async function loadOpportunityContext(opportunityId: string | undefined): Promise<Record<string, unknown> | null> {
  if (!opportunityId) return null;
  return (await coreDb().prepare("SELECT * FROM crm_opportunities WHERE id=?").bind(opportunityId).first<Record<string, unknown>>()) || null;
}

function evaluateCondition(data: Record<string, unknown>, context: Record<string, unknown>, contact: Record<string, unknown> | null, opportunity: Record<string, unknown> | null): boolean {
  const field = String(data.field || "");
  const operator = String(data.operator || "equals");
  const compareTo = data.value;
  let actual: unknown;
  if (field.startsWith("contact.")) actual = contact?.[field.slice(8)];
  else if (field.startsWith("opportunity.")) actual = opportunity?.[field.slice(12)];
  else actual = context[field];

  if (actual === undefined || actual === null) return operator === "not_equals" ? compareTo !== undefined : false;
  const a = typeof actual === "number" ? actual : String(actual).toLowerCase();
  const b = typeof compareTo === "number" ? compareTo : String(compareTo ?? "").toLowerCase();
  switch (operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return String(a).includes(String(b));
    case "greater_than": return Number(actual) > Number(compareTo);
    case "less_than": return Number(actual) < Number(compareTo);
    default: return false;
  }
}

async function executeAction(data: Record<string, unknown>, context: Record<string, unknown>): Promise<string> {
  const db = coreDb();
  const actionType = String(data.actionType || "");
  const contactId = String(context.contactId || "");
  const opportunityId = String(context.opportunityId || "");

  if (actionType === "CREATE_TASK") {
    if (!contactId) throw new Error("No contact in context for CREATE_TASK");
    const title = String(data.title || "Follow up").slice(0, 200);
    const dueInDays = Math.max(0, Number(data.dueInDays ?? 1));
    const id = await createFollowUpTask({ contactId, title, assignee: String(data.assignee || "") || null, dueAt: new Date(Date.now() + dueInDays * 86_400_000).toISOString() });
    return `Created task "${title}" (${id})`;
  }
  if (actionType === "ADD_NOTE") {
    if (!contactId) throw new Error("No contact in context for ADD_NOTE");
    const title = String(data.title || "Automation note").slice(0, 200);
    await addActivityNote(contactId, title, String(data.details || ""), "growth-automation");
    return `Added note "${title}" to contact ${contactId}`;
  }
  if (actionType === "ADD_TAG") {
    if (!contactId) throw new Error("No contact in context for ADD_TAG");
    const tag = String(data.tag || "").trim();
    if (!tag) throw new Error("No tag configured");
    const row = await db.prepare("SELECT gi_tags FROM crm_contacts WHERE id=?").bind(contactId).first<{ gi_tags: string }>();
    const tags: string[] = Array.from(new Set([...JSON.parse(row?.gi_tags || "[]"), tag]));
    await db.prepare("UPDATE crm_contacts SET gi_tags=? WHERE id=?").bind(JSON.stringify(tags), contactId).run();
    return `Tagged contact ${contactId} with "${tag}"`;
  }
  if (actionType === "ASSIGN_REP") {
    if (!opportunityId) throw new Error("No opportunity in context for ASSIGN_REP");
    const rep = String(data.rep || "").trim();
    if (!rep) throw new Error("No rep configured");
    await db.prepare("UPDATE crm_opportunities SET assigned_rep=?, updated_at=? WHERE id=?").bind(rep, new Date().toISOString(), opportunityId).run();
    return `Assigned opportunity ${opportunityId} to ${rep}`;
  }
  if (actionType === "UPDATE_STAGE") {
    if (!opportunityId) throw new Error("No opportunity in context for UPDATE_STAGE");
    const stage = String(data.stage || "").trim().toUpperCase();
    if (!stage) throw new Error("No stage configured");
    await db.prepare("UPDATE crm_opportunities SET stage=?, updated_at=? WHERE id=?").bind(stage, new Date().toISOString(), opportunityId).run();
    return `Moved opportunity ${opportunityId} to ${stage}`;
  }
  throw new Error(`Unknown action type: ${actionType}`);
}

function outgoing(edges: FlowEdge[], nodeId: string, handle?: string): FlowEdge | undefined {
  return edges.find((e) => e.source === nodeId && (handle === undefined || (e.sourceHandle || null) === handle));
}

interface TraceEntry { nodeId: string; type: string; result: string; at: string }

async function walk(
  automationId: string, runId: string, nodes: FlowNode[], edges: FlowEdge[], startNodeId: string,
  context: Record<string, unknown>, trace: TraceEntry[],
): Promise<void> {
  const db = coreDb();
  let currentId: string | undefined = startNodeId;
  const contact = await loadContactContext(String(context.contactId || "") || undefined);
  const opportunity = await loadOpportunityContext(String(context.opportunityId || "") || undefined);

  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    const now = new Date().toISOString();

    if (node.type === "condition") {
      const result = evaluateCondition(node.data, context, contact, opportunity);
      trace.push({ nodeId: node.id, type: "condition", result: result ? "YES" : "NO", at: now });
      const edge = outgoing(edges, node.id, result ? "yes" : "no");
      currentId = edge?.target;
      continue;
    }
    if (node.type === "delay") {
      const amount = Math.max(1, Number(node.data.amount || 1));
      const unit = String(node.data.unit || "hours");
      const ms = unit === "days" ? amount * 86_400_000 : unit === "minutes" ? amount * 60_000 : amount * 3_600_000;
      const resumeAt = new Date(Date.now() + ms).toISOString();
      const edge = outgoing(edges, node.id);
      trace.push({ nodeId: node.id, type: "delay", result: `Paused until ${resumeAt}`, at: now });
      await db.prepare("UPDATE gi_automation_runs SET status='WAITING', current_node_id=?, resume_at=?, trace_json=?, updated_at=? WHERE id=?")
        .bind(edge?.target || null, resumeAt, JSON.stringify(trace), now, runId).run();
      return; // execution pauses here — the cron resumes it
    }
    if (node.type === "action") {
      try {
        const detail = await executeAction(node.data, context);
        trace.push({ nodeId: node.id, type: "action", result: detail, at: now });
      } catch (error) {
        trace.push({ nodeId: node.id, type: "action", result: `FAILED: ${error instanceof Error ? error.message : "Unknown error"}`, at: now });
      }
      const edge = outgoing(edges, node.id);
      currentId = edge?.target;
      continue;
    }
    // trigger node — just move to its outgoing edge
    const edge = outgoing(edges, node.id);
    currentId = edge?.target;
  }

  await db.prepare("UPDATE gi_automation_runs SET status='COMPLETE', current_node_id=NULL, resume_at=NULL, trace_json=?, updated_at=? WHERE id=?")
    .bind(JSON.stringify(trace), new Date().toISOString(), runId).run();
  await db.prepare("UPDATE gi_automations SET run_count = run_count + 1, updated_at=? WHERE id=?").bind(new Date().toISOString(), automationId).run();
}

/** Fires every ACTIVE automation whose trigger node matches this event, starting a real graph walk for each. */
export async function runGrowthAutomations(triggerEvent: GrowthAutomationTrigger, context: Record<string, unknown>): Promise<void> {
  const db = coreDb();
  const { results } = await db.prepare("SELECT * FROM gi_automations WHERE status='ACTIVE'").all<Record<string, unknown>>();
  for (const automation of results || []) {
    const nodes: FlowNode[] = JSON.parse(String(automation.nodes_json || "[]"));
    const edges: FlowEdge[] = JSON.parse(String(automation.edges_json || "[]"));
    const triggerNode = nodes.find((n) => n.type === "trigger" && String(n.data.event) === triggerEvent);
    if (!triggerNode) continue;
    const filterField = String(triggerNode.data.filterField || "");
    if (filterField) {
      const matches = evaluateCondition({ field: filterField, operator: String(triggerNode.data.filterOperator || "equals"), value: triggerNode.data.filterValue }, context, null, null);
      if (!matches) continue;
    }
    const runId = uid();
    const now = new Date().toISOString();
    const trace: TraceEntry[] = [{ nodeId: triggerNode.id, type: "trigger", result: `Matched ${triggerEvent}`, at: now }];
    await db.prepare("INSERT INTO gi_automation_runs (id, automation_id, trigger_event, context_json, status, current_node_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(runId, automation.id, triggerEvent, JSON.stringify(context), "RUNNING", triggerNode.id, now, now).run();
    await walk(String(automation.id), runId, nodes, edges, triggerNode.id, context, trace);
  }
}

/** Called from the existing 30-minute Cloudflare cron trigger — resumes every run a delay node paused whose time has come. */
export async function resumeGrowthAutomations(): Promise<{ resumed: number }> {
  const db = coreDb();
  const now = new Date().toISOString();
  const { results } = await db.prepare("SELECT * FROM gi_automation_runs WHERE status='WAITING' AND resume_at <= ?").bind(now).all<Record<string, unknown>>();
  let resumed = 0;
  for (const run of results || []) {
    const automation = await db.prepare("SELECT * FROM gi_automations WHERE id=?").bind(run.automation_id).first<Record<string, unknown>>();
    if (!automation) continue;
    const nodes: FlowNode[] = JSON.parse(String(automation.nodes_json || "[]"));
    const edges: FlowEdge[] = JSON.parse(String(automation.edges_json || "[]"));
    const context = JSON.parse(String(run.context_json || "{}"));
    const trace: TraceEntry[] = JSON.parse(String(run.trace_json || "[]"));
    if (!run.current_node_id) continue;
    await db.prepare("UPDATE gi_automation_runs SET status='RUNNING' WHERE id=?").bind(run.id).run();
    await walk(String(automation.id), String(run.id), nodes, edges, String(run.current_node_id), context, trace);
    resumed++;
  }
  return { resumed };
}
