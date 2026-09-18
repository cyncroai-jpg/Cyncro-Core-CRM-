/**
 * Growth Intelligence multi-touch attribution engine.
 *
 * Operates over the real gi_events table (never a mock dataset). Groups
 * events into journeys by contact_id (falling back to visitor_id before a
 * contact exists), finds real revenue events, and redistributes credit
 * across each journey's touchpoints inside the model's lookback window.
 * This does not claim to prove causation — see `MODEL_DISCLAIMER`.
 */
import { coreDb } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export type AttributionModel = "FIRST_TOUCH" | "LAST_TOUCH" | "LINEAR" | "TIME_DECAY" | "POSITION_BASED" | "CUSTOM";

export const MODEL_DISCLAIMER =
  "Attribution models show correlation across the tracked journey, not proof of causation. Different lookback windows, identity resolution, and consent restrictions will produce different numbers than ad-platform-reported conversions.";

export interface GrowthEventRow {
  id: string;
  visitor_id: string;
  contact_id: string | null;
  event_type: string;
  event_value_cents: number;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  form_id: string | null;
  landing_page_id: string | null;
  created_at: string;
}

const REVENUE_EVENT_TYPES = new Set(["payment.completed", "revenue.recorded"]);

export async function loadEvents(sinceDays = 180): Promise<GrowthEventRow[]> {
  await ensureGrowthSchema();
  const db = coreDb();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { results } = await db
    .prepare(`SELECT id, visitor_id, contact_id, event_type, event_value_cents, source, medium, campaign, form_id, landing_page_id, created_at
      FROM gi_events WHERE created_at >= ? ORDER BY created_at ASC`)
    .bind(since)
    .all<GrowthEventRow>();
  return results || [];
}

function journeyKey(row: GrowthEventRow): string {
  return row.contact_id || row.visitor_id;
}

export interface AttributedCredit {
  source: string;
  medium: string | null;
  campaign: string | null;
  amountCents: number;
}

/** Redistributes each journey's real revenue events across its touchpoints per the selected model. */
export function attributeRevenue(events: GrowthEventRow[], model: AttributionModel, lookbackDays: number): AttributedCredit[] {
  const journeys = new Map<string, GrowthEventRow[]>();
  for (const event of events) {
    const key = journeyKey(event);
    const list = journeys.get(key) || [];
    list.push(event);
    journeys.set(key, list);
  }
  const credits: AttributedCredit[] = [];
  const credit = (touch: GrowthEventRow, amountCents: number) => {
    if (amountCents <= 0) return;
    credits.push({ source: touch.source || "direct", medium: touch.medium, campaign: touch.campaign, amountCents: Math.round(amountCents) });
  };

  for (const journey of journeys.values()) {
    const sorted = [...journey].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const conversions = sorted.filter((e) => REVENUE_EVENT_TYPES.has(e.event_type) && e.event_value_cents > 0);
    for (const conversion of conversions) {
      const conversionTime = new Date(conversion.created_at).getTime();
      const windowStart = conversionTime - lookbackDays * 86_400_000;
      const path = sorted.filter((e) => {
        const t = new Date(e.created_at).getTime();
        return t <= conversionTime && t >= windowStart && e.source;
      });
      const touchpoints = path.length ? path : [conversion];
      const value = conversion.event_value_cents;
      if (model === "FIRST_TOUCH") {
        credit(touchpoints[0], value);
      } else if (model === "LAST_TOUCH") {
        credit(touchpoints[touchpoints.length - 1], value);
      } else if (model === "POSITION_BASED" && touchpoints.length > 1) {
        credit(touchpoints[0], value * 0.4);
        credit(touchpoints[touchpoints.length - 1], value * 0.4);
        const middle = touchpoints.slice(1, -1);
        if (middle.length) for (const t of middle) credit(t, (value * 0.2) / middle.length);
        else credit(touchpoints[touchpoints.length - 1], value * 0.2);
      } else if (model === "TIME_DECAY") {
        const halfLifeMs = 7 * 86_400_000;
        const weights = touchpoints.map((t) => Math.pow(2, -(conversionTime - new Date(t.created_at).getTime()) / halfLifeMs));
        const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
        touchpoints.forEach((t, i) => credit(t, value * (weights[i] / totalWeight)));
      } else {
        touchpoints.forEach((t) => credit(t, value / touchpoints.length));
      }
    }
  }
  return credits;
}

export function rollupBySource(credits: AttributedCredit[]): Array<{ source: string; revenueCents: number; touches: number }> {
  const bySource = new Map<string, { source: string; revenueCents: number; touches: number }>();
  for (const c of credits) {
    const row = bySource.get(c.source) || { source: c.source, revenueCents: 0, touches: 0 };
    row.revenueCents += c.amountCents;
    row.touches += 1;
    bySource.set(c.source, row);
  }
  return Array.from(bySource.values()).sort((a, b) => b.revenueCents - a.revenueCents);
}

export function rollupByCampaign(credits: AttributedCredit[]): Array<{ campaign: string; revenueCents: number; touches: number }> {
  const byCampaign = new Map<string, { campaign: string; revenueCents: number; touches: number }>();
  for (const c of credits) {
    const key = c.campaign || "(no campaign)";
    const row = byCampaign.get(key) || { campaign: key, revenueCents: 0, touches: 0 };
    row.revenueCents += c.amountCents;
    row.touches += 1;
    byCampaign.set(key, row);
  }
  return Array.from(byCampaign.values()).sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Builds the ordered event timeline for one identity (contact or pre-identified visitor). */
export function buildJourney(events: GrowthEventRow[], key: string): GrowthEventRow[] {
  return events.filter((e) => journeyKey(e) === key).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
