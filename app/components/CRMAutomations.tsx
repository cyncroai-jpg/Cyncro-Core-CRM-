"use client";
import { useEffect, useMemo, useState } from "react";

type Workflow = { id: string; name: string; description: string | null; trigger: string; trigger_filter: string; steps: string; active: number; enrolled_count: number; completed_count: number; last_run_at: string | null; active_enrollments: number; failed_enrollments: number; updated_at: string };
type Recipe = { key: string; name: string; description: string; trigger: string; steps: number };
type Ev = { id: string; workflow_id: string; workflow_name?: string; contact_name: string | null; step_index: number | null; kind: string; detail: string | null; created_at: string };
type Enrollment = { id: string; contact_name: string | null; status: string; step_index: number; next_run_at: string | null; last_error: string | null; started_at: string };
type Step = { type: string; [k: string]: unknown };
type Payload = { workflows: Workflow[]; events: Ev[]; recipes: Recipe[]; triggers: [string, string][]; stepTypes: [string, string][]; channels: { email: boolean; emailTransport: string; sms: boolean } };
type Contact = { id: string; full_name?: string; name?: string; email?: string | null };

const parse = <T,>(raw: unknown, fb: T): T => { try { return raw ? (JSON.parse(String(raw)) as T) : fb; } catch { return fb; } };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const stepIcon = (t: string) => ({ SEND_EMAIL: "✉", SEND_SMS: "▭", WAIT: "◷", IF: "?", ADD_TAG: "#", REMOVE_TAG: "#", CREATE_TASK: "☐", ADD_NOTE: "≡", ASSIGN_REP: "◎", MOVE_STAGE: "→", SET_LIFECYCLE: "◆", NOTIFY_TEAM: "!", WEBHOOK: "⇄", END: "■" } as Record<string, string>)[t] || "•";
const VARS = ["{{contact.first_name}}", "{{contact.name}}", "{{company.name}}", "{{rep}}", "{{booking.time}}", "{{booking.event}}", "{{deal.name}}", "{{job.service}}"];
const STAGES = ["NEW LEAD", "QUALIFIED", "DISCOVERY", "PROPOSAL", "CLOSED WON", "CLOSED LOST"];

function summary(step: Step) {
  const s = (k: string) => String(step[k] ?? "");
  switch (step.type) {
    case "SEND_EMAIL": return s("subject") || "(no subject)";
    case "SEND_SMS": return s("body").slice(0, 70) || "(empty text)";
    case "WAIT": return `${s("amount") || 0} ${s("unit") || "hours"}`;
    case "IF": return `${s("field")} ${s("op") || "equals"} ${s("value")}`;
    case "ADD_TAG": case "REMOVE_TAG": return s("tag");
    case "CREATE_TASK": return s("title") || "Follow up";
    case "ADD_NOTE": return s("text").slice(0, 70);
    case "ASSIGN_REP": return s("rep") || "(pick teammate)";
    case "MOVE_STAGE": return s("stage");
    case "SET_LIFECYCLE": return s("lifecycle");
    case "NOTIFY_TEAM": return `${s("to") || "assigned rep"}: ${s("message").slice(0, 50)}`;
    case "WEBHOOK": return s("url");
    default: return "";
  }
}

