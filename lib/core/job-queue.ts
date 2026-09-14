/**
 * Background Job Queue & Scheduled Tasks (Phase 31)
 *
 * Comprehensive job processing infrastructure:
 * - Async job queue for non-blocking operations
 * - Scheduled/recurring tasks with cron-like support
 * - Job priority levels
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Job status tracking
 * - Dead letter queue for permanently failed jobs
 * - Job execution history and analytics
 * - Worker health monitoring
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type JobType =
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "EXPORT_DATA"
  | "GENERATE_PDF"
  | "PROCESS_WEBHOOK"
  | "SYNC_INTEGRATION"
  | "SEND_NOTIFICATION"
  | "CLEANUP_DATA"
  | "GENERATE_REPORT"
  | "REBUILD_INDEX"
  | "CALCULATE_METRICS"
  | string;

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRY" | "DEAD_LETTER";
export type JobPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface Job {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  tenantId: string;
  name: string;
  type: JobType;
  cronExpression: string; // "0 0 * * *" format
  payload: Record<string, unknown>;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  jobId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

const BASE_BACKOFF_SECONDS = 30; // Start at 30 seconds
const MAX_BACKOFF_SECONDS = 3600; // Cap at 1 hour
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Calculate backoff time for retry
 */
function calculateBackoffSeconds(attempt: number): number {
  const backoff = BASE_BACKOFF_SECONDS * Math.pow(2, attempt - 1);
  return Math.min(backoff, MAX_BACKOFF_SECONDS);
}

/**
 * Create a new job
 */
export async function createJob(
  tenantId: string,
  type: JobType,
  payload: Record<string, unknown>,
  options?: {
    priority?: JobPriority;
    maxAttempts?: number;
    scheduledAt?: string;
  }
): Promise<Job> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: Job = {
    id,
    tenantId,
    type,
    status: "PENDING",
    priority: options?.priority || "NORMAL",
    payload,
    attempts: 0,
    maxAttempts: options?.maxAttempts || DEFAULT_MAX_ATTEMPTS,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO jobs
       (id, tenant_id, type, status, priority, payload, attempts, max_attempts, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      type,
      "PENDING",
      options?.priority || "NORMAL",
      JSON.stringify(payload),
      options?.maxAttempts || DEFAULT_MAX_ATTEMPTS,
      options?.scheduledAt || null,
      now,
      now
    )
    .run();

  return job;
}

/**
 * Get pending jobs for processing
 */
export async function getPendingJobs(
  limit: number = 100,
  tenantId?: string
): Promise<Job[]> {
  const db = coreDb();

  let query = `SELECT * FROM jobs WHERE status IN ('PENDING', 'RETRY')`;
  const params: unknown[] = [];

  if (tenantId) {
    query += ` AND tenant_id = ?`;
    params.push(tenantId);
  }

  query += ` AND (next_retry_at IS NULL OR next_retry_at <= ?)`;
  params.push(new Date().toISOString());

  query += ` ORDER BY priority DESC, created_at ASC LIMIT ?`;
  params.push(limit);

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: String(row.type) as JobType,
    status: String(row.status) as JobStatus,
    priority: String(row.priority) as JobPriority,
    payload: JSON.parse(String(row.payload || "{}")),
    result: row.result ? JSON.parse(String(row.result)) : undefined,
    error: row.error ? String(row.error) : undefined,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : undefined,
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Mark job as processing
 */
export async function markJobProcessing(jobId: string): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE jobs SET status = ?, started_at = ? WHERE id = ?`
    )
    .bind("PROCESSING", new Date().toISOString(), jobId)
    .run();
}

/**
 * Mark job as completed
 */
export async function markJobCompleted(
  jobId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE jobs SET status = ?, result = ?, completed_at = ? WHERE id = ?`
    )
    .bind(
      "COMPLETED",
      result ? JSON.stringify(result) : null,
      new Date().toISOString(),
      jobId
    )
    .run();
}

/**
 * Mark job for retry
 */
