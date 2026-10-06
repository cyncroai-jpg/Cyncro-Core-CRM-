"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./smart-money.css";

// ─── Types (mirror lib/smart-money/engine.ts responses) ──────────────────────

type Change = "NEW" | "ADDED" | "TRIMMED" | "HELD" | "EXITED";

type Holder = {
  cik: string;
  investor: string;
  fund: string;
  valueUsd: number;
  shares: number;
  weight: number;
  change: Change;
  deltaPct: number | null;
  impliedPrice: number | null;
};

type Company = {
  cusip: string;
  ticker: string | null;
  name: string;
  holders: Holder[];
  exits: { cik: string; investor: string; fund: string; prevValueUsd: number }[];
  holderCount: number;
  totalValue: number;
  newCount: number;
  addedCount: number;
  trimmedCount: number;
  exitCount: number;
  maxWeight: number;
  smartPrice: number | null;
  netFlowUsd: number;
  price: number | null;
  dayChangePct: number | null;
  vsSmartPct: number | null;
  insiderBuys30d: number;
  insiderValue30d: number;
  score: number;
  factors: { breadth: number; conviction: number; momentum: number; insider: number; value: number };
  reasons: string[];
  badges: string[];
};

type Investor = {
  cik: string;
  name: string;
  fund: string;
  style: string;
  is_custom: number;
  filer_name: string | null;
  latest_period: string | null;
  latest_filed: string | null;
  portfolio_value: number | null;
  positions: number | null;
  last_synced_at: string | null;
  last_error: string | null;
};

type Insider = {
  accession: string;
  seq: number;
  filed_at: string;
  issuer: string;
  ticker: string;
  owner: string;
  role: string;
  trade_date: string;
  shares: number;
  price: number;
  value_usd: number;
};

type LiveEvent = { id: number; kind: string; title: string; detail: string | null; ticker: string | null; created_at: string };

type Filters = {
  q: string;
  investors: string[];
  match: "any" | "all";
  minHolders: number;
  minWeight: number;
  activity: "any" | "new" | "added" | "accumulating" | "exiting";
  minValue: number;
  insiderOnly: boolean;
  belowSmartPrice: boolean;
  sort: "score" | "holders" | "value" | "momentum" | "conviction" | "discount" | "insider";
};

type ScreenResponse = {
  total: number;
  companies: Company[];
  investors: Investor[];
  stats: { investorsTracked: number; investorsSynced: number; aumTracked: number; companiesTracked: number; newBuys: number; insiderNames: number };
  live: { at: number; error: string | null };
  ai: boolean;
};

type ChatTurn = { role: "user" | "assistant"; content: string; tickers?: string[]; filters?: Partial<Filters> | null; engine?: string };

type Tab = "radar" | "billionaires" | "insiders" | "analyst";

const DEFAULT_FILTERS: Filters = {
  q: "",
  investors: [],
  match: "any",
  minHolders: 1,
  minWeight: 0,
  activity: "any",
  minValue: 0,
  insiderOnly: false,
  belowSmartPrice: false,
  sort: "score",
};

const PRESETS: { label: string; hint: string; filters: Partial<Filters> }[] = [
  { label: "Billionaire consensus", hint: "3+ holders, accumulating", filters: { minHolders: 3, activity: "accumulating", sort: "score" } },
  { label: "Fresh money", hint: "New positions last quarter", filters: { activity: "new", sort: "value" } },
  { label: "High conviction", hint: "≥8% of a portfolio", filters: { minWeight: 8, sort: "conviction" } },
  { label: "Smart money + insiders", hint: "Insiders buying too", filters: { insiderOnly: true, sort: "insider" } },
  { label: "Below their entry", hint: "Cheaper than quarter-end", filters: { belowSmartPrice: true, sort: "discount" } },
  { label: "Who's dumping", hint: "Net selling", filters: { activity: "exiting", sort: "momentum" } },
];

const SUGGESTIONS = [
  "What are billionaires buying most aggressively right now?",
  "Which stocks do Buffett and Ackman both own?",
  "Find high-conviction bets where insiders are also buying",
  "What did Druckenmiller buy new last quarter?",
  "Which consensus picks are trading below the smart-money entry price?",
];

// ─── Formatting helpers ──────────────────────────────────────────────────────

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function ago(timestamp: number | string | null | undefined) {
  if (!timestamp) return "never";
  const ms = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!ms) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function scoreTone(score: number) {
  if (score >= 75) return "hot";
  if (score >= 55) return "warm";
  if (score >= 35) return "mild";
  return "cold";
}

function toQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.investors.length) params.set("investors", filters.investors.join(","));
  if (filters.match !== "any") params.set("match", filters.match);
  if (filters.minHolders > 1) params.set("minHolders", String(filters.minHolders));
  if (filters.minWeight > 0) params.set("minWeight", String(filters.minWeight));
  if (filters.activity !== "any") params.set("activity", filters.activity);
  if (filters.minValue > 0) params.set("minValue", String(filters.minValue));
  if (filters.insiderOnly) params.set("insiderOnly", "1");
  if (filters.belowSmartPrice) params.set("belowSmartPrice", "1");
  params.set("sort", filters.sort);
  params.set("limit", "150");
  return params.toString();
}

