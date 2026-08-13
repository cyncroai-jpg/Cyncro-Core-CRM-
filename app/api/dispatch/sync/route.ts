import { DispatchError } from "@/lib/dispatch/errors";
import { failure, ok, requestId } from "@/lib/dispatch/response";
import { clientIp, rateLimit } from "@/lib/dispatch/security";
import { authenticatedUser, supabaseRequest } from "@/lib/dispatch/supabase";
import { jsonBody } from "@/lib/dispatch/validation";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const user = await authenticatedUser(request);
    await rateLimit("offline-sync", `${user.id}:${clientIp(request)}`, 20, 60);
    const body = await jsonBody(request, 128_000);
    if (!Array.isArray(body.operations) || body.operations.length > 50)
      throw new DispatchError(
        400,
        "BAD_REQUEST",
        "Sync accepts up to 50 operations.",
      );
    const operations = body.operations.map((operation, index) => {
      if (!operation || typeof operation !== "object")
        throw new DispatchError(400, "BAD_REQUEST", "Invalid sync operation.", {
          index,
        });
      const row = operation as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.type !== "string" ||
        typeof row.createdAt !== "string"
      )
        throw new DispatchError(
          400,
          "BAD_REQUEST",
          "Sync operation is incomplete.",
          { index },
        );
      return row;
    });
    const result = await supabaseRequest(
      request,
      "rpc/dispatch_sync_operations",
      {
        method: "POST",
        body: JSON.stringify({ p_operations: operations }),
      },
    );
    return ok({ results: result, serverTime: new Date().toISOString() }, id);
  } catch (error) {
    return failure(error, id, "offline.sync.failed");
  }
}
