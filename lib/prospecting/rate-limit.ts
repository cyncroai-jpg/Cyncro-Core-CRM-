const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new RateLimitError();
  bucket.count += 1;
}

export class RateLimitError extends Error {
  status = 429;
  constructor() {
    super("Too many requests. Wait a moment and try again.");
  }
}
