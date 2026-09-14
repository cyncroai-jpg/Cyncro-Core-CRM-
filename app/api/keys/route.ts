/**
 * API Keys Management API
 *
 * GET /api/keys — list API keys for tenant
 * POST /api/keys — create new API key
 * PATCH /api/keys — update API key (revoke, rotate)
 * DELETE /api/keys?id=X — revoke API key
 * GET /api/keys/usage — get usage statistics
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  generateAPIKey,
  listAPIKeys,
  revokeAPIKey,
  rotateAPIKey,
  APIKeyScope,
} from "@/lib/core/api-keys";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/keys/[section]

    if (section === "usage") {
      // GET /api/keys/usage - get usage statistics
      const keyId = cleanText(url.searchParams.get("keyId") || "", 80);
      const period = cleanText(url.searchParams.get("period") || "day", 20); // day, week, month

      const db = coreDb();
      let periodStart: string;

      const now = new Date();
      if (period === "week") {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (period === "month") {
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      }

      let query = `SELECT * FROM api_key_usage WHERE created_at >= ? ORDER BY created_at DESC`;
      const params: unknown[] = [periodStart];

      if (keyId) {
        query = `SELECT * FROM api_key_usage WHERE api_key_id = ? AND created_at >= ? ORDER BY created_at DESC`;
        params.unshift(keyId);
      }

      const { results } = await db.prepare(query).bind(...params).all<Record<string, unknown>>();

      // Calculate stats
      const stats = {
        totalRequests: results.length,
        byMethod: {} as Record<string, number>,
        byStatus: {} as Record<number, number>,
        avgResponseTime: 0,
      };

      let totalResponseTime = 0;
      results.forEach((row) => {
        const method = String(row.method);
        const statusCode = Number(row.status_code);
        const responseTime = Number(row.response_time_ms);

        stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
        stats.byStatus[statusCode] = (stats.byStatus[statusCode] || 0) + 1;
        totalResponseTime += responseTime;
      });

      if (results.length > 0) {
        stats.avgResponseTime = Math.round(totalResponseTime / results.length);
      }

      return Response.json({ usage: stats, period, results: results.slice(0, 100) });
    }

    // GET /api/keys - list all API keys
    const keys = await listAPIKeys(tenant.tenantId);
    return Response.json({ keys });
  } catch (error) {
    console.error("keys.get.failed", error);
    return Response.json(
      { error: "Unable to fetch API keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can create API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const name = cleanText(String(body.name || ""), 100);
    const scopes = Array.isArray(body.scopes)
      ? (body.scopes as APIKeyScope[])
      : ["*"];
    const rateLimit = Math.min(
      Math.max(parseInt(String(body.rateLimit || 100)), 10),
      10000
    );
    const expiresIn = body.expiresIn
      ? parseInt(String(body.expiresIn))
      : undefined;

    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const { key, apiKey } = await generateAPIKey(
      tenant.tenantId,
      name,
      scopes,
      rateLimit,
      expiresIn,
      tenant.email
    );

    return Response.json(
      {
        key, // Only shown once at creation
        apiKey,
        message:
          "Save your API key now - you won't be able to see it again",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("keys.post.failed", error);
    return Response.json(
      { error: "Unable to create API key" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const keyId = cleanText(String(body.id || ""), 80);
    const action = cleanText(String(body.action || ""), 50);

    if (!keyId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    if (action === "rotate") {
      // PATCH /api/keys - rotate API key
      const { oldKey, newKey } = await rotateAPIKey(
        tenant.tenantId,
        keyId,
        tenant.email
      );

      return Response.json({
        oldKey,
        newKey: {
          key: newKey.key,
          apiKey: newKey.apiKey,
        },
        message: "API key rotated successfully. Old key has been revoked.",
      });
    }

    return Response.json(
      { error: "Unknown action. Use action=rotate" },
      { status: 400 }
    );
  } catch (error) {
    console.error("keys.patch.failed", error);
    return Response.json(
      { error: "Unable to update API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can revoke API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const keyId = cleanText(url.searchParams.get("id") || "", 80);

    if (!keyId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const success = await revokeAPIKey(tenant.tenantId, keyId);

    if (!success) {
      return Response.json({ error: "API key not found" }, { status: 404 });
    }

    return Response.json({ success: true, message: "API key revoked" });
  } catch (error) {
    console.error("keys.delete.failed", error);
    return Response.json(
      { error: "Unable to revoke API key" },
      { status: 500 }
    );
  }
}
