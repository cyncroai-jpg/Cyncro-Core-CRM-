import { config } from "./config";
import { DispatchError } from "./errors";

async function timedFetch(url: string, init: RequestInit, timeoutMs = 8_000) {
  const method = (init.method || "GET").toUpperCase();
  const maxAttempts =
    method === "GET" || init.headers instanceof Headers ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (![502, 503, 504].includes(response.status) || attempt === maxAttempts)
        return response;
    } catch {
      if (attempt === maxAttempts) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 100 * 2 ** (attempt - 1)),
    );
  }
  throw new DispatchError(
    503,
    "UPSTREAM_UNAVAILABLE",
    "Dispatch data is temporarily unavailable. Please retry.",
  );
}

export async function authenticatedUser(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer "))
    throw new DispatchError(401, "UNAUTHORIZED", "Sign in to continue.");
  const cfg = config();
  const response = await timedFetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: cfg.supabaseAnonKey, authorization: auth },
  });
  if (!response.ok)
    throw new DispatchError(
      401,
      "UNAUTHORIZED",
      "Your session is invalid or expired.",
    );
  return (await response.json()) as { id: string; email?: string };
}

export async function supabaseRequest(
  request: Request,
  path: string,
  init: RequestInit = {},
) {
  const cfg = config();
  const auth = request.headers.get("authorization");
  if (!auth)
    throw new DispatchError(401, "UNAUTHORIZED", "Sign in to continue.");
  const response = await timedFetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.supabaseAnonKey,
      authorization: auth,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (response.status === 401)
    throw new DispatchError(401, "UNAUTHORIZED", "Your session has expired.");
  if (response.status === 403)
    throw new DispatchError(
      403,
      "FORBIDDEN",
      "You do not have access to this record.",
    );
  if (response.status === 404)
    throw new DispatchError(
      404,
      "NOT_FOUND",
      "The requested record was not found.",
    );
  if (!response.ok) {
    const upstreamId = response.headers.get("x-request-id") || undefined;
    throw new DispatchError(
      502,
      "UPSTREAM_UNAVAILABLE",
      "Dispatch could not save the change.",
      {
        upstreamId,
      },
    );
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function serviceRpc(name: string, body: Record<string, unknown>) {
  const cfg = config(true);
  const response = await timedFetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: cfg.supabaseServiceRoleKey!,
      authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new DispatchError(
      503,
      "UPSTREAM_UNAVAILABLE",
      "Safety service unavailable.",
    );
  return response.json();
}
