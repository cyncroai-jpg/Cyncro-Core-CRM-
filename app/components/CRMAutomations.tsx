"use client";
import { useEffect, useMemo, useState } from "react";
import { AutomationsDashboard } from "./AutomationsDashboard";
import { StepList, defaultStep, stepIcon, summary, type Step as EditorStep } from "./AutomationSteps";

type Workflow = { id: string; name: string; description: string | null; trigger: string; trigger_filter: string; steps: string; active: number; exit_trigger?: string | null; settings_json?: string | null; enrolled_count: number; completed_count: number; last_run_at: string | null; active_enrollments: number; failed_enrollments: number; updated_at: string };
type Recipe = { key: string; name: string; description: string; trigger: string; steps: number; exitTrigger?: string | null };
type Ev = { id: string; workflow_id: string; workflow_name?: string; contact_name: string | null; step_index: number | null; kind: string; detail: string | null; created_at: string };
type Enrollment = { id: string; contact_name: string | null; status: string; step_index: number; next_run_at: string | null; last_error: string | null; started_at: string };
type Step = { type: string; [k: string]: unknown };
type Payload = { workflows: Workflow[]; events: Ev[]; recipes: Recipe[]; triggers: [string, string][]; stepTypes: [string, string][]; channels: { email: boolean; emailTransport: string; sms: boolean } };
type Contact = { id: string; full_name?: string; name?: string; email?: string | null };

const parse = <T,>(raw: unknown, fb: T): T => { try { return raw ? (JSON.parse(String(raw)) as T) : fb; } catch { return fb; } };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const STAGES = ["NEW LEAD", "QUALIFIED", "DISCOVERY", "PROPOSAL", "CLOSED WON", "CLOSED LOST"];

