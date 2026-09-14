/**
 * Workflow Builder™ — Visual automation orchestration
 *
 * Workflows are DAGs (directed acyclic graphs) of nodes:
 * - Triggers (when to start): contact.created, deal.created, booking.confirmed, time-based, etc.
 * - Conditions (if/then): field equals value, lead score > X, days since X, etc.
 * - Actions (what to do): send email, create task, update deal, enroll sequence, call webhook, etc.
 * - Delays (wait N hours/days)
 *
 * Example workflow:
 * trigger: contact.created
 * → condition: lead_score > 50
 * → action: enroll in "VIP Nurture" sequence
 * → delay: 24 hours
 * → action: create task "Call {name}"
 * → condition: if deal created
 * → action: send "Welcome to proposal" email
 */

import { coreDb } from "@/lib/core/db";
import { sendEmail } from "@/lib/core/email";
import { fireSequenceTrigger } from "@/lib/core/email-sequences";

export type WorkflowTrigger =
  | "contact.created"
  | "contact.updated"
  | "deal.created"
  | "deal.updated"
  | "booking.confirmed"
  | "booking.cancelled"
  | "task.completed"
  | "email.opened"
  | "email.clicked"
  | "webhook.received"
  | "time_based"; // daily at X, weekly, etc.

export type ConditionOperator = "eq" | "ne" | "gt" | "lt" | "contains" | "starts_with" | "in_list";

export interface WorkflowNode {
  id: string;
  type: "trigger" | "condition" | "action" | "delay";
  config: Record<string, unknown>;
  nextNodes?: string[]; // IDs of nodes that follow
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[]; // DAG of nodes
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  tenantId: string;
  contactId?: string;
  dealId?: string;
  triggerData: Record<string, unknown>;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  currentNodeId?: string;
  completedNodes: string[];
  errors: { nodeId: string; error: string }[];
  startedAt: string;
  completedAt?: string;
}

/** Fire a workflow trigger and execute matching workflows */
export async function fireWorkflowTrigger(
  tenantId: string,
  trigger: WorkflowTrigger,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const db = coreDb();

    // Find all active workflows with this trigger
    const { results: workflows } = await db.prepare(
      `SELECT id, nodes FROM workflows
       WHERE tenant_id = ? AND trigger = ? AND enabled = 1`
    ).bind(tenantId, trigger).all<{ id: string; nodes: string }>();

    if (!workflows.length) return;

    // Execute each workflow
    for (const workflow of workflows) {
      const nodes = JSON.parse(String(workflow.nodes || "[]")) as WorkflowNode[];
      await executeWorkflow(tenantId, workflow.id, nodes, data);
    }
  } catch (err) {
    console.error("workflow.trigger.failed", { tenantId, trigger, error: String(err) });
  }
}

/** Execute a workflow from start to finish */
async function executeWorkflow(
  tenantId: string,
  workflowId: string,
  nodes: WorkflowNode[],
  triggerData: Record<string, unknown>,
): Promise<void> {
  try {
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = coreDb();

    // Create execution record
    await db.prepare(
      `INSERT INTO workflow_executions
       (id, workflow_id, tenant_id, trigger_data, status, started_at)
       VALUES (?, ?, ?, ?, 'RUNNING', ?)`
    ).bind(executionId, workflowId, tenantId, JSON.stringify(triggerData), now).run();

    // Execute nodes in order
    const completedNodes: string[] = [];
    const errors: { nodeId: string; error: string }[] = [];

    for (const node of nodes) {
      try {
        await executeNode(tenantId, node, triggerData);
        completedNodes.push(node.id);
      } catch (err) {
        errors.push({ nodeId: node.id, error: String(err) });
        // Continue on error (non-blocking)
      }
    }

    // Update execution
    await db.prepare(
      `UPDATE workflow_executions
       SET status = 'COMPLETED', completed_nodes = ?, errors = ?, completed_at = ?
       WHERE id = ?`
    ).bind(JSON.stringify(completedNodes), JSON.stringify(errors), now, executionId).run();
  } catch (err) {
    console.error("workflow.execution.failed", { workflowId, error: String(err) });
  }
}

/** Execute a single workflow node */
async function executeNode(
  tenantId: string,
  node: WorkflowNode,
  data: Record<string, unknown>,
): Promise<void> {
  const config = node.config || {};

  switch (node.type) {
    case "trigger":
      // Trigger already fired, nothing to do
      break;

    case "condition":
      // Evaluate condition
      const field = String(config.field || "");
      const operator = String(config.operator || "eq");
      const value = config.value;
      const dataValue = data[field];

      const conditionMet = evaluateCondition(dataValue, operator as ConditionOperator, value);
      if (!conditionMet) {
        throw new Error(`Condition not met: ${field} ${operator} ${value}`);
      }
      break;

    case "action":
      await executeAction(tenantId, config, data);
      break;

    case "delay":
      // Delay would be scheduled, not executed immediately
      // For MVP, we skip delays
      break;
  }
}

/** Execute an action node */
async function executeAction(
  tenantId: string,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<void> {
  const action = String(config.action || "");

  switch (action) {
    case "send_email":
      await sendEmail({
        to: String(data.email || config.to || ""),
        subject: String(config.subject || ""),
        html: String(config.html || ""),
      });
      break;

    case "enroll_sequence":
      await fireSequenceTrigger(tenantId, "contact.created", data);
      break;

    case "create_task":
      // Create a task in CRM
      const db = coreDb();
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO crm_activities
         (id, contact_id, activity_type, title, details, status, created_at, updated_at)
         VALUES (?, ?, 'TASK', ?, ?, 'PENDING', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        data.contactId || null,
        String(config.title || ""),
        String(config.details || ""),
        now,
        now,
      ).run();
      break;

    case "update_deal":
      // Update deal field
      const dealId = String(config.dealId || data.dealId || "");
      const field = String(config.field || "");
      const newValue = config.value;

      if (dealId && field) {
        const db2 = coreDb();
        const now2 = new Date().toISOString();
        await db2.prepare(
          `UPDATE crm_opportunities SET ${field} = ?, updated_at = ? WHERE id = ?`
        ).bind(newValue, now2, dealId).run();
      }
      break;

    case "add_tag":
      // Add tag to contact (via note)
      const contactId = String(config.contactId || data.contactId || "");
      const tag = String(config.tag || "");
      if (contactId && tag) {
        const db3 = coreDb();
        const now3 = new Date().toISOString();
        await db3.prepare(
          `UPDATE crm_contacts SET notes = COALESCE(notes, '') || ? WHERE id = ?`
        ).bind(`\n[${tag}]`, contactId).run();
      }
      break;

    case "call_webhook":
      // POST to external webhook
      const webhookUrl = String(config.url || "");
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).catch((err) => console.error("webhook.call.failed", err));
      }
      break;

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/** Evaluate a condition */
function evaluateCondition(
  dataValue: unknown,
  operator: ConditionOperator,
  expectedValue: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return dataValue === expectedValue;
    case "ne":
      return dataValue !== expectedValue;
    case "gt":
      return Number(dataValue) > Number(expectedValue);
    case "lt":
      return Number(dataValue) < Number(expectedValue);
    case "contains":
      return String(dataValue).includes(String(expectedValue));
    case "starts_with":
      return String(dataValue).startsWith(String(expectedValue));
    case "in_list":
      const list = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
      return list.includes(dataValue);
    default:
      return false;
  }
}
