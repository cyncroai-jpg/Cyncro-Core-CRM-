"use client";
import { useEffect, useState } from "react";

type Status = { enabled: boolean; enabledAt: string | null; backupCodesLeft: number; companyRequires: boolean };
type Session = { id: string; device: string; ip: string | null; created_at: string; last_seen_at: string; current: boolean };

/** Personal security: two-factor sign-in (authenticator app + backup codes) and where you're signed in. */
export function SecurityPanel({ onFlash, compact }: { onFlash: (m: string) => void; compact?: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState("");
  const load = async () => {
    const [a, b] = await Promise.all([fetch("/api/auth/2fa").then((r) => (r.ok ? r.json() : null)), fetch("/api/auth/sessions").then((r) => (r.ok ? r.json() : null))]);
    if (a) setSt(a); if (b) setSessions(b.sessions || []);
  };
  useEffect(() => { void load(); }, []);
  const post = async (action: string, body: Record<string, unknown>) => { const r = await fetch(`/api/auth/2fa?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); return { ok: r.ok, d }; };
  const start = async () => { setBusy("setup"); const { ok, d } = await post("setup", {}); setBusy(""); if (!ok) return onFlash(d.error || "Could not start setup"); setSetup(d); setCode(""); };
  const verify = async () => { setBusy("verify"); const { ok, d } = await post("verify", { code }); setBusy(""); if (!ok) return onFlash(d.error || "Wrong code"); setCodes(d.backupCodes); setSetup(null); setCode(""); await load(); onFlash("Two-factor is on"); };
  const disable = async () => { setBusy("disable"); const { ok, d } = await post("disable", { password: pw }); setBusy(""); if (!ok) return onFlash(d.error || "Could not turn off"); setPw(""); setCodes(null); await load(); onFlash("Two-factor is off"); };
  const regen = async () => { setBusy("codes"); const { ok, d } = await post("codes", { code }); setBusy(""); if (!ok) return onFlash(d.error || "Enter a current code first"); setCodes(d.backupCodes); setCode(""); await load(); };
  const signOut = async (id: string | "others") => { await fetch(`/api/auth/sessions?${id === "others" ? "others=1" : `id=${id}`}`, { method: "DELETE" }); await load(); onFlash(id === "others" ? "Signed out everywhere else" : "Session signed out"); };
  if (!st) return null;
  return (
    <div className={`secPanel ${compact ? "compact" : ""}`}>
      <div className="secBlock">
        <div className="secHead"><div><small>TWO-FACTOR SIGN-IN</small><b>{st.enabled ? "On" : "Off"}{st.companyRequires && !st.enabled ? " · required by your company" : ""}</b></div>{st.enabled ? <span className="fxPill green">PROTECTED</span> : <span className="fxPill amber">PASSWORD ONLY</span>}</div>
        {!st.enabled && !setup && <><p>Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, Apple Passwords) every time you sign in.</p><button className="coSave" disabled={busy === "setup"} onClick={() => void start()}>{busy === "setup" ? "Starting…" : "Turn on two-factor"}</button></>}
        {setup && (
          <div className="secSetup">
            <p><b>1.</b> In your authenticator app choose "Add account" → "Enter a setup key", or scan the link below where supported.</p>
            <div className="secKey"><small>SETUP KEY</small><code>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code><small>ACCOUNT LINK</small><code>{setup.otpauth}</code></div>
            <p><b>2.</b> Enter the 6-digit code the app shows now.</p>
            <div className="secRow"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" /><button className="coSave" disabled={code.length !== 6 || busy === "verify"} onClick={() => void verify()}>{busy === "verify" ? "Checking…" : "Verify and turn on"}</button><button className="cyAiMini" onClick={() => setSetup(null)}>Cancel</button></div>
          </div>
        )}
        {codes && <div className="secCodes"><b>Backup codes. Save these somewhere safe; each works once if you lose your phone.</b><div>{codes.map((c) => <code key={c}>{c}</code>)}</div></div>}
        {st.enabled && !codes && (
          <div className="secManage">
            <span>{st.backupCodesLeft} backup code{st.backupCodesLeft === 1 ? "" : "s"} left{st.enabledAt ? ` · on since ${new Date(st.enabledAt).toLocaleDateString()}` : ""}</span>
            <div className="secRow"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="current code" /><button className="cyAiMini" disabled={code.length !== 6 || busy === "codes"} onClick={() => void regen()}>New backup codes</button></div>
            {!st.companyRequires && <div className="secRow"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="current password" /><button className="cyAiMini danger" disabled={!pw || busy === "disable"} onClick={() => void disable()}>Turn off</button></div>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="secBlock">
          <div className="secHead"><div><small>WHERE YOU'RE SIGNED IN</small><b>{sessions.length} active session{sessions.length === 1 ? "" : "s"}</b></div>{sessions.length > 1 && <button className="cyAiMini" onClick={() => void signOut("others")}>Sign out everywhere else</button>}</div>
          <ul className="secSessions">
            {sessions.map((s) => <li key={s.id} className={s.current ? "me" : ""}><b>{s.device}{s.current ? " · this device" : ""}</b><span>{s.ip || "unknown address"} · active {new Date(s.last_seen_at).toLocaleString()}</span>{!s.current && <button className="dangerText" onClick={() => void signOut(s.id)}>Sign out</button>}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Blocks the app until the person turns on two-factor when their company requires it. */
export function SecurityGate({ onFlash }: { onFlash: (m: string) => void }) {
  const [needs, setNeeds] = useState(false);
  useEffect(() => { void fetch("/api/auth/2fa").then((r) => (r.ok ? r.json() : null)).then((d: Status | null) => { if (d) setNeeds(d.companyRequires && !d.enabled); }).catch(() => undefined); }, []);
  if (!needs) return null;
  return (
    <div className="secGate">
      <div className="secGateCard">
        <small>REQUIRED BY YOUR COMPANY</small><h2>Turn on two-factor sign-in to continue</h2>
        <p>Your company requires a second step at sign-in. It takes about a minute with any authenticator app.</p>
        <SecurityPanel compact onFlash={(m) => { onFlash(m); void fetch("/api/auth/2fa").then((r) => r.json()).then((d: Status) => setNeeds(d.companyRequires && !d.enabled)); }} />
        <button className="cyAiMini" onClick={() => { document.cookie = "cyncro_session=;Max-Age=0;path=/"; window.location.href = "/login"; }}>Sign out instead</button>
      </div>
    </div>
  );
}