export function CRMAutomations({ onFlash }: { onFlash: (m: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ enrollments: Enrollment[]; events: Ev[] } | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; trigger: string; filter: Record<string, string>; steps: Step[]; exitTrigger: string; settings: { reenroll: "active" | "once" | "always"; businessHoursOnly: boolean } } | null>(null);
  const [eventTypes, setEventTypes] = useState<{ slug: string; name: string }[]>([]);
  const [bulk, setBulk] = useState({ source: "", lifecycle: "", tag: "" });
  const [openStep, setOpenStep] = useState(-1);
  const [busy, setBusy] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [testContact, setTestContact] = useState("");
  const [tab, setTab] = useState<"dashboard" | "workflows" | "recipes" | "log">("dashboard");

  const load = () => fetch("/api/crm/automations").then((r) => r.json()).then((d: Payload) => setData(d));
  const loadDetail = (id: string) => fetch(`/api/crm/automations?id=${id}`).then((r) => (r.ok ? r.json() : null)).then((d: { enrollments: Enrollment[]; events: Ev[] } | null) => setDetail(d));
  useEffect(() => { void fetch("/api/calendar/event-types").then((r) => (r.ok ? r.json() : null)).then((d: { eventTypes?: { slug: string; name: string }[] } | null) => setEventTypes(d?.eventTypes || [])).catch(() => undefined); }, []);
  useEffect(() => { void load(); void fetch("/api/crm/contacts").then((r) => r.json()).then((d: { contacts?: Contact[] }) => setContacts(d.contacts || [])).catch(() => undefined); }, []);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId]);
  const selected = useMemo(() => data?.workflows.find((w) => w.id === selectedId) || null, [data, selectedId]);
  const triggerLabel = (t: string) => data?.triggers.find((x) => x[0] === t)?.[1] || t;
  const kpis = useMemo(() => ({ total: data?.workflows.length || 0, active: data?.workflows.filter((w) => w.active).length || 0, running: data?.workflows.reduce((s, w) => s + Number(w.active_enrollments || 0), 0) || 0, completed: data?.workflows.reduce((s, w) => s + Number(w.completed_count || 0), 0) || 0, failed: data?.workflows.reduce((s, w) => s + Number(w.failed_enrollments || 0), 0) || 0 }), [data]);

  const startNew = () => { setEditing({ name: "", description: "", trigger: "CONTACT_CREATED", filter: {}, exitTrigger: "", settings: { reenroll: "active", businessHoursOnly: false }, steps: [{ type: "SEND_EMAIL", subject: "Thanks, {{contact.first_name}}", body: "Hi {{contact.first_name}},\n\nThanks for reaching out to {{company.name}}." }] }); setOpenStep(0); };
  const startEdit = (w: Workflow) => { const st = parse<{ reenroll?: string; businessHoursOnly?: boolean }>(w.settings_json, {}); setEditing({ id: w.id, name: w.name, description: w.description || "", trigger: w.trigger, filter: parse<Record<string, string>>(w.trigger_filter, {}), exitTrigger: w.exit_trigger || "", settings: { reenroll: st.reenroll === "once" || st.reenroll === "always" ? st.reenroll : "active", businessHoursOnly: Boolean(st.businessHoursOnly) }, steps: parse<Step[]>(w.steps, []) }); setOpenStep(-1); };
  const bulkEnroll = async () => {
    if (!selected) return;
    const desc = [bulk.source && `source ${bulk.source}`, bulk.lifecycle && `lifecycle ${bulk.lifecycle}`, bulk.tag && `tag ${bulk.tag}`].filter(Boolean).join(", ") || "every contact";
    if (!window.confirm(`Enroll ${desc} in "${selected.name}" now? Emails and texts in it will really send.`)) return;
    setBusy("bulk");
    const r = await fetch("/api/crm/automations?action=enroll_many", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowId: selected.id, filter: bulk }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not bulk enroll"); return; }
    onFlash(`Enrolled ${b.enrolled} of ${b.matched} matching contacts${b.skipped ? ` · ${b.skipped} skipped by the re-enroll rule` : ""}`); await load(); await loadDetail(selected.id);
  };
  const useRecipe = async (key: string) => {
    setBusy(key);
    const r = await fetch("/api/crm/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe: key }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not add recipe"); return; }
    onFlash(`"${b.name}" added and switched on`); await load(); setSelectedId(b.id); setTab("workflows");
  };
  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { onFlash("Give the workflow a name"); return; }
    if (!editing.steps.length) { onFlash("Add at least one step"); return; }
    setBusy("save");
    const body = { id: editing.id, name: editing.name, description: editing.description, trigger: editing.trigger, triggerFilter: editing.filter, steps: editing.steps, exitTrigger: editing.exitTrigger || null, settings: editing.settings };
    const r = await fetch("/api/crm/automations", { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not save"); return; }
    onFlash(editing.id ? "Workflow saved" : "Workflow created and switched on"); setEditing(null); await load(); if (b.id) setSelectedId(b.id); else if (editing.id) void loadDetail(editing.id);
  };
  const toggle = async (w: Workflow) => {
    const r = await fetch("/api/crm/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id, active: !w.active }) });
    if (!r.ok) { onFlash("Could not update"); return; }
    onFlash(w.active ? `"${w.name}" paused` : `"${w.name}" switched on`); await load();
  };
  const remove = async (w: Workflow) => {
    if (!window.confirm(`Delete "${w.name}"? Anyone mid-workflow stops.`)) return;
    const r = await fetch(`/api/crm/automations?id=${w.id}`, { method: "DELETE" });
    if (!r.ok) { onFlash("Could not delete"); return; }
    onFlash("Workflow deleted"); if (selectedId === w.id) setSelectedId(""); await load();
  };
  const testRun = async () => {
    if (!selected || !testContact) return;
    setBusy("test");
    const r = await fetch("/api/crm/automations?action=enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowId: selected.id, contactId: testContact }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not run"); return; }
    onFlash(b.enrollment?.status === "FAILED" ? `Stopped: ${b.enrollment.last_error}` : b.enrollment?.status === "DONE" ? "Ran all steps" : "Running · waiting on a delay"); await load(); await loadDetail(selected.id);
  };
  const runDue = async () => { setBusy("run"); const r = await fetch("/api/crm/automations?action=run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const b = await r.json().catch(() => ({})); setBusy(""); onFlash(`Resumed ${b.resumed ?? 0} waiting`); await load(); if (selectedId) void loadDetail(selectedId); };

  const addStep = (type: string) => setEditing((e) => { if (!e) return e; const steps = [...e.steps, defaultStep(type) as Step]; setOpenStep(steps.length - 1); return { ...e, steps }; });

  return (
    <div className="auHub">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Automations</b><small>{kpis.active} running workflows · {kpis.running} people mid-workflow · email {data?.channels.email ? `on (${data.channels.emailTransport})` : "off"} · texting {data?.channels.sms ? "on" : "logs only until Twilio is added"}</small></div>
        <div className="fxLendChips">
          {(["dashboard", "workflows", "recipes", "log"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "dashboard" ? "Dashboard" : t === "workflows" ? "Workflows" : t === "recipes" ? "Recipes" : "Activity log"}</button>)}
        </div>
        <div className="fxCCActions"><button onClick={() => void runDue()} disabled={busy === "run"} title="The scheduler does this every 5 minutes">Resume waiting now</button><button className="fxCCPrimary" onClick={startNew}>+ New workflow</button></div>
      </div>

      {editing ? (
        <section className="fxCCPanel fxCCHero auBuilder">
          <div className="fxCCHead"><div><b>{editing.id ? "Edit workflow" : "New workflow"}</b><small>Trigger → steps, top to bottom. Waits pause the person; the scheduler resumes them.</small></div><button className="fxCCMini" onClick={() => setEditing(null)}>Close</button></div>
          <div className="auBuilderGrid">
            <div className="auBuilderLeft">
              <label className="dxSchField">Name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="New lead nurture" /></label>
              <label className="dxSchField">Description<input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="What this does, for your team" /></label>
              <label className="dxSchField">When this happens<select value={editing.trigger} onChange={(e) => setEditing({ ...editing, trigger: e.target.value, filter: {} })}>{(data?.triggers || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {editing.trigger === "DEAL_STAGE_CHANGED" && <label className="dxSchField">Only for stage<select value={editing.filter.stage || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, stage: e.target.value } })}><option value="">Any stage</option>{STAGES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select></label>}
              {editing.trigger === "CONTACT_CREATED" && <label className="dxSchField">Only from source<input value={editing.filter.source || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, source: e.target.value } })} placeholder="any · e.g. WEBSITE, CSV_IMPORT, PROSPECTING" /></label>}
              {editing.trigger === "TAG_ADDED" && <label className="dxSchField">Only for tag<input value={editing.filter.tag || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, tag: e.target.value } })} placeholder="any" /></label>}
              {editing.trigger === "BOOKING_UPCOMING" && <div className="auRow"><label className="dxSchField">Hours before<select value={editing.filter.hoursBefore || "24"} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, hoursBefore: e.target.value } })}>{["1", "2", "4", "24", "48", "72"].map((h) => <option key={h} value={h}>{h}h</option>)}</select></label><label className="dxSchField">Appointment type<select value={editing.filter.eventSlug || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, eventSlug: e.target.value } })}><option value="">any</option>{eventTypes.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select></label></div>}
              {editing.trigger === "DEAL_STALE" && <div className="auRow"><label className="dxSchField">Untouched for (days)<input type="number" min={1} value={editing.filter.days || "7"} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, days: e.target.value } })} /></label><label className="dxSchField">Only in stage<select value={editing.filter.stage || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, stage: e.target.value } })}><option value="">any open stage</option>{STAGES.filter((x) => !x.startsWith("CLOSED")).map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}</select></label></div>}
              {editing.trigger === "INVOICE_OVERDUE" && <label className="dxSchField">Days after due date<input type="number" min={0} value={editing.filter.daysAfter || "1"} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, daysAfter: e.target.value } })} /></label>}
              {editing.trigger === "CONTACT_UPDATED" && <label className="dxSchField">Only when this changes<select value={editing.filter.field || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, field: e.target.value } })}><option value="">any of lifecycle, rep, email, phone</option><option value="lifecycle">lifecycle</option><option value="assigned_rep">assigned rep</option><option value="email">email</option><option value="phone">phone</option></select></label>}
              {(editing.trigger === "FORM_SUBMITTED" || editing.trigger === "BOOKING_CREATED" || editing.trigger === "BOOKING_NO_SHOW" || editing.trigger === "BOOKING_CANCELLED") && <label className="dxSchField">Only from source<input value={editing.filter.source || ""} onChange={(e) => setEditing({ ...editing, filter: { ...editing.filter, source: e.target.value } })} placeholder="any (e.g. STUDIO, FORM)" /></label>}
              <div className="auGoal">
                <small>GOAL · EXIT EARLY</small>
                <select value={editing.exitTrigger} onChange={(e) => setEditing({ ...editing, exitTrigger: e.target.value })}><option value="">No goal (run every step)</option>{(data?.triggers || []).filter((t) => !["MANUAL", "BOOKING_UPCOMING", "DEAL_STALE", "INVOICE_OVERDUE", editing.trigger].includes(t[0])).map(([k, l]) => <option key={k} value={k}>Stop when: {l}</option>)}</select>
                <label className="auCheck"><input type="checkbox" checked={editing.settings.businessHoursOnly} onChange={(e) => setEditing({ ...editing, settings: { ...editing.settings, businessHoursOnly: e.target.checked } })} /> Only send emails and texts during business hours</label>
                <label className="dxSchField">Re-enrollment<select value={editing.settings.reenroll} onChange={(e) => setEditing({ ...editing, settings: { ...editing.settings, reenroll: e.target.value as "active" | "once" | "always" } })}><option value="active">Not while they're already in it</option><option value="once">Only ever once per contact</option><option value="always">Every time the trigger fires</option></select></label>
              </div>
              <div className="auPalette">
                <small>ADD A STEP</small>
                <div>{(data?.stepTypes || []).map(([k, l]) => <button key={k} onClick={() => addStep(k)}><i>{stepIcon(k)}</i>{l}</button>)}</div>
              </div>
            </div>
            <div className="auSteps">
              <div className="auStep trigger"><i>⚡</i><div><b>{triggerLabel(editing.trigger)}</b><small>{Object.entries(editing.filter).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(" · ") || "no filter"}</small></div></div>
              <StepList steps={editing.steps as EditorStep[]} onChange={(steps) => setEditing((e) => (e ? { ...e, steps: steps as Step[] } : e))} ctx={{ stepTypes: data?.stepTypes || [], triggers: data?.triggers || [], channels: { email: Boolean(data?.channels.email), sms: Boolean(data?.channels.sms) }, workflows: (data?.workflows || []).filter((w) => w.id !== editing.id).map((w) => ({ id: w.id, name: w.name })), eventTypes, stages: STAGES }} />
            </div>
          </div>
          <div className="fxInvSave"><button onClick={() => setEditing(null)}>Cancel</button><button className="fxCCPrimary" disabled={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Saving…" : editing.id ? "Save workflow" : "Create and switch on"}</button></div>
        </section>
      ) : tab === "dashboard" ? (
        <div className="auDashWrap"><AutomationsDashboard triggerLabel={triggerLabel} onOpen={(id) => { setSelectedId(id); setTab("workflows"); }} /></div>
      ) : tab === "recipes" ? (
        <section className="fxCCPanel auRecipes">
          <div className="fxCCHead"><div><b>Recipes</b><small>One click adds the workflow switched on. Edit anything after.</small></div></div>
          <div className="auRecipeGrid">
            {(data?.recipes || []).map((r) => (
              <article key={r.key}><small>{triggerLabel(r.trigger)}{r.exitTrigger ? ` · exits on ${triggerLabel(r.exitTrigger)}` : ""}</small><b>{r.name}</b><p>{r.description}</p><div><span>{r.steps} steps</span><button className="fxCCPrimary" disabled={busy === r.key} onClick={() => void useRecipe(r.key)}>{busy === r.key ? "Adding…" : "Use recipe"}</button></div></article>
            ))}
          </div>
        </section>
      ) : tab === "log" ? (
        <section className="fxCCPanel auLog">
          <div className="fxCCHead"><div><b>Activity log</b><small>every step that ran, newest first</small></div></div>
          <ul className="auEvents">
            {(data?.events || []).map((e) => <li key={e.id} className={e.kind.toLowerCase()}><i>{stepIcon(e.kind)}</i><b>{e.workflow_name}</b><span>{e.contact_name || "—"} · {e.kind.toLowerCase()}{e.step_index !== null ? ` #${e.step_index + 1}` : ""} · {e.detail}</span><small>{when(e.created_at)}</small></li>)}
            {data && !data.events.length && <li className="dim">Nothing has run yet.</li>}
          </ul>
        </section>
      ) : (
        <>
          <section className="fxCCPanel auList">
            <div className="fxCCHead"><div><b>Workflows</b><small>{data?.workflows.length || 0} total · click one for its runs</small></div></div>
            <div className="auCards">
              {(data?.workflows || []).map((w) => {
                const steps = parse<Step[]>(w.steps, []);
                return (
                  <article key={w.id} className={`${w.id === selectedId ? "sel" : ""} ${w.active ? "" : "off"}`} onClick={() => setSelectedId(w.id)}>
                    <div className="auCardHead"><div><b>{w.name}</b><small>{triggerLabel(w.trigger)}</small></div><button className={`fxLendSwitch ${w.active ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); void toggle(w); }} aria-label={w.active ? "Pause" : "Switch on"}><i /></button></div>
                    <div className="auChain">{steps.slice(0, 8).map((s, i) => <i key={i} title={summary(s)} className={s.type === "WAIT" ? "wait" : ""}>{stepIcon(s.type)}</i>)}{steps.length > 8 && <i>…</i>}</div>
                    <div className="auCardFoot"><span>{w.enrolled_count} enrolled</span><span>{w.active_enrollments} running</span><span>{w.completed_count} done</span>{Number(w.failed_enrollments) > 0 && <span className="bad">{w.failed_enrollments} failed</span>}</div>
                  </article>
                );
              })}
              {data && !data.workflows.length && <div className="fxCCEmpty">No workflows yet. Start from a recipe or build one.</div>}
            </div>
          </section>
          <aside className={`fxCCPanel ${selected ? "fxCCHero" : ""} auDetail`}>
            {selected ? (
              <>
                <div className="fxCCHead"><div><b>{selected.name}</b><small>{selected.description || triggerLabel(selected.trigger)}</small></div><div className="cvPaneActions"><button className="fxCCMini" onClick={() => startEdit(selected)}>Edit</button><button className="fxCCMini danger" onClick={() => void remove(selected)}>Delete</button></div></div>
                <div className="auTest"><select value={testContact} onChange={(e) => setTestContact(e.target.value)}><option value="">Test with a contact…</option>{contacts.slice(0, 200).map((c) => <option key={c.id} value={c.id}>{c.full_name || c.name}</option>)}</select><button className="fxCCPrimary" disabled={!testContact || busy === "test"} onClick={() => void testRun()}>Run now</button></div>
                <small className="auHint">Runs every step for that one contact right now, including real emails. Waits still wait.</small>
                {selected.exit_trigger && <div className="auGoalPill">◉ Goal: stops when "{triggerLabel(selected.exit_trigger)}"</div>}
                <div className="auBulk">
                  <small>BULK ENROLL · pick who, then run</small>
                  <div className="auRow three"><input value={bulk.source} onChange={(e) => setBulk({ ...bulk, source: e.target.value })} placeholder="source (e.g. WEBSITE)" /><select value={bulk.lifecycle} onChange={(e) => setBulk({ ...bulk, lifecycle: e.target.value })}><option value="">any lifecycle</option>{["LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER", "CHURNED"].map((l) => <option key={l} value={l}>{l.toLowerCase()}</option>)}</select><input value={bulk.tag} onChange={(e) => setBulk({ ...bulk, tag: e.target.value })} placeholder="tag" /></div>
                  <button className="fxCCMini" disabled={busy === "bulk"} onClick={() => void bulkEnroll()}>{busy === "bulk" ? "Enrolling…" : "Enroll everyone matching"}</button>
                </div>
                <div className="auEnroll">
                  <small>PEOPLE IN THIS WORKFLOW · {detail?.enrollments.length ?? 0}</small>
                  <ul>
                    {(detail?.enrollments || []).slice(0, 12).map((e) => <li key={e.id}><span className={`fxPill ${e.status === "DONE" ? "green" : e.status === "FAILED" ? "amber" : e.status === "ACTIVE" ? "red" : ""}`}>{e.status.toLowerCase()}</span><b>{e.contact_name || "—"}</b><small>step {e.step_index}{e.next_run_at ? ` · resumes ${when(e.next_run_at)}` : ""}{e.last_error ? ` · ${e.last_error}` : ""}</small></li>)}
                    {detail && !detail.enrollments.length && <li className="dim">Nobody yet. It fires when "{triggerLabel(selected.trigger)}" happens.</li>}
                  </ul>
                </div>
                <div className="auEnroll">
                  <small>RECENT STEPS</small>
                  <ul className="auEvents compact">
                    {(detail?.events || []).slice(0, 15).map((e) => <li key={e.id} className={e.kind.toLowerCase()}><i>{stepIcon(e.kind)}</i><span>{e.contact_name || "—"} · {e.detail}</span><small>{when(e.created_at)}</small></li>)}
                  </ul>
                </div>
              </>
            ) : (
              <div className="fxCCEmpty">Pick a workflow to see who's in it and what ran.</div>
            )}
          </aside>
        </>
      )}

      {tab !== "dashboard" && <div className="fxCCKpis fxInvKpis auKpis">
        <article><i>⚡</i><div><small>WORKFLOWS</small><b>{kpis.total}</b><span>{kpis.active} switched on</span></div></article>
        <article><i>◎</i><div><small>PEOPLE MID-WORKFLOW</small><b>{kpis.running}</b><span>waiting on a step</span></div></article>
        <article><i>✓</i><div><small>COMPLETED</small><b>{kpis.completed}</b><span>all steps finished</span></div></article>
        <article><i>!</i><div><small>FAILED</small><b>{kpis.failed}</b><span>see the log for why</span></div></article>
        <article><i>✉</i><div><small>CHANNELS</small><b>{data ? `${data.channels.email ? "Email" : "—"}${data.channels.sms ? " + SMS" : ""}` : "—"}</b><span>{data?.channels.sms ? "email + texting live" : data?.channels.email ? "texting needs Twilio" : "connect email + Twilio"}</span></div></article>
      </div>}
    </div>
  );
}
