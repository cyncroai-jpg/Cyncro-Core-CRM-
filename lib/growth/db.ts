/**
 * Cyncro Growth Intelligence — schema.
 *
 * This is a NEW module, not a rebuild of Cyncro Core. It owns its own
 * gi_* tables (visitors, sessions, events, forms, landing pages, tracked
 * links, campaigns, identity links, agents, experiments) and only ever
 * reaches into crm_contacts/crm_opportunities through lib/growth/crmSync.ts —
 * it never redefines CRM tables and never becomes a second system of record.
 * The handful of gi_* columns added to crm_contacts below are additive
 * (original/latest source, visitor id, lead score, tags) so the CRM keeps
 * working exactly as it did before this module existed.
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";

let growthInitialized = false;

export async function ensureGrowthSchema() {
  if (growthInitialized) return;
  await ensureCoreSchema();
  const db = coreDb();
  await db.batch([
    // ============ IDENTITY: VISITORS + SESSIONS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_visitors (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_visitors_contact ON gi_visitors(contact_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_sessions (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      click_id TEXT,
      referrer TEXT,
      landing_page_url TEXT,
      device TEXT,
      started_at TEXT NOT NULL,
      last_event_at TEXT NOT NULL,
      FOREIGN KEY(visitor_id) REFERENCES gi_visitors(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_sessions_visitor ON gi_sessions(visitor_id, started_at DESC)"),
    // ============ EVENT ARCHITECTURE ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_events (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      session_id TEXT,
      contact_id TEXT,
      opportunity_id TEXT,
      event_type TEXT NOT NULL,
      event_value_cents INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      form_id TEXT,
      landing_page_id TEXT,
      link_id TEXT,
      agent_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_events_visitor ON gi_events(visitor_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_events_contact ON gi_events(contact_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_events_type ON gi_events(event_type, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_events_form ON gi_events(form_id)"),
    // ============ ADVANCED FORMS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_forms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'LEAD',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      public_token TEXT NOT NULL,
      steps_json TEXT NOT NULL DEFAULT '[]',
      style_json TEXT NOT NULL DEFAULT '{}',
      thank_you_json TEXT NOT NULL DEFAULT '{}',
      sync_config_json TEXT NOT NULL DEFAULT '{}',
      views INTEGER NOT NULL DEFAULT 0,
      starts INTEGER NOT NULL DEFAULT 0,
      submissions INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_gi_forms_token ON gi_forms(public_token)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      visitor_id TEXT,
      session_id TEXT,
      contact_id TEXT,
      opportunity_id TEXT,
      answers_json TEXT NOT NULL DEFAULT '{}',
      current_step INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'STARTED',
      ai_summary TEXT,
      lead_score INTEGER,
      qualification_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(form_id) REFERENCES gi_forms(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_form_submissions_form ON gi_form_submissions(form_id, started_at DESC)"),
    // ============ LANDING PAGES ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_landing_pages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      sections_json TEXT NOT NULL DEFAULT '[]',
      form_id TEXT,
      campaign_id TEXT,
      seo_json TEXT NOT NULL DEFAULT '{}',
      conversion_goal TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_gi_landing_pages_slug ON gi_landing_pages(slug)"),
    // ============ TRACKED LINKS + CAMPAIGNS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_tracked_links (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      campaign_id TEXT,
      source TEXT,
      medium TEXT,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_gi_links_slug ON gi_tracked_links(slug)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'OTHER',
      utm_campaign TEXT,
      spend_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    // ============ IDENTITY GRAPH ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_identity_links (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'DETERMINISTIC',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      unmerged_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_identity_visitor ON gi_identity_links(visitor_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_identity_contact ON gi_identity_links(contact_id)"),
    // ============ AI AGENTS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      allowed_actions_json TEXT NOT NULL DEFAULT '[]',
      channels_json TEXT NOT NULL DEFAULT '[]',
      business_hours_json TEXT NOT NULL DEFAULT '{}',
      escalation_json TEXT NOT NULL DEFAULT '{}',
      requires_human_approval INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_agent_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      contact_id TEXT,
      submission_id TEXT,
      input_summary TEXT,
      output TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_agent_runs_agent ON gi_agent_runs(agent_id, created_at DESC)"),
    // ============ EXPERIMENTS ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      variant_a_json TEXT NOT NULL DEFAULT '{}',
      variant_b_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      winner TEXT,
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL
    )`),
    // ============ VISUAL AUTOMATION BUILDER ============
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      nodes_json TEXT NOT NULL DEFAULT '[]',
      edges_json TEXT NOT NULL DEFAULT '[]',
      run_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      context_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'RUNNING',
      current_node_id TEXT,
      resume_at TEXT,
      trace_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_automation_runs_automation ON gi_automation_runs(automation_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_automation_runs_waiting ON gi_automation_runs(status, resume_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS gi_experiment_events (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      value_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(experiment_id) REFERENCES gi_experiments(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gi_experiment_events_exp ON gi_experiment_events(experiment_id)"),
  ]);

  // Additive columns on crm_contacts so Growth Intelligence can write
  // acquisition context onto the real CRM record without ever redefining
  // it. ADD COLUMN has no IF NOT EXISTS guard in SQLite, so this must run
  // outside the transactional batch above (see lib/core/db.ts for the
  // same pattern) or one duplicate-column failure would roll back every
  // CREATE TABLE above on every later restart.
  for (const statement of [
    "ALTER TABLE crm_contacts ADD COLUMN gi_visitor_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_crm_contacts_gi_visitor ON crm_contacts(gi_visitor_id)",
    "ALTER TABLE crm_contacts ADD COLUMN gi_original_source TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_original_medium TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_original_campaign TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_original_landing_page TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_original_form_id TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_first_touch_at TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_latest_source TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_latest_medium TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_latest_campaign TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_latest_landing_page TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_latest_session_at TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN gi_lead_score INTEGER",
    "ALTER TABLE crm_contacts ADD COLUMN gi_tags TEXT",
    "ALTER TABLE crm_opportunities ADD COLUMN gi_source TEXT",
    "ALTER TABLE crm_opportunities ADD COLUMN gi_campaign TEXT",
    "ALTER TABLE crm_opportunities ADD COLUMN gi_form_id TEXT",
  ]) {
    try { await db.prepare(statement).run(); } catch { /* already migrated */ }
  }
  growthInitialized = true;
}
