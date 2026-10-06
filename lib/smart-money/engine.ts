import {
  addEvent,
  batchInChunks,
  getMeta,
  setMeta,
  smartMoneyDb,
  type HoldingRow,
  type InsiderRow,
  type InvestorRow,
} from "./db";
import {
  fetch13FHoldings,
  fetchCurrentFeed,
  fetchForm4,
  fetchQuotes,
  fetchSubmissions,
  openFigiMap,
  parse13FFilings,
  secTickerIndex,
  type Holding,
} from "./edgar";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PositionChange = "NEW" | "ADDED" | "TRIMMED" | "HELD";

export type HolderPosition = {
  cik: string;
  investor: string;
  fund: string;
  valueUsd: number;
  shares: number;
  prevShares: number;
  weight: number;
  change: PositionChange;
  deltaPct: number | null;
  impliedPrice: number | null;
};

export type ExitPosition = { cik: string; investor: string; fund: string; prevValueUsd: number };

export type CompanyAggregate = {
  cusip: string;
  ticker: string | null;
  name: string;
  titleClass: string;
  holders: HolderPosition[];
  exits: ExitPosition[];
  holderCount: number;
  totalValue: number;
  newCount: number;
  addedCount: number;
  trimmedCount: number;
  exitCount: number;
  maxWeight: number;
  avgWeight: number;
  smartPrice: number | null;
  netFlowUsd: number;
};

