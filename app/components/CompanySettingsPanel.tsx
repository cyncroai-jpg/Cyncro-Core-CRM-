"use client";
import { useEffect, useState } from "react";

type BH = { days: number[]; start: string; end: string };
type Settings = { timezone: string; businessHours: BH; logoUrl: string; phone: string; website: string; address: string; senderName: string; replyTo: string; brandColor: string; bookingIntro: string };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "America/Mexico_City", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

/** Company profile: the settings that booking pages, reminders and automations read (timezone, hours, branding, sender). */
export function CompanySettingsPanel({ onFlash }: { onFlash: (m: string) => void }) {
  const [name, setName] = useState("");
  const [s, setS] = useState<Settings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { void fetch("/api/tenants/settings").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!d) return; setName(String(d.company?.name || "")); setS(d.settings); setCanEdit(Boolean(d.canEdit)); }); }, []);
  if (!s) return null;
  const set = (patch: Partial<Settings>) => { setS({ ...s, ...patch }); setDirty(true); };
  const save = async () => {
    setSaving(true);
    const r = await fetch("/api/tenants/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, settings: s }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { onFlash(d.error || "Could not save company settings"); return; }
    setS(d.settings); setDirty(false); onFlash("Company settings saved");
  };
  const local = (() => { try { return new Date().toLocaleTimeString([], { timeZone: s.timezone, hour: "numeric", minute: "2-digit" }); } catch { return ""; } })();
  return (
    <section className="crmPanel coSettings">
      <div className="crmPanelHead"><div><small>COMPANY PROFILE</small><h2>{name || "Your company"}</h2><p>Booking pages, reminders and automations read these. Time now in your zone: {local}.</p></div>{canEdit && <button className="coSave" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>}</div>
      <div className="coGrid">
        <label>Company name<input value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
        <label>Timezone<select value={s.timezone} disabled={!canEdit} onChange={(e) => set({ timezone: e.target.value })}>{[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select></label>
        <label>Phone<input value={s.phone} disabled={!canEdit} onChange={(e) => set({ phone: e.target.value })} placeholder="(555) 555-0100" /></label>
        <label>Website<input value={s.website} disabled={!canEdit} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></label>
        <label className="wide">Address<input value={s.address} disabled={!canEdit} onChange={(e) => set({ address: e.target.value })} placeholder="Street, city, state" /></label>
        <label>Logo URL<input value={s.logoUrl} disabled={!canEdit} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://…/logo.png" /></label>
        <label>Brand color<span className="coColor"><input type="color" value={s.brandColor} disabled={!canEdit} onChange={(e) => set({ brandColor: e.target.value })} /><input value={s.brandColor} disabled={!canEdit} onChange={(e) => set({ brandColor: e.target.value })} /></span></label>
        <label>Email sender name<input value={s.senderName} disabled={!canEdit} onChange={(e) => set({ senderName: e.target.value })} placeholder={name || "Your company"} /></label>
        <label>Reply-to email<input value={s.replyTo} disabled={!canEdit} onChange={(e) => set({ replyTo: e.target.value })} placeholder="hello@yourcompany.com" /></label>
        <label className="wide">Booking page intro<input value={s.bookingIntro} disabled={!canEdit} onChange={(e) => set({ bookingIntro: e.target.value })} placeholder="Pick a time and we'll confirm right away." /></label>
        <div className="wide coHours">
          <small>BUSINESS HOURS · automations can hold messages until you're open</small>
          <div className="coDays">{DAYS.map((d, i) => <button key={d} type="button" className={s.businessHours.days.includes(i) ? "on" : ""} disabled={!canEdit} onClick={() => set({ businessHours: { ...s.businessHours, days: s.businessHours.days.includes(i) ? s.businessHours.days.filter((x) => x !== i) : [...s.businessHours.days, i].sort() } })}>{d}</button>)}</div>
          <div className="coRange"><input type="time" value={s.businessHours.start} disabled={!canEdit} onChange={(e) => set({ businessHours: { ...s.businessHours, start: e.target.value } })} /><span>to</span><input type="time" value={s.businessHours.end} disabled={!canEdit} onChange={(e) => set({ businessHours: { ...s.businessHours, end: e.target.value } })} /></div>
        </div>
      </div>
    </section>
  );
}
