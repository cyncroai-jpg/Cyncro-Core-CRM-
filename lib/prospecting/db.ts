import { env } from "cloudflare:workers";

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  run: () => Promise<unknown>;
};

type D1 = {
  prepare: (query: string) => Prepared;
  batch: (statements: Prepared[]) => Promise<unknown>;
};

export type ProspectRecord = {
  id: string;
  google_place_id: string | null;
  business_name: string;
  category: string;
  address: string;
  phone: string | null;
  normalized_phone: string | null;
  website: string | null;
  domain: string | null;
  rating_x10: number | null;
  review_count: number;
  self_reported_revenue_cents: number | null;
  estimated_revenue_low_cents: number | null;
  estimated_revenue_high_cents: number | null;
  revenue_confidence: string | null;
  revenue_methodology: string | null;
  opportunity_score: number | null;
  rank_label: string | null;
  signals_json: string | null;
  reasons_json: string | null;
  why_call: string | null;
  what_found: string | null;
  recommended_solution: string | null;
  call_opener: string | null;
  next_action: string | null;
  emails_json: string | null;
  phones_json: string | null;
  leadership_json: string | null;
  source_urls_json: string | null;
  last_extracted_at: string | null;
  assigned_rep: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  analyzed_at: string | null;
};

function database() {
  const db = (env as unknown as { DB?: D1 }).DB;
  if (!db) throw new Error("Prospecting database is not configured.");
  return db;
}

let initialized = false;
export async function ensureProspectingSchema() {
  if (initialized) return;
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      google_place_id TEXT,
      business_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Business',
      address TEXT NOT NULL,
      phone TEXT,
      normalized_phone TEXT,
      website TEXT,
      domain TEXT,
      rating_x10 INTEGER,
      review_count INTEGER NOT NULL DEFAULT 0,
      self_reported_revenue_cents INTEGER,
      estimated_revenue_low_cents INTEGER,
      estimated_revenue_high_cents INTEGER,
      revenue_confidence TEXT,
      revenue_methodology TEXT,
      name_address_key TEXT NOT NULL,
      opportunity_score INTEGER,
      rank_label TEXT,
      signals_json TEXT,
      reasons_json TEXT,
      why_call TEXT,
      what_found TEXT,
      recommended_solution TEXT,
      call_opener TEXT,
      next_action TEXT,
      emails_json TEXT,
      phones_json TEXT,
      leadership_json TEXT,
      source_urls_json TEXT,
      last_extracted_at TEXT,
      assigned_rep TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      analyzed_at TEXT
    )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS prospects_google_place_id_unique ON prospects (google_place_id)",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS prospects_domain_unique ON prospects (domain)",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS prospects_phone_unique ON prospects (normalized_phone)",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS prospects_name_address_unique ON prospects (name_address_key)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS prospects_score_idx ON prospects (opportunity_score DESC)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects (status)",
    ),
  ]);
  for (const statement of [
    "ALTER TABLE prospects ADD COLUMN self_reported_revenue_cents INTEGER",
    "ALTER TABLE prospects ADD COLUMN estimated_revenue_low_cents INTEGER",
    "ALTER TABLE prospects ADD COLUMN estimated_revenue_high_cents INTEGER",
    "ALTER TABLE prospects ADD COLUMN revenue_confidence TEXT",
    "ALTER TABLE prospects ADD COLUMN revenue_methodology TEXT",
  ]) try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  await db.prepare(`UPDATE prospects SET
    estimated_revenue_low_cents=CASE WHEN lower(category) LIKE '%dealership%' OR lower(category) LIKE '%hotel%' OR lower(category) LIKE '%manufactur%' THEN 275000000 ELSE 27500000 END,
    estimated_revenue_high_cents=CASE WHEN lower(category) LIKE '%dealership%' OR lower(category) LIKE '%hotel%' OR lower(category) LIKE '%manufactur%' THEN 825000000 ELSE 82500000 END,
    revenue_confidence='LOW', revenue_methodology='Directional estimate from industry benchmark band and observable public signals; not verified financial data.'
    WHERE estimated_revenue_low_cents IS NULL`).run();
  initialized = true;
}

export function getProspectingDb() {
  return database();
}

export function normalizePhone(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function normalizeDomain(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function nameAddressKey(name: string, address: string) {
  return `${name}::${address}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hydrateProspect(row: ProspectRecord) {
  return {
    id: row.id,
    googlePlaceId: row.google_place_id,
    businessName: row.business_name,
    category: row.category,
    address: row.address,
    phone: row.phone,
    website: row.website,
    domain: row.domain,
    rating: row.rating_x10 == null ? null : row.rating_x10 / 10,
    reviewCount: row.review_count,
    selfReportedRevenue: row.self_reported_revenue_cents == null ? null : row.self_reported_revenue_cents / 100,
    estimatedRevenueLow: row.estimated_revenue_low_cents == null ? null : row.estimated_revenue_low_cents / 100,
    estimatedRevenueHigh: row.estimated_revenue_high_cents == null ? null : row.estimated_revenue_high_cents / 100,
    revenueConfidence: row.revenue_confidence,
    revenueMethodology: row.revenue_methodology,
    opportunityScore: row.opportunity_score,
    rankLabel: row.rank_label,
    signals: row.signals_json ? JSON.parse(row.signals_json) : null,
    reasons: row.reasons_json ? JSON.parse(row.reasons_json) : [],
    whyCall: row.why_call,
    whatFound: row.what_found,
    recommendedSolution: row.recommended_solution,
    callOpener: row.call_opener,
    nextAction: row.next_action,
    emails: row.emails_json ? JSON.parse(row.emails_json) : [],
    extractedPhones: row.phones_json ? JSON.parse(row.phones_json) : [],
    leadership: row.leadership_json ? JSON.parse(row.leadership_json) : [],
    sourceUrls: row.source_urls_json ? JSON.parse(row.source_urls_json) : [],
    lastExtractedAt: row.last_extracted_at,
    assignedRep: row.assigned_rep,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analyzedAt: row.analyzed_at,
  };
}