export function CRMAutomations({ onFlash }: { onFlash: (m: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ enrollments: Enrollment[]; events: Ev[] } | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; trigger: string; filter: Record<string, string>; steps: Step[] } | null>(null);
  const [openStep, setOpenStep] = useState(-1);
  const [busy, setBusy] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [testContact, setTestContact] = useState("");
  const [tab, setTab] = useState<"workflows" | "recipes" | "log">("workflows");

  const load = () => fetch("/api/crm/automations").then((r) => r.json()).then((d: Payload) => setData(d));
  const loadDetail = (id: string) => fetch(`/api/crm/automations?id=${id}`).then((r) => (r.ok ? r.json() : null)).then((d: { enrollments: Enrollment[]; events: Ev[] } | null) => setDetail(d));
  useEffect(() => { void load(); void fetch("/api/crm/contacts").then((r) => r.json()).then((d: { contacts?: Contact[] }) => setContacts(d.contacts || [])).catch(() => undefined); }, []);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId]);
  const selected = useMemo(() => data?.workflows.find((w) => w.id === selectedId) || null, [data, selectedId]);
  const triggerLabel = (t: string) => data?.triggers.find((x) => x[0] === t)?.[1] || t;
  const kpis = useMemo(() => ({ total: data?.workflows.length || 0, active: data?.workflows.filter((w) => w.active).length || 0, running: data?.workflows.reduce((s, w) => s + Number(w.active_enrollments || 0), 0) || 0, completed: data?.workflows.reduce((s, w) => s + Number(w.completed_count || 0), 0) || 0, failed: data?.workflows.reduce((s, w) => s + Number(w.failed_enrollments || 0), 0) || 0 }), [data]);

  const startNew = () => { setEditing({ name: "", description: "", trigger: "CONTACT_CREATED", filter: {}, steps: [{ type: "SEND_EMAIL", subject: "Thanks, {{contact.first_name}}", body: "Hi {{contact.first_name}},\n\nThanks for reaching out to {{company.name}}." }] }); setOpenStep(0); };
  const startEdit = (w: Workflow) => { setEditing({ id: w.id, name: w.name, description: w.description || "", trigger: w.trigger, filter: parse<Record<string, string>>(w.trigger_filter, {}), steps: parse<Step[]>(w.steps, []) }); setOpenStep(-1); };
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
    const body = { id: editing.id, name: editing.name, description: editing.description, trigger: editing.trigger, triggerFilter: editing.filter, steps: editing.steps };
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

  const setStep = (i: number, patch: Partial<Step>) => setEditing((e) => e ? { ...e, steps: e.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : e);
  const addStep = (type: string) => setEditing((e) => { if (!e) return e; const defaults: Record<string, Step> = { SEND_EMAIL: { type, subject: "", body: "" }, SEND_SMS: { type, body: "" }, WAIT: { type, amount: 1, unit: "days" }, IF: { type, field: "lifecycle", op: "equals", value: "LEAD" }, ADD_TAG: { type, tag: "" }, REMOVE_TAG: { type, tag: "" }, CREATE_TASK: { type, title: "Follow up with {{contact.name}}", dueInDays: 1, priority: "MEDIUM" }, ADD_NOTE: { type, text: "" }, ASSIGN_REP: { type, rep: "" }, MOVE_STAGE: { type, stage: "QUALIFIED" }, SET_LIFECYCLE: { type, lifecycle: "CUSTOMER" }, NOTIFY_TEAM: { type, to: "", message: "{{contact.name}} needs attention" }, WEBHOOK: { type, url: "" }, END: { type } }; const steps = [...e.steps, defaults[type] || { type }]; setOpenStep(steps.length - 1); return { ...e, steps }; });
  const move = (i: number, d: number) => setEditing((e) => { if (!e) return e; const j = i + d; if (j < 0 || j >= e.steps.length) return e; const steps = [...e.steps]; [steps[i], steps[j]] = [steps[j], steps[i]]; setOpenStep(j); return { ...e, steps }; });
  const del = (i: number) => setEditing((e) => (e ? { ...e, steps: e.steps.filter((_, idx) => idx !== i) } : e));
  const insertVar = (i: number, key: "body" | "subject" | "text" | "message" | "title", v: string) => setStep(i, { [key]: `${String(editing?.steps[i]?.[key] || "")}${v}` });

  return (
    <div className="auHub">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Automations</b><small>{kpis.active} running workflows · {kpis.running} people mid-workflow · email {data?.channels.email ? `on (${data.channels.emailTransport})` : "off"} · texting {data?.channels.sms ? "on" : "logs only until Twilio is added"}</small></div>
        <div className="fxLendChips">
          {(["workflows", "recipes", "log"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "workflows" ? "Workflows" : t === "recipes" ? "Recipes" : "Activity log"}</button>)}
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
              <div className="auPalette">
                <small>ADD A STEP</small>
                <div>{(data?.stepTypes || []).map(([k, l]) => <button key={k} onClick={() => addStep(k)}><i>{stepIcon(k)}</i>{l}</button>)}</div>
              </div>
            </div>
            <div className="auSteps">
              <div className="auStep trigger"><i>⚡</i><div><b>{triggerLabel(editing.trigger)}</b><small>{Object.entries(editing.filter).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(" · ") || "no filter"}</small></div></div>
              {editing.steps.map((st, i) => (
                <div key={i} className={`auStep ${openStep === i ? "open" : ""} ${st.type === "WAIT" ? "wait" : ""}`}>
                  <button className="auStepHead" onClick={() => setOpenStep(openStep === i ? -1 : i)}><i>{stepIcon(st.type)}</i><div><b>{data?.stepTypes.find((x) => x[0] === st.type)?.[1] || st.type}</b><small>{summary(st) || "click to set up"}</small></div><span>{i + 1}</span></button>
                  {openStep === i && (
                    <div className="auStepBody">
                      {st.type === "SEND_EMAIL" && <><input value={String(st.subject || "")} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Subject" /><textarea rows={5} value={String(st.body || "")} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Email body" /><div className="auVars">{VARS.map((v) => <button key={v} onClick={() => insertVar(i, "body", v)}>{v}</button>)}</div>{!data?.channels.email && <em>No email sender connected yet. This step will fail until Resend or Google is connected.</em>}</>}
                      {st.type === "SEND_SMS" && <><textarea rows={3} value={String(st.body || "")} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Text message (160 chars is one segment)" /><div className="auVars">{VARS.map((v) => <button key={v} onClick={() => insertVar(i, "body", v)}>{v}</button>)}</div>{!data?.channels.sms && <em>No texting provider yet. The text is logged on the contact, not sent, until Twilio is added.</em>}</>}
                      {st.type === "WAIT" && <div className="auRow"><input type="number" min={0} value={Number(st.amount || 0)} onChange={(e) => setStep(i, { amount: Number(e.target.value) })} /><select value={String(st.unit || "hours")} onChange={(e) => setStep(i, { unit: e.target.value })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div>}
                      {st.type === "IF" && <div className="auRow three"><select value={String(st.field || "lifecycle")} onChange={(e) => setStep(i, { field: e.target.value })}><option value="lifecycle">lifecycle</option><option value="source">source</option><option value="assigned_rep">assigned rep</option><option value="tags">tags</option><option value="email">email</option><option value="phone">phone</option><option value="ctx.stage">deal stage (event)</option></select><select value={String(st.op || "equals")} onChange={(e) => setStep(i, { op: e.target.value })}><option value="equals">equals</option><option value="not_equals">does not equal</option><option value="contains">contains</option><option value="empty">is empty</option><option value="not_empty">is not empty</option></select><input value={String(st.value || "")} onChange={(e) => setStep(i, { value: e.target.value })} placeholder="value" /></div>}
                      {(st.type === "ADD_TAG" || st.type === "REMOVE_TAG") && <input value={String(st.tag || "")} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="tag, e.g. hot-lead" />}
                      {st.type === "CREATE_TASK" && <><input value={String(st.title || "")} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Task title" /><div className="auRow three"><input list="cyncro-team" value={String(st.assignee || "")} onChange={(e) => setStep(i, { assignee: e.target.value })} placeholder="assignee (blank = contact's rep)" /><input type="number" min={0} value={Number(st.dueInDays ?? 1)} onChange={(e) => setStep(i, { dueInDays: Number(e.target.value) })} title="Due in days" /><select value={String(st.priority || "MEDIUM")} onChange={(e) => setStep(i, { priority: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></div></>}
                      {st.type === "ADD_NOTE" && <textarea rows={3} value={String(st.text || "")} onChange={(e) => setStep(i, { text: e.target.value })} placeholder="Note text" />}
                      {st.type === "ASSIGN_REP" && <input list="cyncro-team" value={String(st.rep || "")} onChange={(e) => setStep(i, { rep: e.target.value })} placeholder="teammate email" />}
                      {st.type === "MOVE_STAGE" && <select value={String(st.stage || "")} onChange={(e) => setStep(i, { stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>}
                      {st.type === "SET_LIFECYCLE" && <select value={String(st.lifecycle || "CUSTOMER")} onChange={(e) => setStep(i, { lifecycle: e.target.value })}>{["LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER", "CHURNED"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>}
                      {st.type === "NOTIFY_TEAM" && <><input list="cyncro-team" value={String(st.to || "")} onChange={(e) => setStep(i, { to: e.target.value })} placeholder="teammate email (blank = contact's rep)" /><input value={String(st.message || "")} onChange={(e) => setStep(i, { message: e.target.value })} placeholder="Message" /></>}
                      {st.type === "WEBHOOK" && <input value={String(st.url || "")} onChange={(e) => setStep(i, { url: e.target.value })} placeholder="https://…" />}
                      {st.type === "END" && <small>Stops the workflow here.</small>}
                      <div className="auStepTools"><button className="fxCCMini" onClick={() => move(i, -1)} disabled={i === 0}>↑</button><button className="fxCCMini" onClick={() => move(i, 1)} disabled={i === editing.steps.length - 1}>↓</button><button className="fxCCMini danger" onClick={() => del(i)}>Remove</button></div>
                    </div>
                  )}
                </div>
              ))}
              {!editing.steps.length && <div className="fxCCEmpty">Add a step from the left.</div>}
            </div>
          </div>
          <div className="fxInvSave"><button onClick={() => setEditing(null)}>Cancel</button><button className="fxCCPrimary" disabled={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Saving…" : editing.id ? "Save workflow" : "Create and switch on"}</button></div>
        </section>
      ) : tab === "recipes" ? (
        <section className="fxCCPanel auRecipes">
          <div className="fxCCHead"><div><b>Recipes</b><small>One click adds the workflow switched on. Edit anything after.</small></div></div>
          <div className="auRecipeGrid">
            {(data?.recipes || []).map((r) => (
              <article key={r.key}><small>{triggerLabel(r.trigger)}</small><b>{r.name}</b><p>{r.description}</p><div><span>{r.steps} steps</span><button className="fxCCPrimary" disabled={busy === r.key} onClick={() => void useRecipe(r.key)}>{busy === r.key ? "Adding…" : "Use recipe"}</button></div></article>
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

      <div className="fxCCKpis fxInvKpis auKpis">
        <article><i>⚡</i><div><small>WORKFLOWS</small><b>{kpis.total}</b><span>{kpis.active} switched on</span></div></article>
        <article><i>◎</i><div><small>PEOPLE MID-WORKFLOW</small><b>{kpis.running}</b><span>waiting on a step</span></div></article>
        <article><i>✓</i><div><small>COMPLETED</small><b>{kpis.completed}</b><span>all steps finished</span></div></article>
        <article><i>!</i><div><small>FAILED</small><b>{kpis.failed}</b><span>see the log for why</span></div></article>
        <article><i>✉</i><div><small>CHANNELS</small><b>{data ? `${data.channels.email ? "Email" : "—"}${data.channels.sms ? " + SMS" : ""}` : "—"}</b><span>{data?.channels.sms ? "email + texting live" : data?.channels.email ? "texting needs Twilio" : "connect email + Twilio"}</span></div></article>
      </div>
    </div>
  );
}
