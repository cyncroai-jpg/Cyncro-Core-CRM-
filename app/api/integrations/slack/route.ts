/**
 * Slack OAuth Integration
 *
 * GET /api/integrations/slack — OAuth callback from Slack
 * POST /api/integrations/slack — install Slack app
 */

import { ensureCoreSchema, getTenantContext } from "@/lib/core/db";
import { connectSlackWorkspace, getSlackConnection } from "@/lib/core/slack";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.json(
        { error: `Slack authorization failed: ${error}` },
        { status: 400 }
      );
    }

    if (!code || !state) {
      return Response.json(
        { error: "Missing authorization code or state" },
        { status: 400 }
      );
    }

    // In production: exchange code for token via Slack API
    // For now, mock the token exchange

    // Decode state to get tenantId
    let tenantId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      tenantId = decoded.tenantId;
    } catch {
      return Response.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    // Mock Slack OAuth token (in production, exchange code with Slack API)
    const botToken = `xoxb-${crypto.randomUUID()}`;
    const workspaceId = `T${crypto.randomUUID().substring(0, 8)}`;

    const connection = await connectSlackWorkspace(
      tenantId,
      workspaceId,
      botToken,
      "Slack Workspace"
    );

    // Redirect to success page or back to app
    return Response.json({
      success: true,
      connection,
      message: "Slack workspace connected successfully",
    });
  } catch (error) {
    console.error("slack.oauth.failed", error);
    return Response.json(
      { error: "OAuth flow failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getSlackConnection(tenant.tenantId);

    if (connection) {
      return Response.json({
        connected: true,
        connection,
      });
    }

    // Generate OAuth state
    const state = Buffer.from(
      JSON.stringify({ tenantId: tenant.tenantId })
    ).toString("base64");

    // In production, use real Slack OAuth URLs
    const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=YOUR_CLIENT_ID&scope=chat:write,commands,team:read&state=${state}&redirect_uri=https://yourdomain.com/api/integrations/slack`;

    return Response.json({
      connected: false,
      oauthUrl: slackOAuthUrl,
      message: "Generate OAuth URL or connect existing workspace",
    });
  } catch (error) {
    console.error("slack.check.failed", error);
    return Response.json(
      { error: "Unable to check Slack connection" },
      { status: 500 }
    );
  }
}
