/**
 * Background Job Queue API
 *
 * GET /api/jobs — list jobs
 * POST /api/jobs — create job
 * GET /api/jobs/scheduled — list scheduled jobs
 * POST /api/jobs/scheduled — create scheduled job
 * GET /api/jobs/analytics — get job analytics
 * POST /api/jobs/retry-dead-letter — retry dead letter jobs
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createJob,
  getPendingJobs,
  createScheduledJob,
  getScheduledJobs,
  getJobAnalytics,
  JobType,
  JobPriority,
} from "@/lib/core/job-queue";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can view jobs
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/jobs/[section]

    if (section === "scheduled") {
      // GET /api/jobs/scheduled
      const enabledOnly = url.searchParams.get("enabled") !== "false";
      const jobs = await getScheduledJobs(tenant.tenantId, enabledOnly);

      return Response.json({ jobs });
    }

    if (section === "analytics") {
      // GET /api/jobs/analytics
      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
        90
      );

      const analytics = await getJobAnalytics(tenant.tenantId, days);

      return Response.json({ analytics });
    }

    // GET /api/jobs — list pending jobs
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);

    const jobs = await getPendingJobs(limit, tenant.tenantId);

    return Response.json({
      jobs,
      total: jobs.length,
      pending: jobs.filter((j) => j.status === "PENDING").length,
      retrying: jobs.filter((j) => j.status === "RETRY").length,
    });
  } catch (error) {
    console.error("jobs.get.failed", error);
    return Response.json({ error: "Unable to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can create jobs
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "scheduled") {
      // POST /api/jobs/scheduled — create scheduled job
      const name = cleanText(String(body.name || ""), 200);
      const type = cleanText(String(body.type || ""), 100) as JobType;
      const cronExpression = cleanText(String(body.cronExpression || ""), 100);
      const payload = body.payload as Record<string, unknown> | undefined;

      if (!name || !type || !cronExpression || !payload) {
        return Response.json(
          { error: "name, type, cronExpression, and payload are required" },
          { status: 400 }
        );
      }

      const job = await createScheduledJob(
        tenant.tenantId,
        name,
        type,
        cronExpression,
        payload
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "scheduled_job",
        job.id,
        {
          resourceName: `Scheduled job: ${name}`,
          status: "SUCCESS",
          type,
        }
      );

      return Response.json({ job }, { status: 201 });
    }

    if (section === "retry-dead-letter") {
      // POST /api/jobs/retry-dead-letter — retry dead letter jobs
      // This would be implemented to move jobs back to RETRY status
      return Response.json(
        { error: "Not implemented yet" },
        { status: 501 }
      );
    }

    // POST /api/jobs — create job
    const type = cleanText(String(body.type || ""), 100) as JobType;
    const payload = body.payload as Record<string, unknown> | undefined;
    const priority = (body.priority as JobPriority) || "NORMAL";
    const maxAttempts = Math.min(
      Math.max(parseInt(String(body.maxAttempts || 5)), 1),
      20
    );

    if (!type || !payload) {
      return Response.json(
        { error: "type and payload are required" },
        { status: 400 }
      );
    }

    const job = await createJob(tenant.tenantId, type, payload, {
      priority,
      maxAttempts,
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
    });

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "job",
      job.id,
      {
        resourceName: `Job: ${type}`,
        status: "SUCCESS",
        priority,
      }
    );

    return Response.json({ job }, { status: 201 });
  } catch (error) {
    console.error("jobs.post.failed", error);
    return Response.json({ error: "Unable to create job" }, { status: 500 });
  }
}
