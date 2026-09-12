/**
 * Cyncro email sender — powered by Resend.
 * Gracefully no-ops when RESEND_API_KEY is not configured.
 */
import { env } from "cloudflare:workers";

function resendKey(): string | null {
  return (env as Record<string, string>).RESEND_API_KEY || null;
}
function fromAddress(): string {
  return (env as Record<string, string>).EMAIL_FROM || "Cyncro <noreply@cyncro.co>";
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const key = resendKey();
  if (!key) {
    console.warn("email.skipped: RESEND_API_KEY is not configured");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("email.send_failed", res.status, err.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("email.send_error", err);
    return false;
  }
}

// ── Shared template wrapper ──────────────────────────────────────────────────

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cyncro</title>
<style>
  body{margin:0;padding:0;background:#080808;font-family:'Montserrat',system-ui,sans-serif;color:#F5F0EB}
  .shell{max-width:580px;margin:0 auto;padding:32px 16px}
  .card{background:#0D0B0C;border:1px solid #352B2E;border-radius:14px;padding:32px 36px;margin-bottom:24px}
  .logo{font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#F5F0EB;margin-bottom:24px}
  .logo span{color:#C1283E;font-size:12px;font-weight:500;margin-left:6px;letter-spacing:0.04em}
  h1{margin:0 0 8px;font-size:22px;font-weight:500;color:#F5F0EB;line-height:1.3}
  p{margin:0 0 16px;font-size:14px;color:#B8ABAD;line-height:1.6}
  .facts{background:#100E0F;border:1px solid #2a2225;border-radius:10px;padding:20px;margin:20px 0}
  .fact{margin-bottom:12px}
  .fact:last-child{margin-bottom:0}
  .fact small{display:block;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#7a6e70;margin-bottom:3px}
  .fact b{display:block;font-size:14px;color:#F5F0EB}
  .btn{display:inline-block;background:#C1283E;color:#fff;text-decoration:none;border-radius:8px;padding:12px 24px;font-size:13px;font-weight:600;letter-spacing:0.02em;margin:8px 0}
  .footer{font-size:11px;color:#5A4E51;text-align:center;padding-top:8px}
  hr{border:none;border-top:1px solid #2a2225;margin:20px 0}
</style>
</head>
<body><div class="shell">${body}<p class="footer">Cyncro — Business operating system · This is an automated message</p></div></body>
</html>`;
}

// ── Booking confirmation ─────────────────────────────────────────────────────

export function bookingConfirmationEmail(p: {
  customerName: string;
  eventName: string;
  startsAt: string;
  timezone: string;
  locationMode: string;
  videoPlatform?: string | null;
  meetingAddress?: string | null;
  assignedTo: string;
  notes?: string | null;
}): { subject: string; html: string } {
  let dateStr = "";
  try {
    dateStr = new Date(p.startsAt).toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: p.timezone,
    });
  } catch { dateStr = p.startsAt; }

  const location =
    p.locationMode === "VIDEO"
      ? `Video call · ${(p.videoPlatform || "").replace("_", " ") || "Link to follow"}`
      : p.locationMode === "PHONE"
      ? "Phone call — we will call you"
      : p.meetingAddress || "In-person (see notes)";

  return {
    subject: `✅ Confirmed: ${p.eventName} on ${new Date(p.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CALENDAR</span></div>
        <h1>You&rsquo;re confirmed, ${p.customerName.split(" ")[0]}!</h1>
        <p>Your <strong>${p.eventName}</strong> is booked. See the details below.</p>
        <div class="facts">
          <div class="fact"><small>DATE &amp; TIME</small><b>${dateStr}</b></div>
          <div class="fact"><small>LOCATION</small><b>${location}</b></div>
          <div class="fact"><small>WITH</small><b>${p.assignedTo}</b></div>
          ${p.notes ? `<div class="fact"><small>NOTES</small><b>${p.notes}</b></div>` : ""}
        </div>
        <p style="font-size:13px;color:#7a6e70">Need to reschedule? Reply to this email and we&rsquo;ll sort it out.</p>
      </div>
    `),
  };
}

// ── Booking cancellation ─────────────────────────────────────────────────────

export function bookingCancellationEmail(p: {
  customerName: string;
  eventName: string;
  startsAt: string;
  timezone: string;
}): { subject: string; html: string } {
  let dateStr = "";
  try {
    dateStr = new Date(p.startsAt).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: p.timezone,
    });
  } catch { dateStr = p.startsAt; }

  return {
    subject: `Your ${p.eventName} has been cancelled`,
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CALENDAR</span></div>
        <h1>Appointment cancelled</h1>
        <p>Hi ${p.customerName.split(" ")[0]}, your <strong>${p.eventName}</strong> scheduled for <strong>${dateStr}</strong> has been cancelled.</p>
        <p>If you believe this is a mistake or would like to rebook, please reply to this email.</p>
      </div>
    `),
  };
}

// ── Booking reschedule ───────────────────────────────────────────────────────

export function bookingRescheduleEmail(p: {
  customerName: string;
  eventName: string;
  newStartsAt: string;
  timezone: string;
  locationMode: string;
  videoPlatform?: string | null;
  meetingAddress?: string | null;
}): { subject: string; html: string } {
  let dateStr = "";
  try {
    dateStr = new Date(p.newStartsAt).toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: p.timezone,
    });
  } catch { dateStr = p.newStartsAt; }

  const location =
    p.locationMode === "VIDEO"
      ? `Video call · ${(p.videoPlatform || "").replace("_", " ") || "Link to follow"}`
      : p.locationMode === "PHONE"
      ? "Phone call — we will call you"
      : p.meetingAddress || "In-person (see notes)";

  return {
    subject: `📅 Rescheduled: ${p.eventName} — new time inside`,
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CALENDAR</span></div>
        <h1>Your appointment has been rescheduled</h1>
        <p>Hi ${p.customerName.split(" ")[0]}, your <strong>${p.eventName}</strong> has been moved to a new time. Here are your updated details:</p>
        <div class="facts">
          <div class="fact"><small>NEW DATE &amp; TIME</small><b>${dateStr}</b></div>
          <div class="fact"><small>LOCATION</small><b>${location}</b></div>
        </div>
        <p style="font-size:13px;color:#7a6e70">Need to cancel or change again? Reply to this email.</p>
      </div>
    `),
  };
}

// ── Reminder email ───────────────────────────────────────────────────────────

export function bookingReminderEmail(p: {
  customerName: string;
  eventName: string;
  startsAt: string;
  timezone: string;
  locationMode: string;
  videoPlatform?: string | null;
  meetingAddress?: string | null;
  assignedTo: string;
  hoursUntil: number;
}): { subject: string; html: string } {
  let dateStr = "";
  try {
    dateStr = new Date(p.startsAt).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: p.timezone,
    });
  } catch { dateStr = p.startsAt; }

  const location =
    p.locationMode === "VIDEO"
      ? `Video call · ${(p.videoPlatform || "").replace("_", " ") || "Link to follow"}`
      : p.locationMode === "PHONE"
      ? "Phone call"
      : p.meetingAddress || "In-person";

  const when = p.hoursUntil <= 1 ? "in about an hour" : p.hoursUntil <= 24 ? "tomorrow" : `in ${p.hoursUntil} hours`;

  return {
    subject: `⏰ Reminder: ${p.eventName} ${when}`,
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CALENDAR</span></div>
        <h1>Quick reminder, ${p.customerName.split(" ")[0]}</h1>
        <p>Your <strong>${p.eventName}</strong> is coming up ${when}.</p>
        <div class="facts">
          <div class="fact"><small>DATE &amp; TIME</small><b>${dateStr}</b></div>
          <div class="fact"><small>LOCATION</small><b>${location}</b></div>
          <div class="fact"><small>WITH</small><b>${p.assignedTo}</b></div>
        </div>
      </div>
    `),
  };
}

// ── Workspace invite ─────────────────────────────────────────────────────────

export function workspaceInviteEmail(p: {
  displayName: string;
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  expiresAt: string;
}): { subject: string; html: string } {
  let expiresStr = "";
  try {
    expiresStr = new Date(p.expiresAt).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
  } catch { expiresStr = "7 days"; }

  return {
    subject: `You've been invited to ${p.workspaceName}`,
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CORE</span></div>
        <h1>You&rsquo;re invited, ${p.displayName.split(" ")[0]}!</h1>
        <p><strong>${p.inviterName}</strong> has invited you to join the <strong>${p.workspaceName}</strong> workspace on Cyncro Core.</p>
        <p>Click the button below to set your password and activate your account. This link expires on <strong>${expiresStr}</strong>.</p>
        <a class="btn" href="${p.inviteUrl}">Activate my account →</a>
        <hr>
        <p style="font-size:12px;color:#7a6e70">If you weren't expecting this invite, you can ignore this email.</p>
      </div>
    `),
  };
}

// ── Password reset (placeholder — full flow coming soon) ─────────────────────

export function passwordResetEmail(p: {
  displayName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Reset your Cyncro password",
    html: wrap(`
      <div class="card">
        <div class="logo">Cyncro<span>CORE</span></div>
        <h1>Reset your password</h1>
        <p>Hi ${p.displayName.split(" ")[0]}, we received a request to reset your Cyncro password.</p>
        <a class="btn" href="${p.resetUrl}">Reset password →</a>
        <hr>
        <p style="font-size:12px;color:#7a6e70">If you didn't request this, ignore this email — your password won't change.</p>
      </div>
    `),
  };
}
