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
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_unique ON auth_users(lower(email))"),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (
      email TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'MEMBER', crm_access INTEGER NOT NULL DEFAULT 1,
      calendar_access INTEGER NOT NULL DEFAULT 0, prospecting_access INTEGER NOT NULL DEFAULT 0, manage_users INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
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
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_domain_unique ON crm_accounts(domain) WHERE domain IS NOT NULL",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_prospect_unique ON crm_accounts(source_prospect_id) WHERE source_prospect_id IS NOT NULL",
    ),
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
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique ON crm_contacts(lower(email)) WHERE email IS NOT NULL",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS crm_contacts_account_idx ON crm_contacts(account_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_activities (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, activity_type TEXT NOT NULL, title TEXT NOT NULL,
      details TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'COMPLETED', created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS crm_activities_contact_idx ON crm_activities(contact_id, created_at DESC)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS crm_activities_due_idx ON crm_activities(status, due_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_opportunities (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      primary_contact_id TEXT,
      pipeline_id TEXT,
      name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'NEW LEAD',
      value_cents INTEGER NOT NULL DEFAULT 0,
      cost_cents INTEGER NOT NULL DEFAULT 0,
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
    db.prepare(
      "CREATE INDEX IF NOT EXISTS crm_opportunities_stage_idx ON crm_opportunities(stage)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS crm_opportunities_rep_idx ON crm_opportunities(assigned_rep)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_event_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      duration_options TEXT,
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
      buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 1,
      location_modes TEXT NOT NULL DEFAULT '["VIDEO"]',
      video_platforms TEXT NOT NULL DEFAULT '["GOOGLE_MEET","ZOOM","FACETIME"]',
      host_name TEXT,
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
      assigned_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id),
      FOREIGN KEY(account_id) REFERENCES crm_accounts(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS calendar_bookings_time_idx ON calendar_bookings(starts_at, ends_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS calendar_bookings_contact_idx ON calendar_bookings(contact_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS calendar_bookings_assigned_idx ON calendar_bookings(assigned_to, starts_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_notifications (
      id TEXT PRIMARY KEY, recipient TEXT NOT NULL, title TEXT NOT NULL, body TEXT, entity_type TEXT, entity_id TEXT, read_at TEXT, created_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS workspace_notifications_recipient_idx ON workspace_notifications(recipient, created_at DESC)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_feeds (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_oauth_states (
      state TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_oauth_connections (
      owner TEXT NOT NULL, provider TEXT NOT NULL, account_email TEXT, calendar_id TEXT,
      access_token TEXT NOT NULL, refresh_token TEXT, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (owner, provider)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_social_flows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL, trigger_word TEXT NOT NULL,
      reply_text TEXT NOT NULL, extra_keywords TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'DRAFT',
      reach_count INTEGER NOT NULL DEFAULT 0, lead_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_invoices (
      id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE, client_name TEXT NOT NULL, client_email TEXT NOT NULL,
      description TEXT NOT NULL, amount_cents INTEGER NOT NULL, due_date TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
      stripe_url TEXT, paid_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contracts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, client_name TEXT NOT NULL, client_email TEXT NOT NULL,
      body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', signing_token TEXT NOT NULL UNIQUE,
      signer_name TEXT, signer_ip TEXT, signed_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contract_signers (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, signer_name TEXT NOT NULL, signer_email TEXT NOT NULL,
      signer_role TEXT NOT NULL DEFAULT 'CLIENT', signing_order INTEGER NOT NULL DEFAULT 1, signing_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING', signed_at TEXT, signer_ip TEXT, consent_text TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(contract_id) REFERENCES crm_contracts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contract_versions (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, version_number INTEGER NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, document_hash TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(contract_id) REFERENCES crm_contracts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contract_events (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, event_type TEXT NOT NULL, actor TEXT, details TEXT,
      ip_address TEXT, created_at TEXT NOT NULL, FOREIGN KEY(contract_id) REFERENCES crm_contracts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_contract_attachments (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
      object_key TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(contract_id) REFERENCES crm_contracts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_sales_playbooks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL, category TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'ANY', subject TEXT, content TEXT NOT NULL, objection TEXT,
      tags TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, usage_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_playbook_activity (
      id TEXT PRIMARY KEY, playbook_id TEXT NOT NULL, contact_id TEXT, opportunity_id TEXT, channel TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'USED', used_by TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(playbook_id) REFERENCES crm_sales_playbooks(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS attribution_touchpoints (
      id TEXT PRIMARY KEY, visitor_id TEXT, contact_id TEXT, opportunity_id TEXT, channel TEXT NOT NULL DEFAULT 'DIRECT',
      source TEXT NOT NULL DEFAULT 'Direct', medium TEXT, campaign TEXT, content TEXT, term TEXT, landing_page TEXT,
      referrer TEXT, click_id TEXT, event_type TEXT NOT NULL DEFAULT 'PAGE_VIEW', event_value_cents INTEGER NOT NULL DEFAULT 0,
      occurred_at TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attribution_contact_time ON attribution_touchpoints(contact_id, occurred_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attribution_source_time ON attribution_touchpoints(source, occurred_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS attribution_spend (
      id TEXT PRIMARY KEY, platform TEXT NOT NULL, account_name TEXT, campaign TEXT NOT NULL, spend_cents INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attribution_spend_period ON attribution_spend(period_start, period_end)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS attribution_settings (
      workspace_key TEXT PRIMARY KEY, model TEXT NOT NULL DEFAULT 'LAST_TOUCH', lookback_days INTEGER NOT NULL DEFAULT 90,
      currency TEXT NOT NULL DEFAULT 'USD', updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS attribution_print_campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, destination_url TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'PRINT',
      distribution_count INTEGER NOT NULL DEFAULT 0, scans INTEGER NOT NULL DEFAULT 0, conversions INTEGER NOT NULL DEFAULT 0,
      revenue_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS attribution_reports (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, dimensions TEXT NOT NULL DEFAULT '[]', metrics TEXT NOT NULL DEFAULT '[]',
      filters TEXT NOT NULL DEFAULT '{}', date_range TEXT NOT NULL DEFAULT '90D', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'TODO', priority TEXT NOT NULL DEFAULT 'MEDIUM',
      assignee TEXT, reporter TEXT, contact_id TEXT, opportunity_id TEXT, account_id TEXT, due_at TEXT, start_at TEXT,
      estimated_minutes INTEGER NOT NULL DEFAULT 30, recurrence TEXT, dependency_id TEXT, position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_work_tasks_assignee_status ON work_tasks(assignee, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_work_tasks_due ON work_tasks(status, due_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_subtasks (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES work_tasks(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_comments (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, author TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES work_tasks(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_blocked_times (
      id TEXT PRIMARY KEY,
      event_type_id TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      reason TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_blocked_times_range ON calendar_blocked_times(starts_at, ends_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_booking_reminders (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES calendar_bookings(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_booking_reminders_booking ON calendar_booking_reminders(booking_id, reminder_type)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS prime_missions (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      query TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_prime_missions_created ON prime_missions(created_at DESC)"),
  ]);
  try {
    await db
      .prepare("ALTER TABLE calendar_event_types ADD COLUMN host_name TEXT")
      .run();
  } catch {
    /* already migrated */
  }
  try {
    await db
      .prepare(
        "ALTER TABLE calendar_event_types ADD COLUMN duration_options TEXT",
      )
      .run();
  } catch {
    /* already migrated */
  }
  try {
    await db
      .prepare(
        "ALTER TABLE crm_opportunities ADD COLUMN residual_flat_cents INTEGER NOT NULL DEFAULT 2500",
      )
      .run();
  } catch {
    /* already migrated */
  }
  try {
    await db
      .prepare(
        "ALTER TABLE crm_opportunities ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0",
      )
      .run();
  } catch {
    /* already migrated */
  }
  // Premium calendar columns
  for (const statement of [
    "ALTER TABLE calendar_event_types ADD COLUMN color TEXT NOT NULL DEFAULT '#C1283E'",
    "ALTER TABLE calendar_event_types ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_event_types ADD COLUMN min_notice_hours INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE calendar_event_types ADD COLUMN max_advance_days INTEGER NOT NULL DEFAULT 60",
    "ALTER TABLE calendar_event_types ADD COLUMN cancellation_hours INTEGER NOT NULL DEFAULT 24",
    "ALTER TABLE calendar_event_types ADD COLUMN custom_questions TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE calendar_event_types ADD COLUMN max_bookings_per_day INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_event_types ADD COLUMN slot_interval_minutes INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_bookings ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_bookings ADD COLUMN custom_answers TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE calendar_bookings ADD COLUMN reminder_24h_sent INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_bookings ADD COLUMN reminder_1h_sent INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_bookings ADD COLUMN cancellation_reason TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN event_name TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
  for (const statement of [
    "ALTER TABLE workspace_members ADD COLUMN can_create INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE workspace_members ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE workspace_members ADD COLUMN can_delete INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN can_export INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN compensation_access INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN invoice_access INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN contract_access INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN attribution_access INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspace_members ADD COLUMN work_access INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE crm_contracts ADD COLUMN opportunity_id TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN invoice_id TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN template_key TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN expires_at TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN revoked_at TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN locked_at TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN document_hash TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN owner_signer_name TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN owner_signed_at TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN owner_signer_ip TEXT",
    "ALTER TABLE crm_contracts ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE crm_contracts ADD COLUMN last_reminded_at TEXT",
  ]) {
    try {
      await db.prepare(statement).run();
    } catch {
      /* already migrated */
    }
  }
  await db
    .prepare(
      "UPDATE calendar_event_types SET duration_options=json_array(15,30,45,60) WHERE id='cyncro-default-consultation' AND (duration_options IS NULL OR duration_options='')",
    )
    .run();
  await db
    .prepare(
      "UPDATE crm_opportunities SET commission_rate_bps=2000 WHERE commission_rate_bps<2000",
    )
    .run();
  await db
    .prepare(
      "UPDATE crm_opportunities SET commission_rate_bps=3000 WHERE commission_rate_bps>3000",
    )
    .run();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO calendar_event_types
      (id,name,slug,description,duration_minutes,buffer_before_minutes,buffer_after_minutes,capacity,location_modes,video_platforms,active,created_at,updated_at)
      VALUES ('cyncro-default-consultation','Consultation','consultation','Standard appointment',30,0,0,1,'["VIDEO","PHONE","IN_PERSON"]','["GOOGLE_MEET","ZOOM","FACETIME"]',1,?,?)`,
      )
      .bind(now, now),
    ...[1, 2, 3, 4, 5].map((weekday) =>
      db
        .prepare(
          `INSERT INTO calendar_availability
      (id,event_type_id,weekday,start_time,end_time,timezone,active)
      SELECT ?, 'cyncro-default-consultation', ?, '09:00', '17:00', 'America/New_York', 1
      WHERE NOT EXISTS (SELECT 1 FROM calendar_availability WHERE event_type_id='cyncro-default-consultation' AND weekday=?)`,
        )
        .bind(`cyncro-default-availability-${weekday}`, weekday, weekday),
    ),
    db
      .prepare(
        `INSERT OR IGNORE INTO crm_sales_playbooks (id,name,channel,category,stage,subject,content,objection,tags,created_by,created_at,updated_at)
      VALUES ('cyncro-call-discovery','Executive Discovery Call','CALL','Discovery','QUALIFIED',NULL,
      'OPEN\nHi {{first_name}}, this is {{rep_name}} with {{company_name}}. I noticed {{personalized_reason}}. Did I catch you with 30 seconds?\n\nDISCOVER\nHow are you currently handling {{problem_area}}?\nWhat happens when a lead is not answered immediately?\nWhat is that costing the team in missed appointments or revenue?\n\nPOSITION\nBased on what you shared, Cyncro can connect the lead, follow-up, calendar, team, and revenue record instead of adding another disconnected tool.\n\nCLOSE\nThe next step is a {{meeting_length}}-minute strategy session. Is {{option_one}} or {{option_two}} better?',
      'Diagnose before answering; never argue.','["discovery","high-ticket"]','system',?,?)`,
      )
      .bind(now, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO crm_sales_playbooks (id,name,channel,category,stage,subject,content,objection,tags,created_by,created_at,updated_at)
      VALUES ('cyncro-sms-fast-followup','New Lead — 60 Second Follow-Up','SMS','Speed to Lead','NEW',NULL,
      'Hi {{first_name}}, this is {{rep_name}} with {{company_name}}. I just received your request about {{interest}}. I can help you map the best next step—would you prefer a quick call now or this afternoon? Reply STOP to opt out.',
      'If unavailable, offer {{booking_link}}.','["speed-to-lead","consent"]','system',?,?)`,
      )
      .bind(now, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO crm_sales_playbooks (id,name,channel,category,stage,subject,content,objection,tags,created_by,created_at,updated_at)
      VALUES ('cyncro-email-proposal','Proposal Follow-Up','EMAIL','Closing','PROPOSAL','Your Cyncro plan + next step',
      'Hi {{first_name}},\n\nI wanted to make the decision simple. Your team needs {{desired_outcome}}, and the biggest gap we identified is {{problem_area}}.\n\nThe recommended plan is {{recommended_solution}} at {{investment}}. It connects the workflow from lead capture through follow-up, booking, operations, and revenue tracking.\n\nReview the proposal: {{proposal_link}}\nBook the decision call: {{booking_link}}\n\nBest,\n{{rep_name}}',
      'If there is no response, move to the value-recap sequence.','["proposal","closing"]','system',?,?)`,
      )
      .bind(now, now),
  ]);
  initialized = true;
}

export function requestUser(request: Request) {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  return email || "platform-owner";
}

/**
 * Resolves the authenticated email for a request.
 * Checks the Cyncro session cookie first (real auth), then falls back to
 * the platform-injected header (legacy / platform-level auth).
 * Returns null if neither is present and users exist in the database.
 */
export async function resolveRequestEmail(request: Request): Promise<string | null> {
  // 1. Check session cookie
  const cookieHeader = request.headers.get("cookie") || "";
  let sessionToken = "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.trim() === "cyncro_session" && rest.length) {
      sessionToken = decodeURIComponent(rest.join("=").trim());
      break;
    }
  }
  if (sessionToken) {
    try {
      const session = await coreDb()
        .prepare(
          "SELECT s.email, s.expires_at, u.active FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token=?",
        )
        .bind(sessionToken)
        .first<{ email: string; expires_at: string; active: number }>();
      if (session && session.active && new Date(session.expires_at) >= new Date()) {
        return session.email;
      }
    } catch {
      // DB not yet ready — fall through
    }
  }
  // 2. Check platform-injected header
  const headerEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (headerEmail) return headerEmail;
  // 3. If no users exist yet (first run before setup), allow as platform-owner
  try {
    const count = await coreDb()
      .prepare("SELECT COUNT(*) AS total FROM auth_users")
      .first<{ total: number }>();
    if (Number(count?.total || 0) === 0) return "platform-owner";
  } catch {
    return "platform-owner";
  }
  return null; // unauthenticated
}

export async function hasModuleAccess(
  request: Request,
  module: "crm" | "calendar" | "prospecting",
) {
  const email = requestUser(request);
  if (email === "platform-owner" || email === "vividpyvette@gmail.com") return true;
  const member = await coreDb()
    .prepare(
      `SELECT role, active, ${module}_access AS allowed FROM workspace_members WHERE email=?`,
    )
    .bind(email)
    .first<{ role: string; active: number; allowed: number }>();
  if (!member) {
    const count = await coreDb()
      .prepare("SELECT COUNT(*) AS total FROM workspace_members")
      .first<{ total: number }>();
    if (!Number(count?.total || 0)) return true;
  }
  return Boolean(member?.active && (member.role === "OWNER" || member.allowed));
}

export async function isWorkspaceOwner(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb()
    .prepare(
      "SELECT role,active,display_name FROM workspace_members WHERE email=?",
    )
    .bind(email)
    .first<{ role: string; active: number; display_name: string }>();
  const protectedOwners = new Set(["yvette lomeli", "christopher sydoriak"]);
  const protectedOwnerEmails = new Set(["vividpyvette@gmail.com"]);
  return Boolean(
    protectedOwnerEmails.has(email) ||
      (member?.active &&
        (member.role === "OWNER" ||
          protectedOwners.has(
            String(member.display_name || "")
              .trim()
              .toLowerCase(),
          ))),
  );
}

export async function hasCrmAction(request: Request, action: "create"|"edit"|"delete"|"export") {
  const email=requestUser(request); if(email==="platform-owner"||email==="vividpyvette@gmail.com") return true;
  const member=await coreDb().prepare(`SELECT role,active,crm_access,can_${action} allowed FROM workspace_members WHERE email=?`).bind(email).first<{role:string;active:number;crm_access:number;allowed:number}>();
  if(!member){const count=await coreDb().prepare("SELECT COUNT(*) total FROM workspace_members").first<{total:number}>();if(!Number(count?.total||0))return true;}
  return Boolean(member?.active&&member.crm_access&&(member.role==="OWNER"||member.allowed));
}

export function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeEmail(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Strip formatting characters and return digits-only E.164-ish phone for deduplication.
 *  Returns null when the input has fewer than 7 digits (too short to be a real number). */
export function normalizePhone(value: unknown): string | null {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Drop leading country code 1 for North American numbers to allow "+1 (800) 555-1234" == "800-555-1234"
  const canonical = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return canonical.length >= 7 ? canonical : null;
}
