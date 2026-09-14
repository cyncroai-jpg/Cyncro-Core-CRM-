/**
 * Advanced Workflows API
 *
 * GET /api/workflows/advanced — list workflows
 * POST /api/workflows/advanced — create workflow
 * GET /api/workflows/advanced/:id — get workflow
 * PATCH /api/workflows/advanced/:id — update workflow
 * DELETE /api/workflows/advanced/:id — delete workflow
 * POST /api/workflows/advanced/:id/execute — execute workflow
 * GET /api/workflows/advanced/:id/executions — get execution history
 * GET /api/workflows/advanced/:id/metrics — get workflow metrics
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createAdvancedWorkflow,
  getAdvancedWorkflow,
  listAdvancedWorkflows,
  updateAdvancedWorkflow,
  deleteAdvancedWorkflow,
  executeWorkflow,
  getWorkflowExecutions,
  getWorkflowMetrics,
} from "@/lib/core/advanced-workflows";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const workflowId = pathParts[4];
    const section = pathParts[5];

    // GET /api/workflows/advanced/:id/executions
    if (section === "executions") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
      const executions = await getWorkflowExecutions(tenant.tenantId, workflowId, limit);
      return Response.json({ executions });
    }

    // GET /api/workflows/advanced/:id/metrics
    if (section === "metrics") {
      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
        90
      );
      const metrics = await getWorkflowMetrics(tenant.tenantId, workflowId, days);
      return Response.json({ metrics });
    }

    // GET /api/workflows/advanced/:id
    if (workflowId && workflowId !== "advanced") {
      const workflow = await getAdvancedWorkflow(tenant.tenantId, workflowId);
      if (!workflow) {
        return Response.json(
          { error: "Workflow not found" },
          { status: 404 }
        );
      }
      return Response.json({ workflow });
    }

    // GET /api/workflows/advanced - list workflows
    const enabledOnly = url.searchParams.get("enabled") === "true";
    const workflows = await listAdvancedWorkflows(tenant.tenantId, enabledOnly);

    return Response.json({ workflows, total: workflows.length });
  } catch (error) {
    console.error("workflows.advanced.get.failed", error);
    return Response.json(
      { error: "Unable to fetch workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage workflows
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const workflowId = pathParts[4];
    const section = pathParts[5];
    const body = (await request.json()) as Record<string, unknown>;

    // POST /api/workflows/advanced/:id/execute
    if (section === "execute") {
      if (!workflowId) {
        return Response.json(
          { error: "workflowId is required" },
          { status: 400 }
        );
      }

      const workflow = await getAdvancedWorkflow(tenant.tenantId, workflowId);
      if (!workflow) {
        return Response.json(
          { error: "Workflow not found" },
          { status: 404 }
        );
      }

      if (!workflow.enabled) {
        return Response.json(
          { error: "Workflow is disabled" },
          { status: 400 }
        );
      }

      const triggerId = cleanText(String(body.triggerId || ""), 100);
      const triggerData = body.triggerData as Record<string, unknown> | undefined;

      const execution = await executeWorkflow(
        tenant.tenantId,
        workflowId,
        triggerId,
        tenant.userId,
        triggerData
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "EXECUTE",
        "workflow",
        workflowId,
        {
          resourceName: `Workflow: ${workflow.name}`,
          status: "TRIGGERED",
          executionId: execution.id,
        }
      );

      return Response.json({ execution }, { status: 201 });
    }

    // POST /api/workflows/advanced - create workflow
    const name = cleanText(String(body.name || ""), 200);
    const description = body.description
      ? cleanText(String(body.description), 1000)
      : undefined;
    const trigger = body.trigger as any;
    const steps = body.steps as any;
    const enabled = body.enabled !== false;

    if (!name || !trigger || !steps) {
      return Response.json(
        { error: "name, trigger, and steps are required" },
        { status: 400 }
      );
    }

    const workflow = await createAdvancedWorkflow(tenant.tenantId, {
      name,
      description,
      trigger,
      steps,
      enabled,
      createdBy: tenant.userId,
    });

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "workflow",
      workflow.id,
      {
        resourceName: `Workflow: ${name}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error("workflows.advanced.post.failed", error);
    return Response.json(
      { error: "Unable to create workflow" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage workflows
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const workflowId = url.pathname.split("/")[4];
    const body = (await request.json()) as Record<string, unknown>;

    if (!workflowId) {
      return Response.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    const workflow = await getAdvancedWorkflow(tenant.tenantId, workflowId);
    if (!workflow) {
      return Response.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updates.name = cleanText(String(body.name), 200);
    }
    if (body.description !== undefined) {
      updates.description = body.description
        ? cleanText(String(body.description), 1000)
        : undefined;
    }
    if (body.trigger !== undefined) {
      updates.trigger = body.trigger;
    }
    if (body.steps !== undefined) {
      updates.steps = body.steps;
    }
    if (body.enabled !== undefined) {
      updates.enabled = body.enabled === true;
    }

    await updateAdvancedWorkflow(tenant.tenantId, workflowId, updates as any);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "UPDATE",
      "workflow",
      workflowId,
      {
        resourceName: `Workflow: ${workflow.name}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Workflow updated" });
  } catch (error) {
    console.error("workflows.advanced.patch.failed", error);
    return Response.json(
      { error: "Unable to update workflow" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage workflows
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const workflowId = url.pathname.split("/")[4];

    if (!workflowId) {
      return Response.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    const workflow = await getAdvancedWorkflow(tenant.tenantId, workflowId);
    if (!workflow) {
      return Response.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    await deleteAdvancedWorkflow(tenant.tenantId, workflowId);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "workflow",
      workflowId,
      {
        resourceName: `Workflow: ${workflow.name}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Workflow deleted" });
  } catch (error) {
    console.error("workflows.advanced.delete.failed", error);
    return Response.json(
      { error: "Unable to delete workflow" },
      { status: 500 }
    );
  }
}