export type ScoredCompany = CompanyAggregate & {
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

export type ScreenFilters = {
  q?: string;
  investors?: string[];
  match?: "any" | "all";
  minHolders?: number;
  minWeight?: number;
  activity?: "any" | "new" | "added" | "accumulating" | "exiting";
  minValue?: number;
  insiderOnly?: boolean;
  belowSmartPrice?: boolean;
  sort?: "score" | "holders" | "value" | "momentum" | "conviction" | "discount" | "insider";
  limit?: number;
};

const CHANGE_THRESHOLD = 0.05;

// ─── Sync a single investor from EDGAR ───────────────────────────────────────

export async function listInvestors() {
  const { results } = await smartMoneyDb()
    .prepare("SELECT * FROM sm_investors ORDER BY is_custom ASC, COALESCE(portfolio_value,0) DESC, name ASC")
    .all<InvestorRow>();
  return results;
}

async function bumpDataVersion() {
  await setMeta("data_version", String(Date.now()));
}

export async function syncInvestor(cik: string, options: { force?: boolean } = {}) {
  const db = smartMoneyDb();
  const investor = await db.prepare("SELECT * FROM sm_investors WHERE cik=?").bind(cik).first<InvestorRow>();
  if (!investor) throw new Error("Investor is not on the radar.");
  const now = new Date().toISOString();
  try {
    const { filerName, filings } = parse13FFilings(await fetchSubmissions(cik), 2);
    if (!filings.length) throw new Error("No 13F-HR filings found for this filer.");
    const [latest, previous] = filings;
    if (!options.force && investor.latest_accession === latest.accession && investor.positions) {
      await db.prepare("UPDATE sm_investors SET filer_name=?, last_synced_at=?, last_error=NULL WHERE cik=?").bind(filerName, now, cik).run();
      return { cik, changed: false, period: latest.period, positions: investor.positions };
    }
    const current = await fetch13FHoldings(cik, latest);
    const prior: Holding[] = previous ? await fetch13FHoldings(cik, previous) : [];
    const insert = (period: string, h: Holding) =>
      db
        .prepare("INSERT OR REPLACE INTO sm_holdings (cik,period,cusip,issuer,title_class,value_usd,shares) VALUES (?,?,?,?,?,?,?)")
        .bind(cik, period, h.cusip, h.issuer.slice(0, 200), h.titleClass.slice(0, 60), h.valueUsd, h.shares);
    await db.prepare("DELETE FROM sm_holdings WHERE cik=?").bind(cik).run();
    await batchInChunks([
      ...current.map((h) => insert(latest.period, h)),
      ...prior.map((h) => insert(previous!.period, h)),
    ]);
    const portfolioValue = current.reduce((sum, h) => sum + h.valueUsd, 0);
    await db
      .prepare(
        `UPDATE sm_investors SET filer_name=?, latest_accession=?, latest_period=?, latest_filed=?, prev_period=?,
         portfolio_value=?, positions=?, last_synced_at=?, last_error=NULL WHERE cik=?`,
      )
      .bind(filerName, latest.accession, latest.period, latest.filedAt, previous?.period || null, portfolioValue, current.length, now, cik)
      .run();

    if (investor.latest_accession && investor.latest_accession !== latest.accession) {
      const priorCusips = new Set(prior.map((h) => h.cusip));
      const newBuys = current.filter((h) => !priorCusips.has(h.cusip)).slice(0, 3).map((h) => h.issuer);
      await addEvent({
        kind: "13F",
        title: `${investor.name} filed a new 13F (${latest.period})`,
        detail: newBuys.length ? `New positions: ${newBuys.join(", ")}` : `${current.length} positions, $${compact(portfolioValue)} reported`,
        ticker: null,
        cik,
        value_usd: portfolioValue,
      });
    }
    await mapPendingCusips(6);
    await bumpDataVersion();
    return { cik, changed: true, period: latest.period, positions: current.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await db.prepare("UPDATE sm_investors SET last_error=?, last_synced_at=? WHERE cik=?").bind(message.slice(0, 300), now, cik).run();
    throw error;
  }
}

/** Resolves tickers for held CUSIPs: OpenFIGI first (largest stakes first), SEC name match as fallback. */
export async function mapPendingCusips(maxFigiRequests: number) {
  const db = smartMoneyDb();
  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT h.cusip, MAX(h.issuer) AS issuer, SUM(h.value_usd) AS total
       FROM sm_holdings h LEFT JOIN sm_cusip_map m ON m.cusip = h.cusip
       WHERE m.cusip IS NULL OR m.source = 'NAME' OR (m.source = 'NONE' AND m.updated_at < ?)
       GROUP BY h.cusip ORDER BY total DESC LIMIT 400`,
    )
    .bind(staleBefore)
    .all<{ cusip: string; issuer: string; total: number }>();
  if (!results.length) return 0;
  const now = new Date().toISOString();
  const statements = [];
  const resolved = new Set<string>();
  const attempted = new Set<string>();
  try {
    const figi = await openFigiMap(results.map((row) => row.cusip), maxFigiRequests);
    figi.attempted.forEach((cusip) => attempted.add(cusip));
    for (const match of figi.results) {
      resolved.add(match.cusip);
      statements.push(
        db
          .prepare("INSERT OR REPLACE INTO sm_cusip_map (cusip,ticker,name,source,updated_at) VALUES (?,?,?,?,?)")
          .bind(match.cusip, match.ticker, match.name, "OPENFIGI", now),
      );
    }
  } catch (error) {
    console.error("smart-money.openfigi.failed", error);
  }
  let index: Awaited<ReturnType<typeof secTickerIndex>> | null = null;
  try {
    index = await secTickerIndex();
  } catch (error) {
    console.error("smart-money.ticker-index.failed", error);
  }
  for (const row of results) {
    if (resolved.has(row.cusip)) continue;
    const match = index?.lookup(row.issuer);
    if (match) {
      statements.push(
        db
          .prepare("INSERT OR REPLACE INTO sm_cusip_map (cusip,ticker,name,source,updated_at) VALUES (?,?,?,?,?)")
          .bind(row.cusip, match.ticker, match.title, "NAME", now),
      );
    } else if (attempted.has(row.cusip)) {
      statements.push(
        db
          .prepare("INSERT OR REPLACE INTO sm_cusip_map (cusip,ticker,name,source,updated_at) VALUES (?,?,?,?,?)")
          .bind(row.cusip, null, row.issuer, "NONE", now),
      );
    }
  }
  if (statements.length) {
    await batchInChunks(statements);
    await bumpDataVersion();
  }
  return statements.length;
}

// ─── Consensus aggregation ───────────────────────────────────────────────────

let aggregateCache: { version: string; companies: CompanyAggregate[] } | null = null;

export async function loadAggregates(): Promise<CompanyAggregate[]> {
  const version = (await getMeta("data_version")) || "0";
  if (aggregateCache?.version === version) return aggregateCache.companies;
  const db = smartMoneyDb();
  const investors = (await listInvestors()).filter((row) => row.latest_period);
  const { results: holdings } = await db
    .prepare(
      `SELECT h.* FROM sm_holdings h JOIN sm_investors i ON i.cik = h.cik
       WHERE h.period = i.latest_period OR h.period = i.prev_period`,
    )
    .all<HoldingRow>();
  const { results: maps } = await db.prepare("SELECT cusip, ticker, name FROM sm_cusip_map").all<{ cusip: string; ticker: string | null; name: string | null }>();
  const companies = aggregate(investors, holdings, new Map(maps.map((m) => [m.cusip, m])));
  aggregateCache = { version, companies };
  return companies;
}

export function aggregate(
  investors: InvestorRow[],
  holdings: HoldingRow[],
  tickers: Map<string, { ticker: string | null; name: string | null }>,
): CompanyAggregate[] {
  const byCik = new Map(investors.map((inv) => [inv.cik, inv]));
  const latest = new Map<string, Map<string, HoldingRow>>();
  const prior = new Map<string, Map<string, HoldingRow>>();
  for (const row of holdings) {
    const inv = byCik.get(row.cik);
    if (!inv) continue;
    const target = row.period === inv.latest_period ? latest : row.period === inv.prev_period ? prior : null;
    if (!target) continue;
    if (!target.has(row.cusip)) target.set(row.cusip, new Map());
    target.get(row.cusip)!.set(row.cik, row);
  }
  const cusips = new Set([...latest.keys(), ...prior.keys()]);
  const companies: CompanyAggregate[] = [];
  for (const cusip of cusips) {
    const now = latest.get(cusip) || new Map<string, HoldingRow>();
    const before = prior.get(cusip) || new Map<string, HoldingRow>();
    const holders: HolderPosition[] = [];
    for (const [cik, row] of now) {
      const inv = byCik.get(cik)!;
      const prev = before.get(cik);
      const basisNow = row.shares || row.value_usd;
      const basisPrev = prev ? prev.shares || prev.value_usd : 0;
      let change: PositionChange = "HELD";
      let deltaPct: number | null = null;
      if (!prev && inv.prev_period) change = "NEW";
      else if (prev && basisPrev > 0) {
        deltaPct = basisNow / basisPrev - 1;
        if (deltaPct >= CHANGE_THRESHOLD) change = "ADDED";
        else if (deltaPct <= -CHANGE_THRESHOLD) change = "TRIMMED";
      }
      holders.push({
        cik,
        investor: inv.name,
        fund: inv.fund,
        valueUsd: row.value_usd,
        shares: row.shares,
        prevShares: prev?.shares || 0,
        weight: inv.portfolio_value ? row.value_usd / inv.portfolio_value : 0,
        change,
        deltaPct,
        impliedPrice: row.shares > 0 ? row.value_usd / row.shares : null,
      });
    }
    const exits: ExitPosition[] = [];
    for (const [cik, row] of before) {
      if (now.has(cik)) continue;
      const inv = byCik.get(cik)!;
      exits.push({ cik, investor: inv.name, fund: inv.fund, prevValueUsd: row.value_usd });
    }
    holders.sort((a, b) => b.valueUsd - a.valueUsd);
    const sample = [...now.values()][0] || [...before.values()][0];
    const map = tickers.get(cusip);
    const priced = holders.filter((h) => h.shares > 0);
    const pricedShares = priced.reduce((sum, h) => sum + h.shares, 0);
    const smartPrice = pricedShares > 0 ? priced.reduce((sum, h) => sum + h.valueUsd, 0) / pricedShares : null;
    const netFlowUsd =
      holders.reduce((sum, h) => {
        if (h.change === "NEW") return sum + h.valueUsd;
        if (h.impliedPrice && h.prevShares) return sum + (h.shares - h.prevShares) * h.impliedPrice;
        return sum;
      }, 0) - exits.reduce((sum, e) => sum + e.prevValueUsd, 0);
    companies.push({
      cusip,
      ticker: map?.ticker || null,
      name: sample.issuer,
      titleClass: sample.title_class,
      holders,
      exits,
      holderCount: holders.length,
      totalValue: holders.reduce((sum, h) => sum + h.valueUsd, 0),
      newCount: holders.filter((h) => h.change === "NEW").length,
      addedCount: holders.filter((h) => h.change === "ADDED").length,
      trimmedCount: holders.filter((h) => h.change === "TRIMMED").length,
      exitCount: exits.length,
      maxWeight: holders.reduce((max, h) => Math.max(max, h.weight), 0),
      avgWeight: holders.length ? holders.reduce((sum, h) => sum + h.weight, 0) / holders.length : 0,
      smartPrice,
      netFlowUsd,
    });
  }
  return companies;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function scoreCompany(
  company: CompanyAggregate,
  extras: { price?: { price: number; open: number } | null; insiderBuys30d?: number; insiderValue30d?: number },
): ScoredCompany {
  const price = extras.price?.price ?? null;
  const dayChangePct = extras.price && extras.price.open > 0 ? extras.price.price / extras.price.open - 1 : null;
  const vsSmartPct = price && company.smartPrice ? price / company.smartPrice - 1 : null;
  const insiderBuys30d = extras.insiderBuys30d || 0;
  const insiderValue30d = extras.insiderValue30d || 0;
  const h = company.holderCount;
  const breadth = h ? 30 * Math.min(1, Math.log2(1 + h) / Math.log2(7)) : 0;
  const conviction = 12 * Math.min(1, company.maxWeight / 0.1) + 8 * Math.min(1, company.avgWeight / 0.05);
  const net = company.newCount * 1.5 + company.addedCount - company.trimmedCount * 0.75 - company.exitCount * 1.5;
  const momentum = 25 * (0.5 + 0.5 * Math.tanh(net / 2));
  const insider = 10 * Math.min(1, insiderBuys30d / 2);
  const value = vsSmartPct !== null ? 15 * Math.max(0, Math.min(1, -vsSmartPct / 0.2)) : 0;
  const score = Math.round(Math.max(0, Math.min(100, breadth + conviction + momentum + insider + value)));

  const reasons: string[] = [];
  const badges: string[] = [];
  if (h >= 3) reasons.push(`${h} tracked billionaires hold it (${company.holders.slice(0, 3).map((x) => x.investor).join(", ")}${h > 3 ? "…" : ""}).`);
  else if (h) reasons.push(`Held by ${company.holders.map((x) => x.investor).join(" & ")}.`);
  if (company.newCount) {
    reasons.push(`${company.newCount} opened a brand-new position last quarter.`);
    badges.push("NEW BUY");
  }
  if (company.addedCount) reasons.push(`${company.addedCount} added ≥5% more shares.`);
  if (company.trimmedCount || company.exitCount) reasons.push(`${company.trimmedCount} trimmed and ${company.exitCount} fully exited.`);
  const top = company.holders.reduce<HolderPosition | null>((best, x) => (!best || x.weight > best.weight ? x : best), null);
  if (top && top.weight >= 0.05) {
    reasons.push(`${(top.weight * 100).toFixed(1)}% of ${top.investor}'s portfolio — a high-conviction bet.`);
    badges.push("CONVICTION");
  }
  if (insiderBuys30d) {
    reasons.push(`${insiderBuys30d} insider open-market buy${insiderBuys30d > 1 ? "s" : ""} in 30 days ($${compact(insiderValue30d)}).`);
    badges.push("INSIDER BUY");
  }
  if (vsSmartPct !== null && vsSmartPct <= -0.05) {
    reasons.push(`Trading ${(Math.abs(vsSmartPct) * 100).toFixed(1)}% below the smart-money quarter-end price.`);
    badges.push("DISCOUNT");
  }
  if (h >= 4 && net > 0) badges.push("CONSENSUS");
  return {
    ...company,
    price,
    dayChangePct,
    vsSmartPct,
    insiderBuys30d,
    insiderValue30d,
    score,
    factors: {
      breadth: Math.round(breadth),
      conviction: Math.round(conviction),
      momentum: Math.round(momentum),
      insider: Math.round(insider),
      value: Math.round(value),
    },
    reasons,
    badges,
  };
}

async function insiderSummary(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { results } = await smartMoneyDb()
    .prepare("SELECT ticker, COUNT(*) AS buys, SUM(value_usd) AS total FROM sm_insider_trades WHERE filed_at >= ? GROUP BY ticker")
    .bind(since)
    .all<{ ticker: string; buys: number; total: number }>();
  return new Map(results.map((r) => [r.ticker, r]));
}

async function priceMap() {
  const { results } = await smartMoneyDb().prepare("SELECT ticker, price, open FROM sm_prices").all<{ ticker: string; price: number; open: number }>();
  return new Map(results.map((r) => [r.ticker, r]));
}

export async function scoredCompanies() {
  const [companies, insiders, prices] = await Promise.all([loadAggregates(), insiderSummary(), priceMap()]);
  return companies.map((company) => {
    const insider = company.ticker ? insiders.get(company.ticker) : undefined;
    return scoreCompany(company, {
      price: company.ticker ? prices.get(company.ticker) : null,
      insiderBuys30d: Number(insider?.buys || 0),
      insiderValue30d: Number(insider?.total || 0),
    });
  });
}

export function applyScreen(companies: ScoredCompany[], filters: ScreenFilters) {
  const q = (filters.q || "").trim().toLowerCase();
  const investors = new Set(filters.investors || []);
  const minWeight = (filters.minWeight || 0) / 100;
  let rows = companies.filter((c) => {
    if (!c.holderCount && filters.activity !== "exiting") return false;
    if (q && !c.name.toLowerCase().includes(q) && !(c.ticker || "").toLowerCase().includes(q) && c.cusip.toLowerCase() !== q) return false;
    if (investors.size) {
      const held = c.holders.filter((h) => investors.has(h.cik)).length;
      if (filters.match === "all" ? held < investors.size : held === 0) return false;
    }
    if (filters.minHolders && c.holderCount < filters.minHolders) return false;
    if (minWeight && c.maxWeight < minWeight) return false;
    if (filters.minValue && c.totalValue < filters.minValue) return false;
    if (filters.insiderOnly && !c.insiderBuys30d) return false;
    if (filters.belowSmartPrice && !(c.vsSmartPct !== null && c.vsSmartPct < 0)) return false;
    switch (filters.activity) {
      case "new":
        return c.newCount > 0;
      case "added":
        return c.newCount + c.addedCount > 0;
      case "accumulating":
        return c.newCount + c.addedCount > c.trimmedCount + c.exitCount;
      case "exiting":
        return c.exitCount + c.trimmedCount > c.newCount + c.addedCount;
      default:
        return true;
    }
  });
  const sorters: Record<NonNullable<ScreenFilters["sort"]>, (a: ScoredCompany, b: ScoredCompany) => number> = {
    score: (a, b) => b.score - a.score || b.totalValue - a.totalValue,
    holders: (a, b) => b.holderCount - a.holderCount || b.score - a.score,
    value: (a, b) => b.totalValue - a.totalValue,
    momentum: (a, b) => b.factors.momentum - a.factors.momentum || b.netFlowUsd - a.netFlowUsd,
    conviction: (a, b) => b.maxWeight - a.maxWeight,
    discount: (a, b) => (a.vsSmartPct ?? Infinity) - (b.vsSmartPct ?? Infinity),
    insider: (a, b) => b.insiderValue30d - a.insiderValue30d || b.score - a.score,
  };
  rows = rows.sort(sorters[filters.sort || "score"] || sorters.score);
  const total = rows.length;
  return { total, rows: rows.slice(0, Math.min(Math.max(filters.limit || 100, 1), 300)) };
}

export function parseFilters(input: Record<string, unknown>): ScreenFilters {
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const list = Array.isArray(input.investors)
    ? input.investors
    : typeof input.investors === "string" && input.investors
      ? input.investors.split(",")
      : [];
  const pick = <T extends string>(value: unknown, allowed: readonly T[]) => (allowed.includes(value as T) ? (value as T) : undefined);
  return {
    q: typeof input.q === "string" ? input.q.slice(0, 80) : undefined,
    investors: list.map((cik) => String(cik).replace(/\D/g, "").padStart(10, "0")).filter((cik) => cik !== "0000000000").slice(0, 40),
    match: pick(input.match, ["any", "all"] as const),
    minHolders: num(input.minHolders),
    minWeight: num(input.minWeight),
    activity: pick(input.activity, ["any", "new", "added", "accumulating", "exiting"] as const),
    minValue: num(input.minValue),
    insiderOnly: input.insiderOnly === true || input.insiderOnly === "1" || input.insiderOnly === "true",
    belowSmartPrice: input.belowSmartPrice === true || input.belowSmartPrice === "1" || input.belowSmartPrice === "true",
    sort: pick(input.sort, ["score", "holders", "value", "momentum", "conviction", "discount", "insider"] as const),
    limit: num(input.limit),
  };
}

export type PortfolioPosition = {
  cusip: string;
  ticker: string | null;
  name: string;
  score: number;
  valueUsd: number;
  shares: number;
  weight: number;
  change: PositionChange | "EXITED";
  deltaPct: number | null;
  prevValueUsd: number | null;
};

export async function investorPortfolio(cik: string) {
  const db = smartMoneyDb();
  const investor = await db.prepare("SELECT * FROM sm_investors WHERE cik=?").bind(cik).first<InvestorRow>();
  if (!investor) return null;
  const companies = await scoredCompanies();
  const positions: PortfolioPosition[] = [];
  for (const c of companies) {
    const base = { cusip: c.cusip, ticker: c.ticker, name: c.name, score: c.score };
    const holder = c.holders.find((h) => h.cik === cik);
    if (holder) {
      positions.push({ ...base, valueUsd: holder.valueUsd, shares: holder.shares, weight: holder.weight, change: holder.change, deltaPct: holder.deltaPct, prevValueUsd: null });
      continue;
    }
    const exit = c.exits.find((e) => e.cik === cik);
    if (exit) positions.push({ ...base, valueUsd: 0, shares: 0, weight: 0, change: "EXITED", deltaPct: -1, prevValueUsd: exit.prevValueUsd });
  }
  positions.sort((a, b) => b.valueUsd - a.valueUsd || (b.prevValueUsd || 0) - (a.prevValueUsd || 0));
  return { investor, positions };
}

export async function recentInsiderTrades(options: { minValue?: number; days?: number; ticker?: string; limit?: number } = {}) {
  const since = new Date(Date.now() - (options.days || 30) * 86_400_000).toISOString();
  const params: unknown[] = [since, options.minValue || 0];
  let sql = "SELECT * FROM sm_insider_trades WHERE filed_at >= ? AND value_usd >= ?";
  if (options.ticker) {
    sql += " AND ticker = ?";
    params.push(options.ticker.toUpperCase());
  }
  sql += " ORDER BY filed_at DESC, value_usd DESC LIMIT ?";
  params.push(Math.min(options.limit || 100, 300));
  const { results } = await smartMoneyDb().prepare(sql).bind(...params).all<InsiderRow>();
  return results;
}

// ─── Live refresh (throttled, driven by client polling) ──────────────────────

const LIVE_INTERVAL_MS = 60_000;
const PRICE_TTL_MS = 5 * 60_000;

export async function liveRefresh() {
  const last = Number((await getMeta("live_at")) || 0);
  if (Date.now() - last < LIVE_INTERVAL_MS) return { ran: false, at: last };
  await setMeta("live_at", String(Date.now()));
  const db = smartMoneyDb();
  const errors: string[] = [];
  let insiderBuys = 0;
  let synced: string | null = null;

  try {
    const feed = await fetchCurrentFeed("4", 100);
    const unique = [...new Map(feed.map((entry) => [entry.accession, entry])).values()];
    const seen = await seenSet(unique.map((e) => e.accession));
    const fresh = unique.filter((entry) => !seen.has(entry.accession)).slice(0, 10);
    for (const entry of fresh) {
      try {
        const purchases = await fetchForm4(entry.folder);
        const filedAt = entry.updated ? new Date(entry.updated).toISOString() : new Date().toISOString();
        const statements = purchases.map((p, seq) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO sm_insider_trades (accession,seq,filed_at,issuer_cik,issuer,ticker,owner,role,trade_date,shares,price,value_usd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(entry.accession, seq, filedAt, p.issuerCik, p.issuer, p.ticker, p.owner, p.role, p.tradeDate, p.shares, p.price, p.valueUsd),
        );
        statements.push(db.prepare("INSERT OR IGNORE INTO sm_seen_filings (accession,seen_at) VALUES (?,?)").bind(entry.accession, new Date().toISOString()));
        await db.batch(statements);
        insiderBuys += purchases.length;
        const total = purchases.reduce((sum, p) => sum + p.valueUsd, 0);
        if (purchases.length && total >= 250_000) {
          const p = purchases[0];
          await addEvent({
            kind: "INSIDER",
            title: `${p.owner} (${p.role}) bought $${compact(total)} of ${p.ticker || p.issuer}`,
            detail: `${purchases.reduce((s, x) => s + x.shares, 0).toLocaleString()} shares @ ~$${p.price.toFixed(2)} on ${p.tradeDate}`,
            ticker: p.ticker || null,
            cik: p.issuerCik,
            value_usd: total,
          });
        }
      } catch (error) {
        errors.push(`form4 ${entry.accession}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  } catch (error) {
    errors.push(`insider feed: ${error instanceof Error ? error.message : "failed"}`);
  }

  try {
    const feed = await fetchCurrentFeed("13F-HR", 100);
    const investors = new Map((await listInvestors()).map((inv) => [inv.cik, inv]));
    const candidates = feed.filter((entry) => investors.has(entry.cik) && investors.get(entry.cik)!.latest_accession !== entry.accession);
    const seen = await seenSet(candidates.map((e) => e.accession));
    const target = candidates.find((entry) => !seen.has(entry.accession));
    if (target) {
      await db.prepare("INSERT OR IGNORE INTO sm_seen_filings (accession,seen_at) VALUES (?,?)").bind(target.accession, new Date().toISOString()).run();
      await syncInvestor(target.cik);
      synced = target.cik;
    }
  } catch (error) {
    errors.push(`13F feed: ${error instanceof Error ? error.message : "failed"}`);
  }

  try {
    await refreshPrices(40);
  } catch (error) {
    errors.push(`quotes: ${error instanceof Error ? error.message : "failed"}`);
  }

  if (Math.random() < 0.05) await prune();
  await setMeta("live_error", errors.join(" | ").slice(0, 600));
  return { ran: true, at: Date.now(), insiderBuys, synced, errors };
}

async function seenSet(accessions: string[]) {
  if (!accessions.length) return new Set<string>();
  const placeholders = accessions.map(() => "?").join(",");
  const { results } = await smartMoneyDb()
    .prepare(`SELECT accession FROM sm_seen_filings WHERE accession IN (${placeholders})`)
    .bind(...accessions)
    .all<{ accession: string }>();
  return new Set(results.map((r) => r.accession));
}

export async function refreshPrices(limit: number) {
  const companies = await scoredCompanies();
  const db = smartMoneyDb();
  const { results } = await db.prepare("SELECT ticker, updated_at FROM sm_prices").all<{ ticker: string; updated_at: string }>();
  const fresh = new Set(results.filter((r) => Date.now() - Date.parse(r.updated_at) < PRICE_TTL_MS).map((r) => r.ticker));
  const tickers = companies
    .filter((c) => c.ticker && !fresh.has(c.ticker))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.ticker!) ;
  const now = new Date().toISOString();
  for (let i = 0; i < tickers.length; i += 20) {
    const quotes = await fetchQuotes(tickers.slice(i, i + 20));
    if (!quotes.length) continue;
    await db.batch(
      quotes.map((q) =>
        db
          .prepare("INSERT OR REPLACE INTO sm_prices (ticker,price,open,as_of,updated_at) VALUES (?,?,?,?,?)")
          .bind(q.ticker, q.price, q.open, q.asOf, now),
      ),
    );
  }
  return tickers.length;
}

async function prune() {
  const db = smartMoneyDb();
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const halfYear = new Date(Date.now() - 180 * 86_400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM sm_seen_filings WHERE seen_at < ?").bind(month),
    db.prepare("DELETE FROM sm_insider_trades WHERE filed_at < ?").bind(halfYear),
    db.prepare("DELETE FROM sm_events WHERE id NOT IN (SELECT id FROM sm_events ORDER BY id DESC LIMIT 500)"),
  ]);
}

export function compact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}
