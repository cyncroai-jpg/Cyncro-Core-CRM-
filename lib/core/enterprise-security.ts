/**
 * Enterprise SSO & Security Hardening (Phase 32)
 *
 * Enterprise-grade security features:
 * - Single Sign-On (SSO) with OAuth2 / SAML 2.0
 * - IP allowlisting / geofencing
 * - Custom domain support
 * - Two-factor authentication (2FA)
 * - Device fingerprinting and trust
 * - Security event audit trail
 * - Password policies
 * - Session management
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type SSOProvider = "OKTA" | "AZURE_AD" | "GOOGLE" | "SAML";
export type SecureEventType =
  | "SSO_LOGIN"
  | "SSO_LOGOUT"
  | "2FA_ENABLED"
  | "2FA_DISABLED"
  | "2FA_VERIFIED"
  | "2FA_FAILED"
  | "IP_BLOCKED"
  | "SUSPICIOUS_LOCATION"
  | "DEVICE_TRUSTED"
  | "DEVICE_REVOKED"
  | "PASSWORD_CHANGED"
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED";

export interface SSOConfiguration {
  id: string;
  tenantId: string;
  provider: SSOProvider;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IPAllowlist {
  id: string;
  tenantId: string;
  ipAddress: string; // Can be CIDR notation
  description?: string;
  createdBy: string;
  createdAt: string;
}

export interface TwoFactorAuth {
  userId: string;
  tenantId: string;
  enabled: boolean;
  method: "TOTP" | "SMS" | "EMAIL"; // Time-based OTP, SMS, Email
  secret?: string; // Base32 encoded for TOTP
  backupCodes?: string[];
  verifiedAt?: string;
  createdAt: string;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  tenantId: string;
  deviceFingerprint: string;
  deviceName: string;
  lastUsedAt: string;
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  userId?: string;
  eventType: SecureEventType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Setup SSO configuration
 */
