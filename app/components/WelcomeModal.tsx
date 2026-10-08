"use client";
import { useEffect, useState } from "react";

const TZ = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Mexico_City", "Europe/London", "Europe/Paris", "Australia/Sydney"];

/**
 * First-run welcome for a new company owner: company basics in one screen, then
 * three concrete next steps. Shown once per company (remembered in this browser)
 * and only while the workspace is still empty.
 */
export function WelcomeModal({ onView, onOpenCalendar, onFlash }: { onView: (v: string) => void; onOpenCalendar: () => void; onFlash: (m: string) => void }) {
  const [state, setState] = useState<{ tenantId: string; name: string; timezone: string; phone: string; website: string } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [kits, setKits] = useState<{ key: string; name: string; for: string; blurb: string }[]>([]);
  const [kit, setKit] = useState("");
  const [installed, setInstalled] = useState<string>("");
  useEffect(() => {
    void (async () => {
      const a = await fetch("/api/access").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const id = a?.company?.id; if (!id || a?.company?.role !== "OWNER") return;
      try { if (localStorage.getItem(`cyncro.welcome.${id}`) === "1") return; } catch { /* ignore */ }
      const ob = await fetch("/api/crm/onboarding").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!ob || ob.done > 1) return; // they've already started; the checklist takes over
      const s = await fetch("/api/tenants/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      fetch("/api/crm/kits").then((r) => (r.ok ? r.json() : null)).then((j) => j && setKits(j.kits)).catch(() => undefined);
      const row = s?.tenant || s?.company || s || {}; const st = s?.settings || {};
      setState({ tenantId: id, name: String(row.name || ""), timezone: String(st.timezone || "America/New_York"), phone: String(st.phone || ""), website: String(st.website || "") });
    })();
  }, []);
  if (!state) return null;
  const dismiss = () => { try { localStorage.setItem(`cyncro.welcome.${state.tenantId}`, "1"); } catch { /* ignore */ } setState(null); };
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/tenants/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.name, settings: { timezone: state.timezone, phone: state.phone, website: state.website } }) });
    setBusy(false);
    if (!r.ok) return onFlash("Could not save company details");
    setStep(2);
  };
  const go = (v: string) => { dismiss(); if (v === "Calendar") onOpenCalendar(); else onView(v); };
  return (
    <div className="wlBackdrop" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="wlCard">
        {step === 1 ? (
          <>
            <small>WELCOME TO CYNCRO CORE</small>
            <h2>Let's set up {state.name || "your company"}</h2>
            <p>Three details that every booking page, reminder and contract will use. You can change them any time in Team Access.</p>
            <div className="wlGrid">
              <label>Company name<input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="Acme Services" /></label>
              <label>Timezone<select value={state.timezone} onChange={(e) => setState({ ...state, timezone: e.target.value })}>{TZ.map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}</select></label>
              <label>Phone<input value={state.phone} onChange={(e) => setState({ ...state, phone: e.target.value })} placeholder="(555) 555-0100" /></label>
              <label>Website<input value={state.website} onChange={(e) => setState({ ...state, website: e.target.value })} placeholder="https://" /></label>
            </div>
            <div className="wlActions"><button className="coSave" disabled={busy || !state.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save and continue"}</button><button className="cyAiMini" onClick={dismiss}>Skip for now</button></div>
          </>
        ) : (
          <>
            <small>YOU'RE IN</small>
            <h2>What do you want to do first?</h2>
            <p>Each of these takes a couple of minutes. The checklist on your overview keeps track of what's done.</p>
            {kits.length > 0 && (
              <div className="wlKit">
                <small>START WITH A KIT</small>
                <div className="wlKitRow">
                  <select value={kit} onChange={(e) => setKit(e.target.value)}><option value="">Pick your industry…</option>{kits.map((k) => <option key={k.key} value={k.key}>{k.name} · {k.for}</option>)}</select>
                  <button className="coSave" disabled={!kit || busy} onClick={async () => { setBusy(true); const r = await fetch("/api/crm/kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: kit }) }); const j = await r.json().catch(() => ({})); setBusy(false); if (!r.ok) return onFlash(j.error || "Could not install"); const c = j.installed; setInstalled(`${c.stages} pipeline stages, ${c.eventTypes} appointment types, ${c.forms} form, ${c.workflows} automations installed`); onFlash("Starter kit installed"); }}>{busy ? "Installing…" : "Install"}</button>
                </div>
                <span>{installed || (kit ? kits.find((k) => k.key === kit)?.blurb : "A pipeline, appointment types, an intake form and ready-to-run automations for your industry. Edit anything after.")}</span>
              </div>
            )}
            <div className="wlSteps">
              <button onClick={() => go("Contacts")}><i>◎</i><b>Add or import contacts</b><span>Paste a CSV or add one by hand.</span></button>
              <button onClick={() => go("Calendar")}><i>□</i><b>Create a booking link</b><span>Customers pick a time; it lands on your calendar.</span></button>
              <button onClick={() => go("Team Access")}><i>♙</i><b>Invite your team</b><span>Roles, permissions and a secure invite link.</span></button>
              <button onClick={() => go("Contracts")}><i>✎</i><b>Send a contract</b><span>Private signing links, e-signature, audit trail.</span></button>
            </div>
            <div className="wlActions"><button className="cyAiMini" onClick={dismiss}>Just show me the workspace</button></div>
          </>
        )}
      </div>
    </div>
  );
}
