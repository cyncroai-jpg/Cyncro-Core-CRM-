/**
 * SEC EDGAR + market data clients and parsers for the Smart Money radar.
 *
 * Network helpers are thin; the parsers are pure so they can be tested against
 * fixture documents without touching the network.
 */

const DEFAULT_SEC_AGENT = "CyncroCore SmartMoney admin@cyncro.ai";

function secAgent() {
  return (typeof process !== "undefined" && process.env?.SEC_USER_AGENT) || DEFAULT_SEC_AGENT;
}

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function secFetch(url: string, accept = "application/json") {
  const response = await fetch(url, {
    headers: { "User-Agent": secAgent(), Accept: accept },
  });
  if (!response.ok) throw new UpstreamError(`SEC request failed (${response.status}) for ${new URL(url).pathname}`, response.status);
  return response;
}

// ─── Submissions ─────────────────────────────────────────────────────────────

export type FilingRef = {
  accession: string;
  form: string;
  filedAt: string;
  period: string;
};

type Submissions = {
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
    };
  };
};

/** Latest original 13F-HR filings, newest first, one per reporting period. */
export function parse13FFilings(data: Submissions, limit = 2): { filerName: string; filings: FilingRef[] } {
  const recent = data.filings?.recent || {};
  const filings: FilingRef[] = [];
  const seenPeriods = new Set<string>();
  const total = recent.accessionNumber?.length || 0;
  for (let i = 0; i < total && filings.length < limit; i += 1) {
    if (recent.form?.[i] !== "13F-HR") continue;
    const period = recent.reportDate?.[i] || "";
    if (!period || seenPeriods.has(period)) continue;
    seenPeriods.add(period);
    filings.push({
      accession: recent.accessionNumber![i],
      form: "13F-HR",
      filedAt: recent.filingDate?.[i] || "",
      period,
    });
  }
  return { filerName: String(data.name || "").trim(), filings };
}

export async function fetchSubmissions(cik: string) {
  const response = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  return (await response.json()) as Submissions;
}

export function archiveFolder(cik: string, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}`;
}

type IndexJson = { directory?: { item?: { name: string; type?: string; size?: string | number }[] } };

/** Picks the information-table XML out of a 13F filing folder listing. */
export function pickInfoTable(index: IndexJson) {
  const xml = (index.directory?.item || []).filter(
    (item) => /\.xml$/i.test(item.name) && !/^primary_doc\.xml$/i.test(item.name),
  );
  if (!xml.length) return null;
  const named = xml.find((item) => /info|table|holding/i.test(item.name));
  if (named) return named.name;
  return xml.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0].name;
}

/** Picks the root-level ownership XML (Form 4) out of a filing folder listing. */
export function pickOwnershipXml(index: IndexJson) {
  const xml = (index.directory?.item || []).filter((item) => /\.xml$/i.test(item.name) && !item.name.includes("/"));
  return xml[0]?.name || null;
}

export async function fetchFolderIndex(folder: string) {
  const response = await secFetch(`${folder}/index.json`);
  return (await response.json()) as IndexJson;
}

// ─── 13F information table ───────────────────────────────────────────────────

export type Holding = {
  cusip: string;
  issuer: string;
  titleClass: string;
  valueUsd: number;
  shares: number;
};

function tagText(block: string, name: string) {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i"));
  if (!match) return "";
  const inner = match[1];
  const value = inner.match(/<(?:[\w-]+:)?value\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?value>/i);
  return decodeXml((value ? value[1] : inner).trim());
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Parses a 13F information table and aggregates rows per CUSIP. Option rows
 * (put/call) are excluded because they are not share ownership. Filings made
 * before 2023-01-03 reported value in thousands of dollars.
 */
export function parseInfoTable(xml: string, filedAt: string): Holding[] {
  const multiplier = filedAt && filedAt < "2023-01-03" ? 1000 : 1;
  const rows = xml.match(/<(?:[\w-]+:)?infoTable\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?infoTable>/gi) || [];
  const byCusip = new Map<string, Holding>();
  for (const row of rows) {
    if (tagText(row, "putCall")) continue;
    const cusip = tagText(row, "cusip").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (cusip.length !== 9) continue;
    const shareType = tagText(row, "sshPrnamtType").toUpperCase();
    const valueUsd = Number(tagText(row, "value").replace(/,/g, "")) * multiplier;
    const amount = Number(tagText(row, "sshPrnamt").replace(/,/g, ""));
    if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;
    const shares = shareType === "PRN" || !Number.isFinite(amount) ? 0 : amount;
    const existing = byCusip.get(cusip);
    if (existing) {
      existing.valueUsd += valueUsd;
      existing.shares += shares;
    } else {
      byCusip.set(cusip, {
        cusip,
        issuer: tagText(row, "nameOfIssuer"),
        titleClass: tagText(row, "titleOfClass"),
        valueUsd,
        shares,
      });
    }
  }
  return [...byCusip.values()].sort((a, b) => b.valueUsd - a.valueUsd);
}

export async function fetch13FHoldings(cik: string, filing: FilingRef) {
  const folder = archiveFolder(cik, filing.accession);
  const table = pickInfoTable(await fetchFolderIndex(folder));
  if (!table) throw new UpstreamError(`No information table in ${filing.accession}`, 422);
  const xml = await (await secFetch(`${folder}/${table}`, "application/xml")).text();
  return parseInfoTable(xml, filing.filedAt);
}

// ─── Live EDGAR feeds (Atom) ─────────────────────────────────────────────────

export type FeedEntry = {
  accession: string;
  cik: string;
  role: string;
  title: string;
  folder: string;
  updated: string;
};

export function parseAtomFeed(xml: string): FeedEntry[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  const out: FeedEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const title = decodeXml((entry.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "").trim();
    const href = (entry.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const id = (entry.match(/accession-number=([\d-]+)/i) || [])[1] || "";
    const updated = ((entry.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || "").trim();
    const cikMatch = title.match(/\((\d{10})\)\s*\((\w+)\)\s*$/);
    if (!id || !href || !cikMatch) continue;
    const key = `${id}:${cikMatch[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      accession: id,
      cik: cikMatch[1],
      role: cikMatch[2],
      title,
      folder: decodeXml(href).replace(/\/[^/]*$/, ""),
      updated,
    });
  }
  return out;
}

