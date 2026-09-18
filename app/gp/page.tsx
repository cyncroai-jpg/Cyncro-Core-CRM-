"use client";
import { useEffect, useState } from "react";

interface Section { id: string; type: string; text?: string; sub?: string; heading?: string; body?: string }
interface GiPage { id: string; name: string; sections_json: string }

export default function PublicLandingPage() {
  const slug = typeof window !== "undefined" ? new URLSearchParams(location.search).get("slug") || "" : "";
  const [page, setPage] = useState<GiPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) { setError("Page link is missing."); return; }
    void fetch(`/api/growth/landing-pages?slug=${encodeURIComponent(slug)}`).then(async (r) => {
      const d = await r.json() as { page?: GiPage; error?: string };
      if (!r.ok || !d.page) return setError(d.error || "This page is not available.");
      setPage(d.page);
    });
  }, [slug]);

  if (error) return <section className="giPublic giLandingPublic"><main><h1>{error}</h1></main></section>;
  if (!page) return <section className="giPublic giLandingPublic"><main><h1>Loading…</h1></main></section>;

  const sections: Section[] = JSON.parse(page.sections_json || "[]");
  return (
    <section className="giPublic giLandingPublic">
      <main>
        {sections.map((s) => {
          if (s.type === "HEADLINE") return <header key={s.id}><h1>{s.text}</h1>{s.sub && <p>{s.sub}</p>}</header>;
          if (s.type === "BUTTON") return <button key={s.id} className="formSubmit">{s.text}</button>;
          return <article key={s.id}><h2>{s.heading}</h2><p>{s.body}</p></article>;
        })}
      </main>
    </section>
  );
}
