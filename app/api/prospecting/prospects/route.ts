import {
  ensureProspectingSchema,
  getProspectingDb,
  hydrateProspect,
  nameAddressKey,
  normalizeDomain,
  normalizePhone,
  type ProspectRecord,
} from "@/lib/prospecting/db";
import { ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

const statuses = new Set([
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "FOLLOW UP",
  "INTERESTED",
  "DEMO BOOKED",
  "PROPOSAL SENT",
  "WON",
  "LOST",
]);
const editable = new Set([
  "opportunityScore",
  "rankLabel",
  "signals",
  "reasons",
  "whyCall",
  "whatFound",
  "recommendedSolution",
  "callOpener",
  "nextAction",
  "emails",
  "extractedPhones",
  "leadership",
  "sourceUrls",
  "lastExtractedAt",
  "assignedRep",
  "notes",
  "status",
  "selfReportedRevenue",
  "estimatedRevenueLow",
  "estimatedRevenueHigh",
  "revenueConfidence",
  "revenueMethodology",
  "aiSummary",
  "painPoints",
  "aiConfidence",
]);

function revenueEstimate(category: string, reviewCount: number) {
  const value = category.toLowerCase();
  let base = 500_000;
  if (/dealership|manufactur|hotel/.test(value)) base = 5_000_000;
  else if (/law|medical|dent|hvac|contract|real estate/.test(value)) base = 1_200_000;
  else if (/restaurant|gym|salon|spa|beauty/.test(value)) base = 650_000;
  const demand = Math.min(4, 1 + Math.log10(Math.max(1, reviewCount)) * 0.7);
  const midpoint = Math.round(base * demand);
  return { low: Math.round(midpoint * .55), high: Math.round(midpoint * 1.65), confidence: reviewCount >= 250 ? "MEDIUM" : "LOW", methodology: "Directional estimate from industry benchmark band and observable review demand; not verified financial data." };
}

function clean(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema(); if (!(await hasModuleAccess(request, "prospecting"))) return Response.json({ error: "Prospecting access is required." }, { status: 403 });
    await ensureProspectingSchema();
    const { results } = await getProspectingDb()
      .prepare(
        "SELECT * FROM prospects ORDER BY COALESCE(opportunity_score, -1) DESC, created_at DESC LIMIT 500",
      )
      .all<ProspectRecord>();
    return Response.json({ prospects: results.map(hydrateProspect) });
  } catch (error) {
    console.error("prospects.list.failed", error);
    return Response.json(
      { error: "Unable to load prospects." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema(); if (!(await hasModuleAccess(request, "prospecting"))) return Response.json({ error: "Prospecting access is required." }, { status: 403 });
    await ensureProspectingSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const businessName = clean(body.businessName, 160);
    const address = clean(body.address, 240);
    if (!businessName || !address)
      return Response.json(
        { error: "Business name and address are required." },
        { status: 400 },
      );
    const website = clean(body.website, 500);
    const domain = normalizeDomain(website);
    const phone = clean(body.phone, 40);
    const normalizedPhone = normalizePhone(phone);
    const googlePlaceId = clean(body.googlePlaceId, 160);
    const duplicateChecks: string[] = ["name_address_key = ?"];
    const duplicateValues: unknown[] = [nameAddressKey(businessName, address)];
    if (domain) {
      duplicateChecks.push("domain = ?");
      duplicateValues.push(domain);
    }
    if (normalizedPhone) {
      duplicateChecks.push("normalized_phone = ?");
      duplicateValues.push(normalizedPhone);
    }
    if (googlePlaceId) {
      duplicateChecks.push("google_place_id = ?");
      duplicateValues.push(googlePlaceId);
    }
    const existing = await getProspectingDb()
      .prepare(
        `SELECT * FROM prospects WHERE ${duplicateChecks.join(" OR ")} LIMIT 1`,
      )
      .bind(...duplicateValues)
      .first<ProspectRecord>();
    if (existing)
      return Response.json({
        prospect: hydrateProspect(existing),
        duplicate: true,
      });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const estimate = revenueEstimate(clean(body.category, 120) || "Business", Math.max(Number(body.reviewCount) || 0, 0));
    await getProspectingDb()
      .prepare(
        `INSERT INTO prospects (
      id, google_place_id, business_name, category, address, phone, normalized_phone,
      website, domain, rating_x10, review_count, name_address_key, estimated_revenue_low_cents,
      estimated_revenue_high_cents, revenue_confidence, revenue_methodology, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)`,
      )
      .bind(
        id,
        googlePlaceId,
        businessName,
        clean(body.category, 120) || "Business",
        address,
        phone,
        normalizedPhone,
        website,
        domain,
        typeof body.rating === "number" ? Math.round(body.rating * 10) : null,
        Math.max(Number(body.reviewCount) || 0, 0),
        nameAddressKey(businessName, address),
        estimate.low * 100,
        estimate.high * 100,
        estimate.confidence,
        estimate.methodology,
        now,
        now,
      )
      .run();
    const prospect = await getProspectingDb()
      .prepare("SELECT * FROM prospects WHERE id = ?")
      .bind(id)
      .first<ProspectRecord>();
    return Response.json(
      { prospect: prospect && hydrateProspect(prospect), duplicate: false },
      { status: 201 },
    );
  } catch (error) {
    console.error("prospect.create.failed", error);
    return Response.json(
      { error: "Unable to save prospect." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema(); if (!(await hasModuleAccess(request, "prospecting"))) return Response.json({ error: "Prospecting access is required." }, { status: 403 });
    await ensureProspectingSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const id = clean(body.id, 80);
    if (!id)
      return Response.json(
        { error: "Prospect id is required." },
        { status: 400 },
      );
    const updates =
      body.updates && typeof body.updates === "object"
        ? (body.updates as Record<string, unknown>)
        : {};
    const sets: string[] = [];
    const values: unknown[] = [];
    const columns: Record<string, string> = {
      opportunityScore: "opportunity_score",
      rankLabel: "rank_label",
      signals: "signals_json",
      reasons: "reasons_json",
      whyCall: "why_call",
      whatFound: "what_found",
      recommendedSolution: "recommended_solution",
      callOpener: "call_opener",
      nextAction: "next_action",
      emails: "emails_json",
      extractedPhones: "phones_json",
      leadership: "leadership_json",
      sourceUrls: "source_urls_json",
      lastExtractedAt: "last_extracted_at",
      assignedRep: "assigned_rep",
      notes: "notes",
      status: "status",
      selfReportedRevenue: "self_reported_revenue_cents",
      estimatedRevenueLow: "estimated_revenue_low_cents",
      estimatedRevenueHigh: "estimated_revenue_high_cents",
      revenueConfidence: "revenue_confidence",
      revenueMethodology: "revenue_methodology",
      aiSummary: "ai_summary",
      painPoints: "pain_points_json",
      aiConfidence: "ai_confidence",
    };
    for (const [key, value] of Object.entries(updates)) {
      if (!editable.has(key)) continue;
      if (key === "status" && !statuses.has(String(value))) continue;
      sets.push(`${columns[key]} = ?`);
      values.push(["signals", "reasons", "emails", "extractedPhones", "leadership", "sourceUrls", "painPoints"].includes(key) ? JSON.stringify(value) : ["selfReportedRevenue","estimatedRevenueLow","estimatedRevenueHigh"].includes(key) ? Math.max(0,Math.round(Number(value||0)*100)) : value);
    }
    if ("opportunityScore" in updates) {
      sets.push("analyzed_at = ?");
      values.push(new Date().toISOString());
    }
    if (!sets.length)
      return Response.json(
        { error: "No valid updates supplied." },
        { status: 400 },
      );
    sets.push("updated_at = ?");
    values.push(new Date().toISOString(), id);
    await getProspectingDb()
      .prepare(`UPDATE prospects SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
    const row = await getProspectingDb()
      .prepare("SELECT * FROM prospects WHERE id = ?")
      .bind(id)
      .first<ProspectRecord>();
    if (!row)
      return Response.json({ error: "Prospect not found." }, { status: 404 });
    return Response.json({ prospect: hydrateProspect(row) });
  } catch (error) {
    console.error("prospect.update.failed", error);
    return Response.json(
      { error: "Unable to update prospect." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try { await ensureCoreSchema(); if (!(await hasModuleAccess(request, "prospecting"))) return Response.json({ error: "Prospecting access is required." }, { status: 403 }); await ensureProspectingSchema(); const id = clean(new URL(request.url).searchParams.get("id"), 80); if (!id) return Response.json({ error: "Prospect id is required." }, { status: 400 }); await getProspectingDb().prepare("DELETE FROM prospects WHERE id=?").bind(id).run(); return Response.json({ deleted: true }); }
  catch (error) { console.error("prospect.delete.failed", error); return Response.json({ error: "Unable to delete prospect." }, { status: 500 }); }
}
