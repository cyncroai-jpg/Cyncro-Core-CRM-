/**
 * Integrations API
 *
 * GET /api/integrations — list connected apps
 * POST /api/integrations — connect new app
 * DELETE /api/integrations?id=X — disconnect app
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import { connectIntegration, getTenantIntegrations } from "@/lib/core/integrations";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const integrations = await getTenantIntegrations(tenant.tenantId);
    return Response.json({ integrations });
  } catch (error) {
    console.error("integrations.get.failed", error);
    return Response.json(
      { error: "Unable to load integrations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const appName = cleanText(String(body.appName || ""), 50);
    const authType = String(body.authType || "api_key");
    const accessToken = body.accessToken ? cleanText(String(body.accessToken), 500) : undefined;
    const apiKey = body.apiKey ? cleanText(String(body.apiKey), 500) : undefined;

    if (!appName || !authType) {
      return Response.json(
        { error: "appName and authType are required" },
        { status: 400 }
      );
    }

    const integration = await connectIntegration(
      tenant.tenantId,
      appName,
      authType as "oauth" | "api_key" | "webhook",
      accessToken,
      apiKey,
      tenant.email
    );

    return Response.json(integration, { status: 201 });
  } catch (error) {
    console.error("integrations.create.failed", error);
    return Response.json(
      { error: "Unable to connect app" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const integrationId = cleanText(url.searchParams.get("id"), 80);

    if (!integrationId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = coreDb();
    await db
      .prepare(
        "DELETE FROM integrations WHERE id = ? AND tenant_id = ?"
      )
      .bind(integrationId, tenant.tenantId)
      .run();

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("integrations.delete.failed", error);
    return Response.json(
      { error: "Unable to disconnect app" },
      { status: 500 }
    );
  }
}