export async function scheduleJobRetry(
  jobId: string,
  error: string
): Promise<void> {
  const db = coreDb();

  // Get current attempt count
  const job = await db
    .prepare(`SELECT attempts, max_attempts FROM jobs WHERE id = ?`)
    .bind(jobId)
    .first<{ attempts: number; max_attempts: number }>();

  if (!job) return;

  const nextAttempt = job.attempts + 1;

  if (nextAttempt >= job.max_attempts) {
    // Move to dead letter queue
    await db
      .prepare(
        `UPDATE jobs SET status = ?, error = ?, attempts = ? WHERE id = ?`
      )
      .bind("DEAD_LETTER", error.substring(0, 500), nextAttempt, jobId)
      .run();

    return;
  }

  // Schedule next retry
  const backoffSeconds = calculateBackoffSeconds(nextAttempt);
  const nextRetryAt = new Date(
    Date.now() + backoffSeconds * 1000
  ).toISOString();

  await db
    .prepare(
      `UPDATE jobs SET status = ?, error = ?, next_retry_at = ?, attempts = ? WHERE id = ?`
    )
    .bind("RETRY", error.substring(0, 500), nextRetryAt, nextAttempt, jobId)
    .run();
}

/**
 * Mark job as failed permanently
 */
export async function markJobFailed(
  jobId: string,
  error: string
): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE jobs SET status = ?, error = ? WHERE id = ?`
    )
    .bind("DEAD_LETTER", error.substring(0, 500), jobId)
    .run();
}

/**
 * Create a scheduled job
 */
export async function createScheduledJob(
  tenantId: string,
  name: string,
  type: JobType,
  cronExpression: string,
  payload: Record<string, unknown>
): Promise<ScheduledJob> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: ScheduledJob = {
    id,
    tenantId,
    name,
    type,
    cronExpression,
    payload,
    enabled: true,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO scheduled_jobs
       (id, tenant_id, name, type, cron_expression, payload, enabled, failure_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
    )
    .bind(id, tenantId, name, type, cronExpression, JSON.stringify(payload), now, now)
    .run();

  return job;
}

/**
 * Get scheduled jobs for a tenant
 */
export async function getScheduledJobs(
  tenantId: string,
  enabledOnly: boolean = true
): Promise<ScheduledJob[]> {
  const db = coreDb();

  let query = `SELECT * FROM scheduled_jobs WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (enabledOnly) {
    query += ` AND enabled = 1`;
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    type: String(row.type) as JobType,
    cronExpression: String(row.cron_expression),
    payload: JSON.parse(String(row.payload || "{}")),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : undefined,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : undefined,
    failureCount: Number(row.failure_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Update scheduled job last run
 */
export async function updateScheduledJobRun(
  jobId: string,
  success: boolean
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  if (success) {
    await db
      .prepare(
        `UPDATE scheduled_jobs SET last_run_at = ?, failure_count = 0 WHERE id = ?`
      )
      .bind(now, jobId)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE scheduled_jobs SET failure_count = failure_count + 1 WHERE id = ?`
      )
      .bind(jobId)
      .run();
  }
}

/**
 * Get job analytics
 */
export async function getJobAnalytics(
  tenantId: string,
  days: number = 7
): Promise<{
  totalJobs: number;
  completed: number;
  failed: number;
  avgDuration: number;
  byType: Record<string, number>;
  failureRate: number;
}> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Total jobs and completion stats
  const { results: generalStats } = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as failed
      FROM jobs
      WHERE tenant_id = ? AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<{
      total: number;
      completed: number;
      failed: number;
    }>();

  const totalJobs = generalStats[0]?.total || 0;
  const completed = generalStats[0]?.completed || 0;
  const failed = generalStats[0]?.failed || 0;

  // By type
  const { results: typeStats } = await db
    .prepare(
      `SELECT type, COUNT(*) as count
       FROM jobs
       WHERE tenant_id = ? AND created_at > ?
       GROUP BY type`
    )
    .bind(tenantId, startDate)
    .all<{ type: string; count: number }>();

  const byType: Record<string, number> = {};
  for (const stat of typeStats) {
    byType[stat.type] = stat.count;
  }

  // Average duration (for completed jobs)
  const { results: durationStats } = await db
    .prepare(
      `SELECT AVG(CAST((julianday(completed_at) - julianday(started_at)) * 86400 as INTEGER)) as avg_duration
       FROM jobs
       WHERE tenant_id = ? AND status = 'COMPLETED' AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<{ avg_duration: number }>();

  const avgDuration = Math.round(durationStats[0]?.avg_duration || 0);

  return {
    totalJobs,
    completed,
    failed,
    avgDuration,
    byType,
    failureRate: totalJobs > 0 ? Math.round((failed / totalJobs) * 100) : 0,
  };
}
