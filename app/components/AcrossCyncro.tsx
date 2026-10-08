"use client";
import { useEffect, useState } from "react";

type Row = Record<string, unknown>;
type Data = { jobs: Row[]; vehicleDeals: Row[]; disputeRounds: Row[]; bookings: Row[]; invoices: Row[]; contracts: Row[]; apps: string[] };
const usd = (c: unknown) => (Number(c || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

/** On a contact: everything this person has across Dispatch, Automotive, Dispute, Calendar, Invoices and Contracts. */
export function AcrossCyncro({ contactId }: { contactId: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { setD(null); void fetch(`/api/crm/contacts/across?id=${encodeURIComponent(contactId)}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setD(j)).catch(() => undefined); }, [contactId]);
  if (!d) return null;
  type Section = { key: string; label: string; rows: Row[]; line: (r: Row) => [string, string, string] };
  const sections: Section[] = ([
    { key: "bookings", label: "Appointments", rows: d.bookings, line: (r: Row) => [String(r.event_name || "Appointment"), when(r.starts_at), String(r.status || "")] },
    { key: "jobs", label: "Dispatch jobs", rows: d.jobs, line: (r: Row) => [String(r.service_type), `${when(r.scheduled_at)}${r.tech ? ` · ${r.tech}` : ""}`, `${String(r.status || "")}${r.revenue_cents ? ` · ${usd(r.revenue_cents)}` : ""}`] },
    { key: "vehicleDeals", label: "Vehicle deals", rows: d.vehicleDeals, line: (r: Row) => [[r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle deal", when(r.created_at), `${String(r.status || "")} · ${usd(r.sale_price_cents)}`] },
    { key: "disputeRounds", label: "Dispute rounds", rows: d.disputeRounds, line: (r: Row) => [`Round ${r.round_number} · ${r.credit_bureau}`, when(r.opened_at), String(r.status || "")] },
    { key: "invoices", label: "Invoices", rows: d.invoices, line: (r: Row) => [String(r.invoice_number), r.paid_at ? `paid ${when(r.paid_at)}` : r.due_date ? `due ${when(r.due_date)}` : "", `${String(r.status || "")} · ${usd(r.amount_cents)}`] },
    { key: "contracts", label: "Contracts", rows: d.contracts, line: (r: Row) => [String(r.title), r.signed_at ? `signed ${when(r.signed_at)}` : when(r.created_at), String(r.status || "")] },
  ] as Section[]).filter((s) => s.rows.length);
  if (!sections.length) return null;
  return (
    <section className="acrossCyncro">
      <small>ACROSS CYNCRO</small>
      {sections.map((s) => (
        <div key={s.key} className="acrossGroup">
          <b>{s.label} <em>{s.rows.length}</em></b>
          <ul>{s.rows.slice(0, 6).map((r, i) => { const [a, b, c] = s.line(r); return <li key={String(r.id || i)}><span>{a}</span><small>{b}</small><i className={`fxPill ${/PAID|SIGNED|COMPLETE|CLOSED WON|DELIVERED|BOOKED|CONFIRMED/.test(c) ? "green" : /OVERDUE|CANCEL|LOST|VOID/.test(c) ? "red" : "amber"}`}>{c}</i></li>; })}</ul>
        </div>
      ))}
    </section>
  );
}
