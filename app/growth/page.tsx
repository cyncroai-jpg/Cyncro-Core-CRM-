"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, type Node, type Edge, type Connection, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type GrowthModule = "overview" | "forms" | "landing-pages" | "journeys" | "attribution" | "tracking" | "campaigns" | "automations" | "agents" | "conversations" | "revenue-intelligence" | "experiments" | "integrations";

const MODULES: { id: GrowthModule; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "forms", label: "Forms" },
  { id: "landing-pages", label: "Landing Pages" },
  { id: "journeys", label: "Journeys" },
  { id: "attribution", label: "Attribution" },
  { id: "tracking", label: "Tracking" },
  { id: "campaigns", label: "Campaigns" },
  { id: "automations", label: "Automations" },
  { id: "agents", label: "AI Agents" },
  { id: "conversations", label: "Conversations" },
  { id: "revenue-intelligence", label: "Revenue Intelligence" },
  { id: "experiments", label: "Experiments" },
  { id: "integrations", label: "Integrations" },
];

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const uid = () => crypto.randomUUID();

export default function GrowthIntelligence() {
  const [module, setModule] = useState<GrowthModule>("overview");
  const [flash, setFlash] = useState("");
  const onFlash = (message: string) => { setFlash(message); window.clearTimeout((window as unknown as { _giFlashTimer?: number })._giFlashTimer); (window as unknown as { _giFlashTimer?: number })._giFlashTimer = window.setTimeout(() => setFlash(""), 4000); };

  return (
    <div className="giApp">
      <aside className="giNav">
        <div className="giBrand"><b>CYNCRO</b><span>GROWTH INTELLIGENCE</span></div>
        <nav>
          {MODULES.map((m) => (
            <button key={m.id} className={module === m.id ? "giNavActive" : ""} onClick={() => setModule(m.id)}>{m.label}</button>
          ))}
        </nav>
        <a className="giCoreLink" href="/">← Back to Cyncro Core</a>
      </aside>
      <main className="giMain">
        <GiCommandBar onFlash={onFlash} onNavigate={setModule} />
        {flash && <div className="giFlash">{flash}</div>}
        {module === "overview" && <GiOverview onNavigate={setModule} />}
        {module === "forms" && <GiForms onFlash={onFlash} />}
        {module === "landing-pages" && <GiLandingPages onFlash={onFlash} />}
        {module === "journeys" && <GiJourneys onFlash={onFlash} />}
        {module === "attribution" && <GiAttribution onFlash={onFlash} />}
        {module === "tracking" && <GiTracking onFlash={onFlash} />}
        {module === "campaigns" && <GiCampaigns onFlash={onFlash} />}
        {module === "automations" && <GiAutomations onFlash={onFlash} />}
        {module === "agents" && <GiAgents onFlash={onFlash} />}
        {module === "conversations" && <GiConversations />}
        {module === "revenue-intelligence" && <GiRevenueIntelligence onFlash={onFlash} />}
        {module === "experiments" && <GiExperiments onFlash={onFlash} />}
        {module === "integrations" && <GiIntegrations onFlash={onFlash} />}
      </main>
    </div>
  );
}

function GiCommandBar({ onFlash, onNavigate }: { onFlash: (m: string) => void; onNavigate: (m: GrowthModule) => void }) {
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const ask = async () => {
    if (!query.trim()) return;
    setAsking(true); setAnswer("");
    const r = await fetch("/api/growth/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const d = (await r.json()) as { answer?: string; suggestedModule?: GrowthModule; error?: string };
    setAsking(false);
    if (!r.ok || d.error) return onFlash(d.error || "Command bar could not answer that");
    setAnswer(d.answer || "");
    if (d.suggestedModule) onNavigate(d.suggestedModule);
  };
  return (
    <div className="giCommandBar">
      <input placeholder="Ask Growth Intelligence — “which campaign produced the most revenue?”" value={query}
        onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask()} />
      <button disabled={asking} onClick={() => void ask()}>{asking ? "Thinking…" : "Ask →"}</button>
      {answer && <div className="giCommandAnswer">{answer}</div>}
    </div>
  );
}

