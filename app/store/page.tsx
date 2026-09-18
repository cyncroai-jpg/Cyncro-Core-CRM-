"use client";
import { useEffect, useState } from "react";

type StoreVehicle = { id: string; stock_number: string; year: number | null; make: string | null; model: string | null; trim: string | null; mileage: number | null; asking_price_cents: number };
type Estimate = { amountFinancedCents: number; monthlyPaymentCents: number; estimatedApr: number; disclaimer: string };

function money(cents: number | null | undefined) {
  return `$${Math.round((cents || 0) / 100).toLocaleString()}`;
}

export default function DigitalStorefrontPage() {
  const [dealer, setDealer] = useState<string | null>(null);
  const [dealerName, setDealerName] = useState("");
  const [inventory, setInventory] = useState<StoreVehicle[] | null>(null);
  const [error, setError] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<StoreVehicle | null>(null);
  const [downPayment, setDownPayment] = useState(3000);
  const [termMonths, setTermMonths] = useState(72);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [leadForm, setLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDealer(params.get("dealer") || "");
    setSelectedVehicleId(params.get("vehicle"));
  }, []);

  useEffect(() => {
    if (dealer === null) return;
    if (!dealer) { setError("This storefront link is missing a dealer."); return; }
    if (selectedVehicleId) {
      void fetch(`/api/store?dealer=${encodeURIComponent(dealer)}&vehicleId=${selectedVehicleId}`)
        .then((r) => r.json())
        .then((d: { dealer?: { name: string }; vehicle?: StoreVehicle; error?: string }) => {
          if (d.error || !d.vehicle) { setError(d.error || "Vehicle not found."); return; }
          setDealerName(d.dealer?.name || "");
          setVehicle(d.vehicle);
          if (typeof document !== "undefined") document.title = `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model} — ${d.dealer?.name}`;
        });
    } else {
      void fetch(`/api/store?dealer=${encodeURIComponent(dealer)}`)
        .then((r) => r.json())
        .then((d: { dealer?: { name: string }; inventory?: StoreVehicle[]; error?: string }) => {
          if (d.error) { setError(d.error); return; }
          setDealerName(d.dealer?.name || "");
          setInventory(d.inventory || []);
          if (typeof document !== "undefined") document.title = `${d.dealer?.name} — Shop inventory`;
        });
    }
  }, [dealer, selectedVehicleId]);

  useEffect(() => {
    if (!vehicle || !dealer) return;
    void fetch(`/api/store?dealer=${encodeURIComponent(dealer)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "estimate", vehicleId: vehicle.id, downPayment, termMonths }),
    }).then((r) => r.json()).then((d: Estimate) => setEstimate(d));
  }, [vehicle, downPayment, termMonths, dealer]);

  const openVehicle = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("vehicle", id);
    window.history.pushState(null, "", url.toString());
    setSelectedVehicleId(id);
    setVehicle(null);
  };
  const backToInventory = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("vehicle");
    window.history.pushState(null, "", url.toString());
    setSelectedVehicleId(null);
    setVehicle(null);
    setInventory(null);
  };

  const submitLead = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vehicle || !dealer) return;
    const data = new FormData(e.currentTarget);
    setSubmitting(true);
    void fetch(`/api/store?dealer=${encodeURIComponent(dealer)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit-lead", vehicleId: vehicle.id, downPayment, termMonths,
        firstName: data.get("firstName"), lastName: data.get("lastName"), email: data.get("email"), phone: data.get("phone"),
      }),
    }).then(async (r) => {
      setSubmitting(false);
      if (r.ok) setLeadSubmitted(true);
    });
  };

  if (error) return <main className="storeShell storeError"><p>{error}</p></main>;
  if (!dealerName) return <main className="storeShell storeLoading" />;

  return (
    <main className="storeShell">
      <div className="storeHeader">
        <span>{dealerName}</span>
        {vehicle && <button onClick={backToInventory}>← All inventory</button>}
      </div>

      {!vehicle && (
        <>
          <div className="storeHero">
            <h1>Shop {dealerName}&apos;s inventory.</h1>
            <p>Real units, real pricing. Build your own deal before you ever step on the lot.</p>
          </div>
          <div className="storeGrid">
            {(inventory || []).map((v) => (
              <button className="storeCard" onClick={() => openVehicle(v.id)} key={v.id}>
                <b>{v.year} {v.make} {v.model}</b>
                <small>{v.trim} · {v.mileage?.toLocaleString() ?? "—"} mi · {v.stock_number}</small>
                <strong>{money(v.asking_price_cents)}</strong>
              </button>
            ))}
            {inventory && !inventory.length && <p className="storeEmpty">No vehicles listed right now — check back soon.</p>}
          </div>
        </>
      )}

      {vehicle && (
        <div className="storeVehicleDetail">
          <div className="storeVehicleHead">
            <h1>{vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim}</h1>
            <p>{vehicle.mileage?.toLocaleString() ?? "—"} miles · Stock {vehicle.stock_number}</p>
            <b>{money(vehicle.asking_price_cents)}</b>
          </div>
          <section className="storeCalculator">
            <h2>Build your deal</h2>
            <label>
              Down payment <b>{money(downPayment * 100)}</b>
              <input type="range" min="0" max="20000" step="250" value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value))} />
            </label>
            <div className="storeTermOptions">
              {[48, 60, 72, 84].map((t) => (
                <button className={termMonths === t ? "active" : ""} onClick={() => setTermMonths(t)} key={t}>{t} mo</button>
              ))}
            </div>
            {estimate && (
              <div className="storePaymentOutput">
                <small>ESTIMATED PAYMENT</small>
                <b>{money(estimate.monthlyPaymentCents)}<i>/mo</i></b>
                <span>{estimate.estimatedApr}% est. APR · {money(estimate.amountFinancedCents)} financed</span>
                <p>{estimate.disclaimer}</p>
              </div>
            )}
          </section>
          {leadSubmitted ? (
            <div className="storeLeadSuccess">✓ We've got your info — a specialist will reach out to finish your deal.</div>
          ) : leadForm ? (
            <form className="storeLeadForm" onSubmit={submitLead}>
              <input name="firstName" placeholder="First name" required />
              <input name="lastName" placeholder="Last name" required />
              <input name="email" type="email" placeholder="Email" required />
              <input name="phone" placeholder="Phone" />
              <button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Start my deal"}</button>
            </form>
          ) : (
            <button className="storeStartDealBtn" onClick={() => setLeadForm(true)}>Start my deal at this payment →</button>
          )}
        </div>
      )}
    </main>
  );
}
