import { ensureCoreSchema, hasModuleAccess, resolveRequestEmail } from "@/lib/core/db";
import { ensureSmartMoneySchema } from "./db";
import { UpstreamError } from "./edgar";

/** Smart Money lives under the prospecting entitlement. Returns a Response when access is denied. */
export async function smartMoneyGuard(request: Request) {
  await ensureCoreSchema();
  if ((await resolveRequestEmail(request)) === null)
    return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!(await hasModuleAccess(request, "prospecting")))
    return Response.json({ error: "Prospecting access is required for Smart Money." }, { status: 403 });
  await ensureSmartMoneySchema();
  return null;
}

export function smartMoneyError(scope: string, error: unknown) {
  console.error(`smart-money.${scope}.failed`, error);
  if (error instanceof UpstreamError)
    return Response.json({ error: error.message }, { status: error.status === 404 ? 404 : 502 });
  return Response.json({ error: error instanceof Error ? error.message : "Smart Money request failed." }, { status: 500 });
}
