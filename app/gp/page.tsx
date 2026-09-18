"use client";
import { useEffect, useState } from "react";
import SmartForm from "@/components/growth/SmartForm";
import type { LpSection } from "@/lib/growth/sectionTypes";

interface GiPage { id: string; name: string; sections_json: string }

function Countdown({ endsAt, label }: { endsAt: string; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(remainingMs / 86_400_000);
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return (
    <div className="lpCountdown">
      <small>{label}</small>
      <div>{[["D", days], ["H", hours], ["M", minutes], ["S", seconds]].map(([u, v]) => (
        <span key={String(u)}><b>{String(v).padStart(2, "0")}</b><em>{String(u)}</em></span>
      ))}</div>
    </div>
  );
}

function SectionRenderer({ section }: { section: LpSection }) {
  const d = section.data || {};
  switch (section.type) {
    case "HEADLINE": return <header key={section.id}><h1>{String(d.headline || "")}</h1>{!!d.sub && <p>{String(d.sub)}</p>}</header>;
    case "TEXT": return <article key={section.id}><h2>{String(d.heading || "")}</h2><p>{String(d.body || "")}</p></article>;
    case "IMAGE": return d.url ? <img key={section.id} className="lpImage" src={String(d.url)} alt={String(d.alt || "")} /> : null;
    case "BUTTON": return <a key={section.id} className="formSubmit lpButton" href={String(d.href || "#")}>{String(d.text || "Learn more")}</a>;
    case "TESTIMONIAL": return <blockquote key={section.id} className="lpTestimonial">&ldquo;{String(d.quote || "")}&rdquo;<cite>— {String(d.author || "")}</cite></blockquote>;
    case "PRICING": return (
      <div key={section.id} className="lpPricing">
        <b>{String(d.title || "")}</b><strong>{String(d.price || "")}</strong>
        <ul>{String(d.features || "").split("\n").filter(Boolean).map((f) => <li key={f}>{f}</li>)}</ul>
      </div>
    );
    case "FAQ": return <div key={section.id} className="lpFaq"><b>{String(d.question || "")}</b><p>{String(d.answer || "")}</p></div>;
    case "COUNTDOWN": return <Countdown key={section.id} endsAt={String(d.endsAt || "")} label={String(d.label || "Offer ends in")} />;
    case "FORM": return d.formToken ? <div key={section.id} className="lpFormEmbed"><SmartForm token={String(d.formToken)} embedded /></div> : <p key={section.id} className="giEmpty">No form linked to this section yet.</p>;
    default: return null;
  }
}

export default function PublicLandingPage() {
  const slug = typeof window !== "undefined" ? new URLSearchParams(location.search).get("slug") || "" : "";
  const [page, setPage] = useState<GiPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) { setError("Page link is missing."); return; }
    void fetch(`/api/growth/landing-pages?slug=${encodeURIComponent(slug)}`).then(async (r) => {
      const d = (await r.json()) as { page?: GiPage; error?: string };
      if (!r.ok || !d.page) return setError(d.error || "This page is not available.");
      setPage(d.page);
    });
  }, [slug]);

  if (error) return <section className="giPublic giLandingPublic"><main><h1>{error}</h1></main></section>;
  if (!page) return <section className="giPublic giLandingPublic"><main><h1>Loading…</h1></main></section>;

  const sections: LpSection[] = JSON.parse(page.sections_json || "[]");
  return (
    <section className="giPublic giLandingPublic">
      <main>{sections.map((s) => <SectionRenderer key={s.id} section={s} />)}</main>
    </section>
  );
}
