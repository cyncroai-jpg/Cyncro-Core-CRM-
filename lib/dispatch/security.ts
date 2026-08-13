import { DispatchError } from "./errors";
import { serviceRpc } from "./supabase";

export function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const result = (await serviceRpc("dispatch_consume_rate_limit", {
    p_bucket: bucket,
    p_key_hash: await sha256(key),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })) as { allowed: boolean; remaining: number; retry_after_seconds: number };
  if (!result.allowed) {
    throw new DispatchError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
      {
        retryAfterSeconds: result.retry_after_seconds,
      },
    );
  }
  return result;
}

export async function verifyHmac(
  request: Request,
  rawBody: string,
  secret?: string,
) {
  if (!secret)
    throw new DispatchError(
      503,
      "UPSTREAM_UNAVAILABLE",
      "SMS security is not configured.",
    );
  const supplied = request.headers.get("x-cyncro-signature");
  if (!supplied)
    throw new DispatchError(401, "UNAUTHORIZED", "Missing webhook signature.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (!constantTimeEqual(expected, supplied))
    throw new DispatchError(401, "UNAUTHORIZED", "Invalid webhook signature.");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
