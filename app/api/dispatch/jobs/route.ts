import { DispatchError } from "@/lib/dispatch/errors";
import { log } from "@/lib/dispatch/logger";
import { failure, ok, requestId } from "@/lib/dispatch/response";
import { clientIp, rateLimit } from "@/lib/dispatch/security";
import { authenticatedUser, supabaseRequest } from "@/lib/dispatch/supabase";
import { jsonBody, validateJob } from "@/lib/dispatch/validation";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const user = await authenticatedUser(request);
    await rateLimit("jobs-read", `${user.id}:${clientIp(request)}`, 120, 60);
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || 50), 1),
      100,
    );
    const cursor = url.searchParams.get("before");
    const dateFilter = cursor
      ? `&service_date=lt.${encodeURIComponent(cursor)}`
      : "";
    const jobs = await supabaseRequest(
      request,
      `dispatch_jobs?select=id,service_type,service_date,status,address,revenue,route_position,estimated_minutes,updated_at&order=service_date.desc&limit=${limit}${dateFilter}`,
    );
    return ok(
      {
        jobs,
        nextCursor: Array.isArray(jobs)
          ? jobs.at(-1)?.service_date || null
          : null,
      },
      id,
    );
  } catch (error) {
    return failure(error, id, "jobs.list.failed");
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const user = await authenticatedUser(request);
    await rateLimit("jobs-create", `${user.id}:${clientIp(request)}`, 30, 60);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (
      !idempotencyKey ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 120
    )
      throw new DispatchError(
        400,
        "BAD_REQUEST",
        "A valid idempotency key is required.",
      );
    const body = validateJob(await jsonBody(request));
    const rows = await supabaseRequest(request, "rpc/dispatch_create_job", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_service_type: body.serviceType,
        p_service_date: body.serviceDate,
        p_address: body.address,
        p_customer_id: body.customerId || null,
        p_customer_notes: body.customerNotes || null,
        p_lead_source: body.leadSource || null,
        p_revenue: body.revenue || 0,
        p_assigned_tech_id: body.assignedTechId || null,
      }),
    });
    log("info", "job.created", { requestId: id, userId: user.id });
    return ok({ job: rows }, id, 201);
  } catch (error) {
    return failure(error, id, "job.create.failed");
  }
}
