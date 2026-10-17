"use client";
/** Shared shell for the public legal pages. Plain, readable, no app chrome. */
export function LegalPage({ title, updated, eyebrow, children }: { title: string; updated?: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <main className="legalPage">
      <header><a href="/" className="legalBrand">Cyncro Core</a><nav><a href="/pricing">Pricing</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/login">Sign in</a></nav></header>
      <article>
        <small>{eyebrow || `LAST UPDATED ${updated}`}</small>
        <h1>{title}</h1>
        {children}
      </article>
      <footer>© {new Date().getFullYear()} Cyncro Core. Questions: <a href="mailto:hello@app-cyncrocore.com">hello@app-cyncrocore.com</a></footer>
    </main>
  );
}
