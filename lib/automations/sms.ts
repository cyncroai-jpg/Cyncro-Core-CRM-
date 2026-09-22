import { env } from "cloudflare:workers";

const values = () => env as unknown as Record<string, string | undefined>;

/** True when Twilio credentials are on the deployment. */
export function smsConfigured() {
  const v = values();
  return Boolean(v.TWILIO_ACCOUNT_SID && v.TWILIO_AUTH_TOKEN && v.TWILIO_PHONE_NUMBER);
}

/** Sends a text through Twilio's REST API. Returns sent=false with a reason when not configured or rejected. */
export async function sendSms(to: string, body: string): Promise<{ sent: boolean; detail: string }> {
  const v = values();
  if (!smsConfigured()) return { sent: false, detail: "SMS provider not connected (add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)" };
  const digits = to.replace(/[^0-9+]/g, "");
  const e164 = digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${v.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${v.TWILIO_ACCOUNT_SID}:${v.TWILIO_AUTH_TOKEN}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: e164, From: String(v.TWILIO_PHONE_NUMBER), Body: body.slice(0, 1600) }),
    });
    const data = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) return { sent: false, detail: `Twilio rejected: ${data.message || response.status}` };
    return { sent: true, detail: `Twilio ${data.sid || "queued"}` };
  } catch (error) {
    return { sent: false, detail: error instanceof Error ? error.message : "SMS send failed" };
  }
}
