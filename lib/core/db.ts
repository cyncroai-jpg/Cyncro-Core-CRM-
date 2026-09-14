import { env } from "cloudflare:workers";
import crypto from "crypto";

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

/** Multi-tenant context extracted from request */
export interface TenantContext {
  tenantId: string;
  userId: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "USER" | "VIEWER";
}

export async function ensureCoreSchema() {
  if (initialized) return;
  const db = coreDb();
  await db.batch([
    // ============ MULTI-TENANT CORE TABLES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      plan TEXT NOT NULL DEFAULT 'starter',
      seats INTEGER NOT NULL DEFAULT 3,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_members (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      permissions TEXT DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(user_id) REFERENCES auth_users(id),
      UNIQUE(tenant_id, email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS tenant_members_tenant_idx ON tenant_members(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS tenant_members_user_idx ON tenant_members(user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      stripe_subscription_id TEXT,
      stripe_invoice_id TEXT,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_period_start TEXT,
      current_period_end TEXT,
      amount_cents INTEGER,
      currency TEXT DEFAULT 'USD',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx ON tenant_subscriptions(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      last_used_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      email TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(tenant_id, user_id)"),
    // ============ UPDATED AUTH TABLES ============
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
    // Migration: add default_tenant_id if it doesn't exist
    db.prepare("ALTER TABLE auth_users ADD COLUMN default_tenant_id TEXT"),
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
    // Migration: add tenant_id to crm_accounts
    db.prepare("ALTER TABLE crm_accounts ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_accounts_tenant_idx ON crm_accounts(tenant_id)"),
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
    // Migration: add tenant_id to crm_contacts
    db.prepare("ALTER TABLE crm_contacts ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_contacts_tenant_idx ON crm_contacts(tenant_id)"),
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
    // Migration: add tenant_id to crm_opportunities and crm_activities
    db.prepare("ALTER TABLE crm_opportunities ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_opportunities_tenant_idx ON crm_opportunities(tenant_id)"),
    db.prepare("ALTER TABLE crm_activities ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS crm_activities_tenant_idx ON crm_activities(tenant_id)"),
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
    // Migration: add tenant_id to calendar tables
    db.prepare("ALTER TABLE calendar_event_types ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS calendar_event_types_tenant_idx ON calendar_event_types(tenant_id)"),
    db.prepare("ALTER TABLE calendar_bookings ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS calendar_bookings_tenant_idx ON calendar_bookings(tenant_id)"),
    db.prepare("ALTER TABLE calendar_availability ADD COLUMN tenant_id TEXT"),
    db.prepare("ALTER TABLE calendar_feeds ADD COLUMN tenant_id TEXT"),
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
    // ── Universal Calendar™ Phase 2 ──────────────────────────────────────────
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'ROOM',
      description TEXT,
      location TEXT,
      capacity INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#C1283E',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_resource_bookings (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES calendar_bookings(id),
      FOREIGN KEY(resource_id) REFERENCES calendar_resources(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resource_bookings_range ON calendar_resource_bookings(resource_id, starts_at, ends_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_routing_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      event_type_id TEXT,
      strategy TEXT NOT NULL DEFAULT 'ROUND_ROBIN',
      members TEXT NOT NULL DEFAULT '[]',
      weights TEXT NOT NULL DEFAULT '{}',
      skills_required TEXT NOT NULL DEFAULT '[]',
      territory_rules TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_slot_holds (
      token TEXT PRIMARY KEY,
      event_type_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      customer_email TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slot_holds_expires ON calendar_slot_holds(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slot_holds_event_time ON calendar_slot_holds(event_type_id, starts_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_waitlist (
      id TEXT PRIMARY KEY,
      event_type_id TEXT NOT NULL,
      preferred_date TEXT,
      preferred_time_start TEXT,
      preferred_time_end TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'WAITING',
      notified_at TEXT,
      booking_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_waitlist_event ON calendar_waitlist(event_type_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_recurrence_rules (
      id TEXT PRIMARY KEY,
      event_type_id TEXT NOT NULL,
      contact_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'WEEKLY',
      interval_count INTEGER NOT NULL DEFAULT 1,
      weekdays TEXT NOT NULL DEFAULT '[]',
      day_of_month INTEGER,
      starts_on TEXT NOT NULL,
      ends_on TEXT,
      max_occurrences INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      location_mode TEXT NOT NULL DEFAULT 'VIDEO',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_type_id) REFERENCES calendar_event_types(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_audit_log (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      entity_type TEXT NOT NULL DEFAULT 'BOOKING',
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON calendar_audit_log(entity_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON calendar_audit_log(actor, created_at DESC)"),
    // Phase 7: Automation webhook endpoints
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_webhook_endpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_webhook_deliveries (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      response_code INTEGER,
      response_body TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON calendar_webhook_deliveries(endpoint_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON calendar_webhook_deliveries(status, next_retry_at)"),
    // Phase 7: A/B slot experimentation
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_ab_experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      event_type_id TEXT,
      variants TEXT NOT NULL DEFAULT '[]',
      traffic_split TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_ab_events (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'IMPRESSION',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ab_events_experiment ON calendar_ab_events(experiment_id, event_type, created_at DESC)"),
    // Migration: add tenant_id to webhook and experiment tables
    db.prepare("ALTER TABLE calendar_webhook_endpoints ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON calendar_webhook_endpoints(tenant_id)"),
    db.prepare("ALTER TABLE calendar_webhook_deliveries ADD COLUMN tenant_id TEXT"),
    db.prepare("ALTER TABLE calendar_ab_experiments ADD COLUMN tenant_id TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ab_experiments_tenant ON calendar_ab_experiments(tenant_id)"),
    db.prepare("ALTER TABLE calendar_ab_events ADD COLUMN tenant_id TEXT"),
    // ============ PHASE 8: EMAIL SEQUENCES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS email_sequences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      steps TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_enroll INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sequences_tenant ON email_sequences(tenant_id, trigger)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      sequence_id TEXT NOT NULL,
      contact_id TEXT,
      contact_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_step INTEGER NOT NULL DEFAULT 0,
      enrolled_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(sequence_id) REFERENCES email_sequences(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON email_sequence_enrollments(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_enrollments_sequence ON email_sequence_enrollments(sequence_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_sequence_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      enrollment_id TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      step_order INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(enrollment_id) REFERENCES email_sequence_enrollments(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seq_events_enrollment ON email_sequence_events(enrollment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seq_events_tenant ON email_sequence_events(tenant_id, created_at DESC)"),
    // ============ PHASE 9: WORKFLOWS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      nodes TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON workflows(tenant_id, trigger)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      contact_id TEXT,
      deal_id TEXT,
      trigger_data TEXT,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      current_node_id TEXT,
      completed_nodes TEXT DEFAULT '[]',
      errors TEXT DEFAULT '[]',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(workflow_id) REFERENCES workflows(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_executions_tenant ON workflow_executions(tenant_id, started_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_executions_status ON workflow_executions(status)"),
    // ============ PHASE 10: FORMS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      fields TEXT NOT NULL DEFAULT '[]',
      title TEXT NOT NULL,
      description TEXT,
      success_message TEXT,
      redirect_url TEXT,
      notify_email TEXT,
      auto_enroll_sequence TEXT,
      trigger_workflow TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, slug)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_forms_tenant ON forms(tenant_id, active)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      contact_id TEXT,
      email TEXT,
      name TEXT,
      data TEXT,
      submitted_at TEXT NOT NULL,
      ip_address TEXT,
      FOREIGN KEY(form_id) REFERENCES forms(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_form ON form_submissions(form_id, submitted_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON form_submissions(tenant_id, submitted_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_contact ON form_submissions(contact_id)"),
    // ============ PHASE 12: SMS SEQUENCES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS sms_sequences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'twilio',
      steps TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_enroll INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_sequences_tenant ON sms_sequences(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sms_sequence_enrollments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      sequence_id TEXT NOT NULL,
      contact_id TEXT,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_step INTEGER NOT NULL DEFAULT 0,
      enrolled_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(sequence_id) REFERENCES sms_sequences(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_enrollments_tenant ON sms_sequence_enrollments(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_enrollments_sequence ON sms_sequence_enrollments(sequence_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sms_sequence_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      enrollment_id TEXT,
      phone TEXT NOT NULL,
      event_type TEXT NOT NULL,
      step_order INTEGER,
      sms_sid TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(enrollment_id) REFERENCES sms_sequence_enrollments(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_events_enrollment ON sms_sequence_events(enrollment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_events_tenant ON sms_sequence_events(tenant_id, created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS prime_missions (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      query TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_prime_missions_created ON prime_missions(created_at DESC)"),
    // Website Visitor Tracking (Phase 14)
    db.prepare(`CREATE TABLE IF NOT EXISTS website_visitors (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT,
      company_name TEXT,
      ip_address TEXT NOT NULL,
      country TEXT,
      city TEXT,
      state TEXT,
      user_agent TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      page_views INTEGER NOT NULL DEFAULT 0,
      lead_score INTEGER NOT NULL DEFAULT 0,
      identified INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_website_visitors_tenant ON website_visitors(tenant_id, last_seen DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_website_visitors_ip ON website_visitors(ip_address)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_website_visitors_contact ON website_visitors(contact_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS website_visits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      page_url TEXT NOT NULL,
      referrer TEXT,
      time_on_page INTEGER,
      visited_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(visitor_id) REFERENCES website_visitors(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_website_visits_visitor ON website_visits(visitor_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_website_visits_tenant ON website_visits(tenant_id, visited_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS website_pixel_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT,
      triggered_sequence BOOLEAN NOT NULL DEFAULT 0,
      triggered_workflow BOOLEAN NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(visitor_id) REFERENCES website_visitors(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor ON website_pixel_events(visitor_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_pixel_events_tenant ON website_pixel_events(tenant_id, created_at DESC)"),
    // Call Recording + Transcription (Phase 15)
    db.prepare(`CREATE TABLE IF NOT EXISTS call_recordings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT,
      deal_id TEXT,
      user_id TEXT,
      phone_number TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      recording_url TEXT,
      recording_sid TEXT,
      provider TEXT NOT NULL DEFAULT 'twilio',
      status TEXT NOT NULL DEFAULT 'PENDING',
      transcription_status TEXT NOT NULL DEFAULT 'PENDING',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      FOREIGN KEY(deal_id) REFERENCES crm_opportunities(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_recordings_tenant ON call_recordings(tenant_id, started_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_recordings_contact ON call_recordings(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_recordings_deal ON call_recordings(deal_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS call_transcripts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      transcript_text TEXT,
      word_count INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en',
      transcribed_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(recording_id) REFERENCES call_recordings(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_transcripts_recording ON call_transcripts(recording_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS call_analytics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      sentiment TEXT,
      sentiment_score REAL,
      summary TEXT,
      action_items TEXT,
      topics TEXT,
      key_phrases TEXT,
      analyzed_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(recording_id) REFERENCES call_recordings(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_analytics_recording ON call_analytics(recording_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_call_analytics_sentiment ON call_analytics(sentiment)"),
    // Landing Pages (Phase 16)
    db.prepare(`CREATE TABLE IF NOT EXISTS landing_pages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      template TEXT NOT NULL DEFAULT 'blank',
      published INTEGER NOT NULL DEFAULT 0,
      content TEXT,
      form_id TEXT,
      primary_color TEXT,
      favicon_url TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(form_id) REFERENCES forms(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug, tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_landing_pages_published ON landing_pages(published)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS landing_page_analytics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      visitor_ip TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      converted INTEGER NOT NULL DEFAULT 0,
      time_on_page INTEGER,
      viewed_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(page_id) REFERENCES landing_pages(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_page_analytics_page ON landing_page_analytics(page_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_page_analytics_tenant ON landing_page_analytics(tenant_id, viewed_at DESC)"),
    // Zapier Integration (Phase 17)
    db.prepare(`CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      app_icon_url TEXT,
      status TEXT NOT NULL DEFAULT 'CONNECTED',
      auth_type TEXT NOT NULL DEFAULT 'oauth',
      access_token TEXT,
      refresh_token TEXT,
      scope TEXT,
      api_key TEXT,
      webhook_url TEXT,
      connected_by TEXT,
      connected_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS zaps (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_app TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      action_app TEXT NOT NULL,
      action_event TEXT NOT NULL,
      trigger_config TEXT,
      action_config TEXT,
      execution_count INTEGER NOT NULL DEFAULT 0,
      last_executed_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_zaps_tenant ON zaps(tenant_id, enabled)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_zaps_trigger ON zaps(trigger_app, trigger_event)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS zap_executions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      zap_id TEXT NOT NULL,
      trigger_data TEXT,
      action_result TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      executed_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(zap_id) REFERENCES zaps(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_zap_executions_zap ON zap_executions(zap_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_zap_executions_status ON zap_executions(status)"),
    // Slack Integration (Phase 18)
    db.prepare(`CREATE TABLE IF NOT EXISTS slack_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      workspace_name TEXT,
      bot_token TEXT,
      user_token TEXT,
      scope TEXT,
      installed_by TEXT,
      installed_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slack_connections_tenant ON slack_connections(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slack_connections_workspace ON slack_connections(workspace_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS slack_notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slack_workspace_id TEXT,
      channel_id TEXT,
      event_type TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      message_ts TEXT,
      sent_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slack_notifications_tenant ON slack_notifications(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_slack_notifications_event ON slack_notifications(event_type)"),
    // Team Collaboration (Phase 20)
    db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_threads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      title TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_threads_tenant ON collaboration_threads(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_threads_resource ON collaboration_threads(resource_type, resource_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      author_id TEXT,
      author_email TEXT,
      content TEXT NOT NULL,
      mentions TEXT,
      attachments TEXT,
      edited_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(thread_id) REFERENCES collaboration_threads(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_messages_thread ON collaboration_messages(thread_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_messages_author ON collaboration_messages(author_email)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_mentions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      mentioned_user TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(message_id) REFERENCES collaboration_messages(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_mentions_user ON collaboration_mentions(mentioned_user, read)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      owner_id TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      shared_with TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shared_notes_tenant ON shared_notes(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shared_notes_owner ON shared_notes(owner_id)"),
    // Advanced Reporting (Phase 21)
    db.prepare(`CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      widgets TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_default ON dashboards(tenant_id, is_default)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      filters TEXT,
      columns TEXT,
      sort_by TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      recipients TEXT NOT NULL,
      frequency TEXT NOT NULL,
      format TEXT NOT NULL,
      next_run_at TEXT,
      last_run_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant ON scheduled_reports(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next ON scheduled_reports(next_run_at)"),
    // ============ PHASE 22 - ROLE MANAGEMENT ============
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON tenant_roles(tenant_id)"),
    // ============ PHASE 24 - API KEYS & RATE LIMITING ============
    db.prepare(`CREATE TABLE IF NOT EXISTS api_key_usage (
      id TEXT PRIMARY KEY,
      api_key_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_time_ms INTEGER NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_api_key_usage_time ON api_key_usage(created_at DESC)"),
    // ============ PHASE 25 - ADVANCED PERMISSIONS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS field_permissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      field TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      mask_type TEXT,
      condition TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, role, resource_type, field)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_field_perms_role ON field_permissions(tenant_id, role, resource_type)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS dynamic_permissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      resource_type TEXT NOT NULL,
      action TEXT NOT NULL,
      conditions TEXT NOT NULL,
      allow INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dynamic_perms_resource ON dynamic_permissions(tenant_id, resource_type, action, priority)"),
    // ============ PHASE 26 - DATA EXPORT & COMPLIANCE ============
    db.prepare(`CREATE TABLE IF NOT EXISTS data_exports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'json',
      status TEXT NOT NULL DEFAULT 'PENDING',
      categories TEXT NOT NULL,
      download_url TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_data_exports_tenant ON data_exports(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(tenant_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_data_exports_status ON data_exports(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS data_deletions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      categories TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_data_deletions_tenant ON data_deletions(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_data_deletions_status ON data_deletions(status)"),
    // ============ PHASE 27 - WEBHOOK MANAGEMENT ============
    db.prepare(`CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      headers TEXT,
      filter TEXT,
      max_retries INTEGER NOT NULL DEFAULT 5,
      timeout INTEGER NOT NULL DEFAULT 30000,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id, active)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      status_code INTEGER,
      response_body TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      next_retry_at TEXT,
      delivered_at TEXT,
      response_time_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(webhook_id) REFERENCES webhooks(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(status, next_retry_at) WHERE status IN ('PENDING', 'RETRYING')"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC)"),
    // ============ PHASE 28 - SEARCH & INDEXING ============
    db.prepare(`CREATE TABLE IF NOT EXISTS search_index (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, resource_type, resource_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_search_index_tenant ON search_index(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_search_index_resource ON search_index(tenant_id, resource_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index(title)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS search_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_search_logs_tenant ON search_logs(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_search_logs_query ON search_logs(tenant_id, query)"),
    // ============ PHASE 30 - NOTIFICATION SYSTEM ============
    db.prepare(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      template_id TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      channels TEXT NOT NULL DEFAULT '["IN_APP"]',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      variables TEXT,
      metadata TEXT,
      external_id TEXT,
      read_at TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, external_id) WHERE external_id IS NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tenant_id, user_id, read_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(tenant_id, user_id) WHERE read_at IS NULL"),
    db.prepare(`CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      external_id TEXT,
      error TEXT,
      delivered_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(notification_id) REFERENCES notifications(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_deliveries_tenant ON notification_deliveries(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel ON notification_deliveries(channel, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT,
      unsubscribe_token TEXT,
      opted_out_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, user_id, channel)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(tenant_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_preferences_channel ON notification_preferences(channel, enabled)"),
    // ============ PHASE 31 - BACKGROUND JOB QUEUE ============
    db.prepare(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      payload TEXT NOT NULL,
      result TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_retry_at TEXT,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, priority, created_at) WHERE status IN ('PENDING', 'RETRY')"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_retry ON jobs(status, next_retry_at) WHERE status = 'RETRY'"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      payload TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tenant ON scheduled_jobs(tenant_id, enabled)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at, enabled)"),
    // ============ PHASE 32 - ENTERPRISE SECURITY ============
    db.prepare(`CREATE TABLE IF NOT EXISTS sso_configurations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sso_tenant ON sso_configurations(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS ip_allowlist (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, ip_address)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ip_allowlist_tenant ON ip_allowlist(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS two_factor_auth (
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      secret TEXT,
      backup_codes TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, tenant_id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_2fa_tenant ON two_factor_auth(tenant_id, enabled)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(user_id, tenant_id, device_fingerprint)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id, tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(tenant_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS password_policies (
      tenant_id TEXT PRIMARY KEY,
      min_length INTEGER NOT NULL DEFAULT 12,
      require_uppercase INTEGER NOT NULL DEFAULT 1,
      require_numbers INTEGER NOT NULL DEFAULT 1,
      require_special_chars INTEGER NOT NULL DEFAULT 1,
      expiry_days INTEGER NOT NULL DEFAULT 90,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    // ============ PHASE 34: RATE LIMITING & THROTTLING ============
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_configs (
      tenant_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      requests_per_second INTEGER,
      requests_per_minute INTEGER,
      requests_per_hour INTEGER,
      burst_allowance INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, endpoint),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_tenant ON rate_limit_configs(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_checks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_checks_tenant ON rate_limit_checks(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_checks_user ON rate_limit_checks(tenant_id, user_id, endpoint)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_blocks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      window_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_tenant ON rate_limit_blocks(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_user ON rate_limit_blocks(tenant_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_endpoint ON rate_limit_blocks(endpoint)"),
    // ============ PHASE 35: CUSTOM FIELDS & EXTENSIBILITY ============
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_fields (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      field_type TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      unique INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      default_value TEXT,
      options TEXT,
      validation_rules TEXT,
      group_name TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, resource_type, field_name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant ON custom_fields(tenant_id, resource_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_custom_fields_active ON custom_fields(tenant_id, active)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_field_values (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(field_id) REFERENCES custom_fields(id),
      UNIQUE(tenant_id, resource_type, resource_id, field_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_custom_field_values_resource ON custom_field_values(tenant_id, resource_type, resource_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_field_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      group_name TEXT NOT NULL,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, resource_type, group_name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_custom_field_groups_tenant ON custom_field_groups(tenant_id, resource_type)"),
    // ============ PHASE 36: ADVANCED WORKFLOW AUTOMATION ============
    db.prepare(`CREATE TABLE IF NOT EXISTS advanced_workflows (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      trigger TEXT NOT NULL,
      steps TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_advanced_workflows_tenant ON advanced_workflows(tenant_id, enabled)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_advanced_workflows_created ON advanced_workflows(tenant_id, created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      trigger_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      current_step_id TEXT,
      step_results TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(workflow_id) REFERENCES advanced_workflows(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_workflow_executions_tenant ON workflow_executions(tenant_id, started_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status)"),
    // ============ PHASE 38: BULK OPERATIONS API ============
    db.prepare(`CREATE TABLE IF NOT EXISTS bulk_operations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      total_items INTEGER NOT NULL,
      processed_items INTEGER NOT NULL DEFAULT 0,
      successful_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      errors TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      estimated_time_remaining_seconds INTEGER,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_bulk_operations_tenant ON bulk_operations(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_bulk_operations_status ON bulk_operations(tenant_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS bulk_operation_results (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      resource_id TEXT,
      success INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(operation_id) REFERENCES bulk_operations(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_bulk_operation_results_operation ON bulk_operation_results(operation_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_bulk_operation_results_tenant ON bulk_operation_results(tenant_id, created_at DESC)"),
    // ============ PHASE 39: DATA RETENTION & ARCHIVAL POLICIES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS retention_policies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      retention_days INTEGER NOT NULL,
      action TEXT NOT NULL,
      archive_storage TEXT,
      anonymize_fields TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, resource_type)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant ON retention_policies(tenant_id, enabled)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS archived_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      original_data TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      expires_at TEXT,
      storage_location TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_archived_records_tenant ON archived_records(tenant_id, archived_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_archived_records_resource ON archived_records(resource_type, resource_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS retention_cleanup_log (
      tenant_id TEXT PRIMARY KEY,
      last_cleanup_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
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
  // Invite columns on auth_users
  for (const statement of [
    "ALTER TABLE auth_users ADD COLUMN invite_token TEXT",
    "ALTER TABLE auth_users ADD COLUMN invite_expires_at TEXT",
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
  // Phase 23 - Audit Logging columns
  for (const statement of [
    "ALTER TABLE audit_logs ADD COLUMN resource_name TEXT",
    "ALTER TABLE audit_logs ADD COLUMN changes TEXT",
    "ALTER TABLE audit_logs ADD COLUMN ip_address TEXT",
    "ALTER TABLE audit_logs ADD COLUMN user_agent TEXT",
    "ALTER TABLE audit_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'SUCCESS'",
    "ALTER TABLE audit_logs ADD COLUMN error_message TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
  db.prepare("CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(tenant_id, action)").run().catch(() => {});
  db.prepare("CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(tenant_id, resource_type, resource_id)").run().catch(() => {});
  // Phase 24 - API Keys columns
  for (const statement of [
    "ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE api_keys ADD COLUMN rate_limit INTEGER NOT NULL DEFAULT 100",
    "ALTER TABLE api_keys ADD COLUMN expires_at TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
  // Phase 29 - Webhook Processor columns
  try { await db.prepare("ALTER TABLE webhook_deliveries ADD COLUMN response_time_ms INTEGER").run(); } catch { /* already migrated */ }
  // Add commission_notes column for custom commission overrides/splits
  try { await db.prepare("ALTER TABLE crm_opportunities ADD COLUMN commission_notes TEXT").run(); } catch { /* already migrated */ }
  // Universal Calendar™ Phase 2 — new columns
  for (const statement of [
    "ALTER TABLE calendar_bookings ADD COLUMN opportunity_id TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN lead_score INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_bookings ADD COLUMN hold_token TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN recurrence_rule_id TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN routing_rule_id TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN revenue_context TEXT",
    "ALTER TABLE calendar_bookings ADD COLUMN no_show_reason TEXT",
    "ALTER TABLE calendar_event_types ADD COLUMN routing_rule_id TEXT",
    "ALTER TABLE calendar_event_types ADD COLUMN require_hold INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_event_types ADD COLUMN buffer_strategy TEXT NOT NULL DEFAULT 'FIXED'",
    "ALTER TABLE calendar_event_types ADD COLUMN smartslot_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_event_types ADD COLUMN booking_page_title TEXT",
    "ALTER TABLE calendar_event_types ADD COLUMN booking_page_description TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
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

/**
 * Multi-tenant helper: Extract tenant_id from Authorization header (JWT token)
 * or from query params ?tenantId=X for legacy support
 */
export function requestTenantId(request: Request): string | null {
  // Try query param first (for API calls)
  const url = new URL(request.url);
  const param = url.searchParams.get("tenantId");
  if (param) return cleanText(param, 80) || null;

  // Try header (future: extract from JWT if present)
  return null; // Will be set by auth middleware
}

/**
 * Get full tenant context for a request.
 * Used by API routes that need tenant isolation.
 */
/**
 * Get or create a default tenant for backward compatibility.
 * Single-tenant users get migrated to a "default" tenant automatically.
 */
export async function ensureUserDefaultTenant(email: string): Promise<string> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Check if user is already in a tenant
  const existing = await db.prepare(
    "SELECT DISTINCT tenant_id FROM tenant_members WHERE email = ? LIMIT 1"
  ).bind(email).first<{ tenant_id: string }>();

  if (existing) return existing.tenant_id;

  // Get the user to find their display name
  const user = await db.prepare(
    "SELECT id, display_name FROM auth_users WHERE lower(email) = ?"
  ).bind(email).first<{ id: string; display_name: string }>();

  if (!user) {
    // User doesn't exist, create them first
    const userId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO auth_users (id, email, password_hash, display_name, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'MEMBER', 1, ?, ?)`
    ).bind(userId, email, "", email.split("@")[0], now, now).run();
  }

  // Create default tenant
  const tenantId = crypto.randomUUID();
  const tenantName = `${email.split("@")[0]}'s Workspace`;
  const tenantSlug = `default-${email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  await db.prepare(
    `INSERT INTO tenants (id, name, slug, plan, seats, active, created_at, updated_at)
     VALUES (?, ?, ?, 'starter', 3, 1, ?, ?)`
  ).bind(tenantId, tenantName, tenantSlug, now, now).run();

  // Add user as OWNER
  await db.prepare(
    `INSERT INTO tenant_members (id, tenant_id, user_id, email, display_name, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'OWNER', 1, ?, ?)`
  ).bind(crypto.randomUUID(), tenantId, user?.id || crypto.randomUUID(), email, user?.display_name || email, now, now).run();

  return tenantId;
}

export async function getTenantContext(request: Request): Promise<TenantContext | null> {
  const email = await resolveRequestEmail(request);
  if (!email) return null;

  let tenantId = requestTenantId(request);

  // If no tenantId provided, use user's default tenant
  if (!tenantId) {
    tenantId = await ensureUserDefaultTenant(email);
  }

  const db = coreDb();
  const member = await db.prepare(
    `SELECT tm.id, tm.tenant_id, tm.user_id, tm.email, tm.display_name, tm.role
     FROM tenant_members tm
     WHERE tm.tenant_id = ? AND tm.email = ? AND tm.active = 1`
  ).bind(tenantId, email).first<{
    id: string; tenant_id: string; user_id: string; email: string;
    display_name: string; role: string
  }>();

  if (!member) return null;

  return {
    tenantId: member.tenant_id,
    userId: member.user_id,
    email: member.email,
    role: member.role as any
  };
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
