"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { StudioFormField, StudioSection } from "./sections";

/**
 * Renders a page's sections for real visitors — used by the public route
 * (app/s/page.tsx) and, in preview mode, by the builder. `editable` +
 * `onEditProp` let the builder reuse this exact markup for click-to-edit
 * instead of maintaining a second rendering path that could drift from
 * what visitors actually see.
 */
export function StudioSections({
  sections,
  editable,
  onEditProp,
  slug,
  onSubmitLead,
}: {
  sections: StudioSection[];
  editable?: boolean;
  onEditProp?: (sectionId: string, key: string, value: unknown) => void;
  slug?: string;
  onSubmitLead?: (sectionId: string) => void;
}) {
  return (
    <>
      {sections.map((s) => (
        <StudioSectionBlock key={s.id} section={s} editable={editable} onEditProp={onEditProp} slug={slug} onSubmitLead={onSubmitLead} />
      ))}
    </>
  );
}

function EditableText({ value, onChange, tag: Tag = "span", editable, style }: { value: string; onChange?: (v: string) => void; tag?: "h1" | "h2" | "h3" | "p" | "span"; editable?: boolean; style?: React.CSSProperties }) {
  if (!editable || !onChange) return <Tag style={style}>{value}</Tag>;
  return (
    <Tag
      style={style}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onChange(e.currentTarget.textContent || "")}
      className="studioEditable"
    >
      {value}
    </Tag>
  );
}

