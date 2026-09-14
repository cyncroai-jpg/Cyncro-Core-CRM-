/**
 * Rate Limiting & Throttling Engine (Phase 34)
 *
 * Implements multi-level rate limiting:
 * - Global rate limits per endpoint
 * - Per-tenant rate limits
 * - Per-user rate limits
 * - Sliding window token bucket algorithm
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export interface RateLimitConfig {
  tenantId: string;
  endpoint: string;
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  burstAllowance?: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  retryAfterSeconds?: number;
  limitExceededAt?: string;
}

export interface UserRateLimit {
  userId: string;
  tenantId: string;
  endpoint: string;
  windowStart: string;
  requestCount: number;
  lastRequestAt: string;
}

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  blockRate: number;
  topBlockedUsers: {
    userId: string;
    blockedCount: number;
  }[];
  topBlockedEndpoints: {
    endpoint: string;
    blockedCount: number;
  }[];
}

const DEFAULT_LIMITS = {
  requestsPerSecond: 100,
  requestsPerMinute: 1000,
  requestsPerHour: 10000,
  burstAllowance: 150,
};

/**
 * Check if a request is allowed under rate limits
 */
export async function checkRateLimit(
  tenantId: string,
  userId: string,
  endpoint: string,
  customConfig?: RateLimitConfig
): Promise<RateLimitStatus> {
  const db = coreDb();
  const now = new Date();
  const nowISO = now.toISOString();

  // Get rate limit config (from DB or use defaults)
  let config = customConfig || (await getRateLimitConfig(tenantId, endpoint));
  if (!config) {
    config = {
      tenantId,
      endpoint,
      ...DEFAULT_LIMITS,
    };
  }

  // Check multiple time windows
  const windows = [
    { duration: 1, key: "per_second", limit: config.requestsPerSecond },
    { duration: 60, key: "per_minute", limit: config.requestsPerMinute },
    { duration: 3600, key: "per_hour", limit: config.requestsPerHour },
  ];

  for (const window of windows) {
    if (!window.limit) continue;

    const windowStart = new Date(now.getTime() - window.duration * 1000);
    const windowStartISO = windowStart.toISOString();

    // Count requests in this window
    const { results } = await db
      .prepare(
        `SELECT COUNT(*) as count FROM rate_limit_checks
         WHERE tenant_id = ? AND user_id = ? AND endpoint = ? AND created_at > ?`
      )
      .bind(tenantId, userId, endpoint, windowStartISO)
      .all<{ count: number }>();

    const requestCount = Number(results[0]?.count || 0);

    // Check burst allowance for sub-second operations
    if (
      window.duration === 1 &&
      config.burstAllowance &&
      requestCount >= config.burstAllowance
    ) {
      // Rate limit exceeded
      const nextAllowedAt = new Date(now.getTime() + 1000);
      await logRateLimitBlock(tenantId, userId, endpoint, window.key);

      return {
        allowed: false,
        remaining: 0,
        resetAt: nextAllowedAt.toISOString(),
        retryAfterSeconds: 1,
        limitExceededAt: nowISO,
      };
    }

    if (requestCount >= window.limit) {
      // Rate limit exceeded
      const resetAt = new Date(windowStart.getTime() + window.duration * 1000);
      const retryAfter = Math.ceil(
        (resetAt.getTime() - now.getTime()) / 1000
      );

      await logRateLimitBlock(tenantId, userId, endpoint, window.key);

      return {
        allowed: false,
        remaining: 0,
        resetAt: resetAt.toISOString(),
        retryAfterSeconds: retryAfter,
        limitExceededAt: nowISO,
      };
    }
  }

  // Request is allowed - log it
  await db
    .prepare(
      `INSERT INTO rate_limit_checks
       (id, tenant_id, user_id, endpoint, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), tenantId, userId, endpoint, nowISO)
    .run();

  // Get remaining requests in the most restrictive window
  const mostRestrictive = windows
    .filter((w) => w.limit)
    .sort((a, b) => a.limit! - b.limit!)[0];

  let remaining = DEFAULT_LIMITS.requestsPerSecond;
  if (mostRestrictive) {
    const windowStart = new Date(
      now.getTime() - mostRestrictive.duration * 1000
    );
    const { results } = await db
      .prepare(
        `SELECT COUNT(*) as count FROM rate_limit_checks
         WHERE tenant_id = ? AND user_id = ? AND endpoint = ? AND created_at > ?`
      )
      .bind(tenantId, userId, endpoint, windowStart.toISOString())
      .all<{ count: number }>();

    const count = Number(results[0]?.count || 0);
    remaining = Math.max(0, mostRestrictive.limit! - count);
  }

  const resetAt = new Date(now.getTime() + 60000); // Reset in 60 seconds

  return {
    allowed: true,
    remaining,
    resetAt: resetAt.toISOString(),
  };
}

/**
 * Get rate limit configuration for tenant/endpoint
 */
export async function getRateLimitConfig(
  tenantId: string,
  endpoint: string
): Promise<RateLimitConfig | null> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM rate_limit_configs
       WHERE tenant_id = ? AND endpoint = ?`
    )
    .bind(tenantId, endpoint)
    .all<Record<string, unknown>>();

  if (!results.length) return null;

  const row = results[0];
  return {
    tenantId: String(row.tenant_id),
    endpoint: String(row.endpoint),
    requestsPerSecond: row.requests_per_second
      ? Number(row.requests_per_second)
      : undefined,
    requestsPerMinute: row.requests_per_minute
      ? Number(row.requests_per_minute)
      : undefined,
    requestsPerHour: row.requests_per_hour
      ? Number(row.requests_per_hour)
      : undefined,
    burstAllowance: row.burst_allowance
      ? Number(row.burst_allowance)
      : undefined,
  };
}

