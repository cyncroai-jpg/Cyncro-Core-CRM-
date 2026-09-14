/**
 * Call Recording Webhook Handler
 *
 * POST /api/webhooks/call-recording
 * Receives events from phone providers:
 * - Twilio: call.completed, recording.completed
 * - Telnyx: call.hangup, call_recording.finished
 */

import { ensureCoreSchema } from "@/lib/core/db";
import {
  completeCallRecording,
  storeTranscript,
  analyzeCallTranscript,
} from "@/lib/core/call-recording";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    const body = (await request.json()) as Record<string, unknown>;
    const eventType = body.EventType || body.event_type;

    if (!eventType) {
      console.warn("call.webhook.missing_event_type", body);
      return Response.json({ error: "Missing event type" }, { status: 400 });
    }

    // Extract common fields (normalize across providers)
    const tenantId = String(body.TenantId || body.tenant_id || "");
    const recordingId = String(body.RecordingSid || body.recording_sid || body.CallSid || body.call_sid || "");

    if (!tenantId || !recordingId) {
      console.warn("call.webhook.missing_fields", { tenantId, recordingId });
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Handle call completion
    if (eventType === "call.completed" || eventType === "call.hangup") {
      const durationSeconds = parseInt(
        String(body.Duration || body.duration || 0),
        10
      );
      const recordingUrl = String(body.RecordingUrl || body.recording_url || "");

      if (recordingUrl) {
        await completeCallRecording(
          tenantId,
          recordingId,
          durationSeconds,
          recordingUrl
        );

        console.log("call.webhook.completed", {
          recordingId,
          durationSeconds,
        });
      }
    }

    // Handle transcription completion
    if (eventType === "recording.completed" || eventType === "call_recording.finished") {
      const transcriptText = String(body.Transcript || body.transcript || "");
      const durationSeconds = parseInt(
        String(body.Duration || body.duration || 0),
        10
      );

      if (transcriptText) {
        try {
          await storeTranscript(
            tenantId,
            recordingId,
            transcriptText,
            durationSeconds
          );

          // Analyze transcript
          const analytics = await analyzeCallTranscript(
            tenantId,
            recordingId,
            transcriptText
          );

          console.log("call.webhook.transcribed", {
            recordingId,
            sentiment: analytics.sentiment,
          });
        } catch (err) {
          console.error("call.webhook.transcription.failed", err);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("webhook.call.failed", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
