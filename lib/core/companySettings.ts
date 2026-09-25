/** Per-company settings stored on tenants.settings_json. */
import { coreDb } from "@/lib/core/db";

export type BusinessHours = { days: number[]; start: string; end: string };
export type CompanySettings = {
  timezone: string; businessHours: BusinessHours; logoUrl: string; phone: string; website: string; address: string;
  senderName: string; replyTo: string; brandColor: string; bookingIntro: string;
};
export const DEFAULT_SETTINGS: CompanySettings = {
  timezone: "America/New_York", businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }, logoUrl: "", phone: "", website: "", address: "",
  senderName: "", replyTo: "", brandColor: "#a91f39", bookingIntro: "",
};
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function parseSettings(raw: unknown): CompanySettings {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") { try { o = JSON.parse(raw) as Record<string, unknown>; } catch { o = {}; } } else if (raw && typeof raw === "object") o = raw as Record<string, unknown>;
  const bh = (o.businessHours && typeof o.businessHours === "object" ? o.businessHours : {}) as Record<string, unknown>;
  const days = Array.isArray(bh.days) ? [...new Set(bh.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : DEFAULT_SETTINGS.businessHours.days;
  let timezone = clean(o.timezone, 60) || DEFAULT_SETTINGS.timezone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { timezone = DEFAULT_SETTINGS.timezone; }
  const color = clean(o.brandColor, 9);
  return {
    timezone,
    businessHours: { days: days.length ? days : DEFAULT_SETTINGS.businessHours.days, start: isTime(clean(bh.start, 5)) ? clean(bh.start, 5) : "09:00", end: isTime(clean(bh.end, 5)) ? clean(bh.end, 5) : "17:00" },
    logoUrl: /^https?:\/\//.test(clean(o.logoUrl, 500)) ? clean(o.logoUrl, 500) : "", phone: clean(o.phone, 40), website: clean(o.website, 200), address: clean(o.address, 300),
    senderName: clean(o.senderName, 120), replyTo: clean(o.replyTo, 160).toLowerCase(), brandColor: /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_SETTINGS.brandColor, bookingIntro: clean(o.bookingIntro, 400),
  };
}

export async function companySettings(tenantId: string): Promise<CompanySettings> {
  const row = await coreDb().prepare("SELECT settings_json FROM tenants WHERE id=?").bind(tenantId).first<{ settings_json: string | null }>();
  return parseSettings(row?.settings_json);
}

/** Local wall-clock parts for a moment in the company's timezone. */
export function localParts(at: Date, timezone: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

/** True when `at` falls inside the company's business hours. */
export function withinBusinessHours(at: Date, s: CompanySettings): boolean {
  const p = localParts(at, s.timezone);
  if (!s.businessHours.days.includes(p.weekday)) return false;
  const mins = p.hour * 60 + p.minute; const [sh, sm] = s.businessHours.start.split(":").map(Number); const [eh, em] = s.businessHours.end.split(":").map(Number);
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

/** The next moment at or after `from` that is inside business hours (walks forward in 15-minute steps, max 14 days). */
export function nextBusinessMoment(from: Date, s: CompanySettings): Date {
  const t = new Date(from);
  for (let i = 0; i < 14 * 96; i++) { if (withinBusinessHours(t, s)) return t; t.setMinutes(t.getMinutes() + 15, 0, 0); }
  return from;
}

/** The next moment at or after `from` that is at `hh:mm` local time on an allowed weekday (or any day when `days` is empty). */
export function nextLocalTime(from: Date, hhmm: string, days: number[], timezone: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(from); t.setSeconds(0, 0);
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const p = localParts(t, timezone);
    if (p.hour === h && p.minute === m && (!days.length || days.includes(p.weekday)) && t.getTime() >= from.getTime()) return t;
    t.setMinutes(t.getMinutes() + 1);
  }
  return from;
}