export async function fetchCurrentFeed(form: "4" | "13F-HR", count = 100) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}&company=&dateb=&owner=include&count=${count}&output=atom`;
  const xml = await (await secFetch(url, "application/atom+xml")).text();
  return parseAtomFeed(xml);
}

// ─── Form 4 insider transactions ─────────────────────────────────────────────

export type InsiderPurchase = {
  issuerCik: string;
  issuer: string;
  ticker: string;
  owner: string;
  role: string;
  tradeDate: string;
  shares: number;
  price: number;
  valueUsd: number;
};

/** Extracts open-market purchases (transaction code P) from a Form 4. */
export function parseForm4Purchases(xml: string): InsiderPurchase[] {
  const issuerBlock = (xml.match(/<issuer>[\s\S]*?<\/issuer>/i) || [""])[0];
  const ownerBlock = (xml.match(/<reportingOwner>[\s\S]*?<\/reportingOwner>/i) || [""])[0];
  const issuer = tagText(issuerBlock, "issuerName");
  const ticker = tagText(issuerBlock, "issuerTradingSymbol").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  const issuerCik = tagText(issuerBlock, "issuerCik").padStart(10, "0");
  const owner = tagText(ownerBlock, "rptOwnerName");
  const flag = (name: string) => /^(1|true)$/i.test(tagText(ownerBlock, name));
  const roles = [
    tagText(ownerBlock, "officerTitle"),
    flag("isDirector") && "Director",
    flag("isTenPercentOwner") && "10% Owner",
    flag("isOfficer") && !tagText(ownerBlock, "officerTitle") && "Officer",
  ].filter(Boolean) as string[];
  const transactions = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) || [];
  const purchases: InsiderPurchase[] = [];
  for (const tx of transactions) {
    const coding = (tx.match(/<transactionCoding>[\s\S]*?<\/transactionCoding>/i) || [""])[0];
    if (tagText(coding, "transactionCode").toUpperCase() !== "P") continue;
    const amounts = (tx.match(/<transactionAmounts>[\s\S]*?<\/transactionAmounts>/i) || [""])[0];
    if (tagText(amounts, "transactionAcquiredDisposedCode").toUpperCase() !== "A") continue;
    const shares = Number(tagText(amounts, "transactionShares"));
    const price = Number(tagText(amounts, "transactionPricePerShare"));
    if (!(shares > 0) || !(price > 0)) continue;
    purchases.push({
      issuerCik,
      issuer,
      ticker,
      owner,
      role: roles.join(", ") || "Insider",
      tradeDate: tagText(tx, "transactionDate").slice(0, 10),
      shares,
      price,
      valueUsd: Math.round(shares * price),
    });
  }
  return purchases;
}

export async function fetchForm4(folder: string) {
  const name = pickOwnershipXml(await fetchFolderIndex(folder));
  if (!name) return [];
  const xml = await (await secFetch(`${folder}/${name}`, "application/xml")).text();
  return parseForm4Purchases(xml);
}

// ─── CUSIP → ticker ──────────────────────────────────────────────────────────

export type TickerMatch = { cusip: string; ticker: string; name: string; source: string };

export function displayTicker(ticker: string) {
  return ticker.toUpperCase().replace(/[/ ]/g, ".");
}

/** Maps CUSIPs to US tickers through OpenFIGI (10 per request without a key). */
export async function openFigiMap(cusips: string[], maxRequests: number) {
  const apiKey = typeof process !== "undefined" ? process.env?.OPENFIGI_API_KEY : undefined;
  const chunk = apiKey ? 100 : 10;
  const results: TickerMatch[] = [];
  const attempted: string[] = [];
  for (let i = 0, calls = 0; i < cusips.length && calls < maxRequests; i += chunk, calls += 1) {
    const batch = cusips.slice(i, i + chunk);
    const response = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "X-OPENFIGI-APIKEY": apiKey } : {}) },
      body: JSON.stringify(batch.map((idValue) => ({ idType: "ID_CUSIP", idValue }))),
    });
    if (response.status === 429) break;
    if (!response.ok) break;
    attempted.push(...batch);
    const data = (await response.json()) as { data?: { ticker?: string; name?: string; exchCode?: string; marketSector?: string }[] }[];
    data.forEach((entry, index) => {
      const listings = (entry.data || []).filter((item) => item.ticker && item.marketSector === "Equity");
      const pick = listings.find((item) => item.exchCode === "US") || listings[0];
      if (pick?.ticker) results.push({ cusip: batch[index], ticker: displayTicker(pick.ticker), name: pick.name || "", source: "OPENFIGI" });
    });
  }
  return { results, attempted };
}

export function normalizeIssuer(name: string) {
  return name
    .toUpperCase()
    .replace(/&AMP;|&/g, " ")
    .replace(/\/[A-Z]{2,3}\/?/g, " ")
    .replace(/[.,'()]/g, " ")
    .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|HLDGS?|HOLDINGS?|GROUP|NV|N V|SA|AG|SE|LP|L P|LLC|THE|OF|AND|CL [A-Z]|CLASS [A-Z]|COM|NEW|DEL|ORD|SHS|ADR|SPONSORED|SPON)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type TickerIndex = { lookup: (issuer: string) => { ticker: string; title: string } | null };

/**
 * Name matcher over SEC's company_tickers.json. Exact normalized match first;
 * otherwise a token-abbreviation match (13F issuer names are abbreviated, e.g.
 * "OCCIDENTAL PETE" ↔ "OCCIDENTAL PETROLEUM") that must be unambiguous.
 */
export function buildTickerIndex(rows: { ticker: string; title: string }[]): TickerIndex {
  const exact = new Map<string, { ticker: string; title: string }>();
  const byFirst = new Map<string, { tokens: string[]; row: { ticker: string; title: string } }[]>();
  for (const row of rows) {
    const key = normalizeIssuer(row.title);
    if (!key) continue;
    const entry = { ticker: displayTicker(row.ticker), title: row.title };
    if (!exact.has(key)) exact.set(key, entry);
    const tokens = key.split(" ");
    if (!byFirst.has(key[0])) byFirst.set(key[0], []);
    byFirst.get(key[0])!.push({ tokens, row: entry });
  }
  return {
    lookup(issuer) {
      const key = normalizeIssuer(issuer);
      if (!key) return null;
      const hit = exact.get(key);
      if (hit) return hit;
      const tokens = key.split(" ");
      if (tokens.length < 2) return null;
      if (tokens.some((t) => t.length < 3)) return null;
      const candidates = (byFirst.get(key[0]) || []).filter(
        (c) => c.tokens.length === tokens.length && tokens.every((t, i) => abbreviates(t, c.tokens[i]) || abbreviates(c.tokens[i], t)),
      );
      const tickers = new Set(candidates.map((c) => c.row.ticker.split(".")[0]));
      return tickers.size === 1 ? candidates[0].row : null;
    },
  };
}

/** True when `short` is an in-order abbreviation of `long` sharing its first letter ("PETE" ↔ "PETROLEUM"). */
function abbreviates(short: string, long: string) {
  if (short === long) return true;
  if (short.length > long.length || short[0] !== long[0]) return false;
  let j = 0;
  for (const ch of long) if (ch === short[j]) j += 1;
  return j === short.length;
}

let tickerIndexCache: TickerIndex | null = null;

export async function secTickerIndex() {
  if (tickerIndexCache) return tickerIndexCache;
  const data = (await (await secFetch("https://www.sec.gov/files/company_tickers.json")).json()) as Record<string, { ticker: string; title: string }>;
  tickerIndexCache = buildTickerIndex(Object.values(data));
  return tickerIndexCache;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export type Quote = { ticker: string; price: number; open: number; asOf: string };

export function parseStooqCsv(csv: string): Quote[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines.shift() || "").toLowerCase().split(",");
  const col = (name: string) => header.indexOf(name);
  const quotes: Quote[] = [];
  for (const line of lines) {
    const cells = line.split(",");
    const close = Number(cells[col("close")]);
    const open = Number(cells[col("open")]);
    const symbol = cells[col("symbol")] || "";
    if (!symbol || !Number.isFinite(close) || close <= 0) continue;
    quotes.push({
      ticker: symbol.replace(/\.US$/i, "").replace(/-/g, ".").toUpperCase(),
      price: close,
      open: Number.isFinite(open) && open > 0 ? open : close,
      asOf: `${cells[col("date")] || ""} ${cells[col("time")] || ""}`.trim(),
    });
  }
  return quotes;
}

export async function fetchQuotes(tickers: string[]) {
  if (!tickers.length) return [];
  const symbols = tickers.map((ticker) => `${ticker.toLowerCase().replace(/\./g, "-")}.us`).join("+");
  const response = await fetch(`https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlcv&h&e=csv`);
  if (!response.ok) return [];
  return parseStooqCsv(await response.text());
}
