import { DispatchError, safeError } from "./errors";
import { log } from "./logger";

export function requestId(request: Request) {
  return request.headers.get("x-request-id") || crypto.randomUUID();
}

export function ok(data: unknown, id: string, status = 200) {
  return Response.json(
    { ok: true, data, requestId: id },
    { status, headers: securityHeaders(id) },
  );
}

export function failure(error: unknown, id: string, event: string) {
  const safe = safeError(error);
  log(safe.status >= 500 ? "error" : "warn", event, {
    requestId: id,
    code: safe.code,
    status: safe.status,
    message: error instanceof Error ? error.message : String(error),
  });
  return Response.json(
    {
      ok: false,
      error: { code: safe.code, message: safe.message, details: safe.details },
      requestId: id,
    },
    { status: safe.status, headers: securityHeaders(id, safe) },
  );
}

function securityHeaders(id: string, error?: DispatchError) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "x-request-id": id,
  };
  if (error?.code === "RATE_LIMITED") {
    headers["retry-after"] = String(error.details?.retryAfterSeconds || 60);
  }
  return headers;
}
