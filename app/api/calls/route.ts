/**
 * Call Recording Management API
 *
 * GET /api/calls — list call recordings
 * GET /api/calls?id=X — get call details with transcript and analysis
 * POST /api/calls — start call recording
 * PATCH /api/calls — complete/analyze call recording
 * GET /api/calls?analytics=1 — get call analytics summary
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createCallRecording,
  completeCallRecording,
  storeTranscript,
  analyzeCallTranscript,
  getCallRecording,
  getCallAnalytics,
} from "@/lib/core/call-recording";
import { hasFeatureAccess } from "@/lib/core/billing";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check feature access (Pro+ plan)
    const hasCallRecording = await hasFeatureAccess(tenant.tenantId, "callRecording");
    if (!hasCallRecording) {
      return Response.json(
        { error: "Upgrade to Pro plan to use call recording" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const recordingId = cleanText(url.searchParams.get("id"), 80);
    const analyticsFlag = url.searchParams.get("analytics") === "1";

    if (analyticsFlag) {
      // GET /api/calls?analytics=1 — analytics summary
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      const analytics = await getCallAnalytics(tenant.tenantId, days);
      return Response.json(analytics);
    }

    if (recordingId) {
      // GET /api/calls?id=X — get recording details
      const result = await getCallRecording(tenant.tenantId, recordingId);
      if (!result.recording) {
        return Response.json({ error: "Recording not found" }, { status: 404 });
      }
      return Response.json(result);
    }

    // GET /api/calls — list all recordings
    const db = coreDb();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const { results: recordings } = await db
      .prepare(
        `SELECT * FROM call_recordings
         WHERE tenant_id = ?
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(tenant.tenantId, limit, offset)
      .all();

    return Response.json({ recordings, limit, offset });
  } catch (error) {
    console.error("calls.get.failed", error);
    return Response.json(
      { error: "Unable to load calls" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check feature access
    const hasCallRecording = await hasFeatureAccess(tenant.tenantId, "callRecording");
    if (!hasCallRecording) {
      return Response.json(
        { error: "Upgrade to Pro plan to use call recording" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phoneNumber = cleanText(String(body.phoneNumber || ""), 20);
    const recordingSid = cleanText(String(body.recordingSid || ""), 80);
    const contactId = body.contactId ? cleanText(String(body.contactId), 80) : undefined;
    const dealId = body.dealId ? cleanText(String(body.dealId), 80) : undefined;
    const provider = (body.provider as string) || "mock";

    if (!phoneNumber || !recordingSid) {
      return Response.json(
        { error: "phoneNumber and recordingSid are required" },
        { status: 400 }
      );
    }

    const recording = await createCallRecording(
      tenant.tenantId,
      phoneNumber,
      recordingSid,
      provider as "twilio" | "telnyx" | "vonage" | "mock",
      contactId,
      dealId,
      tenant.userId
    );

    return Response.json(recording, { status: 201 });
  } catch (error) {
    console.error("calls.create.failed", error);
    return Response.json(
      { error: "Unable to create call recording" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const recordingId = cleanText(String(body.id || ""), 80);
    const action = cleanText(String(body.action || ""), 20);

    if (!recordingId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    if (action === "complete") {
      // Complete call recording
      const durationSeconds = parseInt(String(body.durationSeconds || 0), 10);
      const recordingUrl = cleanText(String(body.recordingUrl || ""), 500);

      if (!recordingUrl) {
        return Response.json(
          { error: "recordingUrl is required" },
          { status: 400 }
        );
      }

      await completeCallRecording(
        tenant.tenantId,
        recordingId,
        durationSeconds,
        recordingUrl
      );

      return Response.json({ success: true });
    } else if (action === "transcribe") {
      // Store transcript and analyze
      const transcriptText = String(body.transcript || "");
      const durationSeconds = parseInt(String(body.durationSeconds || 0), 10);

      if (!transcriptText) {
        return Response.json(
          { error: "transcript is required" },
          { status: 400 }
        );
      }

      await storeTranscript(
        tenant.tenantId,
        recordingId,
        transcriptText,
        durationSeconds
      );

      const analytics = await analyzeCallTranscript(
        tenant.tenantId,
        recordingId,
        transcriptText
      );

      return Response.json({ analytics });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("calls.update.failed", error);
    return Response.json(
      { error: "Unable to update call" },
      { status: 500 }
    );
  }
}