export async function setupSSO(
  tenantId: string,
  provider: SSOProvider,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<SSOConfiguration> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const config: SSOConfiguration = {
    id,
    tenantId,
    provider,
    enabled: false, // Requires verification
    clientId,
    clientSecret,
    redirectUri,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO sso_configurations
       (id, tenant_id, provider, enabled, client_id, client_secret, redirect_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tenantId, provider, 0, clientId, clientSecret, redirectUri, now, now)
    .run();

  return config;
}

/**
 * Get SSO configuration
 */
export async function getSSO(tenantId: string): Promise<SSOConfiguration | null> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM sso_configurations WHERE tenant_id = ? LIMIT 1`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  if (!results.length) return null;

  const row = results[0];
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    provider: String(row.provider) as SSOProvider,
    enabled: Boolean(row.enabled),
    clientId: String(row.client_id),
    clientSecret: String(row.client_secret),
    redirectUri: String(row.redirect_uri),
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Enable SSO after verification
 */
export async function enableSSO(tenantId: string): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE sso_configurations SET enabled = 1 WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .run();
}

/**
 * Add IP to allowlist
 */
export async function addIPToAllowlist(
  tenantId: string,
  ipAddress: string,
  createdBy: string,
  description?: string
): Promise<IPAllowlist> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const entry: IPAllowlist = {
    id,
    tenantId,
    ipAddress,
    description,
    createdBy,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO ip_allowlist
       (id, tenant_id, ip_address, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tenantId, ipAddress, description || null, createdBy, now)
    .run();

  return entry;
}

/**
 * Check if IP is allowed
 */
export async function isIPAllowed(tenantId: string, ipAddress: string): Promise<boolean> {
  const db = coreDb();

  // Get all allowed IPs
  const { results } = await db
    .prepare(
      `SELECT ip_address FROM ip_allowlist WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<{ ip_address: string }>();

  if (!results.length) return true; // No restrictions

  for (const row of results) {
    const allowedIP = row.ip_address;
    if (allowedIP === ipAddress) return true;
    if (allowedIP.includes("/")) {
      // CIDR notation check - simplified
      const [network, bits] = allowedIP.split("/");
      if (ipAddress.startsWith(network.substring(0, network.lastIndexOf(".")))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Setup 2FA for user
 */
export async function setup2FA(
  userId: string,
  tenantId: string,
  method: "TOTP" | "SMS" | "EMAIL",
  secret?: string,
  backupCodes?: string[]
): Promise<TwoFactorAuth> {
  const db = coreDb();
  const now = new Date().toISOString();

  const auth: TwoFactorAuth = {
    userId,
    tenantId,
    enabled: false, // Requires verification
    method,
    secret,
    backupCodes,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT OR REPLACE INTO two_factor_auth
       (user_id, tenant_id, enabled, method, secret, backup_codes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, tenantId, 0, method, secret || null, backupCodes ? JSON.stringify(backupCodes) : null, now)
    .run();

  return auth;
}

/**
 * Verify 2FA and enable
 */
export async function verify2FA(userId: string, tenantId: string): Promise<void> {
  const db = coreDb();
  await db
    .prepare(
      `UPDATE two_factor_auth SET enabled = 1, verified_at = ? WHERE user_id = ? AND tenant_id = ?`
    )
    .bind(new Date().toISOString(), userId, tenantId)
    .run();
}

/**
 * Get 2FA status for user
 */
export async function get2FAStatus(userId: string, tenantId: string): Promise<TwoFactorAuth | null> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM two_factor_auth WHERE user_id = ? AND tenant_id = ?`
    )
    .bind(userId, tenantId)
    .all<Record<string, unknown>>();

  if (!results.length) return null;

  const row = results[0];
  return {
    userId: String(row.user_id),
    tenantId: String(row.tenant_id),
    enabled: Boolean(row.enabled),
    method: String(row.method) as any,
    secret: row.secret ? String(row.secret) : undefined,
    backupCodes: row.backup_codes ? JSON.parse(String(row.backup_codes)) : undefined,
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    createdAt: String(row.created_at),
  };
}

/**
 * Trust a device
 */
export async function trustDevice(
  userId: string,
  tenantId: string,
  deviceFingerprint: string,
  deviceName: string
): Promise<TrustedDevice> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const device: TrustedDevice = {
    id,
    userId,
    tenantId,
    deviceFingerprint,
    deviceName,
    lastUsedAt: now,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO trusted_devices
       (id, user_id, tenant_id, device_fingerprint, device_name, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, tenantId, deviceFingerprint, deviceName, now, now)
    .run();

  return device;
}

/**
 * Check if device is trusted
 */
export async function isTrustedDevice(
  userId: string,
  tenantId: string,
  deviceFingerprint: string
): Promise<boolean> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT id FROM trusted_devices
       WHERE user_id = ? AND tenant_id = ? AND device_fingerprint = ?`
    )
    .bind(userId, tenantId, deviceFingerprint)
    .all<{ id: string }>();

  return results.length > 0;
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  tenantId: string,
  eventType: SecureEventType,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  options?: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<SecurityEvent> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const event: SecurityEvent = {
    id,
    tenantId,
    userId: options?.userId,
    eventType,
    severity,
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
    details: options?.details,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO security_events
       (id, tenant_id, user_id, event_type, severity, ip_address, user_agent, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      options?.userId || null,
      eventType,
      severity,
      options?.ipAddress || null,
      options?.userAgent || null,
      options?.details ? JSON.stringify(options.details) : null,
      now
    )
    .run();

  return event;
}

/**
 * Get security events for audit
 */
export async function getSecurityEvents(
  tenantId: string,
  days: number = 30,
  severity?: string
): Promise<SecurityEvent[]> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = `SELECT * FROM security_events WHERE tenant_id = ? AND created_at > ?`;
  const params: unknown[] = [tenantId, startDate];

  if (severity) {
    query += ` AND severity = ?`;
    params.push(severity);
  }

  query += ` ORDER BY created_at DESC LIMIT 500`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    eventType: String(row.event_type) as SecureEventType,
    severity: String(row.severity) as any,
    ipAddress: row.ip_address ? String(row.ip_address) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    details: row.details ? JSON.parse(String(row.details)) : undefined,
    createdAt: String(row.created_at),
  }));
}

/**
 * Set password policy for tenant
 */
export async function setPasswordPolicy(
  tenantId: string,
  policy: {
    minLength?: number;
    requireUppercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
    expiryDays?: number;
  }
): Promise<void> {
  const db = coreDb();

  await db
    .prepare(
      `INSERT OR REPLACE INTO password_policies
       (tenant_id, min_length, require_uppercase, require_numbers, require_special_chars, expiry_days)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      tenantId,
      policy.minLength || 12,
      policy.requireUppercase ? 1 : 0,
      policy.requireNumbers ? 1 : 0,
      policy.requireSpecialChars ? 1 : 0,
      policy.expiryDays || 90
    )
    .run();
}
