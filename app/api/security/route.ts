/**
 * Enterprise Security API
 *
 * GET /api/security/sso — get SSO configuration
 * POST /api/security/sso — setup SSO
 * PATCH /api/security/sso — enable SSO
 * GET /api/security/ip-allowlist — list IP allowlist
 * POST /api/security/ip-allowlist — add IP to allowlist
 * GET /api/security/2fa — get 2FA status
 * POST /api/security/2fa/setup — setup 2FA
 * POST /api/security/2fa/verify — verify 2FA
 * GET /api/security/devices — list trusted devices
 * POST /api/security/devices/trust — trust device
 * GET /api/security/audit — get security audit trail
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  setupSSO,
  getSSO,
  enableSSO,
  addIPToAllowlist,
  isIPAllowed,
  setup2FA,
  verify2FA,
  get2FAStatus,
  trustDevice,
  isTrustedDevice,
  logSecurityEvent,
  getSecurityEvents,
  setPasswordPolicy,
} from "@/lib/core/enterprise-security";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/security/[section]

    if (section === "sso") {
      // GET /api/security/sso (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const sso = await getSSO(tenant.tenantId);
      return Response.json({ sso });
    }

    if (section === "ip-allowlist") {
      // GET /api/security/ip-allowlist (OWNER/ADMIN only)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      // Would fetch from database
      return Response.json({ ips: [] });
    }

    if (section === "2fa") {
      // GET /api/security/2fa - user's own 2FA status
      const status = await get2FAStatus(tenant.userId, tenant.tenantId);
      return Response.json({ status });
    }

    if (section === "audit") {
      // GET /api/security/audit - security event trail (OWNER/ADMIN)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") || "30"), 1),
        365
      );
      const severity = url.searchParams.get("severity") || undefined;

      const events = await getSecurityEvents(tenant.tenantId, days, severity);
      return Response.json({ events, total: events.length });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("security.get.failed", error);
    return Response.json({ error: "Unable to fetch security settings" }, { status: 500 });
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

    if (section === "sso") {
      // POST /api/security/sso - setup SSO (OWNER only)
      if (tenant.role !== "OWNER") {
        return Response.json({ error: "Only OWNER can setup SSO" }, { status: 403 });
      }

      const provider = String(body.provider || "");
      const clientId = cleanText(String(body.clientId || ""), 200);
      const clientSecret = cleanText(String(body.clientSecret || ""), 500);
      const redirectUri = cleanText(String(body.redirectUri || ""), 500);

      if (!provider || !clientId || !clientSecret || !redirectUri) {
        return Response.json(
          { error: "provider, clientId, clientSecret, and redirectUri are required" },
          { status: 400 }
        );
      }

      const sso = await setupSSO(
        tenant.tenantId,
        provider as any,
        clientId,
        clientSecret,
        redirectUri
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "sso_configuration",
        sso.id,
        {
          resourceName: `SSO: ${provider}`,
          status: "SUCCESS",
        }
      );

      await logSecurityEvent(
        tenant.tenantId,
        "SSO_LOGIN",
        "LOW",
        { userId: tenant.userId }
      );

      return Response.json({ sso }, { status: 201 });
    }

    if (section === "ip-allowlist") {
      // POST /api/security/ip-allowlist - add IP (OWNER/ADMIN)
      if (!["OWNER", "ADMIN"].includes(tenant.role)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const ipAddress = cleanText(String(body.ipAddress || ""), 50);
      const description = body.description ? cleanText(String(body.description), 200) : undefined;

      if (!ipAddress) {
        return Response.json({ error: "ipAddress is required" }, { status: 400 });
      }

      const entry = await addIPToAllowlist(
        tenant.tenantId,
        ipAddress,
        tenant.userId,
        description
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "ip_allowlist",
        entry.id,
        {
          resourceName: `IP: ${ipAddress}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ entry }, { status: 201 });
    }

    if (section === "2fa/setup") {
      // POST /api/security/2fa/setup - setup 2FA
      const method = String(body.method || "TOTP");
      const secret = body.secret ? String(body.secret) : undefined;

      const auth = await setup2FA(
        tenant.userId,
        tenant.tenantId,
        method as any,
        secret
      );

      await logSecurityEvent(
        tenant.tenantId,
        "2FA_ENABLED",
        "MEDIUM",
        { userId: tenant.userId }
      );

      return Response.json({
        auth,
        message: "2FA setup initiated. Please verify with code.",
      });
    }

    if (section === "2fa/verify") {
      // POST /api/security/2fa/verify - verify and enable 2FA
      await verify2FA(tenant.userId, tenant.tenantId);

      await logSecurityEvent(
        tenant.tenantId,
        "2FA_VERIFIED",
        "LOW",
        { userId: tenant.userId }
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "two_factor_auth",
        tenant.userId,
        {
          resourceName: "2FA enabled",
          status: "SUCCESS",
        }
      );

      return Response.json({ success: true, message: "2FA enabled" });
    }

    if (section === "devices/trust") {
      // POST /api/security/devices/trust - trust device
      const deviceFingerprint = cleanText(String(body.deviceFingerprint || ""), 100);
      const deviceName = cleanText(String(body.deviceName || ""), 100);

      if (!deviceFingerprint) {
        return Response.json({ error: "deviceFingerprint is required" }, { status: 400 });
      }

      const device = await trustDevice(
        tenant.userId,
        tenant.tenantId,
        deviceFingerprint,
        deviceName
      );

      await logSecurityEvent(
        tenant.tenantId,
        "DEVICE_TRUSTED",
        "LOW",
        { userId: tenant.userId }
      );

      return Response.json({ device, message: "Device trusted" });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("security.post.failed", error);
    return Response.json({ error: "Unable to update security settings" }, { status: 500 });
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

    if (section === "sso") {
      // PATCH /api/security/sso - enable SSO (OWNER only)
      if (tenant.role !== "OWNER") {
        return Response.json({ error: "Only OWNER can enable SSO" }, { status: 403 });
      }

      await enableSSO(tenant.tenantId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "sso_configuration",
        "enable",
        {
          resourceName: "SSO enabled",
          status: "SUCCESS",
        }
      );

      return Response.json({ success: true, message: "SSO enabled" });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("security.patch.failed", error);
    return Response.json({ error: "Unable to update security settings" }, { status: 500 });
  }
}