function StudioSectionBlock({
  section,
  editable,
  onEditProp,
  slug,
  onSubmitLead,
}: {
  section: StudioSection;
  editable?: boolean;
  onEditProp?: (sectionId: string, key: string, value: unknown) => void;
  slug?: string;
  onSubmitLead?: (sectionId: string) => void;
}) {
  const p = section.props;
  const edit = (key: string) => (v: string) => onEditProp?.(section.id, key, v);

  if (section.type === "hero") {
    return (
      <section className="studioHero" style={{ textAlign: (p.align as string) === "left" ? "left" : "center" }}>
        <EditableText tag="span" value={String(p.eyebrow || "")} onChange={edit("eyebrow")} editable={editable} style={{ display: "block" }} />
        <EditableText tag="h1" value={String(p.headline || "")} onChange={edit("headline")} editable={editable} />
        <EditableText tag="p" value={String(p.subheadline || "")} onChange={edit("subheadline")} editable={editable} />
        <a className="studioBtn" href={String(p.ctaHref || "#lead-form")} onClick={editable ? (e) => e.preventDefault() : undefined}>{String(p.ctaLabel || "Get started")}</a>
        {editable && <LinkPicker label="Button goes to" value={String(p.ctaHref || "#lead-form")} onChange={(v) => onEditProp?.(section.id, "ctaHref", v)} />}
      </section>
    );
  }
  if (section.type === "text") {
    return (
      <section className="studioText">
        <EditableText tag="h2" value={String(p.heading || "")} onChange={edit("heading")} editable={editable} />
        <EditableText tag="p" value={String(p.body || "")} onChange={edit("body")} editable={editable} />
      </section>
    );
  }
  if (section.type === "image") {
    return (
      <section className="studioImage">
        {p.url ? <img src={String(p.url)} alt={String(p.caption || "")} /> : <div className="studioImagePlaceholder">No image set</div>}
        {editable ? (
          <input placeholder="Image URL" defaultValue={String(p.url || "")} onBlur={(e) => onEditProp?.(section.id, "url", e.target.value)} />
        ) : p.caption ? <small>{String(p.caption)}</small> : null}
      </section>
    );
  }
  if (section.type === "testimonial") {
    return (
      <section className="studioTestimonial">
        <EditableText tag="p" value={String(p.quote || "")} onChange={edit("quote")} editable={editable} />
        <EditableText tag="span" value={String(p.name || "")} onChange={edit("name")} editable={editable} />
        {" — "}
        <EditableText tag="span" value={String(p.role || "")} onChange={edit("role")} editable={editable} />
      </section>
    );
  }
  if (section.type === "faq") {
    const items = Array.isArray(p.items) ? (p.items as { q: string; a: string }[]) : [];
    return (
      <section className="studioFaq">
        {items.map((item, i) => (
          <div key={i} className="studioFaqItem">
            <b>{item.q}</b>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
    );
  }
  if (section.type === "cta") {
    return (
      <section className="studioCta">
        <EditableText tag="h2" value={String(p.heading || "")} onChange={edit("heading")} editable={editable} />
        <a className="studioBtn" href={String(p.buttonHref || "#lead-form")} onClick={editable ? (e) => e.preventDefault() : undefined}>{String(p.buttonLabel || "Book a call")}</a>
        {editable && <LinkPicker label="Button goes to" value={String(p.buttonHref || "#lead-form")} onChange={(v) => onEditProp?.(section.id, "buttonHref", v)} />}
      </section>
    );
  }
  if (section.type === "form") {
    return <StudioFormSection section={section} editable={editable} slug={slug} onSubmitLead={onSubmitLead} onEditProp={onEditProp} />;
  }
  return null;
}

type EventType = { id: string; name: string; slug: string };
let eventTypeCache: EventType[] | null = null;
/** Event types from the Calendar tab, fetched once per builder session (editor only; visitors never call this). */
function useEventTypes(enabled: boolean) {
  const [types, setTypes] = useState<EventType[]>(eventTypeCache || []);
  useEffect(() => {
    if (!enabled || eventTypeCache) return;
    let live = true;
    fetch("/api/calendar/event-types").then((r) => r.json()).then((d) => { const list = (d.eventTypes || []) as EventType[]; eventTypeCache = list; if (live) setTypes(list); }).catch(() => {});
    return () => { live = false; };
  }, [enabled]);
  return types;
}

/** Builder-only picker for where a button sends the visitor: the page's own form or a Calendar booking link. */
function LinkPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const types = useEventTypes(true);
  const bookingOf = (slug: string) => `/?event=${encodeURIComponent(slug)}#book`;
  const matched = types.find((t) => bookingOf(t.slug) === value);
  const mode = value === "#lead-form" ? "form" : matched ? `book:${matched.slug}` : "custom";
  return (
    <div className="studioLinkPick" onClick={(e) => e.stopPropagation()}>
      <small>{label}</small>
      <select value={mode} onChange={(e) => { const v = e.target.value; if (v === "form") onChange("#lead-form"); else if (v.startsWith("book:")) onChange(bookingOf(v.slice(5))); else onChange(value.startsWith("#") || value.startsWith("/?event") ? "https://" : value); }}>
        <option value="form">This page's lead form</option>
        {types.map((t) => <option key={t.id} value={`book:${t.slug}`}>Book: {t.name}</option>)}
        <option value="custom">Custom URL</option>
      </select>
      {mode === "custom" && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://" />}
    </div>
  );
}

/** Builder-only panel under the lead form: what happens after a visitor submits. */
function FormAfterPanel({ p, set }: { p: Record<string, unknown>; set: (key: string, value: unknown) => void }) {
  const types = useEventTypes(true);
  const after = p.afterSubmit === "book" ? "book" : "message";
  return (
    <div className="studioLinkPick studioAfter" onClick={(e) => e.stopPropagation()}>
      <small>After submit · connect to Calendar + Automations</small>
      <div className="studioAfterGrid">
        <label>Then<select value={after} onChange={(e) => set("afterSubmit", e.target.value)}><option value="message">Show the thank-you message</option><option value="book">Send them to book an appointment</option></select></label>
        {after === "book" ? (
          <label>Appointment type<select value={String(p.bookingEvent || "")} onChange={(e) => set("bookingEvent", e.target.value)}><option value="">Any event type</option>{types.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}</select></label>
        ) : (
          <label>Thank-you message<input value={String(p.successMessage || "")} onChange={(e) => set("successMessage", e.target.value)} /></label>
        )}
        <label>Tag the contact<input value={String(p.tags || "")} onChange={(e) => set("tags", e.target.value)} placeholder="e.g. landing-page, hot-lead" /></label>
        <label>Assign to<input list="cyncro-team" value={String(p.assignTo || "")} onChange={(e) => set("assignTo", e.target.value)} placeholder="teammate email" /></label>
      </div>
      <p>Every submission creates or updates the CRM contact, opens a deal, and fires the "Form submitted" trigger in Automations. Tags fire "Tag added" too.</p>
    </div>
  );
}

function StudioFormSection({ section, editable, slug, onSubmitLead, onEditProp }: { section: StudioSection; editable?: boolean; slug?: string; onSubmitLead?: (id: string) => void; onEditProp?: (sectionId: string, key: string, value: unknown) => void }) {
  const p = section.props;
  const fields: StudioFormField[] = Array.isArray(p.fields) ? (p.fields as StudioFormField[]) : [];
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editable) { onSubmitLead?.(section.id); return; }
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setSubmitting(true);
    try {
      const res = await fetch("/api/studio/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, answers: data }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; next?: string | null };
      if (!res.ok) {
        setError(d.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      if (d.next) { window.location.assign(d.next); return; }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <section className="studioForm" id="lead-form">
        <p className="studioFormSuccess">{String(p.successMessage || "Thanks — we'll be in touch shortly.")}</p>
      </section>
    );
  }

  return (
    <section className="studioForm" id="lead-form">
      <h2>{String(p.heading || "Get in touch")}</h2>
      {p.subheading ? <p>{String(p.subheading)}</p> : null}
      <form onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.id}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea name={f.id} required={f.required} />
            ) : (
              <input name={f.id} type={f.type} required={f.required} />
            )}
          </label>
        ))}
        {error && <p className="studioFormError">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Submitting…" : String(p.submitLabel || "Submit")}</button>
      </form>
      {editable && <FormAfterPanel p={p} set={(k, v) => onEditProp?.(section.id, k, v)} />}
    </section>
  );
}
