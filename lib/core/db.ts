import { env } from "cloudflare:workers";

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta?: { changes?: number } }>;
};

type D1 = {
  prepare: (query: string) => Prepared;
  batch: (statements: Prepared[]) => Promise<unknown>;
};

export function coreDb() {
  const db = (env as unknown as { DB?: D1 }).DB;
  if (!db) throw new Error("Cyncro database is not configured.");
  return db;
}

let initialized = false;
export async function ensureCoreSchema() {
  if (initialized) return;
  const db = coreDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      phone TEXT,
      address TEXT,
      category TEXT,
      owner_email TEXT,
      account_manager TEXT,
      sales_director TEXT,
      vp_sales TEXT,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      source_prospect_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_domain_unique ON crm_accounts(domain) WHERE domain IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_prospect_unique ON crm_accounts(source_prospect_id) WHERE source_prospect_id IS NOT NULL"),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contacts (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      title TEXT,
      lifecycle TEXT NOT NULL DEFAULT 'LEAD',
      assigned_rep TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES crm_accounts(id)
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique ON crm_contacts(lower(email)) WHERE email IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_contacts_account_idx ON crm_contacts(account_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_activities (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, activity_type TEXT NOT NULL, title TEXT NOT NULL,
      details TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'COMPLETED', created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_activities_contact_idx ON crm_activities(contact_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_activities_due_idx ON crm_activities(status, due_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_opportunities (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      primary_contact_id TEXT,
      pipeline_id TEXT,
      name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'NEW LEAD',
      value_cents INTEGER NOT NULL DEFAULT 0,
      probability INTEGER NOT NULL DEFAULT 10,
      assigned_rep TEXT,
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      commission_status TEXT NOT NULL DEFAULT 'PENDING',
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      collected_cents INTEGER NOT NULL DEFAULT 0,
      residual_rate_bps INTEGER NOT NULL DEFAULT 0,
      residual_months INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      expected_close_date TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES crm_accounts(id),
      FOREIGN KEY(primary_contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#B51F38',
      position INTEGER NOT NULL,
      probability INTEGER NOT NULL DEFAULT 10,
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(pipeline_id) REFERENCES crm_pipelines(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_opportunities_stage_idx ON crm_opportunities(stage)"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_opportunities_rep_idx ON crm_opportunities(assigned_rep)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_event_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
      buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 1,
      location_modes TEXT NOT NULL DEFAULT '["VIDEO"]',
      video_platforms TEXT NOT NULL DEFAULT '["GOOGLE_MEET","ZOOM","FACETIME"]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_availability (
      id TEXT PRIMARY KEY,
      event_type_id TEXT,
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      timezone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_bookings (
      id TEXT PRIMARY KEY,
      event_type_id TEXT NOT NULL,
      account_id TEXT,
      contact_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      timezone TEXT NOT NULL,
      location_mode TEXT NOT NULL,
      meeting_address TEXT,
      video_platform TEXT,
      video_url TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id),
      FOREIGN KEY(account_id) REFERENCES crm_accounts(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS calendar_bookings_time_idx ON calendar_bookings(starts_at, ends_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS calendar_bookings_contact_idx ON calendar_bookings(contact_id)"),
  ]);
  initialized = true;
}

export function requestUser(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return email || "platform-owner";
}

export function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeEmail(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
