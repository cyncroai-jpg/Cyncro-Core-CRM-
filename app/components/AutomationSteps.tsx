"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Recursive step editor for the workflow builder. IF_ELSE, SPLIT_TEST and
 * WAIT_FOR carry nested `then` / `else` lists that render as indented lanes,
 * each with its own "add step" control, so a branch can be as deep as needed.
 */
export type Step = { type: string; then?: Step[]; else?: Step[]; [k: string]: unknown };
export type StepCtx = {
  stepTypes: [string, string][]; triggers: [string, string][]; channels: { email: boolean; sms: boolean };
  workflows: { id: string; name: string }[]; eventTypes: { slug: string; name: string }[]; stages: string[]; teamListId?: string;
};
export const VARS = ["{{contact.first_name}}", "{{contact.name}}", "{{contact.email}}", "{{contact.phone}}", "{{contact.score}}", "{{company.name}}", "{{company.phone}}", "{{rep}}", "{{booking.link}}", "{{booking.time}}", "{{booking.event}}", "{{deal.name}}", "{{deal.value}}", "{{invoice.number}}", "{{invoice.amount}}", "{{job.service}}", "{{task.title}}", "{{sms.body}}"];
const BRANCHING = new Set(["IF_ELSE", "SPLIT_TEST", "WAIT_FOR"]);
const FIELDS: [string, string][] = [["lifecycle", "lifecycle"], ["source", "source"], ["assigned_rep", "assigned rep"], ["tags", "tags"], ["lead_score", "lead score"], ["email", "email"], ["phone", "phone"], ["title", "title"], ["ctx.stage", "deal stage (event)"], ["ctx.eventName", "appointment type (event)"], ["ctx.withinBusinessHours", "within business hours (true/false)"], ["ctx.hoursBefore", "hours before (reminder)"]];
const OPS: [string, string][] = [["equals", "equals"], ["not_equals", "does not equal"], ["contains", "contains"], ["not_contains", "does not contain"], ["gt", "is more than"], ["lt", "is less than"], ["empty", "is empty"], ["not_empty", "is not empty"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const stepIcon = (t: string) => ({ SEND_EMAIL: "✉", SEND_SMS: "▭", SEND_BOOKING_LINK: "◷", WAIT: "◷", WAIT_UNTIL: "◴", WAIT_FOR: "◔", IF: "?", IF_ELSE: "⑂", SPLIT_TEST: "⚖", ADD_TAG: "#", REMOVE_TAG: "#", UPDATE_FIELD: "✎", LEAD_SCORE: "★", CREATE_TASK: "☐", ADD_NOTE: "≡", CREATE_DEAL: "$", ASSIGN_REP: "◎", ROUND_ROBIN: "⟳", MOVE_STAGE: "→", SET_LIFECYCLE: "◆", NOTIFY_TEAM: "▲", POST_TO_CHAT: "#", ENROLL_WORKFLOW: "⇢", REMOVE_FROM_WORKFLOW: "⇠", WEBHOOK: "⌁", END: "■", ENROLLED: "＋", DONE: "✓", FAILED: "!", STOPPED: "■", GOAL_REACHED: "◉", HOLD: "◷" } as Record<string, string>)[t] || "•";

export function defaultStep(type: string): Step {
  const d: Record<string, Step> = {
    SEND_EMAIL: { type, subject: "", body: "" }, SEND_SMS: { type, body: "" }, SEND_BOOKING_LINK: { type, via: "email", eventSlug: "", subject: "Pick a time with {{company.name}}", body: "Hi {{contact.first_name}},\n\nPick whatever time works best: {{booking.link}}\n\n{{company.name}}" },
    WAIT: { type, amount: 1, unit: "days" }, WAIT_UNTIL: { type, time: "09:00", days: [1, 2, 3, 4, 5], businessHours: false }, WAIT_FOR: { type, event: "BOOKING_CREATED", amount: 3, unit: "days", then: [], else: [] },
    IF: { type, field: "lifecycle", op: "equals", value: "LEAD" }, IF_ELSE: { type, field: "lead_score", op: "gt", value: "10", then: [], else: [] }, SPLIT_TEST: { type, percentA: 50, then: [], else: [] },
    ADD_TAG: { type, tag: "" }, REMOVE_TAG: { type, tag: "" }, UPDATE_FIELD: { type, field: "title", value: "" }, LEAD_SCORE: { type, delta: 10 },
    CREATE_TASK: { type, title: "Follow up with {{contact.name}}", dueInDays: 1, priority: "MEDIUM" }, ADD_NOTE: { type, text: "" }, CREATE_DEAL: { type, name: "{{contact.name}} — new deal", valueDollars: 0, stage: "" },
    MOVE_STAGE: { type, stage: "QUALIFIED" }, SET_LIFECYCLE: { type, lifecycle: "CUSTOMER" }, ASSIGN_REP: { type, rep: "" }, ROUND_ROBIN: { type, reps: "" },
    NOTIFY_TEAM: { type, to: "", message: "{{contact.name}} needs attention" }, POST_TO_CHAT: { type, channel: "leads", message: "{{contact.name}} · {{contact.phone}}" },
    ENROLL_WORKFLOW: { type, workflowId: "" }, REMOVE_FROM_WORKFLOW: { type, workflowId: "all" }, WEBHOOK: { type, url: "" }, END: { type },
  };
  return d[type] || { type };
}

export function summary(step: Step) {
  const s = (k: string) => String(step[k] ?? "");
  switch (step.type) {
    case "SEND_EMAIL": return s("subject") || "(no subject)";
    case "SEND_SMS": return s("body").slice(0, 70) || "(empty text)";
    case "SEND_BOOKING_LINK": return `${s("via") === "sms" ? "text" : "email"} · ${s("eventSlug") || "any event type"}`;
    case "WAIT": return `${s("amount") || 0} ${s("unit") || "hours"}`;
    case "WAIT_UNTIL": return step.businessHours ? "next business hours" : `${s("time") || "09:00"} local${Array.isArray(step.days) && (step.days as number[]).length < 7 ? ` · ${(step.days as number[]).map((d) => DAYS[d]).join(" ")}` : ""}`;
    case "WAIT_FOR": return `${s("event")} · up to ${s("amount")} ${s("unit")}`;
    case "IF": case "IF_ELSE": return `${s("field")} ${OPS.find((o) => o[0] === s("op"))?.[1] || s("op") || "equals"} ${s("value")}`;
    case "SPLIT_TEST": return `A ${s("percentA") || 50}% · B ${100 - Number(step.percentA ?? 50)}%`;
    case "ADD_TAG": case "REMOVE_TAG": return s("tag");
    case "UPDATE_FIELD": return `${s("field")} = ${s("value")}`;
    case "LEAD_SCORE": return `${Number(step.delta ?? 0) >= 0 ? "+" : ""}${s("delta")}`;
    case "CREATE_TASK": return s("title") || "Follow up";
    case "ADD_NOTE": return s("text").slice(0, 70);
    case "CREATE_DEAL": return `${s("name")}${Number(step.valueDollars) ? ` · $${Number(step.valueDollars).toLocaleString()}` : ""}`;
    case "ASSIGN_REP": return s("rep") || "(pick teammate)";
    case "ROUND_ROBIN": return s("reps") || "(list teammates)";
    case "MOVE_STAGE": return s("stage");
    case "SET_LIFECYCLE": return s("lifecycle");
    case "NOTIFY_TEAM": return `${s("to") || "assigned rep"}: ${s("message").slice(0, 50)}`;
    case "POST_TO_CHAT": return `#${s("channel") || "automations"}: ${s("message").slice(0, 50)}`;
    case "ENROLL_WORKFLOW": return s("workflowId") ? "start workflow" : "(pick workflow)";
    case "REMOVE_FROM_WORKFLOW": return s("workflowId") === "all" || !s("workflowId") ? "stop every other workflow" : "stop one workflow";
    case "WEBHOOK": return s("url");
    default: return "";
  }
}

export function StepList({ steps, onChange, ctx, depth = 0, lane }: { steps: Step[]; onChange: (steps: Step[]) => void; ctx: StepCtx; depth?: number; lane?: string }) {
  const [open, setOpen] = useState(-1);
  const [adding, setAdding] = useState("");
  // A step appended from outside (the palette) opens itself so it can be set up right away.
  const prevLen = useRef(steps.length);
  useEffect(() => { if (steps.length > prevLen.current) setOpen(steps.length - 1); prevLen.current = steps.length; }, [steps.length]);
  const set = (i: number, patch: Partial<Step>) => onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= steps.length) return; const next = [...steps]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); setOpen(j); };
  const del = (i: number) => { onChange(steps.filter((_, idx) => idx !== i)); setOpen(-1); };
  const add = (type: string) => { if (!type) return; onChange([...steps, defaultStep(type)]); setOpen(steps.length); setAdding(""); };
  const ins = (i: number, key: string, v: string) => set(i, { [key]: `${String(steps[i][key] || "")}${v}` });
  const label = (t: string) => ctx.stepTypes.find((x) => x[0] === t)?.[1] || t;
  return (
    <div className={`auLane ${depth ? "nested" : ""}`} data-lane={lane}>
      {lane && <div className="auLaneTag">{lane}</div>}
      {steps.map((st, i) => (
        <div key={i} className={`auStep ${open === i ? "open" : ""} ${st.type.startsWith("WAIT") ? "wait" : ""} ${BRANCHING.has(st.type) ? "branch" : ""}`}>
          <button className="auStepHead" onClick={() => setOpen(open === i ? -1 : i)}><i>{stepIcon(st.type)}</i><div><b>{label(st.type)}</b><small>{summary(st) || "click to set up"}</small></div><span>{i + 1}</span></button>
          {open === i && (
            <div className="auStepBody">
              {st.type === "SEND_EMAIL" && <><input value={String(st.subject || "")} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject" /><textarea rows={5} value={String(st.body || "")} onChange={(e) => set(i, { body: e.target.value })} placeholder="Email body" /><div className="auVars">{VARS.map((v) => <button key={v} onClick={() => ins(i, "body", v)}>{v}</button>)}</div>{!ctx.channels.email && <em>No email sender connected yet. This step will fail until Resend or Google is connected.</em>}</>}
              {st.type === "SEND_SMS" && <><textarea rows={3} value={String(st.body || "")} onChange={(e) => set(i, { body: e.target.value })} placeholder="Text message (160 chars is one segment)" /><div className="auVars">{VARS.map((v) => <button key={v} onClick={() => ins(i, "body", v)}>{v}</button>)}</div>{!ctx.channels.sms && <em>No texting provider yet. The text is logged on the contact, not sent, until Twilio is added.</em>}</>}
              {st.type === "SEND_BOOKING_LINK" && <><div className="auRow"><select value={String(st.via || "email")} onChange={(e) => set(i, { via: e.target.value })}><option value="email">by email</option><option value="sms">by text</option></select><select value={String(st.eventSlug || "")} onChange={(e) => set(i, { eventSlug: e.target.value })}><option value="">Any appointment type</option>{ctx.eventTypes.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select></div>{st.via !== "sms" && <input value={String(st.subject || "")} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject" />}<textarea rows={4} value={String(st.body || "")} onChange={(e) => set(i, { body: e.target.value })} placeholder="Message with {{booking.link}}" /><div className="auVars">{VARS.map((v) => <button key={v} onClick={() => ins(i, "body", v)}>{v}</button>)}</div></>}
              {st.type === "WAIT" && <div className="auRow"><input type="number" min={0} value={Number(st.amount || 0)} onChange={(e) => set(i, { amount: Number(e.target.value) })} /><select value={String(st.unit || "hours")} onChange={(e) => set(i, { unit: e.target.value })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div>}
              {st.type === "WAIT_UNTIL" && <><label className="auCheck"><input type="checkbox" checked={Boolean(st.businessHours)} onChange={(e) => set(i, { businessHours: e.target.checked })} /> Wait for the next business hours (from Company settings)</label>{!st.businessHours && <><div className="auRow"><input type="time" value={String(st.time || "09:00")} onChange={(e) => set(i, { time: e.target.value })} /><div className="auDays">{DAYS.map((d, k) => { const days = Array.isArray(st.days) ? (st.days as number[]) : []; const on = days.includes(k); return <button key={d} type="button" className={on ? "on" : ""} onClick={() => set(i, { days: on ? days.filter((x) => x !== k) : [...days, k].sort() })}>{d}</button>; })}</div></div><em style={{ color: "#8f858b" }}>Local time in your company timezone. No days selected means any day.</em></>}</>}
              {st.type === "WAIT_FOR" && <><div className="auRow three"><select value={String(st.event || "BOOKING_CREATED")} onChange={(e) => set(i, { event: e.target.value })}>{ctx.triggers.filter((t) => !["MANUAL", "BOOKING_UPCOMING", "DEAL_STALE", "INVOICE_OVERDUE"].includes(t[0])).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><input type="number" min={0} value={Number(st.amount ?? 3)} onChange={(e) => set(i, { amount: Number(e.target.value) })} /><select value={String(st.unit || "days")} onChange={(e) => set(i, { unit: e.target.value })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div><em style={{ color: "#8f858b" }}>If it happens in time, the "happened" lane runs. Otherwise the "timed out" lane runs. Then the workflow continues below.</em></>}
              {(st.type === "IF" || st.type === "IF_ELSE") && <div className="auRow three"><select value={String(st.field || "lifecycle")} onChange={(e) => set(i, { field: e.target.value })}>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><select value={String(st.op || "equals")} onChange={(e) => set(i, { op: e.target.value })}>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><input value={String(st.value || "")} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" disabled={["empty", "not_empty"].includes(String(st.op))} /></div>}
              {st.type === "SPLIT_TEST" && <div className="auRow"><input type="number" min={0} max={100} value={Number(st.percentA ?? 50)} onChange={(e) => set(i, { percentA: Number(e.target.value) })} /><span className="auInline">% go to variant A, the rest to B</span></div>}
              {(st.type === "ADD_TAG" || st.type === "REMOVE_TAG") && <input value={String(st.tag || "")} onChange={(e) => set(i, { tag: e.target.value })} placeholder="tag, e.g. hot" />}
              {st.type === "UPDATE_FIELD" && <div className="auRow"><select value={String(st.field || "title")} onChange={(e) => set(i, { field: e.target.value })}>{["full_name", "email", "phone", "title", "source", "lifecycle", "notes", "assigned_rep"].map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}<option value={String(st.field).startsWith("custom:") ? String(st.field) : "custom:"}>custom field…</option></select><input value={String(st.field).startsWith("custom:") ? `custom field: ${String(st.field).slice(7)}` : String(st.value || "")} onChange={(e) => String(st.field).startsWith("custom:") ? set(i, { field: `custom:${e.target.value.replace(/^custom field: /, "")}` }) : set(i, { value: e.target.value })} placeholder="new value (merge fields ok)" /></div>}
              {st.type === "UPDATE_FIELD" && String(st.field).startsWith("custom:") && <input value={String(st.value || "")} onChange={(e) => set(i, { value: e.target.value })} placeholder="value for the custom field" />}
              {st.type === "LEAD_SCORE" && <div className="auRow"><input type="number" value={Number(st.delta ?? 10)} onChange={(e) => set(i, { delta: Number(e.target.value) })} /><span className="auInline">points (negative to lower the score)</span></div>}
              {st.type === "CREATE_TASK" && <><input value={String(st.title || "")} onChange={(e) => set(i, { title: e.target.value })} placeholder="Task title" /><div className="auRow three"><input list={ctx.teamListId || "cyncro-team"} value={String(st.assignee || "")} onChange={(e) => set(i, { assignee: e.target.value })} placeholder="assignee (blank = contact's rep)" /><input type="number" min={0} value={Number(st.dueInDays ?? 1)} onChange={(e) => set(i, { dueInDays: Number(e.target.value) })} title="due in days" /><select value={String(st.priority || "MEDIUM")} onChange={(e) => set(i, { priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</select></div></>}
              {st.type === "ADD_NOTE" && <textarea rows={3} value={String(st.text || "")} onChange={(e) => set(i, { text: e.target.value })} placeholder="Note text" />}
              {st.type === "CREATE_DEAL" && <><input value={String(st.name || "")} onChange={(e) => set(i, { name: e.target.value })} placeholder="Deal name" /><div className="auRow"><input type="number" min={0} value={Number(st.valueDollars || 0)} onChange={(e) => set(i, { valueDollars: Number(e.target.value) })} placeholder="value $" /><select value={String(st.stage || "")} onChange={(e) => set(i, { stage: e.target.value })}><option value="">First stage of the pipeline</option>{ctx.stages.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select></div></>}
              {st.type === "ASSIGN_REP" && <input list={ctx.teamListId || "cyncro-team"} value={String(st.rep || "")} onChange={(e) => set(i, { rep: e.target.value })} placeholder="teammate email" />}
              {st.type === "ROUND_ROBIN" && <><input value={String(st.reps || "")} onChange={(e) => set(i, { reps: e.target.value })} placeholder="teammate emails, comma separated" /><em style={{ color: "#8f858b" }}>Each new contact goes to whichever listed teammate has the fewest contacts.</em></>}
              {st.type === "MOVE_STAGE" && <select value={String(st.stage || "")} onChange={(e) => set(i, { stage: e.target.value })}>{ctx.stages.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>}
              {st.type === "SET_LIFECYCLE" && <select value={String(st.lifecycle || "CUSTOMER")} onChange={(e) => set(i, { lifecycle: e.target.value })}>{["LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER", "CHURNED"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>}
              {st.type === "NOTIFY_TEAM" && <><input list={ctx.teamListId || "cyncro-team"} value={String(st.to || "")} onChange={(e) => set(i, { to: e.target.value })} placeholder="teammate email (blank = contact's rep)" /><input value={String(st.message || "")} onChange={(e) => set(i, { message: e.target.value })} placeholder="Message" /><div className="auVars">{VARS.slice(0, 8).map((v) => <button key={v} onClick={() => ins(i, "message", v)}>{v}</button>)}</div></>}
              {st.type === "POST_TO_CHAT" && <><div className="auRow"><input value={String(st.channel || "")} onChange={(e) => set(i, { channel: e.target.value })} placeholder="channel, e.g. leads" /><input value={String(st.message || "")} onChange={(e) => set(i, { message: e.target.value })} placeholder="Message" /></div><div className="auVars">{VARS.slice(0, 8).map((v) => <button key={v} onClick={() => ins(i, "message", v)}>{v}</button>)}</div></>}
              {st.type === "ENROLL_WORKFLOW" && <select value={String(st.workflowId || "")} onChange={(e) => set(i, { workflowId: e.target.value })}><option value="">Pick a workflow…</option>{ctx.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
              {st.type === "REMOVE_FROM_WORKFLOW" && <select value={String(st.workflowId || "all")} onChange={(e) => set(i, { workflowId: e.target.value })}><option value="all">Every other workflow this contact is in</option>{ctx.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
              {st.type === "WEBHOOK" && <input value={String(st.url || "")} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://…" />}
              {st.type === "END" && <small>Stops the workflow here.</small>}
              <div className="auStepTools"><button className="fxCCMini" onClick={() => move(i, -1)} disabled={i === 0}>↑</button><button className="fxCCMini" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>↓</button><button className="fxCCMini danger" onClick={() => del(i)}>Remove</button></div>
            </div>
          )}
          {BRANCHING.has(st.type) && (
            <div className="auBranches">
              <StepList steps={(st.then as Step[]) || []} onChange={(then) => set(i, { then })} ctx={ctx} depth={depth + 1} lane={st.type === "IF_ELSE" ? "Yes" : st.type === "SPLIT_TEST" ? "Variant A" : "Happened"} />
              <StepList steps={(st.else as Step[]) || []} onChange={(els) => set(i, { else: els })} ctx={ctx} depth={depth + 1} lane={st.type === "IF_ELSE" ? "No" : st.type === "SPLIT_TEST" ? "Variant B" : "Timed out"} />
            </div>
          )}
        </div>
      ))}
      {!steps.length && depth === 0 && <div className="fxCCEmpty">Add a step from the left.</div>}
      {depth > 0 && (
        <select className="auLaneAdd" value={adding} onChange={(e) => add(e.target.value)}>
          <option value="">+ add step to this lane</option>
          {ctx.stepTypes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      )}
    </div>
  );
}
