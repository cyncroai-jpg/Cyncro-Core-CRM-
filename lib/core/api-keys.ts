/**
 * API Keys & Rate Limiting System
 *
 * Secure API key management:
 * - Generate and revoke API keys
 * - Scope permissions per key
 * - Rate limiting by key or IP
 * - Usage tracking and analytics
 * - Auto-rotation support
 */

import crypto from "crypto";
import { coreDb } from "@/lib/core/db";

export type APIKeyScope =
  | "contacts:read"
  | "contacts:write"
  | "deals:read"
  | "deals:write"
  | "bookings:read"
  | "bookings:write"
  | "sequences:read"
  | "sequences:write"
  | "workflows:read"
  | "workflows:write"
  | "analytics:read"
  | "integrations:read"
  | "integrations:write"
  | "*"; // Full access

export interface APIKey {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  prefix: string; // First 8 chars of key for display
  scopes: APIKeyScope[];
  rateLimit: number; // requests per minute
  active: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  concurrent?: number;
}

export interface RateLimitStatus {
  remaining: number;
  reset: number; // Unix timestamp
  limit: number;
  retryAfter?: number; // Seconds to wait before retry
}

/** Generate a new API key */
export async function generateAPIKey(
  tenantId: string,
  name: string,
  scopes: APIKeyScope[],
  rateLimit: number = 100, // Default: 100 req/min
  expiresIn?: number, // Days until expiration (optional)
  createdBy?: string
): Promise<{
  key: string;
  apiKey: APIKey;
}> {
  const db = coreDb();
  const keyId = crypto.randomUUID();
  const rawKey = `cyncro_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex");
  const prefix = rawKey.substring(0, 8);
  const now = new Date().toISOString();
  let expiresAt: string | null = null;

  if (expiresIn) {
    const expires = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
    expiresAt = expires.toISOString();
  }

  const apiKey: APIKey = {
    id: keyId,
    tenantId,
    name,
    keyHash,
    prefix,
    scopes,
    rateLimit,
    active: true,
    createdBy: createdBy || "system",
    createdAt: now,
    updatedAt: now,
  };

  if (expiresAt) {
    apiKey.expiresAt = expiresAt;
  }

  await db
    .prepare(
      `INSERT INTO api_keys
       (id, tenant_id, key_hash, name, scopes, rate_limit, active, expires_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    )
    .bind(
      keyId,
      tenantId,
      keyHash,
      name,
      JSON.stringify(scopes),
      rateLimit,
      expiresAt,
      createdBy || "system",
      now,
      now
    )
    .run();

  return {
    key: rawKey, // Only show full key once at creation
    apiKey,
  };
}

/** Validate and verify an API key */
export async function validateAPIKey(
  key: string
): Promise<{
  valid: boolean;
  apiKey?: APIKey;
  error?: string;
}> {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const db = coreDb();
  const result = await db
    .prepare(
      `SELECT * FROM api_keys WHERE key_hash = ? AND active = 1`
    )
    .bind(keyHash)
    .first<Record<string, unknown>>();

  if (!result) {
    return { valid: false, error: "Invalid API key" };
  }

  // Check expiration
  if (result.expires_at) {
    const expiresAt = new Date(String(result.expires_at));
    if (expiresAt < new Date()) {
      return { valid: false, error: "API key expired" };
    }
  }

  const apiKey: APIKey = {
    id: String(result.id),
    tenantId: String(result.tenant_id),
    name: String(result.name),
    keyHash: String(result.key_hash),
    prefix: key.substring(0, 8),
    scopes: JSON.parse(String(result.scopes || "[]")),
    rateLimit: Number(result.rate_limit),
    active: Boolean(result.active),
    lastUsedAt: result.last_used_at ? String(result.last_used_at) : undefined,
    expiresAt: result.expires_at ? String(result.expires_at) : undefined,
    createdBy: String(result.created_by || ""),
    createdAt: String(result.created_at),
    updatedAt: String(result.updated_at),
  };

  return { valid: true, apiKey };
}

/** Update last_used_at timestamp */
export async function recordAPIKeyUsage(keyHash: string): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(`UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?`)
    .bind(now, keyHash)
    .run();
}

