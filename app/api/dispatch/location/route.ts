import { DispatchError } from "@/lib/dispatch/errors";
import { log } from "@/lib/dispatch/logger";
import { failure, ok, requestId } from "@/lib/dispatch/response";
import { clientIp, rateLimit } from "@/lib/dispatch/security";
import { authenticatedUser, supabaseRequest } from "@/lib/dispatch/supabase";
import { jsonBody, validateLocation } from "@/lib/dispatch/validation";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const user = await authenticatedUser(request);
    await rateLimit("gps-write", `${user.id}:${clientIp(request)}`, 24, 60);
    const payload = await jsonBody(request, 8_192);
    const location = validateLocation(payload);
    const jobId = payload.jobId;
    if (typeof jobId !== "string" || jobId.length > 80)
      throw new DispatchError(400, "BAD_REQUEST", "A valid job is required.");

    if (location.accuracyMeters > 500) {
      log("warn", "gps.low_accuracy", {
        requestId: id,
        userId: user.id,
        accuracyMeters: location.accuracyMeters,
      });
      return ok(
        {
          accepted: false,
          reason: "low_accuracy",
          retryAfterSeconds: 30,
          offlineAction: "queue_locally",
        },
        id,
        202,
      );
    }

    await supabaseRequest(request, "rpc/dispatch_record_location", {
      method: "POST",
      body: JSON.stringify({
        p_job_id: jobId,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_accuracy_meters: location.accuracyMeters,
        p_recorded_at: location.recordedAt,
      }),
    });
    return ok({ accepted: true, nextPingSeconds: 300 }, id, 202);
  } catch (error) {
    return failure(error, id, "gps.write.failed");
  }
}
