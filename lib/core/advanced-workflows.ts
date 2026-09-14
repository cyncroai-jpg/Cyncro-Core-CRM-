/**
 * Advanced Workflow Automation (Phase 36)
 *
 * Complex workflow execution engine with:
 * - Complex trigger conditions (AND/OR logic)
 * - Multi-step action sequences with delays
 * - Workflow branching based on conditions
 * - Error handling and retry policies
 * - Execution history and analytics
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type TriggerType =
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "DEAL_CREATED"
  | "DEAL_MOVED"
  | "DEAL_CLOSED"
  | "EMAIL_OPENED"
  | "EMAIL_CLICKED"
  | "FORM_SUBMITTED"
  | "MANUAL_TRIGGER"
  | "SCHEDULED"
  | "WEBHOOK";

export type ActionType =
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "CREATE_TASK"
  | "ASSIGN_TO_USER"
  | "UPDATE_CONTACT"
  | "UPDATE_DEAL"
  | "ADD_TAG"
  | "REMOVE_TAG"
  | "MOVE_DEAL"
  | "CREATE_FOLLOW_UP"
  | "WEBHOOK_CALL"
  | "LOG_ACTIVITY"
  | "DELAY"
  | "BRANCH_CONDITION";

export type ConditionOperator = "equals" | "contains" | "greater_than" | "less_than" | "is_true" | "is_false";

export interface WorkflowTrigger {
  type: TriggerType;
  conditions?: WorkflowCondition[];
  logic?: "AND" | "OR";
}

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface WorkflowAction {
  id: string;
  type: ActionType;
  sequence: number;
  delaySeconds?: number;
  config: Record<string, unknown>;
  conditions?: WorkflowCondition[];
  onError?: "CONTINUE" | "STOP" | "RETRY";
  retryCount?: number;
}

export interface WorkflowStep {
  id: string;
  type: "ACTION" | "BRANCH" | "DELAY";
  action?: WorkflowAction;
  branches?: {
    condition?: WorkflowCondition;
    steps: WorkflowStep[];
  }[];
  delaySeconds?: number;
}

export interface AdvancedWorkflow {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  tenantId: string;
  workflowId: string;
  triggeredBy: string;
  triggerId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  currentStepId?: string;
  stepResults: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  successRate: number;
  topErrors: { error: string; count: number }[];
}

/**
 * Create an advanced workflow
 */
export async function createAdvancedWorkflow(
  tenantId: string,
  workflow: Omit<AdvancedWorkflow, "id" | "tenantId" | "createdAt" | "updatedAt">
): Promise<AdvancedWorkflow> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result: AdvancedWorkflow = {
    id,
    tenantId,
    ...workflow,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO advanced_workflows
       (id, tenant_id, name, description, trigger, steps, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      workflow.name,
      workflow.description || null,
      JSON.stringify(workflow.trigger),
      JSON.stringify(workflow.steps),
      workflow.enabled ? 1 : 0,
      workflow.createdBy,
      now,
      now
    )
    .run();

  return result;
}

/**
 * Get workflow by ID
 */
export async function getAdvancedWorkflow(
  tenantId: string,
  workflowId: string
): Promise<AdvancedWorkflow | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT * FROM advanced_workflows WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, workflowId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    trigger: JSON.parse(String(row.trigger)),
    steps: JSON.parse(String(row.steps)),
    enabled: Boolean(row.enabled),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List workflows for tenant
 */
