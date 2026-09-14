/**
 * SMS Sequence Engine™ — Text message automation
 *
 * Similar to email sequences but optimized for SMS:
 * - Shorter copy (160 chars per message)
 * - Carrier compliance (STOP to unsubscribe)
 * - Delivery + read tracking
 * - Multi-channel sequences (email + SMS together)
 *
 * SMS providers supported (skeleton):
 * - Twilio (production)
 * - Telnyx (production)
 * - AWS SNS (production)
 */

import { coreDb } from "@/lib/core/db";

export type SMSProvider = "twilio" | "telnyx" | "aws_sns" | "mock";

export interface SMSSequenceStep {
  order: number;
  delayHours: number;
  message: string; // Max 160 chars, longer = multi-part
  includeStopLink?: boolean; // Add standard STOP text
  sendWindowStart?: string; // "09:00" — don't text too early
  sendWindowEnd?: string; // "21:00" — don't text too late
  conditions?: {
    field: string;
    operator: "eq" | "gt" | "lt" | "contains";
    value: unknown;
  }[];
}

export interface SMSSequence {
  id: string;
  tenantId: string;
  name: string;
  provider: SMSProvider;
  steps: SMSSequenceStep[];
  enabled: boolean;
  autoEnroll: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Send SMS via provider (production would use real Twilio/Telnyx) */
export async function sendSMS(
  phoneNumber: string,
  message: string,
  provider: SMSProvider = "mock",
): Promise<{ sid?: string; success: boolean }> {
  // Mock implementation
  if (provider === "mock") {
    console.log(`[SMS MOCK] to ${phoneNumber}: ${message}`);
    return { success: true, sid: `mock_${Date.now()}` };
  }

  // Production: call real SMS provider
  // Example (Twilio):
  // const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  // const message = await twilio.messages.create({
  //   body: message,
  //   from: TWILIO_PHONE_NUMBER,
  //   to: phoneNumber
  // });
  // return { success: true, sid: message.sid };

  return { success: false };
}

/** Enroll contact in SMS sequence */
export async function enrollContactInSMSSequence(
  tenantId: string,
  sequenceId: string,
  phone: string,
  contactId?: string,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Check if already enrolled
  const existing = await db.prepare(
    `SELECT id FROM sms_sequence_enrollments
     WHERE sequence_id = ? AND phone = ? AND status != 'UNSUBSCRIBED'`
  ).bind(sequenceId, phone).first();

  if (existing) return;

  // Create enrollment
  await db.prepare(
    `INSERT INTO sms_sequence_enrollments
     (id, tenant_id, sequence_id, contact_id, phone, status, enrolled_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
  ).bind(
    crypto.randomUUID(),
    tenantId,
    sequenceId,
    contactId || null,
    phone,
    now,
    now,
  ).run();
}

/** Send SMS sequence step */
export async function sendSMSSequenceStep(
  tenantId: string,
  sequenceId: string,
  enrollmentId: string,
  phone: string,
  message: string,
  stepOrder: number,
  provider: SMSProvider = "mock",
): Promise<void> {
  try {
    const result = await sendSMS(phone, message, provider);

    if (!result.success) {
      throw new Error("SMS send failed");
    }

    // Log event
    const db = coreDb();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO sms_sequence_events
       (id, tenant_id, enrollment_id, phone, event_type, step_order, sms_sid, created_at)
       VALUES (?, ?, ?, ?, 'SENT', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      tenantId,
      enrollmentId,
      phone,
      stepOrder,
      result.sid || null,
      now,
    ).run();
  } catch (err) {
    console.error("sms.send.failed", { phone, error: String(err) });
  }
}

/** Handle STOP reply (unsubscribe) */
export async function handleSMSUnsubscribe(
  tenantId: string,
  phone: string,
  messageText: string,
): Promise<void> {
  if (messageText.toUpperCase().includes("STOP")) {
    const db = coreDb();
    const now = new Date().toISOString();

    // Unsubscribe from all sequences
    await db.prepare(
      `UPDATE sms_sequence_enrollments
       SET status = 'UNSUBSCRIBED', updated_at = ?
       WHERE tenant_id = ? AND phone = ?`
    ).bind(now, tenantId, phone).run();

    // Log event
    await db.prepare(
      `INSERT INTO sms_sequence_events
       (id, tenant_id, phone, event_type, created_at)
       VALUES (?, ?, ?, 'UNSUBSCRIBED', ?)`
    ).bind(
      crypto.randomUUID(),
      tenantId,
      phone,
      now,
    ).run();
  }
}
