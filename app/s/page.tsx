"use client";
import { useEffect, useState } from "react";
import { StudioSections } from "@/lib/studio/StudioRenderer";
import type { StudioSection } from "@/lib/studio/sections";

export default function PublicStudioPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<StudioSection[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("slug") || "";
    setSlug(s);
  }, []);

  useEffect(() => {
    if (slug === null) return;
    if (!slug) { setNotFound(true); return; }
    void fetch(`/api/studio/public?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { page?: { title: string; seoTitle?: string; seoDescription?: string; sections: StudioSection[] } } | null) => {
        if (!data?.page) { setNotFound(true); return; }
        setTitle(data.page.title);
        setSections(data.page.sections);
        if (typeof document !== "undefined") document.title = data.page.seoTitle || data.page.title;
      });
  }, [slug]);

  if (notFound) {
    return (
      <main className="studioPublic studioNotFound">
        <p>This page is no longer available.</p>
      </main>
    );
  }
  if (!sections) {
    return <main className="studioPublic studioLoading" />;
  }
  return (
    <main className="studioPublic">
      <StudioSections sections={sections} slug={slug || ""} />
    </main>
  );
}
