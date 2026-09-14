/**
 * Rate Limiting API
 *
 * GET /api/rate-limit/config — get rate limit configuration
 * POST /api/rate-limit/config — set rate limit configuration
 * GET /api/rate-limit/metrics — get rate limit metrics
 * POST /api/rate-limit/reset — reset user rate limits
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  getRateLimitConfig,
  setRateLimitConfig,
  getRateLimitMetrics,
  resetUserRateLimit,
  getGlobalLimits,
} from "@/lib/core/rate-limit";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/rate-limit/[section]

    if (section === "config") {
      // GET /api/rate-limit/config (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const endpoint = url.searchParams.get("endpoint");
      if (!endpoint) {
        return Response.json(
          { error: "endpoint parameter required" },
          { status: 400 }
        );
      }

      const config = await getRateLimitConfig(tenant.tenantId, endpoint);
      return Response.json({ config });
    }

    if (section === "metrics") {
      // GET /api/rate-limit/metrics (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
        90
      );

      const metrics = await getRateLimitMetrics(tenant.tenantId, days);
      return Response.json({ metrics });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("rate-limit.get.failed", error);
    return Response.json(
      { error: "Unable to fetch rate limit settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "config") {
      // POST /api/rate-limit/config - set rate limit (OWNER only)
      if (tenant.role !== "OWNER") {
        return Response.json(
          { error: "Only OWNER can modify rate limits" },
          { status: 403 }
        );
      }

      const endpoint = cleanText(String(body.endpoint || ""), 200);
      const requestsPerSecond = body.requestsPerSecond
        ? Math.min(Math.max(parseInt(String(body.requestsPerSecond)), 1), 1000)
        : undefined;
      const requestsPerMinute = body.requestsPerMinute
        ? Math.min(Math.max(parseInt(String(body.requestsPerMinute)), 1), 100000)
        : undefined;
      const requestsPerHour = body.requestsPerHour
        ? Math.min(Math.max(parseInt(String(body.requestsPerHour)), 1), 1000000)
        : undefined;
      const burstAllowance = body.burstAllowance
        ? Math.min(Math.max(parseInt(String(body.burstAllowance)), 1), 5000)
        : undefined;

      if (!endpoint) {
        return Response.json(
          { error: "endpoint is required" },
          { status: 400 }
        );
      }

      await setRateLimitConfig({
        tenantId: tenant.tenantId,
        endpoint,
        requestsPerSecond,
        requestsPerMinute,
        requestsPerHour,
        burstAllowance,
      });

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "rate_limit_config",
        endpoint,
        {
          resourceName: `Rate limit: ${endpoint}`,
          status: "SUCCESS",
          limits: {
            rps: requestsPerSecond,
            rpm: requestsPerMinute,
            rph: requestsPerHour,
          },
        }
      );

      return Response.json({ success: true, message: "Rate limit configured" });
    }

    if (section === "reset") {
      // POST /api/rate-limit/reset - reset user rate limit (OWNER/ADMIN)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const userId = cleanText(String(body.userId || ""), 100);
      const endpoint = body.endpoint
        ? cleanText(String(body.endpoint), 200)
        : undefined;

      if (!userId) {
        return Response.json(
          { error: "userId is required" },
          { status: 400 }
        );
      }

      await resetUserRateLimit(tenant.tenantId, userId, endpoint);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "rate_limit_reset",
        userId,
        {
          resourceName: `Rate limit reset for user: ${userId}`,
          status: "SUCCESS",
          endpoint: endpoint || "all",
        }
      );

      return Response.json({
        success: true,
        message: "Rate limit reset",
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("rate-limit.post.failed", error);
    return Response.json(
      { error: "Unable to update rate limit settings" },
      { status: 500 }
    );
  }
}
