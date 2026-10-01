/**
 * Sign-in security: lockout after repeated failures, D1-backed rate limits
 * for public endpoints, TOTP two-factor codes with single-use backup codes,
 * and session metadata. Everything here is plain WebCrypto so it runs on
 * Cloudflare Workers.
 */
import { coreDb } from "@/lib/core/db";

const now = () => new Date().toISOString();
const enc = new TextEncoder();

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
export function deviceLabel(request: Request): string {
  const ua = request.headers.get("user-agent") || "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${browser} on ${os}`;
}

// ── Rate limits (sliding window per key, stored in D1 so every edge location agrees) ──
export class TooManyRequests extends Error { status = 429; retryAfter: number; constructor(seconds: number) { super(`Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 90 ? "s" : ""}.`); this.retryAfter = seconds; } }

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const db = coreDb(); const t = Date.now();
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key=?").bind(key).first<{ count: number; window_start: number }>();
  if (!row || t - Number(row.window_start) > windowMs) { await db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start").bind(key, t).run(); return; }
  if (Number(row.count) >= limit) throw new TooManyRequests(Math.ceil((windowMs - (t - Number(row.window_start))) / 1000));
  await db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").bind(key).run();
}
export function rateLimitResponse(e: unknown): Response | null {
  if (e instanceof TooManyRequests) return Response.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(e.retryAfter) } });
  return null;
}

// ── Login lockout: 5 bad passwords in 15 minutes locks that account for 15 minutes ──
const LOCK_AFTER = 5, LOCK_WINDOW_MS = 15 * 60_000, LOCK_FOR_MS = 15 * 60_000;
export async function lockStatus(email: string): Promise<{ locked: boolean; seconds: number }> {
  const row = await coreDb().prepare("SELECT locked_until FROM auth_attempts WHERE key=?").bind(`login:${email}`).first<{ locked_until: string | null }>();
  if (!row?.locked_until) return { locked: false, seconds: 0 };
  const ms = new Date(row.locked_until).getTime() - Date.now();
  return ms > 0 ? { locked: true, seconds: Math.ceil(ms / 1000) } : { locked: false, seconds: 0 };
}
export async function recordLoginFailure(email: string): Promise<{ locked: boolean; remaining: number }> {
  const db = coreDb(); const key = `login:${email}`; const t = Date.now();
  const row = await db.prepare("SELECT failures, first_at FROM auth_attempts WHERE key=?").bind(key).first<{ failures: number; first_at: string }>();
  const fresh = !row || t - new Date(row.first_at).getTime() > LOCK_WINDOW_MS;
  const failures = fresh ? 1 : Number(row!.failures) + 1;
  const lockedUntil = failures >= LOCK_AFTER ? new Date(t + LOCK_FOR_MS).toISOString() : null;
  await db.prepare("INSERT INTO auth_attempts (key, failures, first_at, locked_until, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures, first_at=excluded.first_at, locked_until=excluded.locked_until, updated_at=excluded.updated_at")
    .bind(key, failures, fresh ? now() : row!.first_at, lockedUntil, now()).run();
  return { locked: Boolean(lockedUntil), remaining: Math.max(0, LOCK_AFTER - failures) };
}
export async function clearLoginFailures(email: string) { await coreDb().prepare("DELETE FROM auth_attempts WHERE key=?").bind(`login:${email}`).run(); }

// ── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, ""); const out: number[] = []; let bits = 0, value = 0;
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export function newTotpSecret(): string { return base32Encode(crypto.getRandomValues(new Uint8Array(20))); }
export async function totpCode(secret: string, at = Date.now(), step = 30): Promise<string> {
  const counter = Math.floor(at / 1000 / step);
  const msg = new Uint8Array(8); let c = counter; for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[19] & 15;
  const code = ((mac[offset] & 127) << 24 | mac[offset + 1] << 16 | mac[offset + 2] << 8 | mac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const c = code.replace(/\D/g, ""); if (c.length !== 6) return false;
  for (const d of [-1, 0, 1]) if ((await totpCode(secret, Date.now() + d * 30_000)) === c) return true;
  return false;
}
export function otpauthUrl(secret: string, email: string, issuer = "Cyncro Core") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
export async function sha256Hex(s: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function newBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => { const b = crypto.getRandomValues(new Uint8Array(10)); return [...b].map((x) => (x % 36).toString(36)).join("").toUpperCase().replace(/(.{5})/, "$1-"); });
}

export type TwoFactor = { enabled: boolean; secret: string | null; backup_codes: string[]; enabled_at: string | null };
export async function twoFactorFor(userId: string): Promise<TwoFactor> {
  const row = await coreDb().prepare("SELECT enabled, secret, backup_codes, enabled_at FROM auth_totp WHERE user_id=?").bind(userId).first<{ enabled: number; secret: string; backup_codes: string; enabled_at: string | null }>();
  if (!row) return { enabled: false, secret: null, backup_codes: [], enabled_at: null };
  let codes: string[] = []; try { codes = JSON.parse(row.backup_codes || "[]"); } catch { codes = []; }
  return { enabled: Boolean(row.enabled), secret: row.secret, backup_codes: codes, enabled_at: row.enabled_at };
}
/** Accepts a TOTP code or an unused backup code (which is then burned). */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const tf = await twoFactorFor(userId);
  if (!tf.enabled || !tf.secret) return false;
  if (await verifyTotp(tf.secret, code)) return true;
  const h = await sha256Hex(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (!tf.backup_codes.includes(h)) return false;
  await coreDb().prepare("UPDATE auth_totp SET backup_codes=? WHERE user_id=?").bind(JSON.stringify(tf.backup_codes.filter((x) => x !== h)), userId).run();
  return true;
}
