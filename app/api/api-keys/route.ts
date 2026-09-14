/**
 * API Keys Management API
 *
 * GET /api/api-keys — list API keys
 * POST /api/api-keys — create API key
 * GET /api/api-keys/:id — get API key details
 * POST /api/api-keys/:id/rotate — rotate API key
 * DELETE /api/api-keys/:id — revoke API key
 * GET /api/api-keys/:id/usage — get API key usage analytics
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  generateAPIKey,
  listAPIKeys,
  revokeAPIKey,
  rotateAPIKey,
  logAPIKeyUsage,
  type APIKeyScope,
} from "@/lib/core/api-keys";
import { logAuditAction } from "@/lib/core/audit";
import { coreDb } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const keyId = pathParts[3]; // /api/api-keys/[id]
    const section = pathParts[4]; // /api/api-keys/[id]/[section]

    // GET /api/api-keys/:id/usage
    if (section === "usage") {
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "30"), 1),
        90
      );

      const db = coreDb();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { results } = await db
        .prepare(
          `SELECT method, endpoint, COUNT(*) as count, AVG(response_time_ms) as avg_response_time
           FROM api_key_usage
           WHERE api_key_id = ? AND created_at > ?
           GROUP BY method, endpoint
           ORDER BY count DESC`
        )
        .bind(keyId, startDate)
        .all<Record<string, unknown>>();

      const usageStats = {
        totalRequests: 0,
        endpoints: results.map((r) => ({
          method: String(r.method),
          endpoint: String(r.endpoint),
          count: Number(r.count),
          avgResponseTime: Math.round(Number(r.avg_response_time || 0)),
        })),
      };

      usageStats.totalRequests = usageStats.endpoints.reduce(
        (sum, e) => sum + e.count,
        0
      );

      return Response.json({ usage: usageStats });
    }

    // GET /api/api-keys/:id
    if (keyId && keyId !== "api-keys") {
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const db = coreDb();
      const row = await db
        .prepare(
          `SELECT * FROM api_keys WHERE tenant_id = ? AND id = ?`
        )
        .bind(tenant.tenantId, keyId)
        .first<Record<string, unknown>>();

      if (!row) {
        return Response.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      const key = {
        id: String(row.id),
        tenantId: String(row.tenant_id),
        name: String(row.name),
        prefix: `${String(row.name).substring(0, 3)}...`,
        scopes: JSON.parse(String(row.scopes || "[]")),
        rateLimit: Number(row.rate_limit),
        active: Boolean(row.active),
        lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined,
        expiresAt: row.expires_at ? String(row.expires_at) : undefined,
        createdBy: String(row.created_by || ""),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };

      return Response.json({ key });
    }

    // GET /api/api-keys - list all keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const keys = await listAPIKeys(tenant.tenantId);
    return Response.json({ keys, total: keys.length });
  } catch (error) {
    console.error("api-keys.get.failed", error);
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

    // Only OWNER and ADMIN can manage API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const keyId = pathParts[3];
    const section = pathParts[4];
    const body = (await request.json()) as Record<string, unknown>;

    // POST /api/api-keys/:id/rotate
    if (section === "rotate") {
      if (!keyId) {
        return Response.json(
          { error: "keyId is required" },
          { status: 400 }
        );
      }

      const rotated = await rotateAPIKey(tenant.tenantId, keyId, tenant.userId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "ROTATE",
        "api_key",
        keyId,
        {
          resourceName: `API Key: ${rotated.oldKey.name}`,
          status: "SUCCESS",
        }
      );

      return Response.json(
        {
          oldKey: rotated.oldKey,
          newKey: rotated.newKey.apiKey,
          secret: rotated.newKey.key, // Only show secret once
        },
        { status: 201 }
      );
    }

    // POST /api/api-keys - create new API key
    const name = cleanText(String(body.name || ""), 200);
    const scopes = (Array.isArray(body.scopes) ? body.scopes : []).map((s) =>
      cleanText(String(s), 50)
    ) as APIKeyScope[];
    const rateLimit = Math.min(
      Math.max(parseInt(String(body.rateLimit || 100)), 1),
      10000
    );
    const expiresIn = body.expiresIn
      ? Math.min(Math.max(parseInt(String(body.expiresIn)), 1), 365)
      : undefined;

    if (!name || scopes.length === 0) {
      return Response.json(
        { error: "name and scopes are required" },
        { status: 400 }
      );
    }

    const { key, apiKey } = await generateAPIKey(
      tenant.tenantId,
      name,
      scopes,
      rateLimit,
      expiresIn,
      tenant.userId
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "api_key",
      apiKey.id,
      {
        resourceName: `API Key: ${name}`,
        status: "SUCCESS",
        scopes: scopes.join(", "),
      }
    );

    return Response.json(
      {
        key, // Secret only shown at creation
        apiKey,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("api-keys.post.failed", error);
    return Response.json(
      { error: "Unable to create API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can manage API keys
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const keyId = url.pathname.split("/")[3];

    if (!keyId) {
      return Response.json(
        { error: "keyId is required" },
        { status: 400 }
      );
    }

    const db = coreDb();
    const row = await db
      .prepare(
        `SELECT * FROM api_keys WHERE tenant_id = ? AND id = ?`
      )
      .bind(tenant.tenantId, keyId)
      .first<Record<string, unknown>>();

    if (!row) {
      return Response.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    const keyName = String(row.name);
    const revoked = await revokeAPIKey(tenant.tenantId, keyId);

    if (!revoked) {
      return Response.json(
        { error: "Unable to revoke API key" },
        { status: 500 }
      );
    }

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "api_key",
      keyId,
      {
        resourceName: `API Key: ${keyName}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "API key revoked" });
  } catch (error) {
    console.error("api-keys.delete.failed", error);
    return Response.json(
      { error: "Unable to revoke API key" },
      { status: 500 }
    );
  }
}