export async function listAdvancedWorkflows(
  tenantId: string,
  enabledOnly = false
): Promise<AdvancedWorkflow[]> {
  const db = coreDb();

  let query = `SELECT * FROM advanced_workflows WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (enabledOnly) {
    query += ` AND enabled = 1`;
  }

  query += ` ORDER BY updated_at DESC`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    trigger: JSON.parse(String(row.trigger)),
    steps: JSON.parse(String(row.steps)),
    enabled: Boolean(row.enabled),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Update workflow
 */
export async function updateAdvancedWorkflow(
  tenantId: string,
  workflowId: string,
  updates: Partial<Omit<AdvancedWorkflow, "id" | "tenantId" | "createdAt">>
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description || null);
  }
  if (updates.trigger !== undefined) {
    fields.push("trigger = ?");
    values.push(JSON.stringify(updates.trigger));
  }
  if (updates.steps !== undefined) {
    fields.push("steps = ?");
    values.push(JSON.stringify(updates.steps));
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  values.push(now);
  values.push(tenantId);
  values.push(workflowId);

  await db
    .prepare(
      `UPDATE advanced_workflows SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`
    )
    .bind(...values)
    .run();
}

/**
 * Delete workflow
 */
export async function deleteAdvancedWorkflow(
  tenantId: string,
  workflowId: string
): Promise<void> {
  const db = coreDb();

  await db
    .prepare(
      `DELETE FROM advanced_workflows WHERE tenant_id = ? AND id = ?`
    )
    .bind(tenantId, workflowId)
    .run();
}

/**
 * Trigger workflow execution
 */
export async function executeWorkflow(
  tenantId: string,
  workflowId: string,
  triggerId: string,
  triggeredBy: string,
  triggerData?: Record<string, unknown>
): Promise<WorkflowExecution> {
  const db = coreDb();
  const executionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const execution: WorkflowExecution = {
    id: executionId,
    tenantId,
    workflowId,
    triggeredBy,
    triggerId,
    status: "PENDING",
    stepResults: triggerData || {},
    startedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO workflow_executions
       (id, tenant_id, workflow_id, triggered_by, trigger_id, status, step_results, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      executionId,
      tenantId,
      workflowId,
      triggeredBy,
      triggerId,
      "PENDING",
      JSON.stringify(execution.stepResults),
      now
    )
    .run();

  return execution;
}

/**
 * Get execution history
 */
export async function getWorkflowExecutions(
  tenantId: string,
  workflowId: string,
  limit = 50
): Promise<WorkflowExecution[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_executions
       WHERE tenant_id = ? AND workflow_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .bind(tenantId, workflowId, limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workflowId: String(row.workflow_id),
    triggeredBy: String(row.triggered_by),
    triggerId: String(row.trigger_id),
    status: String(row.status) as any,
    currentStepId: row.current_step_id ? String(row.current_step_id) : undefined,
    stepResults: JSON.parse(String(row.step_results || "{}")),
    error: row.error ? String(row.error) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  }));
}

/**
 * Update execution status
 */
export async function updateExecutionStatus(
  tenantId: string,
  executionId: string,
  status: "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED",
  stepResults?: Record<string, unknown>,
  error?: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const fields: string[] = ["status = ?"];
  const values: unknown[] = [status];

  if (stepResults !== undefined) {
    fields.push("step_results = ?");
    values.push(JSON.stringify(stepResults));
  }
  if (error !== undefined) {
    fields.push("error = ?");
    values.push(error || null);
  }
  if (status === "COMPLETED" || status === "FAILED") {
    fields.push("completed_at = ?");
    values.push(now);
  }

  values.push(tenantId);
  values.push(executionId);

  await db
    .prepare(
      `UPDATE workflow_executions SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`
    )
    .bind(...values)
    .run();
}

/**
 * Get workflow metrics
 */
export async function getWorkflowMetrics(
  tenantId: string,
  workflowId?: string,
  days = 7
): Promise<WorkflowMetrics> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = `SELECT * FROM workflow_executions WHERE tenant_id = ? AND started_at > ?`;
  const params: unknown[] = [tenantId, startDate];

  if (workflowId) {
    query += ` AND workflow_id = ?`;
    params.push(workflowId);
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  const total = results.length;
  const successful = results.filter((r) => r.status === "COMPLETED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  // Calculate average execution time
  let totalTime = 0;
  let timeCount = 0;
  const errors: Record<string, number> = {};

  for (const execution of results) {
    const startTime = new Date(String(execution.started_at)).getTime();
    const endTime = execution.completed_at
      ? new Date(String(execution.completed_at)).getTime()
      : Date.now();
    totalTime += endTime - startTime;
    timeCount++;

    if (execution.error) {
      const error = String(execution.error);
      errors[error] = (errors[error] || 0) + 1;
    }
  }

  const topErrors = Object.entries(errors)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalExecutions: total,
    successfulExecutions: successful,
    failedExecutions: failed,
    averageExecutionTime: timeCount > 0 ? Math.round(totalTime / timeCount) : 0,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    topErrors,
  };
}

/**
 * Check if workflow conditions are met
 */
export function evaluateConditions(
  data: Record<string, unknown>,
  conditions: WorkflowCondition[],
  logic: "AND" | "OR" = "AND"
): boolean {
  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map((condition) =>
    evaluateCondition(data, condition)
  );

  return logic === "AND" ? results.every((r) => r) : results.some((r) => r);
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  data: Record<string, unknown>,
  condition: WorkflowCondition
): boolean {
  const value = data[condition.field];

  switch (condition.operator) {
    case "equals":
      return value === condition.value;
    case "contains":
      return String(value).includes(String(condition.value));
    case "greater_than":
      return Number(value) > Number(condition.value);
    case "less_than":
      return Number(value) < Number(condition.value);
    case "is_true":
      return Boolean(value) === true;
    case "is_false":
      return Boolean(value) === false;
    default:
      return false;
  }
}

/**
 * Clean up old executions (keep 90 days)
 */
export async function cleanupOldExecutions(): Promise<void> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `DELETE FROM workflow_executions WHERE started_at < ?`
    )
    .bind(cutoffDate)
    .run();
}
