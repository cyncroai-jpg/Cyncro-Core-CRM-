"use client";
import { useEffect, useState } from "react";

type PortalData = {
  client: {
    firstName: string; lastName: string; email: string;
    subscriptionStatus: string; onboardingStatus: string;
    scoreCurrent: number | null; scoreGoal: number | null; scoreStarting: number | null;
  };
  rounds: { id: string; round_number: number; credit_bureau: string; status: string; opened_at: string }[];
  items: { id: string; status: string; dispute_reason: string; outcome: string | null; created_at: string; creditor_name: string }[];
  scoreHistory: { recorded_date: string; average_score: number }[];
  documents: { id: string; doc_type: string; file_name: string; created_at: string }[];
  notifications: { subject: string; body: string; created_at: string }[];
};

const REASON_LABELS: Record<string, string> = {
  NOT_MINE: "Not mine", NOT_ACCURATE: "Not accurate", ALREADY_PAID: "Already paid",
  WRONG_AMOUNT: "Wrong amount", WRONG_STATUS: "Wrong status", IDENTITY_THEFT: "Identity theft",
  ACCOUNT_CLOSED: "Account closed", DUPLICATE: "Duplicate", WRONG_DATE: "Wrong date",
  NO_ACCOUNT_HISTORY: "No account history",
};

export default function DisputePortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [uploadType, setUploadType] = useState("IDENTITY");
  const [uploadName, setUploadName] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const load = (t: string) => {
    void fetch(`/api/dispute-portal?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d: PortalData & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      });
  };

  useEffect(() => {
    if (token === null) return;
    if (!token) { setError("This link is missing its access token."); return; }
    load(token);
  }, [token]);

  const submitUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !uploadName.trim()) return;
    void fetch("/api/dispute-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, docType: uploadType, fileName: uploadName }),
    }).then((r) => {
      if (r.ok) {
        setUploadNotice("Logged — your specialist has been notified to collect this document.");
        setUploadName("");
        load(token);
      }
    });
  };

  if (error) {
    return (
      <main className="disputePortalPublic disputePortalError">
        <p>{error}</p>
      </main>
    );
  }
  if (!data) return <main className="disputePortalPublic disputePortalLoading" />;

  const { client } = data;
  return (
    <main className="disputePortalPublic">
      <div className="disputePortalHeader">
        <span>CYNCRO DISPUTE · CLIENT PORTAL</span>
        <h1>Welcome back, {client.firstName}.</h1>
        <p>Your program status, dispute progress, and score history — read-only, secured to your own record.</p>
      </div>

      <section className="disputePortalCard">
        <div className="disputePortalScoreRow">
          <div><small>STARTING</small><b>{client.scoreStarting ?? "—"}</b></div>
          <div><small>CURRENT</small><b>{client.scoreCurrent ?? "—"}</b></div>
          <div><small>GOAL</small><b>{client.scoreGoal ?? "—"}</b></div>
        </div>
        <p className="disputePortalStatus">Program status: <b>{client.subscriptionStatus}</b> · Onboarding: <b>{client.onboardingStatus}</b></p>
      </section>

      <section className="disputePortalCard">
        <h2>Progress timeline</h2>
        {data.items.length === 0 && <p className="disputePortalEmpty">No items in progress yet.</p>}
        {data.items.map((item) => (
          <div className="disputePortalRow" key={item.id}>
            <b>{item.creditor_name}</b>
            <span>{REASON_LABELS[item.dispute_reason] || item.dispute_reason}</span>
            <em>{item.status}</em>
          </div>
        ))}
      </section>

      <section className="disputePortalCard">
        <h2>Dispute rounds</h2>
        {data.rounds.length === 0 && <p className="disputePortalEmpty">No rounds opened yet.</p>}
        {data.rounds.map((r) => (
          <div className="disputePortalRow" key={r.id}>
            <b>Round {r.round_number} · {r.credit_bureau}</b>
            <span>Opened {new Date(r.opened_at).toLocaleDateString()}</span>
            <em>{r.status}</em>
          </div>
        ))}
      </section>

      <section className="disputePortalCard">
        <h2>Upload a document</h2>
        <p className="disputePortalEmpty">
          File upload isn't wired to storage yet — this logs a request so your specialist
          knows to collect it from you directly.
        </p>
        <form className="disputePortalUploadForm" onSubmit={submitUpload}>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
            <option value="IDENTITY">Identity document</option>
            <option value="EVIDENCE">Supporting evidence</option>
          </select>
          <input placeholder="File description (e.g. Driver's license front)" value={uploadName} onChange={(e) => setUploadName(e.target.value)} required />
          <button type="submit">Notify my specialist</button>
        </form>
        {uploadNotice && <p className="disputePortalNotice">{uploadNotice}</p>}
        {data.documents.map((d) => (
          <div className="disputePortalRow" key={d.id}>
            <b>{d.file_name}</b>
            <span>{d.doc_type}</span>
            <em>{new Date(d.created_at).toLocaleDateString()}</em>
          </div>
        ))}
      </section>

      <footer className="disputePortalFooter">
        Cyncro Dispute does not guarantee removal of accurate information from your credit file,
        and does not guarantee any increase in your credit score.
      </footer>
    </main>
  );
}
