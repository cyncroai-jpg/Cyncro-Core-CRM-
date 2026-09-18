"use client";
import { useEffect, useState } from "react";

interface GiField { id: string; label: string; type: string; required: boolean; options: string[]; role: "NAME" | "EMAIL" | "PHONE" | null }
interface GiStep { id: string; title: string; fields: GiField[] }
interface GiForm { id: string; name: string; steps_json: string; thank_you_json: string }

export default function PublicSmartForm() {
  const token = typeof window !== "undefined" ? new URLSearchParams(location.search).get("form") || "" : "";
  const [form, setForm] = useState<GiForm | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ message?: string; redirectUrl?: string } | null>(null);

  const utm = () => {
    if (typeof window === "undefined") return {};
    const p = new URLSearchParams(location.search);
    return { utmSource: p.get("utm_source") || undefined, utmMedium: p.get("utm_medium") || undefined, utmCampaign: p.get("utm_campaign") || undefined, referrer: document.referrer || undefined, landingPageUrl: location.href };
  };

  useEffect(() => {
    if (!token) { setError("Form link is missing."); return; }
    void fetch(`/api/growth/forms?token=${encodeURIComponent(token)}`).then(async (r) => {
      const d = await r.json() as { form?: GiForm; error?: string };
      if (!r.ok || !d.form) return setError(d.error || "This form is not available.");
      setForm(d.form);
      const startRes = await fetch("/api/growth/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "VIEW", ...utm() }) });
      void startRes;
    });
  }, [token]);

  const steps: GiStep[] = form ? JSON.parse(form.steps_json || "[]") : [];
  const step = steps[stepIndex];

  const ensureStarted = async () => {
    if (submissionId) return submissionId;
    const r = await fetch("/api/growth/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "START", ...utm() }) });
    const d = (await r.json()) as { submissionId?: string };
    const id = d.submissionId || "";
    setSubmissionId(id);
    return id;
  };

  const next = async () => {
    setError("");
    for (const f of step.fields) if (f.required && !answers[f.id]) return setError(`Please complete: ${f.label}`);
    const id = await ensureStarted();
    await fetch("/api/growth/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "STEP", submissionId: id, step: stepIndex, answers }) });
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    else void submit(id);
  };

  const submit = async (id: string) => {
    setSubmitting(true); setError("");
    const r = await fetch("/api/growth/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "SUBMIT", submissionId: id, answers }) });
    const d = (await r.json()) as { thankYou?: { message?: string; redirectUrl?: string }; error?: string };
    setSubmitting(false);
    if (!r.ok) return setError(d.error || "Submission failed.");
    setDone(d.thankYou || { message: "Thanks — we'll be in touch shortly." });
    if (d.thankYou?.redirectUrl) window.location.href = d.thankYou.redirectUrl;
  };

  if (done) return (
    <section className="publicForm giPublic">
      <main><i>✓</i><h1>{done.message || "Thanks — we'll be in touch shortly."}</h1></main>
    </section>
  );

  return (
    <section className="publicForm giPublic">
      <main>
        <header><small>{form?.name}</small>{steps.length > 1 && <div className="giProgress">{steps.map((_, i) => <span key={i} className={i <= stepIndex ? "giProgressDone" : ""} />)}</div>}</header>
        {error && <div className="bookingError">{error}</div>}
        {step && (
          <div className="publicFormBody">
            {step.fields.map((f, i) => (
              <label className="publicQuestion" key={f.id}>
                <span><i>{i + 1}</i><b>{f.label}</b>{f.required && <em>Required</em>}</span>
                {f.type === "DROPDOWN" || f.type === "RADIO" ? (
                  <select onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}><option value="">Choose one…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                ) : f.type === "CHECKBOX" ? (
                  <div className="checkChoices">{f.options.map((o) => (
                    <label key={o}><input type="checkbox" onChange={(e) => { const old = Array.isArray(answers[f.id]) ? answers[f.id] as string[] : []; setAnswers({ ...answers, [f.id]: e.target.checked ? [...old, o] : old.filter((x) => x !== o) }); }} />{o}</label>
                  ))}</div>
                ) : (
                  <input type={f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : f.type === "DATE" ? "date" : f.type === "NUMBER" || f.type === "CURRENCY" ? "number" : "text"}
                    onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                )}
              </label>
            ))}
            <button className="formSubmit" disabled={submitting} onClick={() => void next()}>
              {submitting ? "Submitting…" : stepIndex < steps.length - 1 ? "Continue →" : "Submit →"}
            </button>
          </div>
        )}
      </main>
    </section>
  );
}
