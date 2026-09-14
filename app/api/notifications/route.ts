/**
 * Notifications API
 *
 * GET /api/notifications — list user notifications
 * POST /api/notifications — create notification
 * PATCH /api/notifications — mark notification as read
 * DELETE /api/notifications?id=X — delete notification
 * GET /api/notifications/preferences — get user preferences
 * PATCH /api/notifications/preferences — update preferences
 * GET /api/notifications/analytics — get notification analytics
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationPreferences,
  updateNotificationPreference,
  getDeliveryStatus,
  getNotificationAnalytics,
  queueNotificationDelivery,
  NotificationChannel,
} from "@/lib/core/notifications";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/notifications/[section]

    if (section === "preferences") {
      // GET /api/notifications/preferences
      const preferences = await getNotificationPreferences(tenant.tenantId, tenant.userId);
      return Response.json({ preferences });
    }

    if (section === "analytics") {
      // GET /api/notifications/analytics (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
        90
      );

      const analytics = await getNotificationAnalytics(tenant.tenantId, days);
      return Response.json({ analytics });
    }

    // GET /api/notifications — list user notifications
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const notificationsId = url.searchParams.get("id");
    if (notificationsId) {
      // Get notification with deliveries
      const { notifications } = await getUserNotifications(
        tenant.tenantId,
        tenant.userId,
        1,
        0
      );

      const notification = notifications.find((n) => n.id === notificationsId);
      if (!notification) {
        return Response.json({ error: "Notification not found" }, { status: 404 });
      }

      const deliveries = await getDeliveryStatus(tenant.tenantId, notificationsId);

      return Response.json({ notification, deliveries });
    }

    const result = await getUserNotifications(
      tenant.tenantId,
      tenant.userId,
      limit,
      offset,
      unreadOnly
    );

    return Response.json({
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      hasMore: result.notifications.length + offset < result.total,
    });
  } catch (error) {
    console.error("notifications.get.failed", error);
    return Response.json(
      { error: "Unable to fetch notifications" },
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

    if (section === "preferences") {
      // This is handled as PATCH instead
      return Response.json({ error: "Use PATCH for preferences" }, { status: 400 });
    }

    // POST /api/notifications — create notification
    // Only admins can create notifications for others
    const userId = String(body.userId || tenant.userId);
    const userEmail = String(body.userEmail || tenant.email);

    if (userId !== tenant.userId && !["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json(
        { error: "Cannot create notifications for other users" },
        { status: 403 }
      );
    }

    const notificationBody = cleanText(String(body.body || ""), 2000);
    const channels = Array.isArray(body.channels)
      ? (body.channels as NotificationChannel[])
      : ["IN_APP", "EMAIL"];
    const priority = (body.priority as any) || "NORMAL";

    if (!notificationBody) {
      return Response.json(
        { error: "body is required" },
        { status: 400 }
      );
    }

    const notification = await createNotification(
      tenant.tenantId,
      userId,
      userEmail,
      notificationBody,
      {
        templateId: body.templateId ? String(body.templateId) : undefined,
        subject: body.subject ? cleanText(String(body.subject), 200) : undefined,
        channels,
        priority,
        variables: body.variables ? (body.variables as Record<string, string>) : undefined,
        metadata: body.metadata ? (body.metadata as Record<string, unknown>) : undefined,
        externalId: body.externalId ? String(body.externalId) : undefined,
      }
    );

    // Queue deliveries
    const deliveryIds = await queueNotificationDelivery(
      tenant.tenantId,
      notification.id,
      channels
    );

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "CREATE",
      "notification",
      notification.id,
      {
        resourceName: `Notification to ${userEmail}`,
        status: "SUCCESS",
        channels: channels.join(","),
      }
    );

    return Response.json(
      {
        notification,
        deliveryIds,
        message: "Notification created and queued for delivery",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("notifications.post.failed", error);
    return Response.json(
      { error: "Unable to create notification" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "preferences") {
      // PATCH /api/notifications/preferences
      const channel = String(body.channel || "EMAIL") as NotificationChannel;
      const enabled = Boolean(body.enabled !== false);
      const quietHours = body.quietHours as { start: string; end: string } | undefined;

      const preference = await updateNotificationPreference(
        tenant.tenantId,
        tenant.userId,
        channel,
        enabled,
        quietHours
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "notification_preference",
        channel,
        {
          resourceName: `${channel} notification preference`,
          status: "SUCCESS",
          enabled,
        }
      );

      return Response.json({ preference });
    }

    // PATCH /api/notifications — mark as read
    const notificationId = String(body.id || "");
    const markAll = Boolean(body.markAll);

    if (!notificationId && !markAll) {
      return Response.json(
        { error: "id or markAll is required" },
        { status: 400 }
      );
    }

    let count = 0;
    if (markAll) {
      count = await markAllAsRead(tenant.tenantId, tenant.userId);
    } else {
      await markAsRead(tenant.tenantId, notificationId);
      count = 1;
    }

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "UPDATE",
      "notification",
      markAll ? "all" : notificationId,
      {
        resourceName: `Mark notification${markAll ? "s" : ""} as read`,
        status: "SUCCESS",
        count,
      }
    );

    return Response.json({ success: true, count });
  } catch (error) {
    console.error("notifications.patch.failed", error);
    return Response.json(
      { error: "Unable to update notification" },
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
    const notificationId = cleanText(url.searchParams.get("id") || "", 100);

    if (!notificationId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    await deleteNotification(tenant.tenantId, notificationId);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "notification",
      notificationId,
      {
        resourceName: "Notification",
        status: "SUCCESS",
      }
    );

    return Response.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("notifications.delete.failed", error);
    return Response.json(
      { error: "Unable to delete notification" },
      { status: 500 }
    );
  }
}
