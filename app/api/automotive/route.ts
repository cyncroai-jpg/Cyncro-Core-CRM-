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
      const { results } = await db.prepare("SELECT * FROM auto_inventory WHERE tenant_id=? ORDER BY created_at DESC LIMIT 300").bind(tenant.tenantId).all();
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
      const id = uid();
      await db.prepare(`INSERT INTO auto_inventory
        (id,tenant_id,stock_number,vin,year,make,model,trim,mileage,book_value_cents,asking_price_cents,acquisition_cost_cents,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          id, tenant.tenantId, stockNumber, cleanText(body.vin, 20) || null,
          body.year !== undefined ? Number(body.year) : null, cleanText(body.make, 60) || null, cleanText(body.model, 60) || null, cleanText(body.trim, 60) || null,
          body.mileage !== undefined ? Number(body.mileage) : null,
          body.bookValue !== undefined ? Math.round(Number(body.bookValue) * 100) : null,
          Math.round(Number(body.askingPrice || 0) * 100),
          body.acquisitionCost !== undefined ? Math.round(Number(body.acquisitionCost) * 100) : null,
          "AVAILABLE", now, now,
        ).run();
      return Response.json({ id }, { status: 201 });
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
      await db.prepare(`INSERT INTO auto_lenders (id,tenant_id,name,min_credit_score,max_advance_pct,buy_rate,reserve_pct,active,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?,?)`)
        .bind(id, tenant.tenantId, name,
          body.minCreditScore !== undefined ? Number(body.minCreditScore) : null,
          body.maxAdvancePct !== undefined ? Number(body.maxAdvancePct) : null,
          body.buyRate !== undefined ? Number(body.buyRate) : null,
          body.reservePct !== undefined ? Number(body.reservePct) : null,
          cleanText(body.notes, 1000) || null, now, now).run();
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
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.status !== undefined) { updates.push("status=?"); vals.push(cleanText(body.status, 20)); }
      if (body.askingPrice !== undefined) { updates.push("asking_price_cents=?"); vals.push(Math.round(Number(body.askingPrice) * 100)); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE auto_inventory SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
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
    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive.delete_failed", error);
    return Response.json({ error: "Unable to delete." }, { status: 500 });
  }
}
