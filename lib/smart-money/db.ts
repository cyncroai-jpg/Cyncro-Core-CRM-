import { env } from "cloudflare:workers";
import { INVESTOR_SEEDS } from "./investors";

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  run: () => Promise<unknown>;
};

export type D1 = {
  prepare: (query: string) => Prepared;
  batch: (statements: Prepared[]) => Promise<unknown>;
};

export type InvestorRow = {
  cik: string;
  name: string;
  fund: string;
  style: string;
  is_custom: number;
  filer_name: string | null;
  latest_accession: string | null;
  latest_period: string | null;
  latest_filed: string | null;
  prev_period: string | null;
  portfolio_value: number | null;
  positions: number | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type HoldingRow = {
  cik: string;
  period: string;
  cusip: string;
  issuer: string;
  title_class: string;
  value_usd: number;
  shares: number;
};

export type InsiderRow = {
  accession: string;
  seq: number;
  filed_at: string;
  issuer_cik: string;
  issuer: string;
  ticker: string;
  owner: string;
  role: string;
  trade_date: string;
  shares: number;
  price: number;
  value_usd: number;
};

export type EventRow = {
  id: number;
  kind: string;
  title: string;
  detail: string | null;
  ticker: string | null;
  cik: string | null;
  value_usd: number | null;
  created_at: string;
};

export function smartMoneyDb() {
  const db = (env as unknown as { DB?: D1 }).DB;
  if (!db) throw new Error("Smart Money database is not configured.");
  return db;
}

let initialized = false;
export async function ensureSmartMoneySchema() {
  if (initialized) return;
  const db = smartMoneyDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_investors (
      cik TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fund TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT '',
      is_custom INTEGER NOT NULL DEFAULT 0,
      filer_name TEXT,
      latest_accession TEXT,
      latest_period TEXT,
      latest_filed TEXT,
      prev_period TEXT,
      portfolio_value REAL,
      positions INTEGER,
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_holdings (
      cik TEXT NOT NULL,
      period TEXT NOT NULL,
      cusip TEXT NOT NULL,
      issuer TEXT NOT NULL,
      title_class TEXT NOT NULL DEFAULT '',
      value_usd REAL NOT NULL,
      shares REAL NOT NULL,
      PRIMARY KEY (cik, period, cusip)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS sm_holdings_cusip_idx ON sm_holdings(cusip)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_cusip_map (
      cusip TEXT PRIMARY KEY,
      ticker TEXT,
      name TEXT,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_insider_trades (
      accession TEXT NOT NULL,
      seq INTEGER NOT NULL,
      filed_at TEXT NOT NULL,
      issuer_cik TEXT NOT NULL,
      issuer TEXT NOT NULL,
      ticker TEXT NOT NULL,
      owner TEXT NOT NULL,
      role TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      shares REAL NOT NULL,
      price REAL NOT NULL,
      value_usd REAL NOT NULL,
      PRIMARY KEY (accession, seq)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS sm_insider_ticker_idx ON sm_insider_trades(ticker, filed_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sm_seen_filings (accession TEXT PRIMARY KEY, seen_at TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      ticker TEXT,
      cik TEXT,
      value_usd REAL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_prices (
      ticker TEXT PRIMARY KEY,
      price REAL NOT NULL,
      open REAL NOT NULL,
      as_of TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE TABLE IF NOT EXISTS sm_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sm_screens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`),
  ]);
  const now = new Date().toISOString();
  await db.batch(
    INVESTOR_SEEDS.map((seed) =>
      db
        .prepare(
          "INSERT INTO sm_investors (cik,name,fund,style,is_custom,created_at) VALUES (?,?,?,?,0,?) ON CONFLICT(cik) DO NOTHING",
        )
        .bind(seed.cik, seed.name, seed.fund, seed.style, now),
    ),
  );
  initialized = true;
}

export async function getMeta(key: string) {
  const row = await smartMoneyDb().prepare("SELECT value FROM sm_meta WHERE key=?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  await smartMoneyDb()
    .prepare("INSERT INTO sm_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(key, value)
    .run();
}

export async function addEvent(event: Omit<EventRow, "id" | "created_at">) {
  await smartMoneyDb()
    .prepare("INSERT INTO sm_events (kind,title,detail,ticker,cik,value_usd,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(event.kind, event.title, event.detail, event.ticker, event.cik, event.value_usd, new Date().toISOString())
    .run();
}

/** Runs statements in chunks so very large 13F filings stay within D1 batch limits. */
export async function batchInChunks(statements: Prepared[], size = 80) {
  const db = smartMoneyDb();
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}