/**
 * Set custom rate limit config for endpoint
 */
export async function setRateLimitConfig(
  config: RateLimitConfig
): Promise<void> {
  const db = coreDb();

  await db
    .prepare(
      `INSERT OR REPLACE INTO rate_limit_configs
       (tenant_id, endpoint, requests_per_second, requests_per_minute, requests_per_hour, burst_allowance, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      config.tenantId,
      config.endpoint,
      config.requestsPerSecond || null,
      config.requestsPerMinute || null,
      config.requestsPerHour || null,
      config.burstAllowance || null,
      new Date().toISOString()
    )
    .run();
}

/**
 * Log a rate limit block
 */
export async function logRateLimitBlock(
  tenantId: string,
  userId: string,
  endpoint: string,
  windowType: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO rate_limit_blocks
       (id, tenant_id, user_id, endpoint, window_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), tenantId, userId, endpoint, windowType, now)
    .run();
}

/**
 * Get rate limit metrics
 */
export async function getRateLimitMetrics(
  tenantId: string,
  days: number = 7
): Promise<RateLimitMetrics> {
  const db = coreDb();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Total requests
  const { results: totalResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limit_checks
       WHERE tenant_id = ? AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<{ count: number }>();

  const totalRequests = Number(totalResult[0]?.count || 0);

  // Blocked requests
  const { results: blockedResult } = await db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limit_blocks
       WHERE tenant_id = ? AND created_at > ?`
    )
    .bind(tenantId, startDate)
    .all<{ count: number }>();

  const blockedRequests = Number(blockedResult[0]?.count || 0);

  // Top blocked users
  const { results: topUsers } = await db
    .prepare(
      `SELECT user_id, COUNT(*) as blocked_count FROM rate_limit_blocks
       WHERE tenant_id = ? AND created_at > ?
       GROUP BY user_id
       ORDER BY blocked_count DESC
       LIMIT 10`
    )
    .bind(tenantId, startDate)
    .all<{ user_id: string; blocked_count: number }>();

  // Top blocked endpoints
  const { results: topEndpoints } = await db
    .prepare(
      `SELECT endpoint, COUNT(*) as blocked_count FROM rate_limit_blocks
       WHERE tenant_id = ? AND created_at > ?
       GROUP BY endpoint
       ORDER BY blocked_count DESC
       LIMIT 10`
    )
    .bind(tenantId, startDate)
    .all<{ endpoint: string; blocked_count: number }>();

  return {
    totalRequests,
    blockedRequests,
    blockRate:
      totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0,
    topBlockedUsers: topUsers.map((r) => ({
      userId: String(r.user_id),
      blockedCount: Number(r.blocked_count),
    })),
    topBlockedEndpoints: topEndpoints.map((r) => ({
      endpoint: String(r.endpoint),
      blockedCount: Number(r.blocked_count),
    })),
  };
}

/**
 * Clean up old rate limit records (keep 30 days)
 */
export async function cleanupOldRateLimitRecords(): Promise<number> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Delete old checks
  await db
    .prepare(
      `DELETE FROM rate_limit_checks WHERE created_at < ?`
    )
    .bind(cutoffDate)
    .run();

  // Delete old blocks
  const { meta } = await db
    .prepare(
      `DELETE FROM rate_limit_blocks WHERE created_at < ?`
    )
    .bind(cutoffDate)
    .run();

  return meta.duration;
}

/**
 * Reset rate limit for a user/endpoint (admin only)
 */
export async function resetUserRateLimit(
  tenantId: string,
  userId: string,
  endpoint?: string
): Promise<void> {
  const db = coreDb();

  if (endpoint) {
    // Reset specific endpoint
    await db
      .prepare(
        `DELETE FROM rate_limit_checks
         WHERE tenant_id = ? AND user_id = ? AND endpoint = ?`
      )
      .bind(tenantId, userId, endpoint)
      .run();
  } else {
    // Reset all endpoints for user
    await db
      .prepare(
        `DELETE FROM rate_limit_checks
         WHERE tenant_id = ? AND user_id = ?`
      )
      .bind(tenantId, userId)
      .run();
  }
}

/**
 * Get global endpoint limits (non-tenant specific)
 */
export async function getGlobalLimits(): Promise<RateLimitConfig[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM rate_limit_configs WHERE tenant_id = '__GLOBAL__'`
    )
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    tenantId: String(row.tenant_id),
    endpoint: String(row.endpoint),
    requestsPerSecond: row.requests_per_second
      ? Number(row.requests_per_second)
      : undefined,
    requestsPerMinute: row.requests_per_minute
      ? Number(row.requests_per_minute)
      : undefined,
    requestsPerHour: row.requests_per_hour
      ? Number(row.requests_per_hour)
      : undefined,
    burstAllowance: row.burst_allowance
      ? Number(row.burst_allowance)
      : undefined,
  }));
}
