/**
 * Real-time WebSocket Management API
 *
 * GET /api/realtime/stats — get connection statistics
 * GET /api/realtime/presence — list online users
 * POST /api/realtime/subscribe — subscribe to updates
 * POST /api/realtime/unsubscribe — unsubscribe from updates
 * POST /api/realtime/lock — lock resource
 * POST /api/realtime/unlock — unlock resource
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  updateUserPresence,
  lockResource,
  unlockResource,
  subscribeToResource,
  unsubscribeFromResource,
  getRealtimeStats,
  getOnlineUsersCount,
} from "@/lib/core/realtime";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/realtime/[section]

    if (section === "stats") {
      // GET /api/realtime/stats (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const stats = await getRealtimeStats();
      return Response.json({ stats });
    }

    if (section === "presence") {
      // GET /api/realtime/presence - get online users
      const onlineCount = await getOnlineUsersCount(tenant.tenantId);

      return Response.json({
        tenantId: tenant.tenantId,
        onlineUsers: onlineCount,
        currentUser: {
          userId: tenant.userId,
          email: tenant.email,
        },
      });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("realtime.get.failed", error);
    return Response.json(
      { error: "Unable to fetch realtime data" },
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

    if (section === "subscribe") {
      // POST /api/realtime/subscribe
      const resourceType = cleanText(String(body.resourceType || ""), 100);
      const resourceId = body.resourceId
        ? cleanText(String(body.resourceId), 100)
        : undefined;

      if (!resourceType) {
        return Response.json(
          { error: "resourceType is required" },
          { status: 400 }
        );
      }

      const subscription = await subscribeToResource(
        tenant.userId,
        tenant.tenantId,
        resourceType,
        resourceId
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "realtime_subscription",
        subscription.id,
        {
          resourceName: `Subscription: ${resourceType}`,
          status: "SUCCESS",
          resourceId: resourceId || "all",
        }
      );

      return Response.json({ subscription }, { status: 201 });
    }

    if (section === "unsubscribe") {
      // POST /api/realtime/unsubscribe
      const subscriptionId = cleanText(String(body.subscriptionId || ""), 100);

      if (!subscriptionId) {
        return Response.json(
          { error: "subscriptionId is required" },
          { status: 400 }
        );
      }

      await unsubscribeFromResource(subscriptionId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "DELETE",
        "realtime_subscription",
        subscriptionId,
        {
          resourceName: `Subscription: ${subscriptionId}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ success: true, message: "Unsubscribed" });
    }

    if (section === "lock") {
      // POST /api/realtime/lock
      const resourceType = cleanText(String(body.resourceType || ""), 100);
      const resourceId = cleanText(String(body.resourceId || ""), 100);
      const durationSeconds = Math.min(
        Math.max(parseInt(String(body.durationSeconds || 300)), 10),
        3600
      );

      if (!resourceType || !resourceId) {
        return Response.json(
          { error: "resourceType and resourceId are required" },
          { status: 400 }
        );
      }

      const lock = await lockResource(
        resourceType,
        resourceId,
        tenant.userId,
        durationSeconds
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "LOCK",
        "resource",
        resourceId,
        {
          resourceName: `${resourceType}: ${resourceId}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ lock }, { status: 201 });
    }

    if (section === "unlock") {
      // POST /api/realtime/unlock
      const resourceType = cleanText(String(body.resourceType || ""), 100);
      const resourceId = cleanText(String(body.resourceId || ""), 100);

      if (!resourceType || !resourceId) {
        return Response.json(
          { error: "resourceType and resourceId are required" },
          { status: 400 }
        );
      }

      const unlocked = await unlockResource(resourceType, resourceId, tenant.userId);

      if (!unlocked) {
        return Response.json(
          { error: "Unable to unlock resource" },
          { status: 500 }
        );
      }

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UNLOCK",
        "resource",
        resourceId,
        {
          resourceName: `${resourceType}: ${resourceId}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ success: true, message: "Resource unlocked" });
    }

    if (section === "presence") {
      // POST /api/realtime/presence - update presence
      const status = cleanText(String(body.status || "online"), 20) as
        | "online"
        | "away"
        | "offline"
        | "focused";
      const currentResource = body.currentResource
        ? cleanText(String(body.currentResource), 100)
        : undefined;

      const presence = await updateUserPresence(
        tenant.userId,
        tenant.tenantId,
        status,
        currentResource
      );

      return Response.json({ presence });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("realtime.post.failed", error);
    return Response.json(
      { error: "Unable to process realtime request" },
      { status: 500 }
    );
  }
}
