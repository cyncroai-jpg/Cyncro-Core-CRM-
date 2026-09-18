/**
 * Cyncro Automotive — public digital retailing storefront API.
 *
 * Unauthenticated. A dealer is identified by their tenant slug (the same
 * unique slug every tenant already has), so each dealer gets their own
 * shareable link: /store?dealer=<slug>. Only publicly-safe inventory
 * fields are ever returned — never acquisition cost, internal notes, etc.
 *
 * GET  /api/store?dealer=X — dealer name + available inventory
 * GET  /api/store?dealer=X&vehicleId=Y — one vehicle's public detail
 * POST /api/store?dealer=X  { action: "estimate", vehicleId, downPayment, termMonths } — payment estimate
 * POST /api/store?dealer=X  { action: "submit-lead", vehicleId, firstName, lastName, email, phone, downPayment, termMonths } — real lead -> real deal
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

function monthlyPayment(principalCents: number, annualRatePct: number, termMonths: number): number {
  if (principalCents <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principalCents / termMonths);
  const factor = Math.pow(1 + r, termMonths);
  return Math.round((principalCents * r * factor) / (factor - 1));
}

// A representative "estimated" APR shown to shoppers before they're actually
// underwritten — real rate comes from the lender matrix once a deal desk
// works the application. Never presented as a guaranteed rate.
const ESTIMATED_APR = 7.49;

async function dealerByslug(slug: string) {
  return coreDb().prepare("SELECT id, name, slug FROM tenants WHERE slug=? AND active=1").bind(slug).first<{ id: string; name: string; slug: string }>();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get("dealer"), 100);
    if (!slug) return Response.json({ error: "dealer is required." }, { status: 400 });
    const dealer = await dealerByslug(slug);
    if (!dealer) return Response.json({ error: "Dealer not found." }, { status: 404 });
    const db = coreDb();
    const vehicleId = url.searchParams.get("vehicleId");

    if (vehicleId) {
      const vehicle = await db.prepare(`SELECT id, stock_number, year, make, model, trim, mileage, asking_price_cents
        FROM auto_inventory WHERE tenant_id=? AND id=? AND status='AVAILABLE'`).bind(dealer.id, vehicleId).first();
      if (!vehicle) return Response.json({ error: "Vehicle not found or no longer available." }, { status: 404 });
      return Response.json({ dealer: { name: dealer.name }, vehicle });
    }

    const { results } = await db.prepare(`SELECT id, stock_number, year, make, model, trim, mileage, asking_price_cents
      FROM auto_inventory WHERE tenant_id=? AND status='AVAILABLE' ORDER BY created_at DESC LIMIT 100`).bind(dealer.id).all();
    return Response.json({ dealer: { name: dealer.name }, inventory: results });
  } catch (error) {
    console.error("store.get_failed", error);
    return Response.json({ error: "Unable to load inventory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get("dealer"), 100);
    if (!slug) return Response.json({ error: "dealer is required." }, { status: 400 });
    const dealer = await dealerByslug(slug);
    if (!dealer) return Response.json({ error: "Dealer not found." }, { status: 404 });
    const db = coreDb();
    const body = (await request.json()) as Record<string, unknown>;
    const vehicleId = cleanText(body.vehicleId, 80);
    if (!vehicleId) return Response.json({ error: "vehicleId is required." }, { status: 400 });
    const vehicle = await db.prepare("SELECT asking_price_cents FROM auto_inventory WHERE tenant_id=? AND id=? AND status='AVAILABLE'").bind(dealer.id, vehicleId).first<{ asking_price_cents: number }>();
    if (!vehicle) return Response.json({ error: "Vehicle not found or no longer available." }, { status: 404 });
    const downPaymentCents = Math.round(Number(body.downPayment || 0) * 100);
    const termMonths = Number(body.termMonths || 72);
    const amountFinancedCents = Math.max(0, vehicle.asking_price_cents - downPaymentCents);
    const paymentCents = monthlyPayment(amountFinancedCents, ESTIMATED_APR, termMonths);

    if (body.action === "estimate") {
      return Response.json({ amountFinancedCents, monthlyPaymentCents: paymentCents, estimatedApr: ESTIMATED_APR, disclaimer: "Estimate only — not a credit offer. Your actual rate and payment depend on credit approval." });
    }

    if (body.action === "submit-lead") {
      const firstName = cleanText(body.firstName, 100);
      const lastName = cleanText(body.lastName, 100);
      const email = cleanText(body.email, 254);
      if (!firstName || !lastName || !email) return Response.json({ error: "firstName, lastName, and email are required." }, { status: 400 });
      const now = new Date().toISOString();
      let customer = await db.prepare("SELECT id FROM auto_customers WHERE tenant_id=? AND lower(email)=lower(?)").bind(dealer.id, email).first<{ id: string }>();
      let customerId: string;
      if (customer) {
        customerId = customer.id;
      } else {
        customerId = crypto.randomUUID();
        await db.prepare(`INSERT INTO auto_customers (id,tenant_id,first_name,last_name,email,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(customerId, dealer.id, firstName, lastName, email, cleanText(body.phone, 40) || null, now, now).run();
      }
      const dealId = crypto.randomUUID();
      await db.prepare(`INSERT INTO auto_deals
        (id,tenant_id,customer_id,vehicle_id,sale_price_cents,down_payment_cents,amount_financed_cents,term_months,interest_rate,monthly_payment_cents,
         front_gross_cents,back_gross_cents,status,contract_status,funding_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?)`)
        .bind(dealId, dealer.id, customerId, vehicleId, vehicle.asking_price_cents, downPaymentCents, amountFinancedCents, termMonths, ESTIMATED_APR, paymentCents, "DIGITAL_LEAD", "NOT_STARTED", "NOT_SUBMITTED", now, now).run();
      await db.batch([
        "Credit application", "Driver's license", "Proof of insurance", "Proof of income", "Proof of residence",
        "Trade title", "Retail installment contract", "Odometer disclosure", "Privacy notice", "OFAC / red-flag check",
      ].map((doc) => db.prepare("INSERT INTO auto_documents (id,tenant_id,deal_id,doc_type,checked,created_at,updated_at) VALUES (?,?,?,?,0,?,?)")
        .bind(crypto.randomUUID(), dealer.id, dealId, doc, now, now)));
      return Response.json({ dealId, monthlyPaymentCents: paymentCents }, { status: 201 });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("store.post_failed", error);
    return Response.json({ error: "Unable to process request." }, { status: 500 });
  }
}