// ============ OVERVIEW ============
interface OverviewData {
  attributedRevenueCents: number; openPipelineCents: number; leads: number; appointments: number; customers: number;
  blendedRoas: number | null; spendCents: number; revenueBySource: Array<{ source: string; revenueCents: number; touches: number }>;
  topForms: Array<{ id: string; name: string; views: number; starts: number; submissions: number }>;
  topLandingPages: Array<{ id: string; name: string; slug: string; views: number }>; eventsTracked: number;
}
function GiOverview({ onNavigate }: { onNavigate: (m: GrowthModule) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [seeding, setSeeding] = useState(false);
  const load = () => void fetch("/api/growth/overview").then((r) => r.json()).then((d) => setData(d as OverviewData));
  useEffect(() => { load(); }, []);
  const seedDemo = async () => {
    setSeeding(true);
    const r = await fetch("/api/growth/seed-demo", { method: "POST" });
    const d = await r.json() as { seeded?: boolean; note?: string; error?: string };
    setSeeding(false);
    if (!r.ok) return alert(d.error || "Could not seed demo data");
    if (d.seeded === false) return alert(d.note || "Demo data already exists.");
    load();
  };
  if (!data) return <div className="giLoading">Loading Growth Intelligence…</div>;
  const isEmpty = !data.eventsTracked;
  return (
    <section className="giOverview">
      <header><small>CYNCRO GROWTH INTELLIGENCE</small><h1>Acquisition to revenue, in one truth layer.</h1>
        {isEmpty && <button disabled={seeding} onClick={() => void seedDemo()}>{seeding ? "Seeding…" : "✦ Load live example data"}</button>}
      </header>
      <div className="giStatGrid">
        <article><small>ATTRIBUTED REVENUE</small><b>{money(data.attributedRevenueCents)}</b></article>
        <article><small>OPEN ATTRIBUTED PIPELINE</small><b>{money(data.openPipelineCents)}</b></article>
        <article><small>LEADS</small><b>{data.leads}</b></article>
        <article><small>APPOINTMENTS</small><b>{data.appointments}</b></article>
        <article><small>CUSTOMERS</small><b>{data.customers}</b></article>
        <article><small>BLENDED ROAS</small><b>{data.blendedRoas ? `${data.blendedRoas.toFixed(2)}×` : "—"}</b></article>
      </div>
      <div className="giOverviewGrid">
        <article className="giPanel" onClick={() => onNavigate("attribution")}>
          <header><small>REVENUE BY SOURCE</small><span>Attribution →</span></header>
          {data.revenueBySource.length ? data.revenueBySource.map((s) => (
            <div className="giRow" key={s.source}><b>{s.source}</b><span>{s.touches} touches</span><strong>{money(s.revenueCents)}</strong></div>
          )) : <p className="giEmpty">No tracked revenue yet — publish a form or landing page and start driving traffic.</p>}
        </article>
        <article className="giPanel" onClick={() => onNavigate("forms")}>
          <header><small>TOP FORMS</small><span>Forms →</span></header>
          {data.topForms.length ? data.topForms.map((f) => (
            <div className="giRow" key={f.id}><b>{f.name}</b><span>{f.views} views</span><strong>{f.submissions} submissions</strong></div>
          )) : <p className="giEmpty">No published forms yet.</p>}
        </article>
        <article className="giPanel" onClick={() => onNavigate("landing-pages")}>
          <header><small>TOP LANDING PAGES</small><span>Landing Pages →</span></header>
          {data.topLandingPages.length ? data.topLandingPages.map((p) => (
            <div className="giRow" key={p.id}><b>{p.name}</b><span>/{p.slug}</span><strong>{p.views} views</strong></div>
          )) : <p className="giEmpty">No published landing pages yet.</p>}
        </article>
        <article className="giPanel" onClick={() => onNavigate("revenue-intelligence")}>
          <header><small>REVENUE INTELLIGENCE</small><span>Open →</span></header>
          <p className="giEmpty">See stalled opportunities, abandoned forms, and unpaid deals worth recovering.</p>
        </article>
      </div>
      <p className="giFootnote">{data.eventsTracked} real tracked events in the last 180 days.</p>
    </section>
  );
}

// ============ FORMS ============
type FieldRole = "NAME" | "EMAIL" | "PHONE" | null;
interface GiField { id: string; label: string; type: string; required: boolean; options: string[]; role: FieldRole }
interface GiStep { id: string; title: string; fields: GiField[] }
interface GiFormRow { id: string; name: string; type: string; status: string; views: number; starts: number; submissions: number; public_token?: string }

function GiForms({ onFlash }: { onFlash: (m: string) => void }) {
  const [forms, setForms] = useState<GiFormRow[]>([]);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [leak, setLeak] = useState<{ funnel: Array<{ label: string; count: number; dropFromPrevious: number }>; recommendation?: string | null; leakStep?: string; note?: string } | null>(null);

  const load = async () => { const d = (await (await fetch("/api/growth/forms")).json()) as { forms?: GiFormRow[] }; setForms(d.forms || []); };
  useEffect(() => { void load(); }, []);

  const createForm = async (name: string, type: string) => {
    const r = await fetch("/api/growth/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type }) });
    const d = (await r.json()) as { form?: Record<string, unknown>; error?: string };
    if (!r.ok) return onFlash(d.error || "Could not create form");
    setCreating(false); await load(); setEditing(d.form || null); onFlash("Form created");
  };

  const openEditor = async (id: string) => {
    const d = (await (await fetch(`/api/growth/forms?id=${id}`)).json()) as { form?: Record<string, unknown> };
    setEditing(d.form || null); setLeak(null);
  };

  const analyzeLeak = async (formId: string) => {
    const r = await fetch("/api/growth/ai/optimize-form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId }) });
    const d = await r.json() as typeof leak & { error?: string };
    if (!r.ok && !d?.funnel) return onFlash(d?.error || "Could not analyze this form");
    setLeak(d);
  };

  if (editing) return <GiFormEditor form={editing} onBack={() => { setEditing(null); void load(); }} onFlash={onFlash} leak={leak} onAnalyze={analyzeLeak} />;

  return (
    <section className="giSection">
      <header><h1>Advanced Smart Forms</h1><button onClick={() => setCreating(true)}>+ New form</button></header>
      {creating && <NewFormDialog onCreate={createForm} onCancel={() => setCreating(false)} />}
      <div className="giTable">
        <header><span>Name</span><span>Type</span><span>Status</span><span>Views</span><span>Starts</span><span>Submissions</span><span>Conversion</span></header>
        {forms.map((f) => (
          <button key={f.id} onClick={() => void openEditor(f.id)}>
            <b>{f.name}</b><span>{f.type}</span><span className={`giBadge giBadge-${f.status}`}>{f.status}</span>
            <span>{f.views}</span><span>{f.starts}</span><span>{f.submissions}</span>
            <strong>{f.views ? pct(f.submissions / f.views) : "—"}</strong>
          </button>
        ))}
        {!forms.length && <p className="giEmpty">No forms yet — create your first smart form.</p>}
      </div>
    </section>
  );
}

function NewFormDialog({ onCreate, onCancel }: { onCreate: (name: string, type: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState("LEAD");
  return (
    <div className="giDialog">
      <label>Form name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Roofing quote request" /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value)}>
        {["LEAD", "APPLICATION", "QUOTE", "CONTACT", "QUALIFICATION", "SURVEY", "APPOINTMENT", "FINANCING", "SERVICE", "CUSTOM"].map((t) => <option key={t}>{t}</option>)}
      </select></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!name.trim()} onClick={() => onCreate(name, type)}>Create</button></div>
    </div>
  );
}

const FIELD_TYPES = ["TEXT", "EMAIL", "PHONE", "ADDRESS", "DROPDOWN", "RADIO", "CHECKBOX", "DATE", "CURRENCY", "NUMBER", "FILE"];
const FIELD_TYPE_META: Record<string, { label: string; icon: string }> = {
  TEXT: { label: "Text", icon: "✎" }, EMAIL: { label: "Email", icon: "@" }, PHONE: { label: "Phone", icon: "☎" },
  ADDRESS: { label: "Address", icon: "⌂" }, DROPDOWN: { label: "Dropdown", icon: "▾" }, RADIO: { label: "Radio", icon: "◉" },
  CHECKBOX: { label: "Checkbox", icon: "☑" }, DATE: { label: "Date", icon: "▦" }, CURRENCY: { label: "Currency", icon: "$" },
  NUMBER: { label: "Number", icon: "#" }, FILE: { label: "File upload", icon: "⇧" },
};
const CHOICE_FIELD_TYPES = new Set(["DROPDOWN", "RADIO", "CHECKBOX"]);

function PaletteItem({ type }: { type: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}`, data: { source: "palette", fieldType: type } });
  const meta = FIELD_TYPE_META[type];
  return (
    <button ref={setNodeRef} className={`dndPaletteItem${isDragging ? " dndDragging" : ""}`} {...listeners} {...attributes} type="button">
      <i>{meta.icon}</i>{meta.label}
    </button>
  );
}

function StepDropZone({ step, children }: { step: GiStep; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `step-${step.id}`, data: { source: "step", stepId: step.id } });
  return <div ref={setNodeRef} className={`dndStepZone${isOver ? " dndOver" : ""}`}>{children}</div>;
}

function SortableFieldRow({ field, stepId, onUpdate, onRemove }: { field: GiField; stepId: string; onUpdate: (patch: Partial<GiField>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, data: { source: "field", stepId } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="giFieldRow">
      <span className="dndHandle" {...attributes} {...listeners}>⠿</span>
      <input value={field.label} onChange={(e) => onUpdate({ label: e.target.value })} />
      <select value={field.type} onChange={(e) => onUpdate({ type: e.target.value, options: CHOICE_FIELD_TYPES.has(e.target.value) && !field.options.length ? ["Option 1", "Option 2"] : field.options })}>
        {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_META[t].label}</option>)}
      </select>
      <input className="dndOptionsInput" style={{ visibility: CHOICE_FIELD_TYPES.has(field.type) ? "visible" : "hidden" }}
        placeholder="Option 1, Option 2, …" value={field.options.join(", ")} onChange={(e) => onUpdate({ options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
      <select value={field.role || ""} onChange={(e) => onUpdate({ role: (e.target.value || null) as FieldRole })}>
        <option value="">No identity role</option><option value="NAME">Identity: Name</option><option value="EMAIL">Identity: Email</option><option value="PHONE">Identity: Phone</option>
      </select>
      <label className="dndRequiredLabel"><input type="checkbox" checked={field.required} onChange={(e) => onUpdate({ required: e.target.checked })} /> Required</label>
      <button onClick={onRemove}>✕</button>
    </div>
  );
}

function GiFormEditor({ form, onBack, onFlash, leak, onAnalyze }: {
  form: Record<string, unknown>; onBack: () => void; onFlash: (m: string) => void;
  leak: { funnel: Array<{ label: string; count: number; dropFromPrevious: number }>; recommendation?: string | null; leakStep?: string; note?: string } | null;
  onAnalyze: (formId: string) => void;
}) {
  const [steps, setSteps] = useState<GiStep[]>(JSON.parse(String(form.steps_json || "[]")));
  const [status, setStatus] = useState(String(form.status));
  const [thankYou, setThankYou] = useState<{ message?: string; redirectUrl?: string; embedCalendar?: boolean }>(JSON.parse(String(form.thank_you_json || "{}")));
  const [syncConfig, setSyncConfig] = useState<{ createOpportunity?: boolean; qualifyWithAI?: boolean; qualificationAgentId?: string; tags?: string[] }>(JSON.parse(String(form.sync_config_json || "{}")));
  const [agents, setAgents] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [aiDescription, setAiDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => { void fetch("/api/growth/agents").then((r) => r.json()).then((d) => setAgents(((d as { agents?: Array<{ id: string; name: string; type: string }> }).agents || []).filter((a) => a.type === "LEAD_QUALIFICATION"))); }, []);

  const save = async () => {
    const r = await fetch("/api/growth/forms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id, updates: { steps, status, thankYou, syncConfig } }) });
    if (!r.ok) return onFlash("Could not save form");
    onFlash("Form saved");
  };

  const addStep = () => setSteps([...steps, { id: uid(), title: `Step ${steps.length + 1}`, fields: [] }]);
  const addField = (stepId: string) => setSteps(steps.map((s) => s.id === stepId ? { ...s, fields: [...s.fields, { id: uid(), label: "New question", type: "TEXT", required: false, options: [], role: null }] } : s));
  const updateField = (stepId: string, fieldId: string, patch: Partial<GiField>) => setSteps(steps.map((s) => s.id === stepId ? { ...s, fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) } : s));
  const removeField = (stepId: string, fieldId: string) => setSteps(steps.map((s) => s.id === stepId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s));

  const generateWithAi = async () => {
    if (!aiDescription.trim()) return;
    setGenerating(true);
    const r = await fetch("/api/crm/forms/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: aiDescription }) });
    const d = (await r.json()) as { fields?: Array<{ label: string; type: string; required: boolean; options: string[] }>; error?: string };
    setGenerating(false);
    if (!r.ok || d.error) return onFlash(d.error || "AI could not generate fields");
    const newFields: GiField[] = (d.fields || []).map((f) => ({ id: uid(), label: f.label, type: f.type === "EMAIL" ? "EMAIL" : f.type === "PHONE" ? "PHONE" : f.type, required: f.required, options: f.options, role: f.type === "EMAIL" ? "EMAIL" : f.type === "PHONE" ? "PHONE" : null }));
    setSteps((prev) => prev.length ? prev.map((s, i) => i === 0 ? { ...s, fields: [...s.fields, ...newFields] } : s) : [{ id: uid(), title: "Step 1", fields: newFields }]);
    onFlash(`Added ${newFields.length} AI-generated fields`);
  };

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/gf?form=${form.public_token}` : "";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { source?: string; fieldType?: string; stepId?: string } | undefined;
    const overData = over.data.current as { source?: string; stepId?: string } | undefined;
    if (!activeData) return;
    if (activeData.source === "palette") {
      const targetStepId = overData?.stepId;
      const fieldType = activeData.fieldType;
      if (!targetStepId || !fieldType) return;
      const isChoice = CHOICE_FIELD_TYPES.has(fieldType);
      setSteps((prev) => prev.map((s) => s.id === targetStepId
        ? { ...s, fields: [...s.fields, { id: uid(), label: `${FIELD_TYPE_META[fieldType]?.label || fieldType} question`, type: fieldType, required: false, options: isChoice ? ["Option 1", "Option 2"] : [], role: fieldType === "EMAIL" ? "EMAIL" : fieldType === "PHONE" ? "PHONE" : null }] }
        : s));
      return;
    }
    if (activeData.source === "field" && activeData.stepId && active.id !== over.id) {
      const stepId = activeData.stepId;
      setSteps((prev) => prev.map((s) => {
        if (s.id !== stepId) return s;
        const oldIndex = s.fields.findIndex((f) => f.id === active.id);
        const newIndex = s.fields.findIndex((f) => f.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return s;
        return { ...s, fields: arrayMove(s.fields, oldIndex, newIndex) };
      }));
    }
  };

  return (
    <section className="giSection">
      <header><button className="giBack" onClick={onBack}>← Forms</button><h1>{String(form.name)}</h1>
        <div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select>
          <button onClick={() => void save()}>Save</button></div>
      </header>
      {status === "PUBLISHED" && <div className="giShareUrl"><code>{publicUrl}</code><button onClick={() => { void navigator.clipboard.writeText(publicUrl); onFlash("Link copied"); }}>Copy link</button></div>}

      <div className="giAiRow">
        <input placeholder="Describe this form and let AI draft the fields — “roofing quote request for homeowners”" value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} />
        <button disabled={generating} onClick={() => void generateWithAi()}>{generating ? "Generating…" : "✦ Generate with AI"}</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="dndFormLayout">
          <aside className="dndPalette">
            <small>DRAG A FIELD ONTO A STEP</small>
            {FIELD_TYPES.map((t) => <PaletteItem key={t} type={t} />)}
          </aside>
          <div className="dndSteps">
            {steps.map((step, stepIndex) => (
              <article className="giPanel giFormStep" key={step.id}>
                <header><small>STEP {stepIndex + 1}</small>
                  <input className="giInlineTitle" value={step.title} onChange={(e) => setSteps(steps.map((s) => s.id === step.id ? { ...s, title: e.target.value } : s))} />
                  <button onClick={() => addField(step.id)}>+ Field</button>
                </header>
                <StepDropZone step={step}>
                  <SortableContext items={step.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    {step.fields.map((field) => (
                      <SortableFieldRow key={field.id} field={field} stepId={step.id}
                        onUpdate={(patch) => updateField(step.id, field.id, patch)} onRemove={() => removeField(step.id, field.id)} />
                    ))}
                  </SortableContext>
                  {!step.fields.length && <p className="giEmpty">Drag a field type here, or click "+ Field".</p>}
                </StepDropZone>
              </article>
            ))}
            <button className="giAddStep" onClick={addStep}>+ Add step</button>
          </div>
          <aside className="dndPreview">
            <small>LIVE PREVIEW</small>
            <div className="dndPreviewCard">
              {steps.flatMap((s) => s.fields).length ? steps.map((step) => (
                <div key={step.id} className="dndPreviewStep">
                  <b>{step.title}</b>
                  {step.fields.map((f) => (
                    <label key={f.id} className="dndPreviewField">
                      <span>{f.label}{f.required && <em>*</em>}</span>
                      {f.type === "DROPDOWN" ? <select disabled><option>{f.options[0] || "Choose…"}</option></select>
                        : f.type === "CHECKBOX" || f.type === "RADIO" ? <div className="dndPreviewChoices">{f.options.map((o) => <span key={o}>{o}</span>)}</div>
                        : <input disabled placeholder={FIELD_TYPE_META[f.type]?.label} />}
                    </label>
                  ))}
                </div>
              )) : <p className="giEmpty">Add fields to see the live preview.</p>}
            </div>
          </aside>
        </div>
      </DndContext>

      <article className="giPanel">
        <header><small>THANK-YOU + CRM SYNC</small></header>
        <label>Thank-you message<input value={thankYou.message || ""} onChange={(e) => setThankYou({ ...thankYou, message: e.target.value })} /></label>
        <label>Redirect URL (optional)<input value={thankYou.redirectUrl || ""} onChange={(e) => setThankYou({ ...thankYou, redirectUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="giCheckboxLabel"><input type="checkbox" checked={!!syncConfig.createOpportunity} onChange={(e) => setSyncConfig({ ...syncConfig, createOpportunity: e.target.checked })} /> Create a CRM opportunity on submit</label>
        <label className="giCheckboxLabel"><input type="checkbox" checked={!!syncConfig.qualifyWithAI} onChange={(e) => setSyncConfig({ ...syncConfig, qualifyWithAI: e.target.checked })} /> Run AI lead qualification on submit</label>
        {syncConfig.qualifyWithAI && (
          <label>Qualification agent
            <select value={syncConfig.qualificationAgentId || ""} onChange={(e) => setSyncConfig({ ...syncConfig, qualificationAgentId: e.target.value })}>
              <option value="">Choose an agent…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {!agents.length && <small>Create a Lead Qualification agent in AI Agents first.</small>}
          </label>
        )}
      </article>

      <article className="giPanel">
        <header><small>AI FORM OPTIMIZER</small><button onClick={() => onAnalyze(String(form.id))}>Analyze conversion leaks</button></header>
        {leak?.note && <p className="giEmpty">{leak.note}</p>}
        {leak?.funnel && (
          <div className="giFunnel">
            {leak.funnel.map((f) => <div key={f.label}><b>{f.label}</b><span>{f.count}</span>{f.dropFromPrevious > 0 && <em>-{f.dropFromPrevious}%</em>}</div>)}
          </div>
        )}
        {leak?.recommendation && (
          <div className="giLeakAlert">
            <small>⚠️ CONVERSION LEAK · {leak.leakStep}</small>
            <p>{leak.recommendation}</p>
          </div>
        )}
      </article>
    </section>
  );
}

// ============ LANDING PAGES ============
interface GiPageRow { id: string; name: string; slug: string; status: string; views: number }
function GiLandingPages({ onFlash }: { onFlash: (m: string) => void }) {
  const [pages, setPages] = useState<GiPageRow[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = async () => { const d = (await (await fetch("/api/growth/landing-pages")).json()) as { pages?: GiPageRow[] }; setPages(d.pages || []); };
  useEffect(() => { void load(); }, []);

  const createPage = async (name: string, sections: Array<Record<string, unknown>>) => {
    const r = await fetch("/api/growth/landing-pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sections }) });
    if (!r.ok) return onFlash("Could not create landing page");
    setAiOpen(false); setCreating(false); await load(); onFlash("Landing page created");
  };

  const publish = async (id: string) => {
    const r = await fetch("/api/growth/landing-pages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, updates: { status: "PUBLISHED" } }) });
    if (!r.ok) return onFlash("Could not publish");
    await load(); onFlash("Page published");
  };

  return (
    <section className="giSection">
      <header><h1>Landing Pages</h1><div><button onClick={() => setCreating(true)}>+ Blank page</button><button onClick={() => setAiOpen(true)}>✦ Create with AI</button></div></header>
      {creating && <NewPageDialog onCreate={(name) => createPage(name, [{ id: uid(), type: "HEADLINE", text: name }])} onCancel={() => setCreating(false)} />}
      {aiOpen && <AiLandingPageDialog onCreate={createPage} onCancel={() => setAiOpen(false)} onFlash={onFlash} />}
      <div className="giTable">
        <header><span>Name</span><span>Slug</span><span>Status</span><span>Views</span></header>
        {pages.map((p) => (
          <div key={p.id} className="giTableRow">
            <b>{p.name}</b><span>/{p.slug}</span><span className={`giBadge giBadge-${p.status}`}>{p.status}</span><span>{p.views}</span>
            <div>{p.status !== "PUBLISHED" && <button onClick={() => void publish(p.id)}>Publish</button>}
              <a href={`/gp?slug=${p.slug}`} target="_blank" rel="noreferrer">View →</a></div>
          </div>
        ))}
        {!pages.length && <p className="giEmpty">No landing pages yet.</p>}
      </div>
    </section>
  );
}
function NewPageDialog({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return <div className="giDialog"><label>Page name<input value={name} onChange={(e) => setName(e.target.value)} /></label><div><button onClick={onCancel}>Cancel</button><button disabled={!name.trim()} onClick={() => onCreate(name)}>Create</button></div></div>;
}
function AiLandingPageDialog({ onCreate, onCancel, onFlash }: { onCreate: (name: string, sections: Array<Record<string, unknown>>) => void; onCancel: () => void; onFlash: (m: string) => void }) {
  const [business, setBusiness] = useState(""); const [offer, setOffer] = useState(""); const [industry, setIndustry] = useState(""); const [generating, setGenerating] = useState(false);
  const generate = async () => {
    setGenerating(true);
    const r = await fetch("/api/growth/ai/generate-landing-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business, offer, industry }) });
    const d = (await r.json()) as { page?: { headline: string; subheadline: string; sections: Array<{ type: string; heading: string; body: string }>; ctaText: string }; error?: string };
    setGenerating(false);
    if (!r.ok || d.error) return onFlash(d.error || "AI could not generate this page");
    const sections = [{ id: uid(), type: "HEADLINE", text: d.page?.headline, sub: d.page?.subheadline }, ...(d.page?.sections || []).map((s) => ({ id: uid(), type: s.type, heading: s.heading, body: s.body })), { id: uid(), type: "BUTTON", text: d.page?.ctaText }];
    onCreate(business, sections);
  };
  return (
    <div className="giDialog">
      <label>Business<input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Riverside Roofing Co." /></label>
      <label>Offer<input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Free roof inspection + quote" /></label>
      <label>Industry (optional)<input value={industry} onChange={(e) => setIndustry(e.target.value)} /></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!business.trim() || !offer.trim() || generating} onClick={() => void generate()}>{generating ? "Generating…" : "Generate page"}</button></div>
    </div>
  );
}

// ============ JOURNEYS ============
interface GiEventRow { id: string; event_type: string; source: string | null; campaign: string | null; event_value_cents: number; created_at: string }
function GiJourneys({ onFlash }: { onFlash: (m: string) => void }) {
  const [contactId, setContactId] = useState("");
  const [contacts, setContacts] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [journey, setJourney] = useState<{ contact: Record<string, unknown> | null; events: GiEventRow[]; opportunities: Array<Record<string, unknown>> } | null>(null);

  useEffect(() => { void fetch("/api/crm/contacts").then((r) => r.json()).then((d) => setContacts(((d as { contacts?: Array<{ id: string; full_name: string; email: string; gi_visitor_id?: string }> }).contacts || []).filter((c) => c.gi_visitor_id).slice(0, 100))); }, []);

  const loadJourney = async (id: string) => {
    setContactId(id);
    const r = await fetch(`/api/growth/journeys?contactId=${id}`);
    const d = await r.json();
    if (!r.ok) return onFlash((d as { error?: string }).error || "Could not load journey");
    setJourney(d as typeof journey);
  };

  return (
    <section className="giSection">
      <header><h1>Customer Journeys</h1></header>
      <div className="giJourneyPicker">
        {contacts.length ? contacts.map((c) => (
          <button key={c.id} className={contactId === c.id ? "giNavActive" : ""} onClick={() => void loadJourney(c.id)}>{c.full_name}<small>{c.email}</small></button>
        )) : <p className="giEmpty">No contacts with a tracked journey yet — submit a form to start one.</p>}
      </div>
      {journey && (
        <div className="giTimeline">
          {journey.contact && <h2>{String(journey.contact.full_name)}</h2>}
          {journey.events.map((e) => (
            <div className="giTimelineRow" key={e.id}>
              <i>{e.event_type.split(".")[0].slice(0, 2).toUpperCase()}</i>
              <div><b>{e.event_type.replace(/[._]/g, " ")}</b><small>{e.source ? `via ${e.source}` : ""}{e.campaign ? ` · ${e.campaign}` : ""} · {new Date(e.created_at).toLocaleString()}</small></div>
              {e.event_value_cents > 0 && <strong>{money(e.event_value_cents)}</strong>}
            </div>
          ))}
          {journey.opportunities.map((o) => (
            <div className="giTimelineRow giTimelineRevenue" key={String(o.id)}><i>$</i><div><b>{String(o.name)}</b><small>{String(o.stage)}</small></div><strong>{money(Number(o.value_cents))}</strong></div>
          ))}
          {!journey.events.length && <p className="giEmpty">No tracked events for this contact yet.</p>}
        </div>
      )}
    </section>
  );
}

// ============ ATTRIBUTION ============
interface AttributionData {
  model: string; disclaimer: string;
  totals: { revenueCents: number; spendCents: number; roas: number | null; leads: number; touchpoints: number };
  bySource: Array<{ source: string; revenueCents: number; touches: number }>;
  byCampaign: Array<{ campaign: string; revenueCents: number; touches: number; spendCents: number; roas: number | null }>;
  comparison: Record<string, Array<{ source: string; revenueCents: number }>> | null;
}
function GiAttribution({ onFlash }: { onFlash: (m: string) => void }) {
  const [model, setModel] = useState("LAST_TOUCH");
  const [lookback, setLookback] = useState(90);
  const [data, setData] = useState<AttributionData | null>(null);
  const [compare, setCompare] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/growth/attribution?model=${model}&lookbackDays=${lookback}${compare ? "&compare=1" : ""}`);
    const d = await r.json();
    if (!r.ok) return onFlash((d as { error?: string }).error || "Attribution could not load");
    setData(d as AttributionData);
  };
  useEffect(() => { void load(); }, [model, lookback, compare]);

  if (!data) return <div className="giLoading">Loading attribution…</div>;
  return (
    <section className="giSection">
      <header><h1>Cyncro Attribution</h1>
        <div>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="FIRST_TOUCH">First touch</option><option value="LAST_TOUCH">Last touch</option><option value="LINEAR">Linear</option>
            <option value="TIME_DECAY">Time decay</option><option value="POSITION_BASED">Position based</option><option value="CUSTOM">Custom (even split)</option>
          </select>
          <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
            {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          <button onClick={() => setCompare(!compare)}>{compare ? "Hide" : "Compare"} models</button>
        </div>
      </header>
      <p className="giDisclaimer">{data.disclaimer}</p>
      <div className="giStatGrid">
        <article><small>ATTRIBUTED REVENUE</small><b>{money(data.totals.revenueCents)}</b></article>
        <article><small>TRACKED SPEND</small><b>{money(data.totals.spendCents)}</b></article>
        <article><small>BLENDED ROAS</small><b>{data.totals.roas ? `${data.totals.roas.toFixed(2)}×` : "—"}</b></article>
        <article><small>TOUCHPOINTS</small><b>{data.totals.touchpoints}</b></article>
      </div>
      <div className="giOverviewGrid">
        <article className="giPanel">
          <header><small>REVENUE BY SOURCE</small></header>
          {data.bySource.length ? data.bySource.map((s) => <div className="giRow" key={s.source}><b>{s.source}</b><span>{s.touches} touches</span><strong>{money(s.revenueCents)}</strong></div>) : <p className="giEmpty">No attributed revenue yet.</p>}
        </article>
        <article className="giPanel">
          <header><small>REVENUE BY CAMPAIGN</small></header>
          {data.byCampaign.length ? data.byCampaign.map((c) => <div className="giRow" key={c.campaign}><b>{c.campaign}</b><span>{c.roas ? `${c.roas.toFixed(2)}× ROAS` : "no spend logged"}</span><strong>{money(c.revenueCents)}</strong></div>) : <p className="giEmpty">No campaign-attributed revenue yet.</p>}
        </article>
      </div>
      {compare && data.comparison && (
        <article className="giPanel">
          <header><small>ATTRIBUTION COMPARISON</small><span>Same conversions, different credit allocation</span></header>
          <div className="giCompareGrid">
            {Object.entries(data.comparison).map(([m, rows]) => (
              <div key={m}><b>{m.replace("_", " ")}</b>{rows.slice(0, 5).map((r) => <span key={r.source}>{r.source}: {money(r.revenueCents)}</span>)}</div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}

// ============ TRACKING (links) ============
interface GiLinkRow { id: string; slug: string; label: string; destination_url: string; clicks: number; leads: number; revenue_cents: number }
function GiTracking({ onFlash }: { onFlash: (m: string) => void }) {
  const [links, setLinks] = useState<GiLinkRow[]>([]);
  const [creating, setCreating] = useState(false);
  const load = async () => { const d = (await (await fetch("/api/growth/links")).json()) as { links?: GiLinkRow[] }; setLinks(d.links || []); };
  useEffect(() => { void load(); }, []);

  const create = async (label: string, destinationUrl: string, source: string) => {
    const r = await fetch("/api/growth/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, destinationUrl, source }) });
    const d = await r.json() as { error?: string };
    if (!r.ok) return onFlash(d.error || "Could not create link");
    setCreating(false); await load(); onFlash("Tracked link created");
  };

  return (
    <section className="giSection">
      <header><h1>Tracked Links</h1><button onClick={() => setCreating(true)}>+ New link</button></header>
      {creating && <NewLinkDialog onCreate={create} onCancel={() => setCreating(false)} />}
      <div className="giTable">
        <header><span>Label</span><span>Link</span><span>Clicks</span><span>Leads</span><span>Revenue</span></header>
        {links.map((l) => {
          const short = typeof window !== "undefined" ? `${window.location.origin}/api/growth/go?slug=${l.slug}` : "";
          return (
            <div key={l.id} className="giTableRow">
              <b>{l.label}</b>
              <button onClick={() => { void navigator.clipboard.writeText(short); onFlash("Link copied"); }}><code>/go?slug={l.slug}</code></button>
              <span>{l.clicks}</span><span>{l.leads}</span><strong>{money(l.revenue_cents)}</strong>
            </div>
          );
        })}
        {!links.length && <p className="giEmpty">No tracked links yet.</p>}
      </div>
    </section>
  );
}
function NewLinkDialog({ onCreate, onCancel }: { onCreate: (label: string, url: string, source: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(""); const [url, setUrl] = useState(""); const [source, setSource] = useState("meta");
  return (
    <div className="giDialog">
      <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Trade show demo link" /></label>
      <label>Destination URL<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/demo" /></label>
      <label>Source<select value={source} onChange={(e) => setSource(e.target.value)}>{["meta", "google", "email", "sms", "qr", "influencer", "partner", "salesperson", "offline"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!label.trim() || !url.trim()} onClick={() => onCreate(label, url, source)}>Create</button></div>
    </div>
  );
}

// ============ CAMPAIGNS ============
interface GiCampaignRow { id: string; name: string; channel: string; spend_cents: number; leads: number; revenue_cents: number; status: string }
function GiCampaigns({ onFlash }: { onFlash: (m: string) => void }) {
  const [campaigns, setCampaigns] = useState<GiCampaignRow[]>([]);
  const [creating, setCreating] = useState(false);
  const load = async () => { const d = (await (await fetch("/api/growth/campaigns")).json()) as { campaigns?: GiCampaignRow[] }; setCampaigns(d.campaigns || []); };
  useEffect(() => { void load(); }, []);
  const create = async (name: string, channel: string, spend: number) => {
    const r = await fetch("/api/growth/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, channel, spend }) });
    if (!r.ok) return onFlash("Could not create campaign");
    setCreating(false); await load(); onFlash("Campaign created");
  };
  return (
    <section className="giSection">
      <header><h1>Campaigns</h1><button onClick={() => setCreating(true)}>+ New campaign</button></header>
      {creating && <NewCampaignDialog onCreate={create} onCancel={() => setCreating(false)} />}
      <div className="giTable">
        <header><span>Name</span><span>Channel</span><span>Spend</span><span>Leads</span><span>Revenue</span><span>ROAS</span></header>
        {campaigns.map((c) => (
          <div key={c.id} className="giTableRow">
            <b>{c.name}</b><span>{c.channel}</span><span>{money(c.spend_cents)}</span><span>{c.leads}</span>
            <strong>{money(c.revenue_cents)}</strong><span>{c.spend_cents ? `${(c.revenue_cents / c.spend_cents).toFixed(2)}×` : "—"}</span>
          </div>
        ))}
        {!campaigns.length && <p className="giEmpty">No campaigns yet — tag your tracked links and forms to a campaign's UTM to see performance here.</p>}
      </div>
    </section>
  );
}
function NewCampaignDialog({ onCreate, onCancel }: { onCreate: (name: string, channel: string, spend: number) => void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [channel, setChannel] = useState("META"); const [spend, setSpend] = useState("");
  return (
    <div className="giDialog">
      <label>Campaign name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Channel<select value={channel} onChange={(e) => setChannel(e.target.value)}>{["META", "GOOGLE", "TIKTOK", "EMAIL", "SMS", "OFFLINE", "OTHER"].map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Spend ($)<input value={spend} onChange={(e) => setSpend(e.target.value)} type="number" /></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!name.trim()} onClick={() => onCreate(name, channel, Number(spend || 0))}>Create</button></div>
    </div>
  );
}

// ============ AI AGENTS ============
interface GiAgentRow { id: string; name: string; type: string; active: number; runnable: boolean }
interface GiAgentRun { id: string; agent_id: string; status: string; output: string | null; error: string | null; created_at: string }
const AGENT_TYPE_LABELS: Record<string, string> = {
  LEAD_QUALIFICATION: "Lead Qualification", APPOINTMENT: "Appointment Agent", SMS_FOLLOWUP: "SMS Follow-Up", EMAIL_FOLLOWUP: "Email Follow-Up",
  AI_RECEPTIONIST: "AI Receptionist", REACTIVATION: "Reactivation Agent", SALES_ASSISTANT: "Sales Assistant", ATTRIBUTION_ANALYST: "Attribution Analyst", REVENUE_RECOVERY: "Revenue Recovery Agent",
};
function GiAgents({ onFlash }: { onFlash: (m: string) => void }) {
  const [agents, setAgents] = useState<GiAgentRow[]>([]);
  const [runs, setRuns] = useState<GiAgentRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [contacts, setContacts] = useState<Array<{ id: string; full_name: string }>>([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => { const d = (await (await fetch("/api/growth/agents")).json()) as { agents?: GiAgentRow[]; runs?: GiAgentRun[] }; setAgents(d.agents || []); setRuns(d.runs || []); };
  useEffect(() => { void load(); void fetch("/api/crm/contacts").then((r) => r.json()).then((d) => setContacts(((d as { contacts?: Array<{ id: string; full_name: string }> }).contacts || []).slice(0, 100))); }, []);

  const create = async (name: string, type: string, instructions: string) => {
    const r = await fetch("/api/growth/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, instructions }) });
    if (!r.ok) return onFlash("Could not create agent");
    setCreating(false); await load(); onFlash("Agent created");
  };

  const run = async (agent: GiAgentRow) => {
    setRunning(agent.id);
    const body: Record<string, unknown> = { agentId: agent.id };
    if (agent.type === "SALES_ASSISTANT") { if (!selectedContact) { setRunning(null); return onFlash("Pick a contact first"); } body.contactId = selectedContact; }
    if (agent.type === "ATTRIBUTION_ANALYST") { if (!question.trim()) { setRunning(null); return onFlash("Ask a question first"); } body.question = question; }
    if (agent.type === "LEAD_QUALIFICATION") { setRunning(null); return onFlash("Run this from a form submission in Revenue Intelligence, or enable “Run AI lead qualification” on the form itself."); }
    const r = await fetch("/api/growth/agents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json() as { output?: string; error?: string };
    setRunning(null);
    if (!r.ok) return onFlash(d.error || "Agent run failed");
    await load(); onFlash("Agent run complete — see run history below");
  };

  return (
    <section className="giSection">
      <header><h1>AI Agents</h1><button onClick={() => setCreating(true)}>+ New agent</button></header>
      {creating && <NewAgentDialog onCreate={create} onCancel={() => setCreating(false)} />}
      <div className="giAgentGrid">
        {agents.map((a) => (
          <article className="giPanel giAgentCard" key={a.id}>
            <header><b>{a.name}</b><span className={a.runnable ? "giBadge giBadge-PUBLISHED" : "giBadge giBadge-DRAFT"}>{a.runnable ? "RUNNABLE" : "NEEDS CHANNEL"}</span></header>
            <small>{AGENT_TYPE_LABELS[a.type] || a.type}</small>
            {a.type === "SALES_ASSISTANT" && <select value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}><option value="">Choose a contact…</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>}
            {a.type === "ATTRIBUTION_ANALYST" && <input placeholder="Ask a question…" value={question} onChange={(e) => setQuestion(e.target.value)} />}
            <button disabled={running === a.id} onClick={() => void run(a)}>{running === a.id ? "Running…" : a.runnable ? "Run" : "Not connected"}</button>
          </article>
        ))}
        {!agents.length && <p className="giEmpty">No agents yet — create a Lead Qualification, Sales Assistant, Attribution Analyst, or Revenue Recovery agent to get a real, working AI action.</p>}
      </div>
      <article className="giPanel">
        <header><small>RUN HISTORY</small></header>
        {runs.map((r) => (
          <div className="giRunRow" key={r.id}>
            <span className={`giBadge giBadge-${r.status === "COMPLETE" ? "PUBLISHED" : r.status === "FAILED" ? "ARCHIVED" : "DRAFT"}`}>{r.status}</span>
            <p>{r.output || r.error || "…"}</p><small>{new Date(r.created_at).toLocaleString()}</small>
          </div>
        ))}
        {!runs.length && <p className="giEmpty">No agent runs yet.</p>}
      </article>
    </section>
  );
}
function NewAgentDialog({ onCreate, onCancel }: { onCreate: (name: string, type: string, instructions: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState("LEAD_QUALIFICATION"); const [instructions, setInstructions] = useState("");
  return (
    <div className="giDialog">
      <label>Agent name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(AGENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Instructions<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="How should this agent behave?" /></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!name.trim()} onClick={() => onCreate(name, type, instructions)}>Create</button></div>
    </div>
  );
}

// ============ CONVERSATIONS (honest — no telephony/SMS provider connected) ============
function GiConversations() {
  return (
    <section className="giSection">
      <header><h1>Conversations</h1></header>
      <article className="giPanel giNotConnected">
        <small>NOT CONNECTED</small>
        <h2>No SMS, voice, or chat provider is connected yet.</h2>
        <p>Conversations will appear here once a telephony/SMS provider (like Twilio) or a chat widget is connected in Integrations. Nothing here is faked — this panel stays empty until a real provider is wired up.</p>
      </article>
    </section>
  );
}

// ============ REVENUE INTELLIGENCE ============
interface RecoveryData {
  staleOpportunities: Array<{ id: string; name: string; stage: string; value_cents: number; updated_at: string }>;
  abandonedForms: Array<{ id: string; form_name: string; started_at: string }>;
  unpaidClosedWon: Array<{ id: string; name: string; value_cents: number; collected_cents: number }>;
  totals: { recoverableCount: number; potentialPipelineCents: number };
  disclaimer: string;
}
function GiRevenueIntelligence({ onFlash }: { onFlash: (m: string) => void }) {
  const [data, setData] = useState<RecoveryData | null>(null);
  const [running, setRunning] = useState(false);
  const [recoveryAgent, setRecoveryAgent] = useState<string | null>(null);
  const [insight, setInsight] = useState("");
  useEffect(() => {
    void fetch("/api/growth/revenue-recovery").then((r) => r.json()).then((d) => setData(d as RecoveryData));
    void fetch("/api/growth/agents").then((r) => r.json()).then((d) => { const a = ((d as { agents?: Array<{ id: string; type: string }> }).agents || []).find((x) => x.type === "REVENUE_RECOVERY"); setRecoveryAgent(a?.id || null); });
  }, []);
  const runAnalysis = async () => {
    if (!recoveryAgent) return onFlash("Create a Revenue Recovery agent in AI Agents first");
    setRunning(true);
    const r = await fetch("/api/growth/agents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: recoveryAgent }) });
    const d = await r.json() as { output?: string; error?: string };
    setRunning(false);
    if (!r.ok) return onFlash(d.error || "Analysis failed");
    setInsight(d.output || "");
  };
  if (!data) return <div className="giLoading">Loading…</div>;
  return (
    <section className="giSection">
      <header><h1>Revenue Recovery</h1><button disabled={running} onClick={() => void runAnalysis()}>{running ? "Analyzing…" : "✦ AI: find the best 3 to recover"}</button></header>
      <div className="giStatGrid">
        <article><small>RECOVERABLE OPPORTUNITIES DETECTED</small><b>{data.totals.recoverableCount}</b></article>
        <article><small>POTENTIAL PIPELINE VALUE</small><b>{money(data.totals.potentialPipelineCents)}</b></article>
      </div>
      <p className="giDisclaimer">{data.disclaimer}</p>
      {insight && <article className="giPanel"><small>AI RECOMMENDATION</small><p>{insight}</p></article>}
      <div className="giOverviewGrid">
        <article className="giPanel"><header><small>STALE OPPORTUNITIES</small></header>
          {data.staleOpportunities.map((o) => <div className="giRow" key={o.id}><b>{o.name}</b><span>{o.stage}</span><strong>{money(o.value_cents)}</strong></div>)}
          {!data.staleOpportunities.length && <p className="giEmpty">Nothing stale right now.</p>}
        </article>
        <article className="giPanel"><header><small>ABANDONED FORMS</small></header>
          {data.abandonedForms.map((f) => <div className="giRow" key={f.id}><b>{f.form_name}</b><span>{new Date(f.started_at).toLocaleDateString()}</span></div>)}
          {!data.abandonedForms.length && <p className="giEmpty">No abandoned form starts.</p>}
        </article>
        <article className="giPanel"><header><small>UNPAID CLOSED-WON</small></header>
          {data.unpaidClosedWon.map((o) => <div className="giRow" key={o.id}><b>{o.name}</b><span>Collected {money(o.collected_cents)}</span><strong>{money(o.value_cents - o.collected_cents)}</strong></div>)}
          {!data.unpaidClosedWon.length && <p className="giEmpty">Nothing unpaid.</p>}
        </article>
      </div>
    </section>
  );
}

// ============ EXPERIMENTS ============
interface GiExperimentRow { id: string; name: string; target_type: string; status: string; stats: { viewsA: number; convA: number; viewsB: number; convB: number; rateA: number; rateB: number; significant: boolean } }
function GiExperiments({ onFlash }: { onFlash: (m: string) => void }) {
  const [experiments, setExperiments] = useState<GiExperimentRow[]>([]);
  const [creating, setCreating] = useState(false);
  const load = async () => { const d = (await (await fetch("/api/growth/experiments")).json()) as { experiments?: GiExperimentRow[] }; setExperiments(d.experiments || []); };
  useEffect(() => { void load(); }, []);
  const create = async (name: string, targetType: string) => {
    const r = await fetch("/api/growth/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, targetType, variantA: { label: "A" }, variantB: { label: "B" } }) });
    if (!r.ok) return onFlash("Could not create experiment");
    setCreating(false); await load(); onFlash("Experiment created");
  };
  return (
    <section className="giSection">
      <header><h1>Experiments</h1><button onClick={() => setCreating(true)}>+ New experiment</button></header>
      {creating && <NewExperimentDialog onCreate={create} onCancel={() => setCreating(false)} />}
      <div className="giAgentGrid">
        {experiments.map((e) => (
          <article className="giPanel" key={e.id}>
            <header><b>{e.name}</b><span className="giBadge giBadge-DRAFT">{e.status}</span></header>
            <small>{e.target_type}</small>
            <div className="giVariantRow"><span>A: {e.stats.viewsA} views, {pct(e.stats.rateA)} conv</span><span>B: {e.stats.viewsB} views, {pct(e.stats.rateB)} conv</span></div>
            <p className="giEmpty">{e.stats.significant ? "Statistically significant difference." : "Not enough sample size yet for a confident winner."}</p>
          </article>
        ))}
        {!experiments.length && <p className="giEmpty">No experiments yet.</p>}
      </div>
    </section>
  );
}
function NewExperimentDialog({ onCreate, onCancel }: { onCreate: (name: string, targetType: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [targetType, setTargetType] = useState("FORM");
  return (
    <div className="giDialog">
      <label>Experiment name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Target<select value={targetType} onChange={(e) => setTargetType(e.target.value)}><option value="FORM">Form</option><option value="LANDING_PAGE">Landing page</option></select></label>
      <div><button onClick={onCancel}>Cancel</button><button disabled={!name.trim()} onClick={() => onCreate(name, targetType)}>Create</button></div>
    </div>
  );
}

// ============ INTEGRATIONS (honest connection status) ============
function GiIntegrations({ onFlash }: { onFlash: (m: string) => void }) {
  const connectors = [
    { name: "Anthropic (AI agents + optimizer)", connected: true, note: "Connected — powers Forms AI, Lead Qualification, Attribution Analyst, and the command bar." },
    { name: "Google Ads", connected: false, note: "Not connected — spend and offline conversions must be entered manually in Campaigns until this is wired up." },
    { name: "Meta Ads", connected: false, note: "Not connected." },
    { name: "TikTok Ads", connected: false, note: "Not connected." },
    { name: "Twilio (SMS / voice / call tracking)", connected: false, note: "Not connected — Conversations and Call Attribution stay empty until this is set up." },
    { name: "Stripe / payments", connected: false, note: "Not connected — revenue events are recorded from real CRM opportunity payments only, not live checkout webhooks yet." },
  ];
  return (
    <section className="giSection">
      <header><h1>Integrations</h1></header>
      <div className="giTable">
        <header><span>Connector</span><span>Status</span><span>Notes</span></header>
        {connectors.map((c) => (
          <div key={c.name} className="giTableRow">
            <b>{c.name}</b><span className={`giBadge giBadge-${c.connected ? "PUBLISHED" : "DRAFT"}`}>{c.connected ? "CONNECTED" : "NOT CONNECTED"}</span>
            <span className="giNote">{c.note}</span>
            {!c.connected && <button onClick={() => onFlash(`${c.name} isn't wired up yet — this needs real API credentials before it can connect.`)}>Connect</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============ AUTOMATIONS (visual node-graph builder) ============
type FlowNodeType = "trigger" | "condition" | "action" | "delay";
const TRIGGER_EVENTS = ["FORM_SUBMITTED", "CONTACT_CREATED", "OPPORTUNITY_CREATED"];
const ACTION_TYPES = ["CREATE_TASK", "ADD_NOTE", "ADD_TAG", "ASSIGN_REP", "UPDATE_STAGE"];
const ACTION_LABELS: Record<string, string> = { CREATE_TASK: "Create task", ADD_NOTE: "Add CRM note", ADD_TAG: "Add tag", ASSIGN_REP: "Assign rep", UPDATE_STAGE: "Update opportunity stage" };
const CONDITION_FIELDS = ["source", "campaign", "contact.gi_lead_score", "contact.lifecycle", "opportunity.value_cents", "opportunity.stage"];
const CONDITION_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than"];

function TriggerFlowNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  return (
    <div className={`flowNode flowNodeTrigger${selected ? " flowNodeSelected" : ""}`}>
      <small>TRIGGER</small>
      <b>{String(d.event || "Choose event")}</b>
      {!!d.filterField && <span>if {String(d.filterField)} {String(d.filterOperator)} {String(d.filterValue ?? "")}</span>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
function ConditionFlowNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  return (
    <div className={`flowNode flowNodeCondition${selected ? " flowNodeSelected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <small>CONDITION</small>
      <b>{String(d.field || "field")} {String(d.operator || "equals")} {String(d.value ?? "")}</b>
      <div className="flowNodeBranches"><span>Yes</span><span>No</span></div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} />
    </div>
  );
}
function ActionFlowNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  return (
    <div className={`flowNode flowNodeAction${selected ? " flowNodeSelected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <small>ACTION</small>
      <b>{ACTION_LABELS[String(d.actionType)] || "Choose action"}</b>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
function DelayFlowNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  return (
    <div className={`flowNode flowNodeDelay${selected ? " flowNodeSelected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <small>WAIT</small>
      <b>{String(d.amount ?? 1)} {String(d.unit || "hours")}</b>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const flowNodeTypes = { trigger: TriggerFlowNode, condition: ConditionFlowNode, action: ActionFlowNode, delay: DelayFlowNode };

interface GiAutomationRow { id: string; name: string; status: string; run_count: number }
function GiAutomations({ onFlash }: { onFlash: (m: string) => void }) {
  const [automations, setAutomations] = useState<GiAutomationRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = async () => { const d = (await (await fetch("/api/growth/automations")).json()) as { automations?: GiAutomationRow[] }; setAutomations(d.automations || []); };
  useEffect(() => { void load(); }, []);

  const create = async (name: string) => {
    const r = await fetch("/api/growth/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = (await r.json()) as { automation?: { id: string }; error?: string };
    if (!r.ok) return onFlash(d.error || "Could not create automation");
    setCreating(false); await load(); setEditingId(d.automation?.id || null);
  };

  if (editingId) return <GiAutomationEditor id={editingId} onBack={() => { setEditingId(null); void load(); }} onFlash={onFlash} />;

  return (
    <section className="giSection">
      <header><h1>Automations</h1><button onClick={() => setCreating(true)}>+ New automation</button></header>
      {creating && <div className="giDialog"><label>Automation name<input id="newAutomationName" placeholder="Qualify new roofing leads" /></label>
        <div><button onClick={() => setCreating(false)}>Cancel</button>
          <button onClick={() => { const el = document.getElementById("newAutomationName") as HTMLInputElement; if (el?.value.trim()) void create(el.value.trim()); }}>Create</button></div>
      </div>}
      <div className="giTable">
        <header><span>Name</span><span>Status</span><span>Runs</span></header>
        {automations.map((a) => (
          <button key={a.id} onClick={() => setEditingId(a.id)}>
            <b>{a.name}</b><span className={`giBadge giBadge-${a.status === "ACTIVE" ? "PUBLISHED" : a.status === "PAUSED" ? "ARCHIVED" : "DRAFT"}`}>{a.status}</span><span>{a.run_count}</span>
          </button>
        ))}
        {!automations.length && <p className="giEmpty">No automations yet — build one visually: trigger → condition → action → delay.</p>}
      </div>
    </section>
  );
}

interface GiAutomationRun { id: string; status: string; trace_json: string; created_at: string }
function GiAutomationEditor({ id, onBack, onFlash }: { id: string; onBack: () => void; onFlash: (m: string) => void }) {
  const [automation, setAutomation] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [runs, setRuns] = useState<GiAutomationRun[]>([]);

  const loadRuns = async () => { const d = (await (await fetch(`/api/growth/automations/runs?automationId=${id}`)).json()) as { runs?: GiAutomationRun[] }; setRuns(d.runs || []); };

  useEffect(() => {
    void fetch(`/api/growth/automations?id=${id}`).then((r) => r.json()).then((d) => {
      const a = (d as { automation?: Record<string, unknown> }).automation;
      if (!a) return;
      setAutomation({ id: String(a.id), name: String(a.name) });
      setStatus(String(a.status));
      setNodes(JSON.parse(String(a.nodes_json || "[]")));
      setEdges(JSON.parse(String(a.edges_json || "[]")));
    });
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: uid() }, eds)), [setEdges]);

  const addNode = (type: FlowNodeType) => {
    const nodeId = uid();
    const defaults: Record<FlowNodeType, Record<string, unknown>> = {
      trigger: { event: "FORM_SUBMITTED" }, condition: { field: "source", operator: "equals", value: "" },
      action: { actionType: "CREATE_TASK", title: "Follow up", dueInDays: 1 }, delay: { amount: 1, unit: "hours" },
    };
    setNodes((nds) => [...nds, { id: nodeId, type, data: defaults[type], position: { x: 80 + (nds.length % 3) * 220, y: 80 + Math.floor(nds.length / 3) * 160 } }]);
  };

  const updateSelectedData = (patch: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === selectedNode?.id ? { ...n, data: { ...n.data, ...patch } } : n)));
    setSelectedNode((sn) => (sn ? { ...sn, data: { ...sn.data, ...patch } } : sn));
  };

  const deleteSelected = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const save = async () => {
    const r = await fetch("/api/growth/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, updates: { nodes, edges, status } }) });
    if (!r.ok) return onFlash("Could not save automation");
    onFlash("Automation saved");
  };

  const checkDelayedSteps = async () => {
    const r = await fetch("/api/growth/automations/resume", { method: "POST" });
    const d = (await r.json()) as { resumed?: number; error?: string };
    if (!r.ok) return onFlash(d.error || "Could not check for due steps");
    await loadRuns();
    onFlash(`Checked — ${d.resumed || 0} run(s) resumed`);
  };

  if (!automation) return <div className="giLoading">Loading…</div>;

  return (
    <section className="giSection giAutomationEditor">
      <header>
        <button className="giBack" onClick={onBack}>← Automations</button><h1>{automation.name}</h1>
        <div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select>
          <button onClick={() => void save()}>Save</button>
        </div>
      </header>
      <div className="flowPalette">
        <button onClick={() => addNode("trigger")}>+ Trigger</button>
        <button onClick={() => addNode("condition")}>+ Condition</button>
        <button onClick={() => addNode("action")}>+ Action</button>
        <button onClick={() => addNode("delay")}>+ Delay</button>
        {selectedNode && <button className="flowDeleteBtn" onClick={deleteSelected}>Delete selected</button>}
      </div>
      <div className="flowCanvasWrap">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={flowNodeTypes} onNodeClick={(_, node) => setSelectedNode(node)} onPaneClick={() => setSelectedNode(null)} fitView colorMode="dark">
          <Background gap={18} color="#241a1c" />
          <Controls />
        </ReactFlow>
      </div>
      {selectedNode && <NodeInspector node={selectedNode} onChange={updateSelectedData} />}
      <article className="giPanel">
        <header><small>RUN HISTORY</small><button onClick={() => void checkDelayedSteps()}>Check delayed steps now</button></header>
        {runs.map((r) => (
          <div className="giRunRow" key={r.id}>
            <span className={`giBadge giBadge-${r.status === "COMPLETE" ? "PUBLISHED" : r.status === "FAILED" ? "ARCHIVED" : "DRAFT"}`}>{r.status}</span>
            <p>{(JSON.parse(r.trace_json || "[]") as Array<{ type: string; result: string }>).map((t) => `${t.type}: ${t.result}`).join(" → ")}</p>
            <small>{new Date(r.created_at).toLocaleString()}</small>
          </div>
        ))}
        {!runs.length && <p className="giEmpty">No runs yet — this fires on real form submissions once the automation is Active.</p>}
      </article>
    </section>
  );
}

function NodeInspector({ node, onChange }: { node: Node; onChange: (patch: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>;
  if (node.type === "trigger") return (
    <div className="giDialog flowInspector">
      <label>Event<select value={String(d.event || "")} onChange={(e) => onChange({ event: e.target.value })}>{TRIGGER_EVENTS.map((ev) => <option key={ev}>{ev}</option>)}</select></label>
      <label>Only if (optional)<select value={String(d.filterField || "")} onChange={(e) => onChange({ filterField: e.target.value })}><option value="">No filter</option><option value="source">source</option><option value="campaign">campaign</option></select></label>
      {!!d.filterField && <>
        <label>Operator<select value={String(d.filterOperator || "equals")} onChange={(e) => onChange({ filterOperator: e.target.value })}>{CONDITION_OPERATORS.map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Value<input value={String(d.filterValue || "")} onChange={(e) => onChange({ filterValue: e.target.value })} /></label>
      </>}
    </div>
  );
  if (node.type === "condition") return (
    <div className="giDialog flowInspector">
      <label>Field<select value={String(d.field || "")} onChange={(e) => onChange({ field: e.target.value })}>{CONDITION_FIELDS.map((f) => <option key={f}>{f}</option>)}</select></label>
      <label>Operator<select value={String(d.operator || "equals")} onChange={(e) => onChange({ operator: e.target.value })}>{CONDITION_OPERATORS.map((o) => <option key={o}>{o}</option>)}</select></label>
      <label>Value<input value={String(d.value ?? "")} onChange={(e) => onChange({ value: e.target.value })} /></label>
    </div>
  );
  if (node.type === "action") return (
    <div className="giDialog flowInspector">
      <label>Action<select value={String(d.actionType || "")} onChange={(e) => onChange({ actionType: e.target.value })}>{ACTION_TYPES.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}</select></label>
      {d.actionType === "CREATE_TASK" && <>
        <label>Task title<input value={String(d.title || "")} onChange={(e) => onChange({ title: e.target.value })} /></label>
        <label>Due in days<input type="number" value={Number(d.dueInDays ?? 1)} onChange={(e) => onChange({ dueInDays: Number(e.target.value) })} /></label>
      </>}
      {d.actionType === "ADD_NOTE" && <>
        <label>Note title<input value={String(d.title || "")} onChange={(e) => onChange({ title: e.target.value })} /></label>
        <label>Details<textarea value={String(d.details || "")} onChange={(e) => onChange({ details: e.target.value })} /></label>
      </>}
      {d.actionType === "ADD_TAG" && <label>Tag<input value={String(d.tag || "")} onChange={(e) => onChange({ tag: e.target.value })} /></label>}
      {d.actionType === "ASSIGN_REP" && <label>Rep email<input value={String(d.rep || "")} onChange={(e) => onChange({ rep: e.target.value })} /></label>}
      {d.actionType === "UPDATE_STAGE" && <label>Stage<input value={String(d.stage || "")} onChange={(e) => onChange({ stage: e.target.value })} /></label>}
    </div>
  );
  if (node.type === "delay") return (
    <div className="giDialog flowInspector">
      <label>Wait<input type="number" value={Number(d.amount ?? 1)} onChange={(e) => onChange({ amount: Number(e.target.value) })} /></label>
      <label>Unit<select value={String(d.unit || "hours")} onChange={(e) => onChange({ unit: e.target.value })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></label>
    </div>
  );
  return null;
}
