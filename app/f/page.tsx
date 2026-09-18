"use client";
import { useEffect, useState } from "react";

type CyncroFormField = { id: string; label: string; type: string; required: boolean; options: string[] };

export default function PublicFormPage() {
  const token = typeof window !== "undefined" ? new URLSearchParams(location.search).get("form") || "" : "";
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("Form link is missing."); return; }
    void fetch(`/api/crm/forms?token=${encodeURIComponent(token)}`).then(async (r) => {
      const d = await r.json();
      if (!r.ok) setError(d.error || "Form unavailable");
      else setForm(d.form);
    });
  }, [token]);

  const fields: CyncroFormField[] = form ? JSON.parse(String(form.fields_json || "[]")) : [];

  const submit = async () => {
    setError("");
    for (const f of fields) {
      if (f.required && !answers[f.id] && !(files[f.id]?.length)) return setError(`Please complete: ${f.label}`);
    }
    if (Number(form?.requires_signature) === 1 && (!signature.trim() || !accepted)) {
      return setError("Type your signature and accept the electronic consent.");
    }
    setSaving(true);
    const r = await fetch("/api/crm/forms", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SUBMIT", token, respondentName: name, respondentEmail: email, answers, signatureName: signature }),
    });
    const d = (await r.json()) as { submissionId?: string; error?: string };
    if (!r.ok) { setSaving(false); return setError(d.error || "Submission failed"); }
    for (const [questionId, list] of Object.entries(files)) {
      for (const file of list) {
        const data = new FormData();
        data.append("token", token);
        data.append("submissionId", d.submissionId || "");
        data.append("questionId", questionId);
        data.append("file", file);
        const up = await fetch("/api/crm/forms/uploads", { method: "POST", body: data });
        if (!up.ok) { setSaving(false); return setError("Your answers were saved, but one file could not upload."); }
      }
    }
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <section className="publicForm">
        <main className="formThankYou">
          <i>✓</i>
          <small>SUBMISSION RECEIVED</small>
          <h1>Everything is safely with our team.</h1>
          <p>Your answers, signature, and uploaded files were recorded.</p>
        </main>
      </section>
    );
  }

  return (
    <section className="publicForm">
      <main>
        <header>
          <small>CYNCRO SECURE INTAKE</small>
          <h1>{String(form?.title || "Loading form…")}</h1>
          <p>{String(form?.description || "")}</p>
        </header>
        {error && <div className="bookingError">{error}</div>}
        {form && (
          <div className="publicFormBody">
            <div className="respondentGrid">
              <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            </div>
            {fields.map((f, index) => (
              <label className="publicQuestion" key={f.id}>
                <span><i>{index + 1}</i><b>{f.label}</b>{f.required && <em>Required</em>}</span>
                {f.type === "LONG" ? (
                  <textarea onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                ) : f.type === "SELECT" ? (
                  <select onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}>
                    <option value="">Choose one…</option>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === "CHECKBOX" ? (
                  <div className="checkChoices">
                    {f.options.map((o) => (
                      <label key={o}>
                        <input type="checkbox" onChange={(e) => {
                          const old = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
                          setAnswers({ ...answers, [f.id]: e.target.checked ? [...old, o] : old.filter((x) => x !== o) });
                        }} />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : f.type === "FILE" ? (
                  <div className="uploadZone">
                    <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={(e) => setFiles({ ...files, [f.id]: Array.from(e.target.files || []) })} />
                    <b>Choose pictures or documents</b>
                    <small>{files[f.id]?.map((x) => x.name).join(", ") || "Up to 20MB per file"}</small>
                  </div>
                ) : (
                  <input type={f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : f.type.toLowerCase()}
                    onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                )}
              </label>
            ))}
            {Number(form.requires_signature) === 1 && (
              <section className="formSignature">
                <small>ELECTRONIC SIGNATURE</small>
                <label>Type your full legal name<input value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
                <label>
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  I confirm my responses are accurate and adopt my typed name as my electronic signature.
                </label>
              </section>
            )}
            <button className="formSubmit" disabled={saving} onClick={() => void submit()}>
              {saving ? "Securely submitting…" : "Submit questionnaire →"}
            </button>
          </div>
        )}
      </main>
    </section>
  );
}