/** Minimal, safe markdown: **bold**, _italic_, line breaks, numbered/bullet lines. */
function RichText({ text }: { text: string }) {
  const renderInline = (line: string) => {
    const parts: ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(line))) {
      if (match.index > last) parts.push(line.slice(last, match.index));
      const token = match[0];
      if (token.startsWith("**")) parts.push(<b key={key++}>{token.slice(2, -2)}</b>);
      else if (token.startsWith("`")) parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
      else parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
      last = match.index + token.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };
  return (
    <div className="smRich">
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={index} />;
        if (/^#{1,3}\s/.test(trimmed)) return <h4 key={index}>{renderInline(trimmed.replace(/^#{1,3}\s/, ""))}</h4>;
        if (/^(\d+\.|[-•*])\s/.test(trimmed)) return <p key={index} className="smRichItem">{renderInline(trimmed)}</p>;
        return <p key={index}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

// ─── Main module ─────────────────────────────────────────────────────────────

export default function SmartMoney() {
  const [tab, setTab] = useState<Tab>("radar");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ cusip?: string; ticker?: string } | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [liveInsiders, setLiveInsiders] = useState<Insider[]>([]);
  const [liveAt, setLiveAt] = useState(0);
  const [, setTick] = useState(0);
  const [sync, setSync] = useState<{ running: boolean; done: number; total: number; current: string; failures: string[] }>({
    running: false,
    done: 0,
    total: 0,
    current: "",
    failures: [],
  });
  const [toast, setToast] = useState("");
  const lastEventId = useRef(0);
  const dataVersion = useRef("");
  const stopSync = useRef(false);
  const autoSynced = useRef(false);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const load = useCallback(async (current: Filters) => {
    try {
      const response = await fetch(`/api/smart-money?${toQuery(current)}`);
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = (await response.json()) as ScreenResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load the radar.");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the radar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), filters.q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  // Live pulse: poll every 30s; server throttles upstream refreshes.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/smart-money/live?since=${lastEventId.current}`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { events: LiveEvent[]; insiders: Insider[]; dataVersion: string; liveAt: number };
        setLiveInsiders(body.insiders || []);
        setLiveAt(body.liveAt || 0);
        if (body.events?.length) {
          const isFirst = lastEventId.current === 0;
          lastEventId.current = Math.max(lastEventId.current, ...body.events.map((e) => e.id));
          setEvents((prev) => [...body.events, ...prev.filter((p) => !body.events.some((e) => e.id === p.id))].slice(0, 60));
          if (!isFirst) {
            setFreshIds(new Set(body.events.map((e) => e.id)));
            flash(`⚡ ${body.events[0].title}`);
          }
        }
        if (dataVersion.current && body.dataVersion !== dataVersion.current) void load(filtersRef.current);
        dataVersion.current = body.dataVersion;
      } catch {
        /* Offline polls are retried on the next tick. */
      }
    };
    void poll();
    const timer = window.setInterval(poll, 30_000);
    const clock = window.setInterval(() => setTick((t) => t + 1), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [flash, load]);

  const runSync = useCallback(
    async (targets: Investor[], force = false) => {
      if (!targets.length) return;
      stopSync.current = false;
      setSync({ running: true, done: 0, total: targets.length, current: targets[0].name, failures: [] });
      const failures: string[] = [];
      for (let i = 0; i < targets.length; i += 1) {
        if (stopSync.current) break;
        setSync((s) => ({ ...s, current: targets[i].name, done: i }));
        try {
          const response = await fetch("/api/smart-money/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cik: targets[i].cik, force }),
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            failures.push(`${targets[i].name}: ${body.error || response.status}`);
          }
        } catch {
          failures.push(`${targets[i].name}: network error`);
        }
        if ((i + 1) % 4 === 0) void load(filtersRef.current);
      }
      setSync((s) => ({ ...s, running: false, done: targets.length, current: "", failures }));
      await load(filtersRef.current);
      flash(failures.length ? `Sync finished with ${failures.length} issue${failures.length > 1 ? "s" : ""}` : "Radar synced with SEC EDGAR ✓");
    },
    [flash, load],
  );

  // First visit: pull every unsynced investor automatically.
  useEffect(() => {
    if (!data || autoSynced.current || sync.running) return;
    autoSynced.current = true;
    const pending = data.investors.filter((inv) => !inv.latest_period && !inv.last_error);
    if (!pending.length) return;
    const timer = window.setTimeout(() => void runSync(pending), 0);
    return () => window.clearTimeout(timer);
  }, [data, runSync, sync.running]);

  const applyFilters = (patch: Partial<Filters>, reset = false) => {
    setFilters((current) => ({ ...(reset ? DEFAULT_FILTERS : current), ...patch }));
    setTab("radar");
  };

  const investors = data?.investors || [];
  const stats = data?.stats;
  const tape = useMemo(() => {
    const items = [
      ...events.slice(0, 20).map((e) => ({ key: `e${e.id}`, kind: e.kind, text: e.title, ticker: e.ticker })),
      ...liveInsiders.slice(0, 12).map((t) => ({ key: `i${t.accession}${t.seq}`, kind: "INSIDER", text: `${t.ticker || t.issuer} · ${t.owner} bought ${money(t.value_usd)}`, ticker: t.ticker })),
    ];
    const seen = new Set<string>();
    return items.filter((item) => (seen.has(item.text) ? false : (seen.add(item.text), true)));
  }, [events, liveInsiders]);

  return (
    <section className="sm">
      <div className="smGlow" aria-hidden />
      <div className="smHero">
        <div>
          <p className="smEyebrow">
            <span className="smPulse" /> LIVE · SEC EDGAR 13F + FORM 4
          </p>
          <h1>
            Smart Money <i>Radar</i>
          </h1>
          <p className="smLede">
            Track what the world&apos;s billionaire investors are buying, adding and dumping — scored, ranked and cross-checked against live insider buys.
          </p>
        </div>
        <div className="smHeroStats">
          <Stat label="Billionaires tracked" value={stats ? `${stats.investorsSynced}/${stats.investorsTracked}` : "—"} />
          <Stat label="13F capital tracked" value={stats ? money(stats.aumTracked) : "—"} />
          <Stat label="Companies on radar" value={stats ? stats.companiesTracked.toLocaleString() : "—"} />
          <Stat label="Fresh positions" value={stats ? stats.newBuys.toLocaleString() : "—"} accent />
          <Stat label="Live pulse" value={liveAt ? ago(liveAt) : "starting…"} />
        </div>
      </div>

      <div className="smTape" aria-label="Live smart money feed">
        <b>
          <span className="smPulse" /> LIVE
        </b>
        <div className="smTapeTrack">
          <div className="smTapeInner">
            {(tape.length ? [...tape, ...tape] : [{ key: "idle", kind: "INFO", text: "Listening to SEC EDGAR for new 13F filings and insider buys…", ticker: null }]).map((item, index) => (
              <button
                key={`${item.key}-${index}`}
                className={`smTapeItem k${item.kind}`}
                onClick={() => item.ticker && setSelected({ ticker: item.ticker })}
              >
                <em>{item.kind === "INSIDER" ? "INSIDER" : item.kind === "13F" ? "13F" : "INFO"}</em>
                {item.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sync.running && (
        <div className="smSyncBar">
          <div>
            <b>Syncing with SEC EDGAR</b> · {sync.current} ({sync.done + 1}/{sync.total})
          </div>
          <div className="smProgress">
            <span style={{ width: `${Math.round((sync.done / Math.max(sync.total, 1)) * 100)}%` }} />
          </div>
          <button onClick={() => (stopSync.current = true)}>Stop</button>
        </div>
      )}

      <div className="smTabs">
        {(
          [
            ["radar", "◉ Radar"],
            ["billionaires", "♛ Billionaires"],
            ["insiders", "⚡ Insider Buys"],
            ["analyst", "✦ AI Analyst"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="smError">{error}</div>}

      {tab === "radar" && (
        <Radar
          loading={loading}
          data={data}
          filters={filters}
          setFilters={setFilters}
          applyFilters={applyFilters}
          investors={investors}
          onSelect={(company) => setSelected({ cusip: company.cusip })}
          flash={flash}
          freshTickers={new Set(events.filter((e) => freshIds.has(e.id) && e.ticker).map((e) => e.ticker!))}
        />
      )}
      {tab === "billionaires" && (
        <Billionaires
          investors={investors}
          sync={sync}
          onSyncAll={() => runSync(investors, false)}
          onSyncOne={(inv) => runSync([inv], true)}
          onFilter={(cik) => applyFilters({ investors: [cik] }, true)}
          onReload={() => load(filtersRef.current)}
          onSelectCompany={(cusip) => setSelected({ cusip })}
          flash={flash}
        />
      )}
      {tab === "insiders" && <InsiderBuys onSelectTicker={(ticker) => setSelected({ ticker })} />}
      {tab === "analyst" && (
        <Analyst aiEnabled={Boolean(data?.ai)} onApplyFilters={(f) => applyFilters(f, true)} onSelectTicker={(ticker) => setSelected({ ticker })} />
      )}

      {selected && <CompanyDrawer target={selected} onClose={() => setSelected(null)} onFilterInvestor={(cik) => { setSelected(null); applyFilters({ investors: [cik] }, true); }} flash={flash} />}
      {toast && <div className="smToast">{toast}</div>}
      <div className="smFoot">
        Data: SEC EDGAR 13F-HR (quarterly, filed up to 45 days after quarter end; long US equity only) and Form 4 open-market purchases. Quotes are delayed. Research tool, not
        investment advice.
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <article className={accent ? "accent" : ""}>
      <b>{value}</b>
      <span>{label}</span>
    </article>
  );
}

function ScoreRing({ score, size = 46 }: { score: number; size?: number }) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className={`smRing ${scoreTone(score)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} className="track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="bar"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <b>{score}</b>
    </span>
  );
}

// ─── Radar (screener) ────────────────────────────────────────────────────────

function Radar({
  loading,
  data,
  filters,
  setFilters,
  applyFilters,
  investors,
  onSelect,
  flash,
  freshTickers,
}: {
  loading: boolean;
  data: ScreenResponse | null;
  filters: Filters;
  setFilters: (updater: (f: Filters) => Filters) => void;
  applyFilters: (patch: Partial<Filters>, reset?: boolean) => void;
  investors: Investor[];
  onSelect: (company: Company) => void;
  flash: (message: string) => void;
  freshTickers: Set<string>;
}) {
  const [screens, setScreens] = useState<{ id: string; name: string; filters: Partial<Filters> }[]>([]);
  const [screenName, setScreenName] = useState("");
  const [investorQuery, setInvestorQuery] = useState("");
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const loadScreens = useCallback(async () => {
    const response = await fetch("/api/smart-money/screens");
    if (response.ok) setScreens(((await response.json()) as { screens: typeof screens }).screens);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/smart-money/screens").then(async (response) => {
      if (response.ok && !cancelled) setScreens(((await response.json()) as { screens: typeof screens }).screens);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveScreen = async () => {
    if (!screenName.trim()) return flash("Name the screen first");
    const response = await fetch("/api/smart-money/screens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: screenName, filters }),
    });
    if (!response.ok) return flash("Could not save screen");
    setScreenName("");
    flash("Screen saved");
    void loadScreens();
  };

  const deleteScreen = async (id: string) => {
    await fetch(`/api/smart-money/screens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    void loadScreens();
  };

  const toggleInvestor = (cik: string) =>
    setFilters((f) => ({ ...f, investors: f.investors.includes(cik) ? f.investors.filter((c) => c !== cik) : [...f.investors, cik] }));

  const visibleInvestors = investors.filter(
    (inv) => !investorQuery || `${inv.name} ${inv.fund}`.toLowerCase().includes(investorQuery.toLowerCase()),
  );
  const exportCsv = () => {
    if (!data?.companies.length) return;
    const rows = [
      ["Ticker", "Company", "Score", "Holders", "Combined stake USD", "New", "Added", "Trimmed", "Exited", "Max weight %", "Smart price", "Price", "Vs smart %", "Insider buys 30d", "Holders list"],
      ...data.companies.map((c) => [
        c.ticker || "",
        c.name,
        c.score,
        c.holderCount,
        Math.round(c.totalValue),
        c.newCount,
        c.addedCount,
        c.trimmedCount,
        c.exitCount,
        (c.maxWeight * 100).toFixed(2),
        c.smartPrice?.toFixed(2) || "",
        c.price ?? "",
        c.vsSmartPct !== null ? (c.vsSmartPct * 100).toFixed(1) : "",
        c.insiderBuys30d,
        c.holders.map((h) => h.investor).join("; "),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `smart-money-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="smRadar">
      <aside className="smFilters">
        <div className="smPresets">
          {PRESETS.map((preset) => (
            <button key={preset.label} onClick={() => applyFilters(preset.filters, true)}>
              <b>{preset.label}</b>
              <small>{preset.hint}</small>
            </button>
          ))}
        </div>

        <label className="smField">
          <span>Search company / ticker</span>
          <input value={filters.q} placeholder="NVDA, Apple, Visa…" onChange={(e) => set("q", e.target.value)} />
        </label>

        <div className="smField">
          <span>
            Billionaires {filters.investors.length ? `(${filters.investors.length})` : ""}
            <select value={filters.match} onChange={(e) => set("match", e.target.value as Filters["match"])}>
              <option value="any">held by any</option>
              <option value="all">held by all</option>
            </select>
          </span>
          <input value={investorQuery} placeholder="Filter investors…" onChange={(e) => setInvestorQuery(e.target.value)} />
          <div className="smChips">
            {visibleInvestors.map((inv) => (
              <button key={inv.cik} className={filters.investors.includes(inv.cik) ? "on" : ""} onClick={() => toggleInvestor(inv.cik)} title={inv.fund}>
                {inv.name}
              </button>
            ))}
          </div>
        </div>

        <label className="smField">
          <span>
            Min. billionaire holders <b>{filters.minHolders}+</b>
          </span>
          <input type="range" min={1} max={10} value={filters.minHolders} onChange={(e) => set("minHolders", Number(e.target.value))} />
        </label>

        <label className="smField">
          <span>
            Min. conviction (% of a portfolio) <b>{filters.minWeight}%</b>
          </span>
          <input type="range" min={0} max={30} value={filters.minWeight} onChange={(e) => set("minWeight", Number(e.target.value))} />
        </label>

        <label className="smField">
          <span>Last-quarter activity</span>
          <select value={filters.activity} onChange={(e) => set("activity", e.target.value as Filters["activity"])}>
            <option value="any">Any</option>
            <option value="new">Brand-new positions</option>
            <option value="added">New or added</option>
            <option value="accumulating">Net accumulating</option>
            <option value="exiting">Net selling / exiting</option>
          </select>
        </label>

        <label className="smField">
          <span>Min. combined stake</span>
          <select value={filters.minValue} onChange={(e) => set("minValue", Number(e.target.value))}>
            <option value={0}>Any size</option>
            <option value={10_000_000}>$10M+</option>
            <option value={100_000_000}>$100M+</option>
            <option value={1_000_000_000}>$1B+</option>
            <option value={10_000_000_000}>$10B+</option>
          </select>
        </label>

        <div className="smToggles">
          <label>
            <input type="checkbox" checked={filters.insiderOnly} onChange={(e) => set("insiderOnly", e.target.checked)} /> Insiders buying (30d)
          </label>
          <label>
            <input type="checkbox" checked={filters.belowSmartPrice} onChange={(e) => set("belowSmartPrice", e.target.checked)} /> Below smart-money price
          </label>
        </div>

        <label className="smField">
          <span>Rank by</span>
          <select value={filters.sort} onChange={(e) => set("sort", e.target.value as Filters["sort"])}>
            <option value="score">Smart Money Score</option>
            <option value="holders">Most billionaire holders</option>
            <option value="value">Largest combined stake</option>
            <option value="momentum">Buying momentum</option>
            <option value="conviction">Highest conviction</option>
            <option value="discount">Biggest discount to entry</option>
            <option value="insider">Insider buying</option>
          </select>
        </label>

        <button className="smGhost" onClick={() => applyFilters({}, true)}>
          Reset filters
        </button>

        <div className="smSaved">
          <span>Saved screens</span>
          <div className="smSaveRow">
            <input value={screenName} placeholder="Name this screen" onChange={(e) => setScreenName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveScreen()} />
            <button onClick={saveScreen}>Save</button>
          </div>
          {screens.map((screen) => (
            <div key={screen.id} className="smSavedItem">
              <button onClick={() => applyFilters(screen.filters, true)}>{screen.name}</button>
              <button aria-label={`Delete ${screen.name}`} onClick={() => deleteScreen(screen.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="smResults">
        <div className="smResultsHead">
          <div>
            <b>{data ? data.total.toLocaleString() : "…"}</b> companies match
            {filters.investors.length > 0 && (
              <span className="smMuted"> · {filters.investors.map((cik) => investors.find((i) => i.cik === cik)?.name).filter(Boolean).join(filters.match === "all" ? " + " : " / ")}</span>
            )}
          </div>
          <button className="smGhost" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        {loading && !data ? (
          <div className="smSkeleton">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
        ) : !data?.companies.length ? (
          <div className="smEmpty">
            <b>{data?.stats.investorsSynced ? "No companies match this screen." : "Radar warming up…"}</b>
            <p>
              {data?.stats.investorsSynced
                ? "Loosen a filter or try a preset."
                : "Pulling the latest 13F filings from SEC EDGAR. Results stream in as each billionaire syncs."}
            </p>
          </div>
        ) : (
          <div className="smTable" role="table">
            <div className="smRow smHeadRow" role="row">
              <span>#</span>
              <span>Company</span>
              <span>Score</span>
              <span>Billionaire holders</span>
              <span>Combined stake</span>
              <span>Q/Q flow</span>
              <span>Conviction</span>
              <span>Price vs entry</span>
            </div>
            {data.companies.map((company, index) => (
              <button
                key={company.cusip}
                className={`smRow ${company.ticker && freshTickers.has(company.ticker) ? "fresh" : ""}`}
                role="row"
                onClick={() => onSelect(company)}
              >
                <span className="smRank">{index + 1}</span>
                <span className="smCompany">
                  <b>{company.ticker || "—"}</b>
                  <small>{company.name}</small>
                  <span className="smBadges">
                    {company.badges.map((badge) => (
                      <em key={badge} className={`b-${badge.replace(/\s/g, "")}`}>
                        {badge}
                      </em>
                    ))}
                  </span>
                </span>
                <span>
                  <ScoreRing score={company.score} />
                </span>
                <span className="smAvatars">
                  {company.holders.slice(0, 5).map((holder) => (
                    <i key={holder.cik} title={`${holder.investor} · ${money(holder.valueUsd)} · ${holder.change}`} className={`c-${holder.change}`}>
                      {initials(holder.investor)}
                    </i>
                  ))}
                  {company.holderCount > 5 && <i className="more">+{company.holderCount - 5}</i>}
                </span>
                <span className="smNum">{money(company.totalValue)}</span>
                <span className="smFlow">
                  {company.newCount > 0 && <em className="up">{company.newCount} new</em>}
                  {company.addedCount > 0 && <em className="up">{company.addedCount}↑</em>}
                  {company.trimmedCount > 0 && <em className="down">{company.trimmedCount}↓</em>}
                  {company.exitCount > 0 && <em className="down">{company.exitCount} out</em>}
                  {!company.newCount && !company.addedCount && !company.trimmedCount && !company.exitCount && <em>steady</em>}
                </span>
                <span className="smNum">{(company.maxWeight * 100).toFixed(1)}%</span>
                <span className="smNum">
                  {company.price ? `$${company.price.toFixed(2)}` : "—"}
                  <small className={company.vsSmartPct !== null && company.vsSmartPct < 0 ? "up" : "down"}>{company.vsSmartPct !== null ? pct(company.vsSmartPct) : ""}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Company drawer ──────────────────────────────────────────────────────────

function CompanyDrawer({
  target,
  onClose,
  onFilterInvestor,
  flash,
}: {
  target: { cusip?: string; ticker?: string };
  onClose: () => void;
  onFilterInvestor: (cik: string) => void;
  flash: (message: string) => void;
}) {
  const [state, setState] = useState<{ company?: Company; insiders?: Insider[]; error?: string }>({});
  useEffect(() => {
    const params = new URLSearchParams(target.cusip ? { cusip: target.cusip } : { ticker: target.ticker || "" });
    void fetch(`/api/smart-money/company?${params}`).then(async (response) => {
      const body = (await response.json()) as { company?: Company; insiders?: Insider[]; error?: string };
      setState(response.ok ? body : { error: body.error || "Company not found." });
    });
  }, [target.cusip, target.ticker]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addToCrm = async () => {
    const c = state.company;
    if (!c) return;
    const response = await fetch("/api/crm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.ticker ? `${c.name} (${c.ticker})` : c.name,
        category: "Smart Money Watchlist",
        source: "SMART_MONEY",
        notes: `Smart Money Score ${c.score}/100\n${c.reasons.join("\n")}\nHolders: ${c.holders.map((h) => `${h.investor} ${money(h.valueUsd)}`).join(", ")}`,
      }),
    });
    flash(response.ok ? "Added to CRM accounts ✓" : "Could not add to CRM");
  };

  const c = state.company;
  return (
    <div className="smDrawerBackdrop" onClick={onClose}>
      <aside className="smDrawer" onClick={(event) => event.stopPropagation()} aria-label="Company detail">
        <button className="smClose" onClick={onClose} aria-label="Close">
          ×
        </button>
        {state.error && <div className="smError">{state.error}</div>}
        {!c && !state.error && <div className="smSkeleton">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>}
        {c && (
          <>
            <div className="smDrawerHead">
              <ScoreRing score={c.score} size={72} />
              <div>
                <p className="smEyebrow">{c.cusip}</p>
                <h2>
                  {c.ticker || "—"} <small>{c.name}</small>
                </h2>
                <div className="smBadges">
                  {c.badges.map((badge) => (
                    <em key={badge} className={`b-${badge.replace(/\s/g, "")}`}>
                      {badge}
                    </em>
                  ))}
                </div>
              </div>
            </div>

            <div className="smKpis">
              <Stat label="Billionaire holders" value={String(c.holderCount)} />
              <Stat label="Combined stake" value={money(c.totalValue)} />
              <Stat label="Net Q/Q flow" value={money(c.netFlowUsd)} accent={c.netFlowUsd > 0} />
              <Stat label="Smart-money price" value={c.smartPrice ? `$${c.smartPrice.toFixed(2)}` : "—"} />
              <Stat label="Live price" value={c.price ? `$${c.price.toFixed(2)}` : "—"} />
              <Stat label="Vs. smart money" value={pct(c.vsSmartPct)} accent={c.vsSmartPct !== null && c.vsSmartPct < 0} />
            </div>

            <section className="smFactors">
              {(
                [
                  ["Breadth", c.factors.breadth, 30],
                  ["Conviction", c.factors.conviction, 20],
                  ["Momentum", c.factors.momentum, 25],
                  ["Insiders", c.factors.insider, 10],
                  ["Discount", c.factors.value, 15],
                ] as const
              ).map(([label, value, max]) => (
                <div key={label}>
                  <span>
                    {label} <b>{value}/{max}</b>
                  </span>
                  <i>
                    <s style={{ width: `${(value / max) * 100}%` }} />
                  </i>
                </div>
              ))}
            </section>

            <ul className="smReasons">
              {c.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            <h3>Who owns it</h3>
            <div className="smHolderList">
              {c.holders.map((holder) => (
                <button key={holder.cik} onClick={() => onFilterInvestor(holder.cik)} title="Show everything this investor holds">
                  <i className={`c-${holder.change}`}>{initials(holder.investor)}</i>
                  <span>
                    <b>{holder.investor}</b>
                    <small>{holder.fund}</small>
                  </span>
                  <span className="smNum">
                    {money(holder.valueUsd)}
                    <small>{(holder.weight * 100).toFixed(2)}% of portfolio</small>
                  </span>
                  <em className={`chg c-${holder.change}`}>
                    {holder.change}
                    {holder.deltaPct !== null && holder.change !== "HELD" ? ` ${pct(holder.deltaPct, 0)}` : ""}
                  </em>
                </button>
              ))}
              {c.exits.map((exit) => (
                <button key={exit.cik} className="exited" onClick={() => onFilterInvestor(exit.cik)}>
                  <i className="c-EXITED">{initials(exit.investor)}</i>
                  <span>
                    <b>{exit.investor}</b>
                    <small>{exit.fund}</small>
                  </span>
                  <span className="smNum">
                    {money(0)}
                    <small>was {money(exit.prevValueUsd)}</small>
                  </span>
                  <em className="chg c-EXITED">SOLD OUT</em>
                </button>
              ))}
            </div>

            <h3>Insider open-market buys (180d)</h3>
            {state.insiders?.length ? (
              <div className="smInsiderMini">
                {state.insiders.map((trade) => (
                  <div key={`${trade.accession}-${trade.seq}`}>
                    <b>{trade.owner}</b>
                    <small>{trade.role}</small>
                    <span>{trade.trade_date}</span>
                    <span className="smNum">{money(trade.value_usd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="smMuted">No open-market insider purchases captured yet.</p>
            )}

            <div className="smDrawerActions">
              <button onClick={addToCrm}>+ Add to CRM watchlist</button>
              {c.ticker && (
                <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(c.name)}&type=10-K`} target="_blank" rel="noreferrer">
                  SEC filings ↗
                </a>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ─── Billionaires ────────────────────────────────────────────────────────────

type PortfolioPosition = {
  cusip: string;
  ticker: string | null;
  name: string;
  score: number;
  valueUsd: number;
  weight: number;
  change: Change;
  deltaPct: number | null;
  prevValueUsd: number | null;
};

function Billionaires({
  investors,
  sync,
  onSyncAll,
  onSyncOne,
  onFilter,
  onReload,
  onSelectCompany,
  flash,
}: {
  investors: Investor[];
  sync: { running: boolean; failures: string[] };
  onSyncAll: () => void;
  onSyncOne: (inv: Investor) => void;
  onFilter: (cik: string) => void;
  onReload: () => void;
  onSelectCompany: (cusip: string) => void;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState<Investor | null>(null);
  const [loaded, setLoaded] = useState<{ cik: string; positions: PortfolioPosition[] } | null>(null);
  const portfolio = open && loaded?.cik === open.cik ? loaded.positions : null;
  const [form, setForm] = useState({ cik: "", name: "", fund: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    const cik = open.cik;
    void fetch(`/api/smart-money/investors?cik=${cik}`).then(async (response) => {
      if (response.ok) setLoaded({ cik, positions: ((await response.json()) as { positions: PortfolioPosition[] }).positions });
    });
  }, [open]);

  const addInvestor = async () => {
    if (!form.cik.trim()) return flash("Enter the filer's SEC CIK");
    setAdding(true);
    const response = await fetch("/api/smart-money/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = (await response.json()) as { error?: string; syncError?: string };
    setAdding(false);
    if (!response.ok) return flash(body.error || "Could not add investor");
    flash(body.syncError ? `Added, but sync failed: ${body.syncError}` : "Investor added and synced ✓");
    setForm({ cik: "", name: "", fund: "" });
    onReload();
  };

  const removeInvestor = async (inv: Investor) => {
    const response = await fetch(`/api/smart-money/investors?cik=${inv.cik}`, { method: "DELETE" });
    flash(response.ok ? `${inv.name} removed` : "Could not remove");
    onReload();
  };

  return (
    <div className="smBillionaires">
      <div className="smBillHead">
        <p>
          {investors.filter((i) => i.latest_period).length} of {investors.length} portfolios loaded straight from SEC 13F-HR filings. New filings are detected live and auto-synced.
        </p>
        <button className="smPrimary" disabled={sync.running} onClick={onSyncAll}>
          {sync.running ? "Syncing…" : "↻ Sync all"}
        </button>
      </div>
      {sync.failures.length > 0 && (
        <details className="smError">
          <summary>{sync.failures.length} sync issue(s)</summary>
          {sync.failures.map((failure) => (
            <div key={failure}>{failure}</div>
          ))}
        </details>
      )}

      <div className="smInvestorGrid">
        {investors.map((inv) => (
          <article key={inv.cik} className="smInvestor">
            <div className="smInvHead">
              <i>{initials(inv.name)}</i>
              <div>
                <b>{inv.name}</b>
                <small>{inv.fund}</small>
              </div>
              {inv.is_custom ? <em>CUSTOM</em> : null}
            </div>
            <p className="smStyle">{inv.style}</p>
            <div className="smInvestorStats">
              <span>
                <b>{money(inv.portfolio_value)}</b>13F value
              </span>
              <span>
                <b>{inv.positions ?? "—"}</b>positions
              </span>
              <span>
                <b>{inv.latest_period || "—"}</b>period
              </span>
            </div>
            {inv.last_error ? <p className="smWarn">⚠ {inv.last_error}</p> : <p className="smMuted">Filed {inv.latest_filed || "—"} · synced {ago(inv.last_synced_at)}</p>}
            {inv.filer_name && <p className="smMuted smFiler">SEC filer: {inv.filer_name}</p>}
            <div className="smInvFoot">
              <button onClick={() => setOpen(inv)} disabled={!inv.latest_period}>
                Portfolio
              </button>
              <button onClick={() => onFilter(inv.cik)} disabled={!inv.latest_period}>
                On radar
              </button>
              <button onClick={() => onSyncOne(inv)} disabled={sync.running}>
                ↻
              </button>
              {inv.is_custom ? (
                <button onClick={() => removeInvestor(inv)} aria-label={`Remove ${inv.name}`}>
                  ×
                </button>
              ) : null}
            </div>
          </article>
        ))}

        <article className="smInvestor smAdd">
          <div className="smInvHead">
            <i>+</i>
            <div>
              <b>Track any 13F filer</b>
              <small>Family offices, hedge funds, foundations</small>
            </div>
          </div>
          <input value={form.cik} placeholder="SEC CIK (e.g. 0001067983)" onChange={(e) => setForm({ ...form, cik: e.target.value })} />
          <input value={form.name} placeholder="Investor name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input value={form.fund} placeholder="Fund name" onChange={(e) => setForm({ ...form, fund: e.target.value })} />
          <button className="smPrimary" onClick={addInvestor} disabled={adding}>
            {adding ? "Adding…" : "Add to radar"}
          </button>
          <a className="smMuted" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR" target="_blank" rel="noreferrer">
            Find a CIK on EDGAR ↗
          </a>
        </article>
      </div>

      {open && (
        <div className="smDrawerBackdrop" onClick={() => setOpen(null)}>
          <aside className="smDrawer" onClick={(e) => e.stopPropagation()}>
            <button className="smClose" onClick={() => setOpen(null)} aria-label="Close">
              ×
            </button>
            <div className="smDrawerHead">
              <i className="smBigAvatar">{initials(open.name)}</i>
              <div>
                <p className="smEyebrow">
                  {open.fund} · {open.latest_period}
                </p>
                <h2>{open.name}</h2>
                <p className="smMuted">
                  {money(open.portfolio_value)} across {open.positions} positions
                </p>
              </div>
            </div>
            {!portfolio ? (
              <div className="smSkeleton">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
            ) : (
              <div className="smPortfolio">
                {portfolio.map((position) => (
                  <button key={position.cusip} onClick={() => onSelectCompany(position.cusip)}>
                    <b>{position.ticker || "—"}</b>
                    <small>{position.name}</small>
                    <span className="smWeight">
                      <s style={{ width: `${Math.min(100, position.weight * 400)}%` }} />
                    </span>
                    <span className="smNum">
                      {position.change === "EXITED" ? money(position.prevValueUsd) : money(position.valueUsd)}
                      <small>{position.change === "EXITED" ? "previous" : `${(position.weight * 100).toFixed(2)}%`}</small>
                    </span>
                    <em className={`chg c-${position.change}`}>{position.change}</em>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Insider buys ────────────────────────────────────────────────────────────

function InsiderBuys({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const [minValue, setMinValue] = useState(100_000);
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<{ key: string; trades: Insider[] } | null>(null);
  const queryKey = `minValue=${minValue}&days=${days}`;
  const trades = result?.key === queryKey ? result.trades : null;
  useEffect(() => {
    void fetch(`/api/smart-money/insiders?${queryKey}`).then(async (response) => {
      setResult({ key: queryKey, trades: response.ok ? ((await response.json()) as { trades: Insider[] }).trades : [] });
    });
  }, [queryKey]);
  const clusters = useMemo(() => {
    const map = new Map<string, { ticker: string; issuer: string; buyers: Set<string>; total: number }>();
    for (const trade of trades || []) {
      const key = trade.ticker || trade.issuer;
      const entry = map.get(key) || { ticker: trade.ticker, issuer: trade.issuer, buyers: new Set<string>(), total: 0 };
      entry.buyers.add(trade.owner);
      entry.total += trade.value_usd;
      map.set(key, entry);
    }
    return [...map.values()].filter((c) => c.buyers.size >= 2).sort((a, b) => b.buyers.size - a.buyers.size || b.total - a.total).slice(0, 8);
  }, [trades]);

  return (
    <div className="smInsiders">
      <div className="smBillHead">
        <p>Open-market purchases (Form 4, code P) captured live from SEC EDGAR — executives putting their own millions in.</p>
        <div className="smInline">
          <select value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
            <option value={0}>Any size</option>
            <option value={100_000}>$100K+</option>
            <option value={500_000}>$500K+</option>
            <option value={1_000_000}>$1M+</option>
            <option value={10_000_000}>$10M+</option>
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
          </select>
        </div>
      </div>
      {clusters.length > 0 && (
        <div className="smClusters">
          <span>🔥 Cluster buys</span>
          {clusters.map((cluster) => (
            <button key={cluster.ticker || cluster.issuer} onClick={() => cluster.ticker && onSelectTicker(cluster.ticker)}>
              <b>{cluster.ticker || cluster.issuer}</b>
              <small>
                {cluster.buyers.size} insiders · {money(cluster.total)}
              </small>
            </button>
          ))}
        </div>
      )}
      {!trades ? (
        <div className="smSkeleton">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
      ) : !trades.length ? (
        <div className="smEmpty">
          <b>No insider buys captured in this window yet.</b>
          <p>The live pulse scans new Form 4 filings every minute while the radar is open.</p>
        </div>
      ) : (
        <div className="smTable">
          <div className="smRow smHeadRow smInsiderRow">
            <span>Filed</span>
            <span>Company</span>
            <span>Insider</span>
            <span>Trade date</span>
            <span>Shares</span>
            <span>Price</span>
            <span>Value</span>
          </div>
          {trades.map((trade) => (
            <button key={`${trade.accession}-${trade.seq}`} className="smRow smInsiderRow" onClick={() => trade.ticker && onSelectTicker(trade.ticker)}>
              <span className="smMuted">{ago(trade.filed_at)}</span>
              <span className="smCompany">
                <b>{trade.ticker || "—"}</b>
                <small>{trade.issuer}</small>
              </span>
              <span className="smCompany">
                <b>{trade.owner}</b>
                <small>{trade.role}</small>
              </span>
              <span>{trade.trade_date}</span>
              <span className="smNum">{Math.round(trade.shares).toLocaleString()}</span>
              <span className="smNum">${trade.price.toFixed(2)}</span>
              <span className={`smNum ${trade.value_usd >= 1_000_000 ? "big" : ""}`}>{money(trade.value_usd)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI analyst ──────────────────────────────────────────────────────────────

function Analyst({
  aiEnabled,
  onApplyFilters,
  onSelectTicker,
}: {
  aiEnabled: boolean;
  onApplyFilters: (filters: Partial<Filters>) => void;
  onSelectTicker: (ticker: string) => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const next = [...turns, { role: "user" as const, content: text }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/smart-money/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await response.json()) as { answer?: string; tickers?: string[]; filters?: Partial<Filters> | null; engine?: string; notice?: string; error?: string };
      setTurns([
        ...next,
        {
          role: "assistant",
          content: response.ok ? `${body.notice ? `_${body.notice}_\n` : ""}${body.answer || ""}` : `⚠ ${body.error || "The analyst is unavailable."}`,
          tickers: body.tickers,
          filters: body.filters,
          engine: body.engine,
        },
      ]);
    } catch {
      setTurns([...next, { role: "assistant", content: "⚠ Network error — try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="smAnalyst">
      <div className="smChat">
        {!turns.length && (
          <div className="smChatIntro">
            <i>✦</i>
            <h2>Ask the Smart Money analyst</h2>
            <p>
              {aiEnabled
                ? "Powered by Claude with live tool access to every tracked portfolio, the consensus scores and the insider tape."
                : "Running in local mode — set ANTHROPIC_API_KEY on the server to unlock full Claude reasoning."}
            </p>
            <div className="smSuggest">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} onClick={() => ask(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className={`smMsg ${turn.role}`}>
            {turn.role === "assistant" ? <RichText text={turn.content} /> : <p>{turn.content}</p>}
            {turn.role === "assistant" && (turn.tickers?.length || turn.filters) ? (
              <div className="smMsgActions">
                {turn.tickers?.slice(0, 12).map((ticker) => (
                  <button key={ticker} onClick={() => onSelectTicker(ticker)}>
                    {ticker}
                  </button>
                ))}
                {turn.filters && (
                  <button className="apply" onClick={() => onApplyFilters(turn.filters!)}>
                    Open in Radar →
                  </button>
                )}
              </div>
            ) : null}
            {turn.engine && <small className="smEngine">{turn.engine === "claude" ? "Claude · live data" : "Local analyst"}</small>}
          </div>
        ))}
        {busy && (
          <div className="smMsg assistant smThinking">
            <span />
            <span />
            <span />
            Scanning portfolios…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="smAsk"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Which tech stocks are 3+ billionaires adding to?" disabled={busy} />
        <button className="smPrimary" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

