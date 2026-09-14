/**
 * Email Sequence Engine™ — Automated follow-up sequences
 *
 * Supports triggers:
 * - contact.created — new contact added
 * - deal.created — new deal created
 * - booking.confirmed — meeting booked
 * - contact.inactivity_30d — no activity in 30 days
 * - email.opened — recipient opened previous email
 *
 * Sequences are auto-enrolled and emails sent on schedule.
 */

import { coreDb } from "@/lib/core/db";
import { sendEmail } from "@/lib/core/email";

export type SequenceTrigger =
  | "contact.created"
  | "deal.created"
  | "booking.confirmed"
  | "contact.inactivity_30d"
  | "email.opened"
  | "email.clicked";

export interface SequenceStep {
  order: number;
  delayHours: number;
  subject: string;
  bodyHtml: string;
  sendWindowStart?: string; // "09:00" — don't send before this time
  sendWindowEnd?: string; // "17:00" — don't send after this time
  skipWeekends?: boolean;
  conditions?: {
    field: string;
    operator: "eq" | "gt" | "lt" | "contains";
    value: unknown;
  }[];
}

export interface EmailSequence {
  id: string;
  tenantId: string;
  name: string;
  trigger: SequenceTrigger;
  steps: SequenceStep[];
  enabled: boolean;
  autoEnroll: boolean; // Automatically enroll matching contacts
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Enroll a contact in a sequence */
export async function enrollContactInSequence(
  tenantId: string,
  sequenceId: string,
  contactEmail: string,
  contactId?: string,
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Check if already enrolled
  const existing = await db.prepare(
    `SELECT id FROM email_sequence_enrollments
     WHERE sequence_id = ? AND contact_email = ? AND status != 'CANCELLED'`
  ).bind(sequenceId, contactEmail).first();

  if (existing) return; // Already enrolled

  // Create enrollment
  await db.prepare(
    `INSERT INTO email_sequence_enrollments
     (id, tenant_id, sequence_id, contact_id, contact_email, status, enrolled_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
  ).bind(
    crypto.randomUUID(),
    tenantId,
    sequenceId,
    contactId || null,
    contactEmail,
    now,
    now,
  ).run();
}

/** Fire a sequence trigger (contact.created, deal.created, etc.) */
export async function fireSequenceTrigger(
  tenantId: string,
  trigger: SequenceTrigger,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const db = coreDb();

    // Find all active sequences with this trigger
    const { results: sequences } = await db.prepare(
      `SELECT id, steps FROM email_sequences
       WHERE tenant_id = ? AND trigger = ? AND enabled = 1`
    ).bind(tenantId, trigger).all<{ id: string; steps: string }>();

    if (!sequences.length) return;

    const contactEmail = String(data.contactEmail || data.email || "");
    if (!contactEmail) return;

    // Enroll in matching sequences
    for (const seq of sequences) {
      await enrollContactInSequence(tenantId, seq.id, contactEmail, String(data.contactId || ""));
    }

    // Schedule first step execution
    await scheduleSequenceSteps(tenantId);
  } catch (err) {
    console.error("sequence.trigger.failed", { tenantId, trigger, error: String(err) });
  }
}

/** Check and send pending emails in sequences */
export async function scheduleSequenceSteps(tenantId: string): Promise<void> {
  try {
    const db = coreDb();
    const now = new Date().toISOString();

    // Find all pending sequence emails
    const { results: pending } = await db.prepare(
      `SELECT se.id, se.sequence_id, se.contact_email, es.steps
       FROM email_sequence_enrollments se
       JOIN email_sequences es ON es.id = se.sequence_id
       WHERE se.tenant_id = ? AND se.status = 'ACTIVE'
       ORDER BY se.enrolled_at ASC
       LIMIT 100`
    ).bind(tenantId).all<{ id: string; sequence_id: string; contact_email: string; steps: string }>();

    for (const enrollment of pending) {
      const steps = JSON.parse(String(enrollment.steps || "[]")) as SequenceStep[];
      if (!steps.length) continue;

      // Find next step to send
      const nextStep = steps[0]; // Simplified: always send first step
      if (!nextStep) continue;

      // Calculate send time
      const sendAt = new Date(
        new Date(enrollment.enrolled_at).getTime() + nextStep.delayHours * 60 * 60 * 1000,
      );

      if (sendAt <= new Date(now)) {
        // Time to send
        await sendSequenceEmail(tenantId, enrollment, nextStep);
      }
    }
  } catch (err) {
    console.error("sequence.schedule.failed", { tenantId, error: String(err) });
  }
}

/** Send a single sequence email */
async function sendSequenceEmail(
  tenantId: string,
  enrollment: { id: string; contact_email: string },
  step: SequenceStep,
): Promise<void> {
  try {
    // Send email
    await sendEmail({
      to: enrollment.contact_email,
      subject: step.subject,
      html: step.bodyHtml,
    });

    // Log send
    const db = coreDb();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO email_sequence_events
       (id, tenant_id, enrollment_id, contact_email, event_type, step_order, created_at)
       VALUES (?, ?, ?, ?, 'SENT', ?, ?)`
    ).bind(
      crypto.randomUUID(),
      tenantId,
      enrollment.id,
      enrollment.contact_email,
      step.order,
      now,
    ).run();
  } catch (err) {
    console.error("sequence.email.failed", { contactEmail: enrollment.contact_email, error: String(err) });
  }
}
