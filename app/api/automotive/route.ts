/**
 * Cyncro Automotive — dealership finance & deal-management API.
 *
 * A single Next.js route file (no catch-all segment) — resource, id and
 * action are query params instead of URL path segments.
 *
 * GET  /api/automotive?resource=customers
 * POST /api/automotive?resource=customers
 * GET  /api/automotive?resource=inventory
 * POST /api/automotive?resource=inventory
 * PATCH /api/automotive?resource=inventory&id=X
 * GET  /api/automotive?resource=deals[&id=X]
 * POST /api/automotive?resource=deals
 * PATCH /api/automotive?resource=deals&id=X
 * GET  /api/automotive?resource=cobuyers&dealId=X
 * POST /api/automotive?resource=cobuyers
 * GET  /api/automotive?resource=credit-application&dealId=X
 * POST /api/automotive?resource=credit-application
 * GET  /api/automotive?resource=products&dealId=X
 * POST /api/automotive?resource=products
 * DELETE /api/automotive?resource=products&id=X
 * GET  /api/automotive?resource=lenders
 * POST /api/automotive?resource=lenders
 * GET  /api/automotive?resource=submissions&dealId=X
 * POST /api/automotive?resource=submissions  { dealId, lenderIds: [...] }
 * PATCH /api/automotive?resource=submissions&id=X
 * GET  /api/automotive?resource=documents&dealId=X
 * POST /api/automotive?resource=documents
 * PATCH /api/automotive?resource=documents&id=X
 * GET  /api/automotive?resource=summary
 * GET  /api/automotive?resource=watchlist
 * POST /api/automotive?resource=watchlist
 * DELETE /api/automotive?resource=watchlist&id=X
 * GET  /api/automotive?resource=compliance-checks&dealId=X
 * POST /api/automotive?resource=compliance-check  { dealId, screenedName }
 * POST /api/automotive?resource=contract  { dealId }  — sends the contract
 * PATCH /api/automotive?resource=contract&id=dealId  { signerName, signatureData }  — signs it
 * GET  /api/automotive?resource=analytics
 * POST /api/automotive?resource=seed-demo — populates realistic sample records
 *   (real rows flowing through the real deal/funding/accounting logic below,
 *   not canned numbers) so every view has something to show. No-ops if this
 *   tenant already has inventory.
 */
import { cleanText, ensureCoreSchema, getTenantContext, coreDb } from "@/lib/core/db";
import { postJournalEntry } from "@/lib/core/accounting";
import { logAuditAction } from "@/lib/core/audit";

function uid() {
  return crypto.randomUUID();
}

