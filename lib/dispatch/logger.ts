type LogLevel = "info" | "warn" | "error";

const SECRET_KEYS =
  /authorization|token|password|secret|signature|cookie|phone/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? "[REDACTED]" : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function log(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const sanitized = redact(context) as Record<string, unknown>;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "cyncro-dispatch",
    event,
    ...sanitized,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
