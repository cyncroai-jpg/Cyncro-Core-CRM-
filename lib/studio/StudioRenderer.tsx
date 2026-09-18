"use client";
import { useState, type FormEvent } from "react";
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
        <a className="studioBtn" href={String(p.ctaHref || "#lead-form")}>{String(p.ctaLabel || "Get started")}</a>
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
        <a className="studioBtn" href={String(p.buttonHref || "#lead-form")}>{String(p.buttonLabel || "Book a call")}</a>
      </section>
    );
  }
  if (section.type === "form") {
    return <StudioFormSection section={section} editable={editable} slug={slug} onSubmitLead={onSubmitLead} />;
  }
  return null;
}

function StudioFormSection({ section, editable, slug, onSubmitLead }: { section: StudioSection; editable?: boolean; slug?: string; onSubmitLead?: (id: string) => void }) {
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
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
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
    </section>
  );
}