/** Normalizes a name for watchlist matching: uppercase, single-spaced, punctuation stripped. */
function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Assembles a real buyer's order / retail contract summary from the deal's actual persisted numbers. */
function buildContractText(deal: Record<string, unknown>, customerName: string, vehicleDesc: string): string {
  const money = (cents: unknown) => `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    "RETAIL BUYER'S ORDER",
    `Buyer: ${customerName}`,
    `Vehicle: ${vehicleDesc}`,
    "",
    `Cash price ................. ${money(deal.sale_price_cents)}`,
    `Trade allowance ............ ${money(deal.trade_allowance_cents)}`,
    `Trade payoff ................ ${money(deal.trade_payoff_cents)}`,
    `Down payment ................ ${money(deal.down_payment_cents)}`,
    `Taxes ....................... ${money(deal.tax_cents)}`,
    `Fees ........................ ${money(deal.fees_cents)}`,
    `Amount financed ............. ${money(deal.amount_financed_cents)}`,
    `Term ......................... ${deal.term_months} months`,
    `APR .......................... ${deal.interest_rate}%`,
    `Monthly payment .............. ${money(deal.monthly_payment_cents)}`,
  ].join("\n");
}

/** Standard amortizing monthly payment, in cents. */
function monthlyPayment(principalCents: number, annualRatePct: number, termMonths: number): number {
  if (principalCents <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principalCents / termMonths);
  const factor = Math.pow(1 + r, termMonths);
  return Math.round((principalCents * r * factor) / (factor - 1));
}

const DEAL_JACKET_CHECKLIST = [
  "Driver's license", "Proof of insurance", "Proof of income", "Proof of residence",
  "Trade title", "Credit application", "Retail installment contract", "Odometer disclosure",
  "Privacy notice", "OFAC / red-flag check",
];


/** "$24,500.00" | "24500" | 24500 → cents, or null when blank/invalid. */
function toCents(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
function toInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
const INVENTORY_STATUSES = new Set(["AVAILABLE", "PENDING", "SOLD", "WHOLESALE", "IN_RECON", "HOLD"]);
/** Shared column mapping for inventory create / bulk upsert / patch. */
function inventoryColumns(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const set = (col: string, val: unknown) => { out[col] = val; };
  if (body.vin !== undefined) set("vin", cleanText(body.vin, 20).toUpperCase() || null);
  if (body.year !== undefined) set("year", toInt(body.year));
  if (body.make !== undefined) set("make", cleanText(body.make, 60) || null);
  if (body.model !== undefined) set("model", cleanText(body.model, 60) || null);
  if (body.trim !== undefined) set("trim", cleanText(body.trim, 60) || null);
  if (body.mileage !== undefined) set("mileage", toInt(body.mileage));
  if (body.bookValue !== undefined) set("book_value_cents", toCents(body.bookValue));
  if (body.askingPrice !== undefined) set("asking_price_cents", toCents(body.askingPrice) ?? 0);
  if (body.acquisitionCost !== undefined) set("acquisition_cost_cents", toCents(body.acquisitionCost));
  if (body.reconCost !== undefined) set("recon_cost_cents", toCents(body.reconCost));
  if (body.kbbValue !== undefined) set("kbb_value_cents", toCents(body.kbbValue));
  if (body.jdpowerValue !== undefined) set("jdpower_value_cents", toCents(body.jdpowerValue));
  if (body.mmrValue !== undefined) set("mmr_value_cents", toCents(body.mmrValue));
  if (body.color !== undefined) set("color", cleanText(body.color, 40) || null);
  if (body.bodyStyle !== undefined) set("body_style", cleanText(body.bodyStyle, 40) || null);
  if (body.drivetrain !== undefined) set("drivetrain", cleanText(body.drivetrain, 20) || null);
  if (body.acquiredAt !== undefined) { const d = new Date(String(body.acquiredAt)); set("acquired_at", Number.isNaN(d.valueOf()) ? null : d.toISOString()); }
  if (body.notes !== undefined) set("notes", cleanText(body.notes, 2000) || null);
  if (body.status !== undefined) { const st = cleanText(body.status, 20).toUpperCase(); if (INVENTORY_STATUSES.has(st)) set("status", st); }
  return out;
}

/** Real lender names dealers in Florida commonly work with. Rates and tiers are
 *  left blank on purpose — every dealer's program terms differ, so the dealer
 *  fills those in from their own agreements. */
const LENDER_DIRECTORY: { name: string; type: string; region: string; website?: string }[] = [
  // Captive finance arms
  { name: "GM Financial", type: "CAPTIVE", region: "National", website: "https://www.gmfinancial.com" },
  { name: "Ford Credit", type: "CAPTIVE", region: "National", website: "https://www.ford.com/finance/" },
  { name: "Toyota Financial Services", type: "CAPTIVE", region: "National", website: "https://www.toyotafinancial.com" },
  { name: "Honda Financial Services", type: "CAPTIVE", region: "National", website: "https://www.hondafinancialservices.com" },
  { name: "Nissan Motor Acceptance (NMAC)", type: "CAPTIVE", region: "National", website: "https://www.nissanfinance.com" },
  { name: "Hyundai Capital America", type: "CAPTIVE", region: "National", website: "https://www.hyundaimotorfinance.com" },
  { name: "Kia Finance America", type: "CAPTIVE", region: "National", website: "https://www.kiafinance.com" },
  { name: "Stellantis Financial Services", type: "CAPTIVE", region: "National", website: "https://www.stellantisfinancialservices.com" },
  { name: "Volkswagen Credit", type: "CAPTIVE", region: "National", website: "https://www.vwcredit.com" },
  { name: "BMW Financial Services", type: "CAPTIVE", region: "National", website: "https://www.bmwusa.com/financial-services.html" },
  { name: "Mercedes-Benz Financial Services", type: "CAPTIVE", region: "National", website: "https://www.mbfs.com" },
  { name: "Subaru Motors Finance", type: "CAPTIVE", region: "National", website: "https://www.subarumotorsfinance.com" },
  { name: "Mazda Financial Services", type: "CAPTIVE", region: "National", website: "https://www.mazdafinancialservices.com" },
  // National banks and prime lenders
  { name: "Ally Financial", type: "BANK", region: "National", website: "https://www.ally.com/dealer/" },
  { name: "Capital One Auto Finance", type: "BANK", region: "National", website: "https://www.capitalone.com/cars/dealers/" },
  { name: "Chase Auto", type: "BANK", region: "National", website: "https://www.chase.com/personal/auto" },
  { name: "Bank of America Dealer Financial Services", type: "BANK", region: "National", website: "https://www.bankofamerica.com/auto-loans/" },
  { name: "Wells Fargo Auto", type: "BANK", region: "National", website: "https://www.wellsfargo.com/auto-loans/" },
  { name: "U.S. Bank Dealer Services", type: "BANK", region: "National", website: "https://www.usbank.com/vehicle-loans.html" },
  { name: "TD Auto Finance", type: "BANK", region: "National", website: "https://www.tdautofinance.com" },
  { name: "Huntington Auto Finance", type: "BANK", region: "National", website: "https://www.huntington.com/Personal/auto-loans" },
  { name: "Fifth Third Dealer Services", type: "BANK", region: "National", website: "https://www.53.com/content/fifth-third/en/personal-banking/borrowing/auto-loans.html" },
  { name: "PNC Dealer Finance", type: "BANK", region: "National", website: "https://www.pnc.com/en/personal-banking/borrowing/auto-loans.html" },
  { name: "Truist Dealer Retail Services", type: "BANK", region: "National", website: "https://www.truist.com" },
  { name: "Citizens Auto Finance", type: "BANK", region: "National", website: "https://www.citizensbank.com/auto-loans/" },
  { name: "Santander Consumer USA", type: "BANK", region: "National", website: "https://www.santanderconsumerusa.com" },
  { name: "Mechanics Bank Auto Finance", type: "BANK", region: "National", website: "https://www.mechanicsbank.com/Auto-Finance" },
  // Florida banks
  { name: "Seacoast Bank", type: "BANK", region: "Florida", website: "https://www.seacoastbank.com" },
  { name: "BankUnited", type: "BANK", region: "Florida", website: "https://www.bankunited.com" },
  { name: "Amerant Bank", type: "BANK", region: "Florida", website: "https://www.amerantbank.com" },
  { name: "City National Bank of Florida", type: "BANK", region: "Florida", website: "https://www.citynational.com" },
  { name: "Capital City Bank", type: "BANK", region: "Florida", website: "https://www.ccbg.com" },
  { name: "Southern Auto Finance Company (SAFCO)", type: "SUBPRIME", region: "Florida", website: "https://www.safco.com" },
  // Near-prime and subprime
  { name: "Westlake Financial Services", type: "SUBPRIME", region: "National", website: "https://www.westlakefinancial.com" },
  { name: "Exeter Finance", type: "SUBPRIME", region: "National", website: "https://www.exeterfinance.com" },
  { name: "Credit Acceptance", type: "SUBPRIME", region: "National", website: "https://www.creditacceptance.com" },
  { name: "Regional Acceptance Corporation", type: "SUBPRIME", region: "National", website: "https://www.regionalacceptance.com" },
  { name: "Global Lending Services", type: "SUBPRIME", region: "National", website: "https://www.glsllc.com" },
  { name: "Flagship Credit Acceptance", type: "SUBPRIME", region: "National", website: "https://www.flagshipcredit.com" },
  { name: "United Auto Credit", type: "SUBPRIME", region: "National", website: "https://www.unitedautocredit.net" },
  { name: "Consumer Portfolio Services (CPS)", type: "SUBPRIME", region: "National", website: "https://www.consumerportfolio.com" },
  { name: "First Investors Financial Services", type: "SUBPRIME", region: "National", website: "https://www.firstinvestorsonline.com" },
  { name: "Prestige Financial Services", type: "SUBPRIME", region: "National", website: "https://www.gopfs.com" },
  { name: "Security National Automotive Acceptance (SNAAC)", type: "SUBPRIME", region: "National", website: "https://www.snaac.com" },
  { name: "Lobel Financial", type: "SUBPRIME", region: "National", website: "https://www.lobelfinancial.com" },
  { name: "American Credit Acceptance", type: "SUBPRIME", region: "National", website: "https://www.americancreditacceptance.com" },
  { name: "Foursight Capital", type: "SUBPRIME", region: "National", website: "https://www.foursightcapital.com" },
  { name: "Veros Credit", type: "SUBPRIME", region: "National", website: "https://www.veroscredit.com" },
  { name: "Carvana Finance (Bridgecrest)", type: "SUBPRIME", region: "National", website: "https://www.bridgecrest.com" },
  // Florida credit unions
  { name: "Suncoast Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.suncoastcreditunion.com" },
  { name: "VyStar Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://vystarcu.org" },
  { name: "Space Coast Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.sccu.com" },
  { name: "GTE Financial", type: "CREDIT_UNION", region: "Florida", website: "https://www.gtefinancial.org" },
  { name: "Fairwinds Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.fairwinds.org" },
  { name: "Addition Financial Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.additionfi.com" },
  { name: "MIDFLORIDA Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.midflorida.com" },
  { name: "Grow Financial Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.growfinancial.org" },
  { name: "Launch Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.launchcu.com" },
  { name: "Achieva Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.achievacu.com" },
  { name: "Tropical Financial Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.tropicalfcu.com" },
  { name: "CAMPUS USA Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.campuscu.com" },
  { name: "Florida Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.flcu.org" },
  { name: "Community First Credit Union of Florida", type: "CREDIT_UNION", region: "Florida", website: "https://www.communityfirstfl.org" },
  { name: "First Florida Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.firstflorida.org" },
  { name: "Eglin Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.eglinfcu.org" },
  { name: "Pen Air Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.penair.org" },
  { name: "Tyndall Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.tyndall.org" },
  { name: "Insight Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.insightcreditunion.com" },
  { name: "Envision Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.envisioncu.com" },
  { name: "First Commerce Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.firstcommercecu.org" },
  { name: "Dade County Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.dcfcu.org" },
  { name: "Power Financial Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.powerfi.org" },
  { name: "We Florida Financial", type: "CREDIT_UNION", region: "Florida", website: "https://www.wefloridafinancial.com" },
  { name: "Jax Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.jaxfcu.org" },
  { name: "121 Financial Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.121fcu.org" },
  { name: "USF Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.usffcu.org" },
  { name: "IBM Southeast Employees' Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.ibmsecu.org" },
  { name: "McCoy Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.mccoyfcu.org" },
  { name: "Priority Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.prioritycu.org" },
  { name: "Gulf Winds Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.gulfwindscu.org" },
  { name: "Miami Firefighters Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.miamifirefighterscu.org" },
  { name: "Brightstar Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.bscu.org" },
  { name: "PBC Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.pbccu.org" },
  { name: "Florida State University Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.fsucu.org" },
  { name: "Harvesters Federal Credit Union", type: "CREDIT_UNION", region: "Florida", website: "https://www.harvestersfcu.org" },
  // National credit unions
  { name: "Navy Federal Credit Union", type: "CREDIT_UNION", region: "National", website: "https://www.navyfederal.org" },
  { name: "PenFed Credit Union", type: "CREDIT_UNION", region: "National", website: "https://www.penfed.org" },
  { name: "Alliant Credit Union", type: "CREDIT_UNION", region: "National", website: "https://www.alliantcreditunion.org" },
  { name: "Digital Federal Credit Union (DCU)", type: "CREDIT_UNION", region: "National", website: "https://www.dcu.org" },
  { name: "Security Service Federal Credit Union", type: "CREDIT_UNION", region: "National", website: "https://www.ssfcu.org" },
  { name: "USAA (bank)", type: "BANK", region: "National", website: "https://www.usaa.com" },
];

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id") || undefined;
    const dealId = url.searchParams.get("dealId") || undefined;

    if (resource === "customers") {
      const { results } = await db.prepare("SELECT * FROM auto_customers WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").bind(tenant.tenantId).all();
      return Response.json({ customers: results });
    }

    if (resource === "inventory") {
      const { results } = await db.prepare("SELECT * FROM auto_inventory WHERE tenant_id=? ORDER BY created_at DESC LIMIT 2000").bind(tenant.tenantId).all();
      return Response.json({ inventory: results });
    }

    if (resource === "deals") {
      if (id) {
        const deal = await db.prepare(`SELECT d.*, c.first_name, c.last_name, c.email AS customer_email, c.credit_score_pulled,
                    i.stock_number, i.vin, i.year, i.make, i.model, i.trim, i.mileage, i.book_value_cents
                    FROM auto_deals d
                    JOIN auto_customers c ON c.id=d.customer_id
                    JOIN auto_inventory i ON i.id=d.vehicle_id
                    WHERE d.tenant_id=? AND d.id=?`).bind(tenant.tenantId, id).first();
        if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
        const [cobuyers, products, submissions, documents, creditApp] = await Promise.all([
          db.prepare("SELECT * FROM auto_co_buyers WHERE deal_id=?").bind(id).all(),
          db.prepare("SELECT * FROM auto_deal_products WHERE deal_id=? ORDER BY created_at").bind(id).all(),
          db.prepare("SELECT s.*, l.name AS lender_name FROM auto_lender_submissions s JOIN auto_lenders l ON l.id=s.lender_id WHERE s.deal_id=? ORDER BY s.submitted_at DESC").bind(id).all(),
          db.prepare("SELECT * FROM auto_documents WHERE deal_id=? ORDER BY doc_type").bind(id).all(),
          db.prepare("SELECT * FROM auto_credit_applications WHERE deal_id=? ORDER BY created_at DESC LIMIT 1").bind(id).first(),
        ]);
        return Response.json({ deal, cobuyers: cobuyers.results, products: products.results, submissions: submissions.results, documents: documents.results, creditApplication: creditApp });
      }
      const { results } = await db.prepare(`SELECT d.*, c.first_name, c.last_name, i.stock_number, i.year, i.make, i.model
        FROM auto_deals d JOIN auto_customers c ON c.id=d.customer_id JOIN auto_inventory i ON i.id=d.vehicle_id
        WHERE d.tenant_id=? ORDER BY d.created_at DESC LIMIT 200`).bind(tenant.tenantId).all();
      return Response.json({ deals: results });
    }

    if (resource === "cobuyers") {
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM auto_co_buyers WHERE tenant_id=? AND deal_id=?").bind(tenant.tenantId, dealId).all();
      return Response.json({ cobuyers: results });
    }

    if (resource === "credit-application") {
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const app = await db.prepare("SELECT * FROM auto_credit_applications WHERE tenant_id=? AND deal_id=? ORDER BY created_at DESC LIMIT 1").bind(tenant.tenantId, dealId).first();
      return Response.json({ creditApplication: app });
    }

    if (resource === "products") {
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM auto_deal_products WHERE tenant_id=? AND deal_id=? ORDER BY created_at").bind(tenant.tenantId, dealId).all();
      return Response.json({ products: results });
    }

    if (resource === "lenders") {
      const { results } = await db.prepare("SELECT * FROM auto_lenders WHERE tenant_id=? ORDER BY name").bind(tenant.tenantId).all();
      return Response.json({ lenders: results });
    }

    if (resource === "submissions") {
      const q = dealId
        ? db.prepare("SELECT s.*, l.name AS lender_name FROM auto_lender_submissions s JOIN auto_lenders l ON l.id=s.lender_id WHERE s.tenant_id=? AND s.deal_id=? ORDER BY s.submitted_at DESC").bind(tenant.tenantId, dealId)
        : db.prepare(`SELECT s.*, l.name AS lender_name, c.first_name, c.last_name FROM auto_lender_submissions s
                       JOIN auto_lenders l ON l.id=s.lender_id JOIN auto_deals d ON d.id=s.deal_id JOIN auto_customers c ON c.id=d.customer_id
                       WHERE s.tenant_id=? ORDER BY s.submitted_at DESC LIMIT 200`).bind(tenant.tenantId);
      const { results } = await q.all();
      return Response.json({ submissions: results });
    }

    if (resource === "documents") {
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM auto_documents WHERE tenant_id=? AND deal_id=? ORDER BY doc_type").bind(tenant.tenantId, dealId).all();
      return Response.json({ documents: results });
    }

    if (resource === "summary") {
      const [units, deals, funded, grossRow, tenantRow] = await Promise.all([
        db.prepare("SELECT COUNT(*) c FROM auto_inventory WHERE tenant_id=? AND status='AVAILABLE'").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM auto_deals WHERE tenant_id=? AND status NOT IN ('FUNDED','UNWOUND')").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COUNT(*) c FROM auto_deals WHERE tenant_id=? AND status='FUNDED'").bind(tenant.tenantId).first<{ c: number }>(),
        db.prepare("SELECT COALESCE(SUM(front_gross_cents),0) f, COALESCE(SUM(back_gross_cents),0) b FROM auto_deals WHERE tenant_id=? AND status='FUNDED'").bind(tenant.tenantId).first<{ f: number; b: number }>(),
        db.prepare("SELECT slug FROM tenants WHERE id=?").bind(tenant.tenantId).first<{ slug: string }>(),
      ]);
      return Response.json({
        availableUnits: Number(units?.c || 0),
        activeDeals: Number(deals?.c || 0),
        fundedDeals: Number(funded?.c || 0),
        totalFrontGrossCents: Number(grossRow?.f || 0),
        totalBackGrossCents: Number(grossRow?.b || 0),
        dealerSlug: tenantRow?.slug || null,
        digitalLeads: (await db.prepare("SELECT COUNT(*) c FROM auto_deals WHERE tenant_id=? AND status='DIGITAL_LEAD'").bind(tenant.tenantId).first<{ c: number }>())?.c || 0,
      });
    }

    if (resource === "watchlist") {
      const { results } = await db.prepare("SELECT * FROM auto_watchlist WHERE tenant_id=? ORDER BY created_at DESC").bind(tenant.tenantId).all();
      return Response.json({ watchlist: results });
    }

    if (resource === "compliance-checks") {
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const { results } = await db.prepare("SELECT * FROM auto_compliance_checks WHERE tenant_id=? AND deal_id=? ORDER BY checked_at DESC").bind(tenant.tenantId, dealId).all();
      return Response.json({ checks: results });
    }

    if (resource === "analytics") {
      const { results } = await db.prepare(`
        SELECT COALESCE(salesperson_email,'(unassigned)') AS rep, COUNT(*) AS deal_count,
          COALESCE(SUM(front_gross_cents),0) AS front_gross_cents, COALESCE(SUM(back_gross_cents),0) AS back_gross_cents
        FROM auto_deals WHERE tenant_id=? AND status='FUNDED' GROUP BY rep ORDER BY (front_gross_cents+back_gross_cents) DESC
      `).bind(tenant.tenantId).all<{ rep: string; deal_count: number; front_gross_cents: number; back_gross_cents: number }>();
      const reps = (results || []).map((r) => ({
        ...r,
        pvrCents: r.deal_count > 0 ? Math.round((r.front_gross_cents + r.back_gross_cents) / r.deal_count) : 0,
      }));
      return Response.json({ reps });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive.get_failed", error);
    return Response.json({ error: "Unable to load Cyncro Automotive data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "customers") {
      const firstName = cleanText(body.firstName, 100);
      const lastName = cleanText(body.lastName, 100);
      if (!firstName || !lastName) return Response.json({ error: "firstName and lastName are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO auto_customers (id,tenant_id,first_name,last_name,email,phone,address,date_of_birth,ssn_last4,credit_score_pulled,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, firstName, lastName, cleanText(body.email, 254) || null, cleanText(body.phone, 40) || null,
          cleanText(body.address, 300) || null, cleanText(body.dateOfBirth, 20) || null, cleanText(body.ssnLast4, 4) || null,
          body.creditScorePulled !== undefined ? Number(body.creditScorePulled) : null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "inventory") {
      const stockNumber = cleanText(body.stockNumber, 40);
      if (!stockNumber) return Response.json({ error: "stockNumber is required." }, { status: 400 });
      const cols = inventoryColumns(body);
      const id = uid();
      const names = ["id", "tenant_id", "stock_number", ...Object.keys(cols), "created_at", "updated_at"];
      const values = [id, tenant.tenantId, stockNumber, ...Object.values(cols), now, now];
      if (!("status" in cols)) { names.splice(names.length - 2, 0, "status"); values.splice(values.length - 2, 0, "AVAILABLE"); }
      if (!("asking_price_cents" in cols)) { names.splice(names.length - 2, 0, "asking_price_cents"); values.splice(values.length - 2, 0, 0); }
      await db.prepare(`INSERT INTO auto_inventory (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).bind(...values).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "inventory-bulk") {
      // Upsert many vehicles keyed by stock number (CSV / paste import).
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
      if (!rows.length) return Response.json({ error: "rows is required." }, { status: 400 });
      if (rows.length > 2000) return Response.json({ error: "Import at most 2,000 vehicles at a time." }, { status: 400 });
      let inserted = 0, updated = 0; const errors: string[] = [];
      for (const [i, row] of rows.entries()) {
        const stockNumber = cleanText(row.stockNumber, 40) || (cleanText(row.vin, 20) ? cleanText(row.vin, 20).toUpperCase().slice(-8) : "");
        if (!stockNumber) { errors.push(`Row ${i + 1}: missing stock number and VIN`); continue; }
        const cols = inventoryColumns(row);
        const existing = await db.prepare("SELECT id FROM auto_inventory WHERE tenant_id=? AND stock_number=?").bind(tenant.tenantId, stockNumber).first<{ id: string }>();
        if (existing) {
          if (Object.keys(cols).length) {
            await db.prepare(`UPDATE auto_inventory SET ${Object.keys(cols).map((c) => `${c}=?`).join(",")}, updated_at=? WHERE id=?`).bind(...Object.values(cols), now, existing.id).run();
          }
          updated++;
        } else {
          const names = ["id", "tenant_id", "stock_number", ...Object.keys(cols), "created_at", "updated_at"];
          const values = [uid(), tenant.tenantId, stockNumber, ...Object.values(cols), now, now];
          if (!("status" in cols)) { names.splice(names.length - 2, 0, "status"); values.splice(values.length - 2, 0, "AVAILABLE"); }
          if (!("asking_price_cents" in cols)) { names.splice(names.length - 2, 0, "asking_price_cents"); values.splice(values.length - 2, 0, 0); }
          await db.prepare(`INSERT INTO auto_inventory (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).bind(...values).run();
          inserted++;
        }
      }
      return Response.json({ inserted, updated, errors }, { status: 201 });
    }

    if (resource === "lender-directory") {
      // Seed the Florida + national lender directory, skipping names already present.
      const { results: existing } = await db.prepare("SELECT lower(name) AS n FROM auto_lenders WHERE tenant_id=?").bind(tenant.tenantId).all<{ n: string }>();
      const have = new Set(existing.map((r) => r.n));
      let added = 0;
      for (const l of LENDER_DIRECTORY) {
        if (have.has(l.name.toLowerCase())) continue;
        await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,active,lender_type,region,website,created_at,updated_at) VALUES (?,?,?,1,?,?,?,?,?)`)
          .bind(uid(), tenant.tenantId, l.name, l.type, l.region, l.website || null, now, now).run();
        added++;
      }
      return Response.json({ added, total: LENDER_DIRECTORY.length }, { status: 201 });
    }

    if (resource === "deals") {
      const customerId = cleanText(body.customerId, 80);
      const vehicleId = cleanText(body.vehicleId, 80);
      if (!customerId || !vehicleId) return Response.json({ error: "customerId and vehicleId are required." }, { status: 400 });
      const salePriceCents = Math.round(Number(body.salePrice || 0) * 100);
      const tradeAllowanceCents = Math.round(Number(body.tradeAllowance || 0) * 100);
      const tradePayoffCents = Math.round(Number(body.tradePayoff || 0) * 100);
      const downPaymentCents = Math.round(Number(body.downPayment || 0) * 100);
      const taxCents = Math.round(Number(body.tax || 0) * 100);
      const feesCents = Math.round(Number(body.fees || 0) * 100);
      const termMonths = Number(body.termMonths || 72);
      const interestRate = Number(body.interestRate || 0);
      const amountFinancedCents = Math.max(0, salePriceCents - tradeAllowanceCents + tradePayoffCents - downPaymentCents + taxCents + feesCents);
      const monthlyPaymentCents = monthlyPayment(amountFinancedCents, interestRate, termMonths);
      const vehicle = await db.prepare("SELECT acquisition_cost_cents FROM auto_inventory WHERE tenant_id=? AND id=?").bind(tenant.tenantId, vehicleId).first<{ acquisition_cost_cents: number | null }>();
      const frontGrossCents = salePriceCents - Number(vehicle?.acquisition_cost_cents || 0);
      const id = uid();
      await db.prepare(`INSERT INTO auto_deals
        (id,tenant_id,customer_id,vehicle_id,salesperson_email,finance_manager_email,sale_price_cents,trade_description,
         trade_allowance_cents,trade_payoff_cents,down_payment_cents,tax_cents,fees_cents,amount_financed_cents,term_months,
         interest_rate,monthly_payment_cents,front_gross_cents,back_gross_cents,status,contract_status,funding_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          id, tenant.tenantId, customerId, vehicleId, cleanText(body.salespersonEmail, 254) || tenant.email, cleanText(body.financeManagerEmail, 254) || null,
          salePriceCents, cleanText(body.tradeDescription, 300) || null, tradeAllowanceCents, tradePayoffCents, downPaymentCents,
          taxCents, feesCents, amountFinancedCents, termMonths, interestRate, monthlyPaymentCents, frontGrossCents, 0,
          "WORKING", "NOT_STARTED", "NOT_SUBMITTED", now, now,
        ).run();
      await db.batch(DEAL_JACKET_CHECKLIST.map((doc) =>
        db.prepare("INSERT INTO auto_documents (id,tenant_id,deal_id,doc_type,checked,created_at,updated_at) VALUES (?,?,?,?,0,?,?)")
          .bind(uid(), tenant.tenantId, id, doc, now, now)));
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "loan_application", id, { resourceName: "Deal created" });
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "cobuyers") {
      const dealId = cleanText(body.dealId, 80);
      const fullName = cleanText(body.fullName, 200);
      if (!dealId || !fullName) return Response.json({ error: "dealId and fullName are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO auto_co_buyers (id,tenant_id,deal_id,full_name,relationship,ssn_last4,date_of_birth,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id, tenant.tenantId, dealId, fullName, cleanText(body.relationship, 60) || null, cleanText(body.ssnLast4, 4) || null, cleanText(body.dateOfBirth, 20) || null, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "credit-application") {
      const dealId = cleanText(body.dealId, 80);
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO auto_credit_applications (id,tenant_id,deal_id,applicant_income_cents,employer,time_at_job_months,housing_payment_cents,status,submitted_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, dealId,
          body.applicantIncome !== undefined ? Math.round(Number(body.applicantIncome) * 100) : null,
          cleanText(body.employer, 200) || null,
          body.timeAtJobMonths !== undefined ? Number(body.timeAtJobMonths) : null,
          body.housingPayment !== undefined ? Math.round(Number(body.housingPayment) * 100) : null,
          "SUBMITTED", now, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "products") {
      const dealId = cleanText(body.dealId, 80);
      const productType = cleanText(body.productType, 40);
      const name = cleanText(body.name, 200);
      if (!dealId || !productType || !name) return Response.json({ error: "dealId, productType, and name are required." }, { status: 400 });
      const id = uid();
      const priceCents = Math.round(Number(body.price || 0) * 100);
      const costCents = Math.round(Number(body.cost || 0) * 100);
      await db.prepare(`INSERT INTO auto_deal_products (id,tenant_id,deal_id,product_type,name,price_cents,cost_cents,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id, tenant.tenantId, dealId, productType, name, priceCents, costCents, now).run();
      // Back-end gross = sum of (price - cost) across all F&I products on the deal.
      const totals = await db.prepare("SELECT COALESCE(SUM(price_cents-cost_cents),0) g FROM auto_deal_products WHERE deal_id=?").bind(dealId).first<{ g: number }>();
      await db.prepare("UPDATE auto_deals SET back_gross_cents=?, updated_at=? WHERE tenant_id=? AND id=?").bind(Number(totals?.g || 0), now, tenant.tenantId, dealId).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "lenders") {
      const name = cleanText(body.name, 200);
      if (!name) return Response.json({ error: "name is required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,min_credit_score,max_advance_pct,buy_rate,reserve_pct,active,notes,lender_type,region,website,phone,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, name,
          body.minCreditScore !== undefined && body.minCreditScore !== "" ? Number(body.minCreditScore) : null,
          body.maxAdvancePct !== undefined && body.maxAdvancePct !== "" ? Number(body.maxAdvancePct) : null,
          body.buyRate !== undefined && body.buyRate !== "" ? Number(body.buyRate) : null,
          body.reservePct !== undefined && body.reservePct !== "" ? Number(body.reservePct) : null,
          cleanText(body.notes, 1000) || null, cleanText(body.lenderType, 30).toUpperCase() || null, cleanText(body.region, 60) || null, cleanText(body.website, 300) || null, cleanText(body.phone, 40) || null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "submissions") {
      const dealId = cleanText(body.dealId, 80);
      const lenderIds = Array.isArray(body.lenderIds) ? (body.lenderIds as unknown[]).map((x) => cleanText(x, 80)).filter(Boolean) : [];
      if (!dealId || !lenderIds.length) return Response.json({ error: "dealId and at least one lenderId are required." }, { status: 400 });
      const created: string[] = [];
      for (const lenderId of lenderIds) {
        const id = uid();
        await db.prepare(`INSERT INTO auto_lender_submissions (id,tenant_id,deal_id,lender_id,status,submitted_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`).bind(id, tenant.tenantId, dealId, lenderId, "SUBMITTED", now, now, now).run();
        created.push(id);
      }
      await db.prepare("UPDATE auto_deals SET status='SUBMITTED', updated_at=? WHERE tenant_id=? AND id=?").bind(now, tenant.tenantId, dealId).run();
      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "SUBMIT", "loan_application", dealId, { resourceName: `Submitted to ${lenderIds.length} lender(s)` });
      return Response.json({ ids: created }, { status: 201 });
    }

    if (resource === "documents") {
      const dealId = cleanText(body.dealId, 80);
      const docType = cleanText(body.docType, 100);
      if (!dealId || !docType) return Response.json({ error: "dealId and docType are required." }, { status: 400 });
      const id = uid();
      await db.prepare(`INSERT INTO auto_documents (id,tenant_id,deal_id,doc_type,file_name,checked,created_at,updated_at)
        VALUES (?,?,?,?,?,0,?,?)`).bind(id, tenant.tenantId, dealId, docType, cleanText(body.fileName, 300) || null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "watchlist") {
      const fullName = cleanText(body.fullName, 200);
      if (!fullName) return Response.json({ error: "fullName is required." }, { status: 400 });
      const id = uid();
      await db.prepare("INSERT INTO auto_watchlist (id,tenant_id,full_name,reason,created_at) VALUES (?,?,?,?,?)")
        .bind(id, tenant.tenantId, fullName, cleanText(body.reason, 500) || null, now).run();
      return Response.json({ id }, { status: 201 });
    }

    if (resource === "compliance-check") {
      const dealId = cleanText(body.dealId, 80);
      const screenedName = cleanText(body.screenedName, 200);
      if (!dealId || !screenedName) return Response.json({ error: "dealId and screenedName are required." }, { status: 400 });
      const normalizedScreened = normalizeName(screenedName);
      const { results: watchlist } = await db.prepare("SELECT full_name FROM auto_watchlist WHERE tenant_id=?").bind(tenant.tenantId).all<{ full_name: string }>();
      let matchedEntry: string | null = null;
      for (const entry of watchlist || []) {
        const normalizedEntry = normalizeName(entry.full_name);
        if (normalizedEntry && (normalizedScreened === normalizedEntry || normalizedScreened.includes(normalizedEntry) || normalizedEntry.includes(normalizedScreened))) {
          matchedEntry = entry.full_name;
          break;
        }
      }
      const id = uid();
      await db.prepare(`INSERT INTO auto_compliance_checks (id,tenant_id,deal_id,screened_name,match_found,matched_entry,checked_by,checked_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, tenant.tenantId, dealId, screenedName, matchedEntry ? 1 : 0, matchedEntry, tenant.email, now).run();
      return Response.json({ id, matchFound: Boolean(matchedEntry), matchedEntry }, { status: 201 });
    }

    if (resource === "contract") {
      const dealId = cleanText(body.dealId, 80);
      if (!dealId) return Response.json({ error: "dealId is required." }, { status: 400 });
      const deal = await db.prepare(`SELECT d.*, c.first_name, c.last_name, i.year, i.make, i.model, i.vin, i.stock_number
        FROM auto_deals d JOIN auto_customers c ON c.id=d.customer_id JOIN auto_inventory i ON i.id=d.vehicle_id
        WHERE d.tenant_id=? AND d.id=?`).bind(tenant.tenantId, dealId).first<Record<string, unknown>>();
      if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
      const customerName = `${deal.first_name} ${deal.last_name}`;
      const vehicleDesc = `${deal.year} ${deal.make} ${deal.model} — VIN ${deal.vin || "N/A"} — Stock ${deal.stock_number}`;
      const contractText = buildContractText(deal, customerName, vehicleDesc);
      await db.prepare("UPDATE auto_deals SET contract_status='SENT', contract_sent_at=?, updated_at=? WHERE tenant_id=? AND id=?")
        .bind(now, now, tenant.tenantId, dealId).run();
      return Response.json({ sent: true, contractText }, { status: 201 });
    }

    if (resource === "seed-demo") {
      const existing = await db.prepare("SELECT COUNT(*) c FROM auto_inventory WHERE tenant_id=?").bind(tenant.tenantId).first<{ c: number }>();
      if (Number(existing?.c || 0) > 0) {
        return Response.json({ seeded: false, reason: "This dealership already has inventory — seed only runs on an empty account." });
      }

      const mk = async (customer: { firstName: string; lastName: string; email: string; phone: string }) => {
        const cid = uid();
        await db.prepare(`INSERT INTO auto_customers (id,tenant_id,first_name,last_name,email,phone,credit_score_pulled,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`).bind(cid, tenant.tenantId, customer.firstName, customer.lastName, customer.email, customer.phone, 720, now, now).run();
        return cid;
      };
      const mkVehicle = async (v: { stock: string; vin: string; year: number; make: string; model: string; trim: string; mileage: number; book: number; asking: number; acquisition: number }) => {
        const vid = uid();
        await db.prepare(`INSERT INTO auto_inventory (id,tenant_id,stock_number,vin,year,make,model,trim,mileage,book_value_cents,asking_price_cents,acquisition_cost_cents,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'AVAILABLE',?,?)`)
          .bind(vid, tenant.tenantId, v.stock, v.vin, v.year, v.make, v.model, v.trim, v.mileage, v.book * 100, v.asking * 100, v.acquisition * 100, now, now).run();
        return vid;
      };

      const [buyer1, buyer2, buyer3, buyer4] = await Promise.all([
        mk({ firstName: "Marcus", lastName: "Ellison", email: "marcus.ellison@example.com", phone: "555-0142" }),
        mk({ firstName: "Priya", lastName: "Anand", email: "priya.anand@example.com", phone: "555-0198" }),
        mk({ firstName: "Diego", lastName: "Ramos", email: "diego.ramos@example.com", phone: "555-0177" }),
        mk({ firstName: "Olivia", lastName: "Bennett", email: "olivia.bennett@example.com", phone: "555-0163" }),
      ]);
      const [veh1, veh2, veh3, veh4, veh5] = await Promise.all([
        mkVehicle({ stock: "A24-1001", vin: "1FTFW1E50PFA10001", year: 2024, make: "Ford", model: "F-150", trim: "XLT", mileage: 8200, book: 38500, asking: 41995, acquisition: 35800 }),
        mkVehicle({ stock: "A24-1002", vin: "5YJ3E1EA1PF100002", year: 2023, make: "Tesla", model: "Model 3", trim: "Long Range", mileage: 12400, book: 32000, asking: 35995, acquisition: 30200 }),
        mkVehicle({ stock: "A24-1003", vin: "1HGCV1F30PA100003", year: 2024, make: "Honda", model: "Accord", trim: "Sport", mileage: 3100, book: 27500, asking: 29995, acquisition: 25900 }),
        mkVehicle({ stock: "A24-1004", vin: "3GNAXUEV5PL100004", year: 2023, make: "Chevrolet", model: "Equinox", trim: "LT", mileage: 15800, book: 24000, asking: 26495, acquisition: 22100 }),
        mkVehicle({ stock: "A24-1005", vin: "WBA5R7C50PF100005", year: 2024, make: "BMW", model: "330i", trim: "Base", mileage: 5600, book: 39000, asking: 43995, acquisition: 37500 }),
      ]);

      const lenderIds = await Promise.all([
        (async () => { const id = uid(); await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,min_credit_score,max_advance_pct,buy_rate,reserve_pct,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`).bind(id, tenant.tenantId, "Capital One Auto", 620, 120, 6.49, 1.5, now, now).run(); return id; })(),
        (async () => { const id = uid(); await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,min_credit_score,max_advance_pct,buy_rate,reserve_pct,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`).bind(id, tenant.tenantId, "Chase Auto", 660, 110, 5.99, 1.25, now, now).run(); return id; })(),
        (async () => { const id = uid(); await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,min_credit_score,max_advance_pct,buy_rate,reserve_pct,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`).bind(id, tenant.tenantId, "Ally Financial", 600, 125, 7.25, 1.75, now, now).run(); return id; })(),
      ]);

      const mkDeal = async (customerId: string, vehicleId: string, salePrice: number, opts: { down?: number; termMonths?: number; rate?: number } = {}) => {
        const downCents = Math.round((opts.down || 0) * 100);
        const termMonths = opts.termMonths || 72;
        const rate = opts.rate ?? 7.49;
        const salePriceCents = salePrice * 100;
        const amountFinancedCents = Math.max(0, salePriceCents - downCents);
        const monthlyCents = monthlyPayment(amountFinancedCents, rate, termMonths);
        const vehicle = await db.prepare("SELECT acquisition_cost_cents FROM auto_inventory WHERE id=?").bind(vehicleId).first<{ acquisition_cost_cents: number }>();
        const frontGrossCents = salePriceCents - Number(vehicle?.acquisition_cost_cents || 0);
        const did = uid();
        await db.prepare(`INSERT INTO auto_deals
          (id,tenant_id,customer_id,vehicle_id,salesperson_email,sale_price_cents,down_payment_cents,amount_financed_cents,term_months,
           interest_rate,monthly_payment_cents,front_gross_cents,back_gross_cents,status,contract_status,funding_status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`)
          .bind(did, tenant.tenantId, customerId, vehicleId, tenant.email, salePriceCents, downCents, amountFinancedCents, termMonths,
            rate, monthlyCents, frontGrossCents, "WORKING", "NOT_STARTED", "NOT_SUBMITTED", now, now).run();
        await db.batch(DEAL_JACKET_CHECKLIST.map((doc) =>
          db.prepare("INSERT INTO auto_documents (id,tenant_id,deal_id,doc_type,checked,created_at,updated_at) VALUES (?,?,?,?,0,?,?)")
            .bind(uid(), tenant.tenantId, did, doc, now, now)));
        return did;
      };

      // Deal 1 — early-stage, working the desk
      await mkDeal(buyer1, veh1, 41995, { down: 3000 });

      // Deal 2 — submitted to lenders, one approved
      const deal2 = await mkDeal(buyer2, veh2, 35995, { down: 2000, rate: 6.49 });
      await db.prepare("UPDATE auto_deals SET status='SUBMITTED', updated_at=? WHERE tenant_id=? AND id=?").bind(now, tenant.tenantId, deal2).run();
      const sub2 = uid();
      await db.prepare(`INSERT INTO auto_lender_submissions (id,tenant_id,deal_id,lender_id,status,approved_rate,approved_term,approved_amount_cents,submitted_at,responded_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sub2, tenant.tenantId, deal2, lenderIds[1], "APPROVED", 6.49, 72, 3399500, now, now, now, now).run();

      // Deal 3 — fully funded, with an F&I product, signed contract, cleared compliance, complete jacket
      const deal3 = await mkDeal(buyer3, veh3, 29995, { down: 1500, rate: 5.99 });
      const prod3 = uid();
      await db.prepare(`INSERT INTO auto_deal_products (id,tenant_id,deal_id,product_type,name,price_cents,cost_cents,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(prod3, tenant.tenantId, deal3, "GAP", "GAP Insurance", 79500, 40000, now).run();
      await db.prepare("UPDATE auto_deals SET back_gross_cents=39500, updated_at=? WHERE id=?").bind(now, deal3).run();
      await db.prepare("UPDATE auto_documents SET checked=1, updated_at=? WHERE deal_id=?").bind(now, deal3).run();
      await db.prepare("UPDATE auto_deals SET contract_status='SENT', contract_sent_at=? WHERE id=?").bind(now, deal3).run();
      await db.prepare("UPDATE auto_deals SET contract_status='SIGNED', contract_signed_at=?, signer_name=?, signature_data=? WHERE id=?")
        .bind(now, "Diego Ramos", "Diego Ramos", deal3).run();
      const check3 = uid();
      await db.prepare(`INSERT INTO auto_compliance_checks (id,tenant_id,deal_id,screened_name,match_found,checked_by,checked_at) VALUES (?,?,?,?,0,?,?)`)
        .bind(check3, tenant.tenantId, deal3, "Diego Ramos", tenant.email, now).run();
      const deal3Row = await db.prepare("SELECT * FROM auto_deals WHERE id=?").bind(deal3).first<Record<string, unknown>>();
      await db.prepare("UPDATE auto_deals SET funding_status='FUNDED', status='FUNDED', updated_at=? WHERE id=?").bind(now, deal3).run();
      try {
        await postJournalEntry(tenant.tenantId, null, "DEAL_FUNDED", deal3, `Deal funded — ${buyer3}`, [
          { code: "1100", debitCents: Number(deal3Row?.sale_price_cents || 0) + 79500 },
          { code: "1300", creditCents: 25900 * 100 },
          { code: "4000", creditCents: Number(deal3Row?.front_gross_cents || 0) },
          { code: "4100", creditCents: 39500 },
          { code: "2200", creditCents: 40000 },
        ]);
      } catch (err) { console.error("seed_demo.journal_failed", err); }

      // Deal 4 — a digital-retailing lead, not yet worked
      const deal4 = uid();
      await db.prepare(`INSERT INTO auto_deals
        (id,tenant_id,customer_id,vehicle_id,sale_price_cents,status,contract_status,funding_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(deal4, tenant.tenantId, buyer4, veh4, 2649500, "DIGITAL_LEAD", "NOT_STARTED", "NOT_SUBMITTED", now, now).run();
      await db.batch(DEAL_JACKET_CHECKLIST.map((doc) =>
        db.prepare("INSERT INTO auto_documents (id,tenant_id,deal_id,doc_type,checked,created_at,updated_at) VALUES (?,?,?,?,0,?,?)")
          .bind(uid(), tenant.tenantId, deal4, doc, now, now)));

      // Fifth vehicle (veh5) stays unsold in inventory so Inventory view has an AVAILABLE unit too.

      // Compliance watchlist — one clearly-labeled example entry that won't match any seeded buyer.
      await db.prepare("INSERT INTO auto_watchlist (id,tenant_id,full_name,reason,created_at) VALUES (?,?,?,?,?)")
        .bind(uid(), tenant.tenantId, "Example Flagged Name", "Sample entry — replace with your dealership's own watchlist.", now).run();

      // Service Department
      const tech1 = uid();
      const tech2 = uid();
      await db.batch([
        db.prepare("INSERT INTO service_technicians (id,tenant_id,name,email,specialty,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").bind(tech1, tenant.tenantId, "James Okafor", "jokafor@example.com", "Drivetrain", now, now),
        db.prepare("INSERT INTO service_technicians (id,tenant_id,name,email,specialty,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").bind(tech2, tenant.tenantId, "Sara Kim", "skim@example.com", "Electrical", now, now),
      ]);
      const part1 = uid();
      const part2 = uid();
      await db.batch([
        db.prepare("INSERT INTO service_parts (id,tenant_id,part_number,description,quantity_on_hand,reorder_threshold,cost_cents,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(part1, tenant.tenantId, "OF-5W30", "Synthetic oil filter kit", 24, 5, 800, 2499, now, now),
        db.prepare("INSERT INTO service_parts (id,tenant_id,part_number,description,quantity_on_hand,reorder_threshold,cost_cents,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(part2, tenant.tenantId, "BP-4402", "Front brake pad set", 10, 3, 3200, 8900, now, now),
      ]);
      await db.prepare(`INSERT INTO service_appointments (id,tenant_id,customer_name,customer_phone,vehicle_description,requested_service,scheduled_at,advisor_email,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(), tenant.tenantId, "Priya Anand", "555-0198", "2023 Tesla Model 3", "Tire rotation", new Date(Date.now() + 86400000).toISOString(), tenant.email, "SCHEDULED", now, now).run();

      const ro1 = uid();
      await db.prepare(`INSERT INTO service_repair_orders (id,tenant_id,ro_number,customer_name,customer_phone,vin,year,make,model,technician_id,complaint,status,opened_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(ro1, tenant.tenantId, "RO-1001", "Marcus Ellison", "555-0142", "1FTFW1E50PFA10001", 2024, "Ford", "F-150", tech1, "Squeaking front brakes", "OPEN", now, now, now).run();
      await db.prepare(`INSERT INTO service_ro_lines (id,tenant_id,ro_id,line_type,description,part_id,quantity,unit_price_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(uid(), tenant.tenantId, ro1, "PARTS", "Front brake pad set", part2, 1, 8900, now).run();
      await db.prepare(`INSERT INTO service_ro_lines (id,tenant_id,ro_id,line_type,description,quantity,unit_price_cents,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(uid(), tenant.tenantId, ro1, "LABOR", "Brake pad replacement", 1.5, 9500, now).run();
      await db.prepare("UPDATE service_repair_orders SET labor_cents=14250, parts_cents=8900, total_cents=23150, updated_at=? WHERE id=?").bind(now, ro1).run();

      const ro2 = uid();
      await db.prepare(`INSERT INTO service_repair_orders (id,tenant_id,ro_number,customer_name,customer_phone,vin,year,make,model,technician_id,complaint,status,opened_at,closed_at,labor_cents,parts_cents,total_cents,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(ro2, tenant.tenantId, "RO-1002", "Olivia Bennett", "555-0163", "3GNAXUEV5PL100004", 2023, "Chevrolet", "Equinox", tech2, "Routine oil change", "INVOICED", now, now, 4500, 2499, 6999, now, now).run();
      await db.prepare(`INSERT INTO service_ro_lines (id,tenant_id,ro_id,line_type,description,part_id,quantity,unit_price_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(uid(), tenant.tenantId, ro2, "PARTS", "Synthetic oil filter kit", part1, 1, 2499, now).run();
      await db.prepare(`INSERT INTO service_ro_lines (id,tenant_id,ro_id,line_type,description,quantity,unit_price_cents,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(uid(), tenant.tenantId, ro2, "LABOR", "Oil & filter change", 0.5, 9000, now).run();
      try {
        await postJournalEntry(tenant.tenantId, null, "REPAIR_ORDER_INVOICED", ro2, "Repair order RO-1002 invoiced", [
          { code: "1200", debitCents: 6999 },
          { code: "4200", creditCents: 4500 },
          { code: "4300", creditCents: 2499 },
        ]);
      } catch (err) { console.error("seed_demo.ro_journal_failed", err); }

      await logAuditAction(tenant.tenantId, tenant.userId, tenant.email, "CREATE", "loan_application", deal3, { resourceName: "Demo data seeded" });
      return Response.json({ seeded: true }, { status: 201 });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive.post_failed", error);
    return Response.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (resource === "inventory") {
      const cols = inventoryColumns(body);
      if (body.stockNumber !== undefined) { const sn = cleanText(body.stockNumber, 40); if (sn) cols.stock_number = sn; }
      if (!Object.keys(cols).length) return Response.json({ updated: false });
      await db.prepare(`UPDATE auto_inventory SET ${Object.keys(cols).map((c) => `${c}=?`).join(",")}, updated_at=? WHERE tenant_id=? AND id=?`).bind(...Object.values(cols), now, tenant.tenantId, id).run();
      return Response.json({ updated: true });
    }

    if (resource === "lenders") {
      const updates: string[] = []; const vals: unknown[] = [];
      const num = (k: string, col: string) => { if (body[k] !== undefined) { updates.push(`${col}=?`); vals.push(body[k] === "" || body[k] === null ? null : Number(body[k])); } };
      if (body.name !== undefined) { const n = cleanText(body.name, 200); if (n) { updates.push("name=?"); vals.push(n); } }
      num("minCreditScore", "min_credit_score"); num("maxAdvancePct", "max_advance_pct"); num("buyRate", "buy_rate"); num("reservePct", "reserve_pct");
      if (body.active !== undefined) { updates.push("active=?"); vals.push(body.active ? 1 : 0); }
      if (body.notes !== undefined) { updates.push("notes=?"); vals.push(cleanText(body.notes, 1000) || null); }
      if (body.lenderType !== undefined) { updates.push("lender_type=?"); vals.push(cleanText(body.lenderType, 30).toUpperCase() || null); }
      if (body.region !== undefined) { updates.push("region=?"); vals.push(cleanText(body.region, 60) || null); }
      if (body.website !== undefined) { updates.push("website=?"); vals.push(cleanText(body.website, 300) || null); }
      if (body.phone !== undefined) { updates.push("phone=?"); vals.push(cleanText(body.phone, 40) || null); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now, tenant.tenantId, id);
      await db.prepare(`UPDATE auto_lenders SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "contract") {
      const dealId = id;
      const signerName = cleanText(body.signerName, 200);
      const signatureData = cleanText(body.signatureData, 20000);
      if (!signerName || !signatureData) return Response.json({ error: "signerName and signatureData are required." }, { status: 400 });
      const deal = await db.prepare("SELECT contract_status FROM auto_deals WHERE tenant_id=? AND id=?").bind(tenant.tenantId, dealId).first<{ contract_status: string }>();
      if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
      if (deal.contract_status !== "SENT") return Response.json({ error: "The contract must be sent to the buyer before it can be signed." }, { status: 400 });
      await db.prepare(`UPDATE auto_deals SET contract_status='SIGNED', contract_signed_at=?, signer_name=?, signature_data=?, updated_at=?
        WHERE tenant_id=? AND id=?`).bind(now, signerName, signatureData, now, tenant.tenantId, dealId).run();
      return Response.json({ signed: true });
    }

    if (resource === "deals") {
      // Recompute amount financed + payment whenever a structure input changes,
      // so the calculator is always driven off real, persisted numbers.
      const current = await db.prepare("SELECT * FROM auto_deals WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first<Record<string, unknown>>();
      if (!current) return Response.json({ error: "Deal not found." }, { status: 404 });

      if (body.fundingStatus === "FUNDED") {
        const nextContractStatus = body.contractStatus !== undefined ? cleanText(body.contractStatus, 20) : String(current.contract_status || "");
        if (nextContractStatus !== "SIGNED") {
          return Response.json({ error: "The retail contract must be signed before this deal can be funded." }, { status: 400 });
        }
        const uncheckedDocs = await db.prepare("SELECT COUNT(*) c FROM auto_documents WHERE tenant_id=? AND deal_id=? AND checked=0").bind(tenant.tenantId, id).first<{ c: number }>();
        if (Number(uncheckedDocs?.c || 0) > 0) {
          return Response.json({ error: `${uncheckedDocs?.c} deal-jacket document(s) are still unchecked — complete the checklist before funding.` }, { status: 400 });
        }
        const latestCheck = await db.prepare("SELECT match_found FROM auto_compliance_checks WHERE tenant_id=? AND deal_id=? ORDER BY checked_at DESC LIMIT 1").bind(tenant.tenantId, id).first<{ match_found: number }>();
        if (!latestCheck) {
          return Response.json({ error: "Run an OFAC / red-flag compliance screening on this buyer before funding." }, { status: 400 });
        }
        if (latestCheck.match_found) {
          return Response.json({ error: "The most recent compliance screening flagged a possible match — resolve it before funding." }, { status: 400 });
        }
      }
      const next = {
        sale_price_cents: body.salePrice !== undefined ? Math.round(Number(body.salePrice) * 100) : Number(current.sale_price_cents),
        trade_allowance_cents: body.tradeAllowance !== undefined ? Math.round(Number(body.tradeAllowance) * 100) : Number(current.trade_allowance_cents),
        trade_payoff_cents: body.tradePayoff !== undefined ? Math.round(Number(body.tradePayoff) * 100) : Number(current.trade_payoff_cents),
        down_payment_cents: body.downPayment !== undefined ? Math.round(Number(body.downPayment) * 100) : Number(current.down_payment_cents),
        tax_cents: body.tax !== undefined ? Math.round(Number(body.tax) * 100) : Number(current.tax_cents),
        fees_cents: body.fees !== undefined ? Math.round(Number(body.fees) * 100) : Number(current.fees_cents),
        term_months: body.termMonths !== undefined ? Number(body.termMonths) : Number(current.term_months),
        interest_rate: body.interestRate !== undefined ? Number(body.interestRate) : Number(current.interest_rate),
      };
      const amountFinancedCents = Math.max(0, next.sale_price_cents - next.trade_allowance_cents + next.trade_payoff_cents - next.down_payment_cents + next.tax_cents + next.fees_cents);
      const monthlyPaymentCents = monthlyPayment(amountFinancedCents, next.interest_rate, next.term_months);
      const frontGrossCents = next.sale_price_cents - Number((await db.prepare("SELECT acquisition_cost_cents FROM auto_inventory WHERE id=?").bind(current.vehicle_id).first<{ acquisition_cost_cents: number | null }>())?.acquisition_cost_cents || 0);
      const updates: string[] = [
        "sale_price_cents=?", "trade_allowance_cents=?", "trade_payoff_cents=?", "down_payment_cents=?",
        "tax_cents=?", "fees_cents=?", "term_months=?", "interest_rate=?", "amount_financed_cents=?", "monthly_payment_cents=?", "front_gross_cents=?",
      ];
      const vals: unknown[] = [
        next.sale_price_cents, next.trade_allowance_cents, next.trade_payoff_cents, next.down_payment_cents,
        next.tax_cents, next.fees_cents, next.term_months, next.interest_rate, amountFinancedCents, monthlyPaymentCents, frontGrossCents,
      ];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 20)); }
      else if (body.fundingStatus === "FUNDED") { updates.push("status=?"); vals.push("FUNDED"); }
      if (body.contractStatus !== undefined) { updates.push("contract_status=?"); vals.push(cleanText(body.contractStatus, 20)); }
      if (body.fundingStatus !== undefined) { updates.push("funding_status=?"); vals.push(cleanText(body.fundingStatus, 20)); }
      if (body.financeManagerEmail !== undefined) { updates.push("finance_manager_email=?"); vals.push(cleanText(body.financeManagerEmail, 254) || null); }
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE auto_deals SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();

      if (body.fundingStatus === "FUNDED") {
        const acquisitionCostCents = Number((await db.prepare("SELECT acquisition_cost_cents FROM auto_inventory WHERE id=?").bind(current.vehicle_id).first<{ acquisition_cost_cents: number | null }>())?.acquisition_cost_cents || 0);
        const products = await db.prepare("SELECT COALESCE(SUM(price_cents),0) price, COALESCE(SUM(cost_cents),0) cost FROM auto_deal_products WHERE deal_id=?").bind(id).first<{ price: number; cost: number }>();
        const productPriceCents = Number(products?.price || 0);
        const productCostCents = Number(products?.cost || 0);
        const backGrossCents = Number(current.back_gross_cents || 0);
        try {
          await postJournalEntry(tenant.tenantId, cleanText(current.store_id as string, 80) || null, "DEAL_FUNDED", id,
            `Deal funded — ${current.customer_id}`,
            [
              { code: "1100", debitCents: next.sale_price_cents + productPriceCents },
              { code: "1300", creditCents: acquisitionCostCents },
              { code: "4000", creditCents: frontGrossCents },
              { code: "4100", creditCents: backGrossCents },
              { code: "2200", creditCents: productCostCents },
            ],
          );
        } catch (err) {
          console.error("automotive.journal_post_failed", err);
        }
      }
      return Response.json({ updated: true, amountFinancedCents, monthlyPaymentCents });
    }

    if (resource === "submissions") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 30)); updates.push("responded_at=?"); vals.push(now); }
      if (body.approvedRate !== undefined) { updates.push("approved_rate=?"); vals.push(Number(body.approvedRate)); }
      if (body.approvedTerm !== undefined) { updates.push("approved_term=?"); vals.push(Number(body.approvedTerm)); }
      if (body.approvedAmount !== undefined) { updates.push("approved_amount_cents=?"); vals.push(Math.round(Number(body.approvedAmount) * 100)); }
      if (body.declineReason !== undefined) { updates.push("decline_reason=?"); vals.push(cleanText(body.declineReason, 500) || null); }
      if (body.stipulations !== undefined) { updates.push("stipulations=?"); vals.push(JSON.stringify(Array.isArray(body.stipulations) ? body.stipulations : [])); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE auto_lender_submissions SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    if (resource === "documents") {
      const checked = body.checked !== undefined ? (body.checked ? 1 : 0) : undefined;
      if (checked === undefined) return Response.json({ updated: false });
      await db.prepare("UPDATE auto_documents SET checked=?, updated_at=? WHERE tenant_id=? AND id=?").bind(checked, now, tenant.tenantId, id).run();
      return Response.json({ updated: true });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive.patch_failed", error);
    return Response.json({ error: "Unable to update." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    if (resource === "products") {
      const row = await db.prepare("SELECT deal_id FROM auto_deal_products WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first<{ deal_id: string }>();
      await db.prepare("DELETE FROM auto_deal_products WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).run();
      if (row) {
        const totals = await db.prepare("SELECT COALESCE(SUM(price_cents-cost_cents),0) g FROM auto_deal_products WHERE deal_id=?").bind(row.deal_id).first<{ g: number }>();
        await db.prepare("UPDATE auto_deals SET back_gross_cents=?, updated_at=? WHERE id=?").bind(Number(totals?.g || 0), new Date().toISOString(), row.deal_id).run();
      }
      return Response.json({ deleted: true });
    }
    if (resource === "watchlist") {
      await db.prepare("DELETE FROM auto_watchlist WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).run();
      return Response.json({ deleted: true });
    }
    if (resource === "inventory") {
      const inDeal = await db.prepare("SELECT COUNT(*) AS n FROM auto_deals WHERE tenant_id=? AND vehicle_id=?").bind(tenant.tenantId, id).first<{ n: number }>();
      if (Number(inDeal?.n || 0) > 0) return Response.json({ error: "This vehicle is attached to a deal. Mark it Sold or Wholesale instead of deleting it." }, { status: 409 });
      await db.prepare("DELETE FROM auto_inventory WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).run();
      return Response.json({ deleted: true });
    }
    if (resource === "inventory-bulk") {
      const ids = String(url.searchParams.get("ids") || id).split(",").map((x) => cleanText(x, 80)).filter(Boolean);
      let deleted = 0, blocked = 0;
      for (const vid of ids) {
        const inDeal = await db.prepare("SELECT COUNT(*) AS n FROM auto_deals WHERE tenant_id=? AND vehicle_id=?").bind(tenant.tenantId, vid).first<{ n: number }>();
        if (Number(inDeal?.n || 0) > 0) { blocked++; continue; }
        await db.prepare("DELETE FROM auto_inventory WHERE tenant_id=? AND id=?").bind(tenant.tenantId, vid).run(); deleted++;
      }
      return Response.json({ deleted, blocked });
    }
    if (resource === "lenders") {
      const used = await db.prepare("SELECT COUNT(*) AS n FROM auto_lender_submissions WHERE tenant_id=? AND lender_id=?").bind(tenant.tenantId, id).first<{ n: number }>();
      if (Number(used?.n || 0) > 0) {
        await db.prepare("UPDATE auto_lenders SET active=0, updated_at=? WHERE tenant_id=? AND id=?").bind(new Date().toISOString(), tenant.tenantId, id).run();
        return Response.json({ deleted: false, deactivated: true, reason: "This lender has submissions on file, so it was deactivated instead of deleted." });
      }
      await db.prepare("DELETE FROM auto_lenders WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).run();
      return Response.json({ deleted: true });
    }
    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive.delete_failed", error);
    return Response.json({ error: "Unable to delete." }, { status: 500 });
  }
}