/** Check rate limit for API key */
export async function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = {
    requestsPerMinute: 100,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
  }
): Promise<RateLimitStatus> {
  const db = coreDb();
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Query request counts
  const { results: minResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM api_key_usage
       WHERE api_key_id = ? AND created_at >= ?`
    )
    .bind(keyId, oneMinuteAgo)
    .all<{ count: number }>();

  const { results: hourResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM api_key_usage
       WHERE api_key_id = ? AND created_at >= ?`
    )
    .bind(keyId, oneHourAgo)
    .all<{ count: number }>();

  const { results: dayResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM api_key_usage
       WHERE api_key_id = ? AND created_at >= ?`
    )
    .bind(keyId, oneDayAgo)
    .all<{ count: number }>();

  const minCount = minResult[0]?.count || 0;
  const hourCount = hourResult[0]?.count || 0;
  const dayCount = dayResult[0]?.count || 0;

  // Check against limits
  if (minCount >= config.requestsPerMinute) {
    return {
      remaining: 0,
      reset: Math.floor(now.getTime() / 1000) + 60,
      limit: config.requestsPerMinute,
      retryAfter: 60,
    };
  }

  if (hourCount >= config.requestsPerHour) {
    return {
      remaining: 0,
      reset: Math.floor(now.getTime() / 1000) + 60 * 60,
      limit: config.requestsPerHour,
      retryAfter: 60 * 60,
    };
  }

  if (dayCount >= config.requestsPerDay) {
    return {
      remaining: 0,
      reset: Math.floor(now.getTime() / 1000) + 24 * 60 * 60,
      limit: config.requestsPerDay,
      retryAfter: 24 * 60 * 60,
    };
  }

  return {
    remaining: Math.max(
      config.requestsPerMinute - minCount,
      config.requestsPerHour - hourCount,
      config.requestsPerDay - dayCount
    ),
    reset: Math.floor(now.getTime() / 1000) + 60,
    limit: config.requestsPerMinute,
  };
}

/** Log API key usage */
export async function logAPIKeyUsage(
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress?: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();
  const usageId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO api_key_usage
       (id, api_key_id, endpoint, method, status_code, response_time_ms, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(usageId, keyId, endpoint, method, statusCode, responseTimeMs, ipAddress || null, now)
    .run();
}

/** List API keys for tenant */
export async function listAPIKeys(
  tenantId: string,
  excludeHash: boolean = true
): Promise<APIKey[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(`SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC`)
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    keyHash: excludeHash ? "***" : String(row.key_hash),
    prefix: `${String(row.name).substring(0, 3)}...`,
    scopes: JSON.parse(String(row.scopes || "[]")),
    rateLimit: Number(row.rate_limit),
    active: Boolean(row.active),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    createdBy: String(row.created_by || ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/** Revoke API key */
export async function revokeAPIKey(
  tenantId: string,
  keyId: string
): Promise<boolean> {
  const db = coreDb();

  const result = await db
    .prepare(
      `UPDATE api_keys SET active = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`
    )
    .bind(new Date().toISOString(), keyId, tenantId)
    .run();

  return (result.meta?.changes || 0) > 0;
}

/** Rotate API key (revoke old, create new) */
export async function rotateAPIKey(
  tenantId: string,
  keyId: string,
  createdBy: string
): Promise<{
  oldKey: APIKey;
  newKey: {
    key: string;
    apiKey: APIKey;
  };
}> {
  const db = coreDb();

  // Get old key details
  const oldKeyRecord = await db
    .prepare(`SELECT * FROM api_keys WHERE id = ? AND tenant_id = ?`)
    .bind(keyId, tenantId)
    .first<Record<string, unknown>>();

  if (!oldKeyRecord) {
    throw new Error("API key not found");
  }

  const oldKey: APIKey = {
    id: String(oldKeyRecord.id),
    tenantId: String(oldKeyRecord.tenant_id),
    name: String(oldKeyRecord.name),
    keyHash: String(oldKeyRecord.key_hash),
    prefix: keyId.substring(0, 8),
    scopes: JSON.parse(String(oldKeyRecord.scopes || "[]")),
    rateLimit: Number(oldKeyRecord.rate_limit),
    active: Boolean(oldKeyRecord.active),
    createdBy: String(oldKeyRecord.created_by || ""),
    createdAt: String(oldKeyRecord.created_at),
    updatedAt: String(oldKeyRecord.updated_at),
  };

  // Revoke old key
  await revokeAPIKey(tenantId, keyId);

  // Generate new key with same name and scopes
  const newKey = await generateAPIKey(
    tenantId,
    oldKey.name,
    oldKey.scopes,
    oldKey.rateLimit,
    undefined,
    createdBy
  );

  return { oldKey, newKey };
}
