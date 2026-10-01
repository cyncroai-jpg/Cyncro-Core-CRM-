"use client";
import { useEffect, useState } from "react";

type Plan = { id: string; name: string; priceCents: number; seats: number; aiCalls: number; blurb: string; perks: string[] };
type State = { configured: boolean; pricesConfigured: boolean; plan: string; status: string; seats: number; seatsUsed: number; trialEndsAt: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; hasCustomer: boolean; daysLeft: number | null; writable: boolean };

const STATUS: Record<string, { label: string; tone: string }> = {
  TRIALING: { label: "Free trial", tone: "amber" }, ACTIVE: { label: "Active", tone: "green" }, PAST_DUE: { label: "Payment failed", tone: "red" },
  CANCELLED: { label: "Ended", tone: "red" }, EXPIRED: { label: "Trial ended", tone: "red" }, COMPLIMENTARY: { label: "Complimentary", tone: "green" },
};

/** Team Access → Billing: the company's plan, seats, trial, and the way to pay (Stripe Checkout / Portal). */
export function BillingPanel({ onFlash, isOwner }: { onFlash: (m: string) => void; isOwner: boolean }) {
  const [d, setD] = useState<{ state: State; plans: Plan[] } | null>(null);
  const [busy, setBusy] = useState("");
  const load = async () => { const r = await fetch("/api/billing"); if (r.ok) setD(await r.json()); };
  useEffect(() => { void load(); if (window.location.hash.includes("billing=success")) onFlash("Thanks! Your plan updates as soon as Stripe confirms the payment."); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const { state, plans } = d; const st = STATUS[state.status] || STATUS.TRIALING;
  const go = async (action: "checkout" | "portal", plan?: string) => {
    setBusy(plan || action);
    const r = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, plan }) });
    const j = await r.json().catch(() => ({})); setBusy("");
    if (!r.ok || !j.url) return onFlash(j.error || "Stripe request failed");
    window.location.href = j.url;
  };
  const headline = state.status === "TRIALING" ? `${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left on your free trial` : state.status === "EXPIRED" ? "Your free trial has ended" : state.status === "CANCELLED" ? "Your subscription has ended" : state.status === "PAST_DUE" ? "Your last payment didn't go through" : state.status === "COMPLIMENTARY" ? "This company is on the house" : `${plans.find((p) => p.id === state.plan)?.name || "Plan"} plan${state.cancelAtPeriodEnd ? ", ends" : ", renews"} ${state.periodEnd ? new Date(state.periodEnd).toLocaleDateString() : ""}`;
  return (
    <section className="crmPanel billingPanel">
      <div className="crmPanelHead"><div><small>BILLING</small><h2>{headline}</h2><p>{state.seatsUsed} of {state.seats} seats in use{state.status === "TRIALING" ? ` · trial ends ${new Date(state.trialEndsAt!).toLocaleDateString()}` : ""}.</p></div>
        <div className="cvPaneActions"><span className={`fxPill ${st.tone}`}>{st.label.toUpperCase()}</span>{isOwner && state.hasCustomer && state.configured && <button className="cyAiMini" disabled={busy === "portal"} onClick={() => void go("portal")}>{busy === "portal" ? "Opening…" : "Manage card, invoices, cancel"}</button>}</div></div>
      {!state.configured && <div className="billNote">Payments aren't connected on this deployment yet. {isOwner ? "Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the three STRIPE_PRICE_* secrets to turn on self-serve plans. Until then nothing is charged and nothing locks." : "Ask the owner about plans."}</div>}
      {state.configured && !state.pricesConfigured && isOwner && <div className="billNote">Stripe is connected but one or more STRIPE_PRICE_* secrets are missing, so some plans can't be bought yet.</div>}
      {!state.writable && <div className="billNote danger">Changes are paused until a plan is chosen. Everything you've built is safe and still readable.</div>}
      <div className="billPlans">
        {plans.map((p) => { const current = p.id === state.plan && ["ACTIVE", "PAST_DUE"].includes(state.status); return (
          <article key={p.id} className={`billPlan ${current ? "current" : ""}`}>
            <small>{p.name.toUpperCase()}</small><b>${(p.priceCents / 100).toLocaleString()}<i>/mo</i></b><p>{p.blurb}</p>
            <ul>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
            {current ? <span className="billCurrent">Your plan</span> : isOwner ? <button className="coSave" disabled={!state.configured || Boolean(busy)} onClick={() => void (state.hasCustomer && ["ACTIVE", "PAST_DUE"].includes(state.status) ? go("portal") : go("checkout", p.id))}>{busy === p.id ? "Opening…" : state.hasCustomer && ["ACTIVE", "PAST_DUE"].includes(state.status) ? "Switch in portal" : `Choose ${p.name}`}</button> : <span className="billCurrent dim">Owner can choose</span>}
          </article>); })}
      </div>
      <small className="billFoot">Billed monthly through Stripe. Cancel any time from the portal; access runs to the end of the paid month. Prices shown before tax.</small>
    </section>
  );
}
