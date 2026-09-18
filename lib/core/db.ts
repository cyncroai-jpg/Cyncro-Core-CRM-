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
    // Advanced Reporting (Phase 21). Named legacy_reporting_dashboards (not dashboards) —
    // a later phase (reporting.ts / app/api/reporting/route.ts) defines its own
    // "dashboards" table with a different shape (owner, is_public); a second
    // CREATE TABLE IF NOT EXISTS "dashboards" would silently no-op and this table's
    // columns (widgets, is_default, created_by) would never actually exist. Nothing
    // currently queries this table by name, so it's kept for compatibility only.
    db.prepare(`CREATE TABLE IF NOT EXISTS legacy_reporting_dashboards (
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_legacy_reporting_dashboards_tenant ON legacy_reporting_dashboards(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_legacy_reporting_dashboards_default ON legacy_reporting_dashboards(tenant_id, is_default)"),
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
      UNIQUE(tenant_id, external_id)
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
      "unique" INTEGER NOT NULL DEFAULT 0,
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
    // ============ PHASE 40: REAL-TIME WEBSOCKET SUPPORT ============
    db.prepare(`CREATE TABLE IF NOT EXISTS user_presence (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      current_resource TEXT,
      last_seen_at TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, user_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_user_presence_tenant ON user_presence(tenant_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS resource_locks (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      locked_by TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      UNIQUE(resource_type, resource_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resource_locks_expires ON resource_locks(expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS realtime_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      subscription_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_user ON realtime_subscriptions(tenant_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_resource ON realtime_subscriptions(resource_type, resource_id)"),
    // ============ PHASE 42: ADVANCED REPORTING & BUSINESS INTELLIGENCE ============
    db.prepare(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'CUSTOM',
      filters TEXT,
      columns TEXT,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      owner TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS report_executions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      executed_by TEXT,
      data TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error TEXT,
      executed_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_report_executions_report ON report_executions(report_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS dashboard_widgets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      dashboard_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'METRIC_CARD',
      report_id TEXT,
      metric TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 2,
      height INTEGER NOT NULL DEFAULT 3,
      config TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(dashboard_id) REFERENCES dashboards(id),
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_report ON dashboard_widgets(report_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS kpis (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value REAL NOT NULL DEFAULT 0,
      current_value REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      trend TEXT,
      trend_percentage REAL,
      alert_threshold REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, metric)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_kpis_tenant ON kpis(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_kpis_metric ON kpis(metric)"),
    // ============ PHASE 43: MULTI-CURRENCY SUPPORT & LOCALIZATION ============
    db.prepare(`CREATE TABLE IF NOT EXISTS currency_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      supported_currencies TEXT NOT NULL DEFAULT '[]',
      auto_convert INTEGER NOT NULL DEFAULT 1,
      rate_update_frequency TEXT NOT NULL DEFAULT 'DAILY',
      last_updated TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_currency_config_tenant ON currency_config(tenant_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      timestamp TEXT NOT NULL,
      source TEXT,
      UNIQUE(from_currency, to_currency, timestamp)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_exchange_rates_timestamp ON exchange_rates(timestamp DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS currency_conversions_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      original_amount REAL NOT NULL,
      original_currency TEXT NOT NULL,
      converted_amount REAL NOT NULL,
      converted_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversions_log_tenant ON currency_conversions_log(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversions_log_entity ON currency_conversions_log(entity_type, entity_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversions_log_timestamp ON currency_conversions_log(created_at DESC)"),
    // ============ PHASE 44: DOCUMENT MANAGEMENT & FILE STORAGE ============
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'DOCUMENT',
      storage_provider TEXT NOT NULL DEFAULT 'LOCAL',
      storage_path TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      entity_type TEXT,
      entity_id TEXT,
      uploaded_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      version INTEGER NOT NULL DEFAULT 1,
      checksum TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents(uploaded_by)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      change_notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(document_id) REFERENCES documents(id),
      UNIQUE(document_id, version)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_versions_uploaded ON document_versions(uploaded_by)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_sharing (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      shared_with TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'VIEW',
      shared_by TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(document_id) REFERENCES documents(id),
      UNIQUE(document_id, shared_with)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_sharing_document ON document_sharing(document_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_sharing_user ON document_sharing(shared_with)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_sharing_expires ON document_sharing(expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'DOCUMENT',
      storage_path TEXT NOT NULL,
      variables TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_templates_tenant ON document_templates(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category)"),
    // ============ PHASE 45: EMAIL TEMPLATES & CAMPAIGNS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'MARKETING',
      subject TEXT NOT NULL,
      preview_text TEXT,
      html_content TEXT NOT NULL,
      plain_text_content TEXT,
      variables TEXT,
      tags TEXT,
      category TEXT,
      created_by TEXT NOT NULL,
      last_modified_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      description TEXT,
      from_email TEXT NOT NULL,
      from_name TEXT,
      reply_to TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      bounce_count INTEGER NOT NULL DEFAULT 0,
      unsubscribe_count INTEGER NOT NULL DEFAULT 0,
      open_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      test_variant TEXT,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(template_id) REFERENCES email_templates(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON email_campaigns(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_campaigns_created ON email_campaigns(created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      variables TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      sent_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      bounce_type TEXT,
      failure_reason TEXT,
      FOREIGN KEY(campaign_id) REFERENCES email_campaigns(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_tracking (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      tracking_type TEXT NOT NULL,
      clicked_url TEXT,
      timestamp TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY(campaign_id) REFERENCES email_campaigns(id),
      FOREIGN KEY(recipient_id) REFERENCES campaign_recipients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_tracking_campaign ON email_tracking(campaign_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_tracking_recipient ON email_tracking(recipient_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_tracking_type ON email_tracking(tracking_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_tracking_timestamp ON email_tracking(timestamp DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_unsubscribes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      reason TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_tenant ON email_unsubscribes(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email ON email_unsubscribes(email)"),
    // ============ PHASE 46: LEAD SCORING & AI-POWERED INSIGHTS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS lead_scores (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'C',
      conversion_probability REAL NOT NULL DEFAULT 0.0,
      engagement_score INTEGER NOT NULL DEFAULT 0,
      firmographic_score INTEGER NOT NULL DEFAULT 0,
      behavioral_score INTEGER NOT NULL DEFAULT 0,
      risk_score INTEGER NOT NULL DEFAULT 0,
      factors TEXT NOT NULL DEFAULT '{}',
      last_recalculated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      UNIQUE(tenant_id, contact_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_scores_tenant ON lead_scores(tenant_id, score DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_scores_contact ON lead_scores(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_scores_grade ON lead_scores(grade)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_scores_risk ON lead_scores(risk_score DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS engagement_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      email_opens INTEGER NOT NULL DEFAULT 0,
      email_clicks INTEGER NOT NULL DEFAULT 0,
      website_visits INTEGER NOT NULL DEFAULT 0,
      page_views INTEGER NOT NULL DEFAULT 0,
      form_submissions INTEGER NOT NULL DEFAULT 0,
      calls_received INTEGER NOT NULL DEFAULT 0,
      meetings_scheduled INTEGER NOT NULL DEFAULT 0,
      document_downloads INTEGER NOT NULL DEFAULT 0,
      time_since_last_engagement INTEGER NOT NULL DEFAULT 0,
      last_activity_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      UNIQUE(tenant_id, contact_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_engagement_tenant ON engagement_metrics(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_engagement_contact ON engagement_metrics(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_engagement_activity ON engagement_metrics(last_activity_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS firmographic_data (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      account_id TEXT,
      company_size TEXT,
      industry TEXT,
      revenue_range TEXT,
      company_age INTEGER,
      geographic_location TEXT,
      technology_stack TEXT,
      budget_alignment TEXT,
      solution_fit_score INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      FOREIGN KEY(account_id) REFERENCES crm_accounts(id),
      UNIQUE(tenant_id, contact_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_firmographic_tenant ON firmographic_data(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_firmographic_contact ON firmographic_data(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_firmographic_industry ON firmographic_data(industry)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_firmographic_company_size ON firmographic_data(company_size)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_recommendations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      recommendation_type TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      action_description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      next_best_action TEXT,
      estimated_impact TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      actioned_at TEXT,
      action_feedback TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recommendations_tenant ON ai_recommendations(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recommendations_contact ON ai_recommendations(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recommendations_type ON ai_recommendations(recommendation_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON ai_recommendations(priority)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS lead_insights (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      suggested_actions TEXT NOT NULL DEFAULT '[]',
      insight_data TEXT NOT NULL DEFAULT '{}',
      read_at TEXT,
      dismissed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_insights_tenant ON lead_insights(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_insights_contact ON lead_insights(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_insights_type ON lead_insights(insight_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_insights_confidence ON lead_insights(confidence_score DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversion_predictions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      predicted_close_date TEXT,
      predicted_probability REAL NOT NULL,
      contributing_factors TEXT NOT NULL DEFAULT '{}',
      time_to_close_days INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      UNIQUE(tenant_id, contact_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversion_tenant ON conversion_predictions(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversion_contact ON conversion_predictions(contact_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_conversion_probability ON conversion_predictions(predicted_probability DESC)"),
    // ============ PHASE 47: CREDIT REPAIR & DISPUTE MANAGEMENT ============
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_repair_clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT,
      email TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      ssn TEXT,
      phone_number TEXT,
      address TEXT,
      access_level TEXT NOT NULL DEFAULT 'FREE',
      onboarding_status TEXT NOT NULL DEFAULT 'PENDING',
      credit_score_current INTEGER,
      credit_score_goal INTEGER,
      credit_score_starting INTEGER,
      disputes_remaining INTEGER NOT NULL DEFAULT 1,
      monthly_dispute_limit INTEGER NOT NULL DEFAULT 1,
      subscription_status TEXT NOT NULL DEFAULT 'TRIAL',
      subscription_start_date TEXT,
      subscription_end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(contact_id) REFERENCES crm_contacts(id),
      UNIQUE(tenant_id, email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_clients_tenant ON credit_repair_clients(tenant_id, access_level)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_clients_email ON credit_repair_clients(email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_clients_onboarding ON credit_repair_clients(onboarding_status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      credit_bureau TEXT NOT NULL DEFAULT 'EQUIFAX',
      reason TEXT NOT NULL DEFAULT 'OTHER',
      description TEXT NOT NULL,
      account_info TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      submitted_date TEXT,
      investigation_start_date TEXT,
      expected_resolution_date TEXT,
      actual_resolution_date TEXT,
      resolution TEXT,
      documents TEXT DEFAULT '[]',
      certificate_of_dispute TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disputes_tenant ON disputes(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disputes_client ON disputes(client_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disputes_bureau ON disputes(credit_bureau)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disputes_reason ON disputes(reason)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disputes_submitted ON disputes(submitted_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS dispute_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'OTHER',
      template_content TEXT NOT NULL,
      credit_bureau TEXT NOT NULL DEFAULT 'ALL',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_tenant ON dispute_templates(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_reason ON dispute_templates(reason)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_bureau ON dispute_templates(credit_bureau)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_score_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      equifax_score INTEGER,
      experian_score INTEGER,
      transunion_score INTEGER,
      average_score INTEGER NOT NULL,
      recorded_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      document_proof TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_scores_tenant ON credit_score_records(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_scores_client ON credit_score_records(client_id, recorded_date DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_credit_scores_average ON credit_score_records(average_score DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_method TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      unlocked_features TEXT DEFAULT '[]',
      recipient_email TEXT,
      invoice_url TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id),
      UNIQUE(tenant_id, transaction_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payment_records(tenant_id, paid_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_client ON payment_records(client_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_type ON payment_records(payment_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_records(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_steps (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      step_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      data TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON onboarding_steps(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_steps(client_id, step_number)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_steps(status)"),
    // ============ PHASE 48: FCRA COMPLIANCE & DISPUTE LETTERS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS dispute_letters (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      letter_type TEXT NOT NULL,
      credit_bureau TEXT NOT NULL,
      dispute_reason TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      reported_amount INTEGER,
      reported_status TEXT,
      narrative TEXT,
      legal_references TEXT DEFAULT '[]',
      letter_content TEXT NOT NULL,
      generated_date TEXT NOT NULL,
      sent_date TEXT,
      response_date TEXT,
      response_status TEXT,
      response_content TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_letters_tenant ON dispute_letters(tenant_id, generated_date DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_letters_client ON dispute_letters(client_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_letters_type ON dispute_letters(letter_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_letters_bureau ON dispute_letters(credit_bureau)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_letters_sent ON dispute_letters(sent_date)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS compliance_checklists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      checklist_type TEXT NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      overall_compliance INTEGER NOT NULL DEFAULT 0,
      completion_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(client_id) REFERENCES credit_repair_clients(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checklists_tenant ON compliance_checklists(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checklists_client ON compliance_checklists(client_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checklists_type ON compliance_checklists(checklist_type)"),
    // ============ PHASE 49: LENDING PLATFORM ============
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      min_amount INTEGER NOT NULL,
      max_amount INTEGER NOT NULL,
      min_term INTEGER NOT NULL,
      max_term INTEGER NOT NULL,
      base_interest_rate REAL NOT NULL,
      description TEXT,
      features TEXT DEFAULT '[]',
      min_credit_score INTEGER NOT NULL,
      min_income INTEGER NOT NULL,
      max_dti REAL NOT NULL,
      residency_required INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_products_tenant ON loan_products(tenant_id, active)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_products_type ON loan_products(type)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_applications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      applicant_email TEXT NOT NULL,
      applicant_phone TEXT,
      product_id TEXT NOT NULL,
      requested_amount INTEGER NOT NULL,
      requested_term INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'STARTED',
      submitted_at TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      decision TEXT,
      decision_notes TEXT,
      credit_score INTEGER,
      estimated_apr REAL,
      monthly_payment REAL,
      documents TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(product_id) REFERENCES loan_products(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_applications_tenant ON loan_applications(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_applications_email ON loan_applications(applicant_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_applications_submitted ON loan_applications(submitted_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_offers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      loan_amount INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      term INTEGER NOT NULL,
      monthly_payment REAL NOT NULL,
      total_interest REAL NOT NULL,
      total_payment REAL NOT NULL,
      fees TEXT DEFAULT '{}',
      terms TEXT,
      valid_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      accepted_at TEXT,
      declined_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(application_id) REFERENCES loan_applications(id),
      FOREIGN KEY(product_id) REFERENCES loan_products(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_offers_tenant ON loan_offers(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_offers_application ON loan_offers(application_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_offers_valid ON loan_offers(valid_until)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      borrower_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      loan_amount INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      term INTEGER NOT NULL,
      monthly_payment REAL NOT NULL,
      total_interest REAL NOT NULL,
      origination_date TEXT NOT NULL,
      funded_date TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_balance INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      days_delinquent INTEGER NOT NULL DEFAULT 0,
      last_payment_date TEXT,
      next_payment_due_date TEXT,
      documents TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(application_id) REFERENCES loan_applications(id),
      FOREIGN KEY(offer_id) REFERENCES loan_offers(id),
      FOREIGN KEY(product_id) REFERENCES loan_products(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loans(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_loans_delinquent ON loans(days_delinquent DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      due_date TEXT,
      principal_amount INTEGER NOT NULL,
      interest_amount INTEGER NOT NULL,
      fee_amount INTEGER,
      payment_method TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(loan_id) REFERENCES loans(id),
      UNIQUE(tenant_id, transaction_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_tenant ON loan_payments(tenant_id, payment_date DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_loan ON loan_payments(loan_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_status ON loan_payments(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      credit_score INTEGER NOT NULL,
      credit_score_tier TEXT NOT NULL,
      debt_to_income_ratio REAL NOT NULL,
      employment_history TEXT,
      collateral TEXT,
      risk_score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      factors TEXT DEFAULT '{}',
      recommendations TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(application_id) REFERENCES loan_applications(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assessments_tenant ON risk_assessments(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assessments_application ON risk_assessments(application_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assessments_risk ON risk_assessments(risk_level)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS disclosures (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      disclosure_type TEXT NOT NULL,
      content TEXT NOT NULL,
      acknowledged_date TEXT,
      acknowledged_by TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(loan_id) REFERENCES loans(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disclosures_tenant ON disclosures(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disclosures_loan ON disclosures(loan_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_disclosures_type ON disclosures(disclosure_type)"),
    // ============ PHASE 50: ADVANCED LENDING & CREDIT REPAIR ANALYTICS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS portfolio_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      total_loans_active INTEGER NOT NULL DEFAULT 0,
      total_loans_paid_off INTEGER NOT NULL DEFAULT 0,
      total_loans_defaulted INTEGER NOT NULL DEFAULT 0,
      total_originated INTEGER NOT NULL DEFAULT 0,
      default_rate REAL NOT NULL DEFAULT 0,
      portfolio_yield REAL NOT NULL DEFAULT 0,
      average_loan_amount REAL NOT NULL DEFAULT 0,
      average_interest_rate REAL NOT NULL DEFAULT 0,
      total_interest_collected INTEGER NOT NULL DEFAULT 0,
      total_revenue INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, metric_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_portfolio_tenant ON portfolio_metrics(tenant_id, metric_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_date TEXT NOT NULL,
      total_customers INTEGER NOT NULL DEFAULT 0,
      active_customers INTEGER NOT NULL DEFAULT 0,
      new_customers INTEGER NOT NULL DEFAULT 0,
      churn_rate REAL NOT NULL DEFAULT 0,
      customer_lifetime_value REAL NOT NULL DEFAULT 0,
      average_customer_value REAL NOT NULL DEFAULT 0,
      retention_rate REAL NOT NULL DEFAULT 0,
      nps_score REAL,
      satisfaction_score REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, customer_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_customer_tenant ON customer_metrics(tenant_id, customer_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_repair_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      total_disputes_filed INTEGER NOT NULL DEFAULT 0,
      disputes_resolved INTEGER NOT NULL DEFAULT 0,
      disputes_successful INTEGER NOT NULL DEFAULT 0,
      dispute_success_rate REAL NOT NULL DEFAULT 0,
      average_resolution_days REAL NOT NULL DEFAULT 0,
      average_credit_score_improvement INTEGER NOT NULL DEFAULT 0,
      total_clients_active INTEGER NOT NULL DEFAULT 0,
      revenue_from_disputes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, metric_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_repair_tenant ON credit_repair_metrics(tenant_id, metric_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS revenue_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      revenue_date TEXT NOT NULL,
      origination_fees INTEGER NOT NULL DEFAULT 0,
      interest_revenue INTEGER NOT NULL DEFAULT 0,
      late_fees INTEGER NOT NULL DEFAULT 0,
      prepayment_penalties INTEGER NOT NULL DEFAULT 0,
      subscription_revenue INTEGER NOT NULL DEFAULT 0,
      total_revenue INTEGER NOT NULL DEFAULT 0,
      cost_of_funds INTEGER NOT NULL DEFAULT 0,
      operating_expenses INTEGER NOT NULL DEFAULT 0,
      net_revenue INTEGER NOT NULL DEFAULT 0,
      profit_margin REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, revenue_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_revenue_tenant ON revenue_metrics(tenant_id, revenue_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS risk_analytics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      analytics_date TEXT NOT NULL,
      portfolio_risk_score INTEGER NOT NULL DEFAULT 50,
      delinquent_30days_count INTEGER NOT NULL DEFAULT 0,
      delinquent_60days_count INTEGER NOT NULL DEFAULT 0,
      delinquent_90plus_count INTEGER NOT NULL DEFAULT 0,
      delinquency_rate REAL NOT NULL DEFAULT 0,
      predictive_default_rate REAL NOT NULL DEFAULT 0,
      reserve_requirement INTEGER NOT NULL DEFAULT 0,
      concentration_risk_score INTEGER NOT NULL DEFAULT 0,
      interest_rate_risk_score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, analytics_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_risk_tenant ON risk_analytics(tenant_id, analytics_date DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS analytics_dashboards (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      dashboard_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      configuration TEXT NOT NULL DEFAULT '{}',
      filters TEXT DEFAULT '{}',
      refresh_interval_minutes INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON analytics_dashboards(tenant_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_type ON analytics_dashboards(dashboard_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON analytics_dashboards(owner_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS analytics_alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      threshold_value REAL NOT NULL,
      comparison_operator TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      notify_via TEXT NOT NULL DEFAULT '[]',
      last_triggered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON analytics_alerts(tenant_id, is_active)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_alerts_metric ON analytics_alerts(metric_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON analytics_alerts(last_triggered_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      export_type TEXT NOT NULL,
      filters TEXT DEFAULT '{}',
      format TEXT NOT NULL DEFAULT 'CSV',
      status TEXT NOT NULL DEFAULT 'PENDING',
      file_path TEXT,
      file_size INTEGER,
      total_records INTEGER NOT NULL DEFAULT 0,
      processed_records INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      requested_by TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_exports_tenant ON export_jobs(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_exports_status ON export_jobs(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_exports_expires ON export_jobs(expires_at)"),
    // ============ PHASE 51: PAYMENT GATEWAY INTEGRATION ============
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      method_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      token_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      card_last_four TEXT,
      card_brand TEXT,
      card_expiry TEXT,
      bank_account_last_four TEXT,
      bank_routing_number TEXT,
      wallet_email TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, token_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_methods_tenant ON payment_methods(tenant_id, is_default)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_methods_customer ON payment_methods(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_methods_active ON payment_methods(is_active)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      loan_id TEXT,
      customer_id TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_transaction_id TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      processing_fee_cents INTEGER NOT NULL DEFAULT 0,
      net_amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'PENDING',
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id),
      UNIQUE(tenant_id, provider_transaction_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_loan ON transactions(loan_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      loan_id TEXT,
      invoice_number TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_amount_cents INTEGER NOT NULL DEFAULT 0,
      paid_with_transaction_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      description TEXT,
      due_date TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, invoice_number)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
      amount_cents INTEGER NOT NULL,
      trial_days INTEGER NOT NULL DEFAULT 0,
      features TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_plans_tenant ON subscription_plans(tenant_id, is_active)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      next_billing_date TEXT NOT NULL,
      trial_end_date TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(plan_id) REFERENCES subscription_plans(id),
      FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subs_billing ON subscriptions(next_billing_date)"),
    // Named payment_disputes (not disputes) — "disputes" is already used by the
    // credit-repair module (client_id, credit_bureau, reason) for a different entity;
    // a second CREATE TABLE IF NOT EXISTS with that name would silently no-op and this
    // table's columns (customer_id, response_deadline, ...) would never actually exist.
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_disputes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_dispute_id TEXT NOT NULL,
      dispute_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      reason TEXT,
      evidence TEXT DEFAULT '[]',
      submitted_at TEXT,
      response_deadline TEXT,
      resolved_at TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(transaction_id) REFERENCES transactions(id),
      UNIQUE(tenant_id, provider_dispute_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_disputes_tenant ON payment_disputes(tenant_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_disputes_customer ON payment_disputes(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_disputes_deadline ON payment_disputes(response_deadline)"),
    // ============ TEAM CHAT ============
    db.prepare(`CREATE TABLE IF NOT EXISTS team_chat_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'PUBLIC',
      description TEXT,
      created_by TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON team_chat_channels(type, archived)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS team_chat_channel_members (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      member_email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      joined_at TEXT NOT NULL,
      FOREIGN KEY(channel_id) REFERENCES team_chat_channels(id)
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_channel_members_unique ON team_chat_channel_members(channel_id, member_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_channel_members_email ON team_chat_channel_members(member_email)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS team_chat_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      thread_parent_id TEXT,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      crm_link_type TEXT,
      crm_link_id TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(channel_id) REFERENCES team_chat_channels(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_time ON team_chat_messages(channel_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON team_chat_messages(thread_parent_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_author ON team_chat_messages(author_email, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS team_chat_reads (
      channel_id TEXT NOT NULL,
      member_email TEXT NOT NULL,
      last_read_at TEXT NOT NULL,
      PRIMARY KEY(channel_id, member_email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_reads_email ON team_chat_reads(member_email)"),
    // ============ CRM FORMS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_forms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      public_token TEXT NOT NULL,
      fields_json TEXT NOT NULL DEFAULT '[]',
      requires_signature INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_forms_token ON crm_forms(public_token)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      contact_id TEXT,
      respondent_name TEXT NOT NULL,
      respondent_email TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      signature_name TEXT,
      consent_text TEXT,
      signer_ip TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      submitted_at TEXT NOT NULL,
      FOREIGN KEY(form_id) REFERENCES crm_forms(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form ON crm_form_submissions(form_id, submitted_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_form_files (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      question_id TEXT,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      object_key TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(submission_id) REFERENCES crm_form_submissions(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_crm_form_files_submission ON crm_form_files(submission_id)"),
    // ============ COMMISSION RULES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_commission_rules (
      id TEXT PRIMARY KEY,
      service_name TEXT NOT NULL,
      applies_to TEXT NOT NULL,
      percentage_bps INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_rules_sort ON crm_commission_rules(sort_order)"),
    // ============ CALENDAR EXTERNAL SYNC ============
    db.prepare(`CREATE TABLE IF NOT EXISTS calendar_external_events (
      booking_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
  ]);
  // Migration: add tenant_id columns to tables that predate multi-tenancy, then their
  // indexes. Run sequentially with try/catch (not inside the batch above) because
  // ADD COLUMN has no IF NOT EXISTS guard in SQLite — once a column exists, re-running
  // it throws "duplicate column", and since db.batch() is transactional, that failure
  // would silently roll back every CREATE TABLE in the batch on every later restart.
  for (const statement of [
    "ALTER TABLE auth_users ADD COLUMN default_tenant_id TEXT",
    "ALTER TABLE crm_accounts ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS crm_accounts_tenant_idx ON crm_accounts(tenant_id)",
    "ALTER TABLE crm_contacts ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS crm_contacts_tenant_idx ON crm_contacts(tenant_id)",
    "ALTER TABLE crm_opportunities ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS crm_opportunities_tenant_idx ON crm_opportunities(tenant_id)",
    "ALTER TABLE crm_activities ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS crm_activities_tenant_idx ON crm_activities(tenant_id)",
    "ALTER TABLE calendar_event_types ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS calendar_event_types_tenant_idx ON calendar_event_types(tenant_id)",
    "ALTER TABLE calendar_bookings ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS calendar_bookings_tenant_idx ON calendar_bookings(tenant_id)",
    "ALTER TABLE calendar_availability ADD COLUMN tenant_id TEXT",
    "ALTER TABLE calendar_feeds ADD COLUMN tenant_id TEXT",
    "ALTER TABLE calendar_webhook_endpoints ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON calendar_webhook_endpoints(tenant_id)",
    "ALTER TABLE calendar_webhook_deliveries ADD COLUMN tenant_id TEXT",
    "ALTER TABLE calendar_ab_experiments ADD COLUMN tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_ab_experiments_tenant ON calendar_ab_experiments(tenant_id)",
    "ALTER TABLE calendar_ab_events ADD COLUMN tenant_id TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
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
