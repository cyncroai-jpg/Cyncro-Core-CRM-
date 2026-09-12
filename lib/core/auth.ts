/**
 * Cyncro Auth Utilities
 * PBKDF2-SHA256 password hashing (Web Crypto API — works in Workers + Node 22+)
 * Session token management via D1
 */
import { coreDb } from "@/lib/core/db";

// ─── Password hashing ────────────────────────────────────────────────────────

function hexEncode(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexDecode(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt },
    key,
    256,
  );
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${hexEncode(salt.buffer)}:${hexEncode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[2], 10);
  const salt = hexDecode(parts[3]);
  const storedHash = parts[4];
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", iterations, salt },
      key,
      256,
    );
    return hexEncode(bits) === storedHash;
  } catch {
    return false;
  }
}

// ─── Session management ───────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "cyncro_session";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  active: number;
};

function randomToken(bytes = 32): string {
  return hexEncode(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export async function createSession(userId: string, email: string): Promise<string> {
  const token = randomToken(32);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await coreDb()
    .prepare(
      "INSERT INTO auth_sessions (token, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(token, userId, email.toLowerCase(), expiresAt, now)
    .run();
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await coreDb().prepare("DELETE FROM auth_sessions WHERE token=?").bind(token).run();
}

export async function getSessionUser(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await coreDb()
    .prepare(
      "SELECT s.user_id, s.email, s.expires_at, u.display_name, u.role, u.active FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token=?",
    )
    .bind(token)
    .first<{ user_id: string; email: string; expires_at: string; display_name: string; role: string; active: number }>();

  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await deleteSession(token);
    return null;
  }
  return {
    id: session.user_id,
    email: session.email,
    display_name: session.display_name,
    role: session.role,
    active: session.active,
  };
}

export function getTokenFromRequest(request: Request): string {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.trim() === SESSION_COOKIE) return decodeURIComponent(rest.join("=").trim());
  }
  return "";
}

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return getSessionUser(token);
}

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ─── Convenience auth guard ───────────────────────────────────────────────────

export async function requireAuth(
  request: Request,
): Promise<{ user: AuthUser } | Response> {
  const user = await getRequestUser(request);
  if (!user || !user.active) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  return { user };
}

export async function requireOwner(
  request: Request,
): Promise<{ user: AuthUser } | Response> {
  const result = await requireAuth(request);
  if (result instanceof Response) return result;
  if (result.user.role !== "OWNER") {
    return Response.json({ error: "Owner permission required." }, { status: 403 });
  }
  return result;
}
