/**
 * Cyncro Automotive — multi-store + accounting backbone API.
 *
 * A single Next.js route file (no catch-all segment) — resource, id and
 * action are query params instead of URL path segments.
 *
 * GET  /api/automotive-accounting?resource=stores
 * POST /api/automotive-accounting?resource=stores
 * PATCH /api/automotive-accounting?resource=stores&id=X
 * GET  /api/automotive-accounting?resource=accounts — chart of accounts with computed balances
 * GET  /api/automotive-accounting?resource=journal — recent journal entries
 * GET  /api/automotive-accounting?resource=journal&id=X — one entry's lines
 */
import { cleanText, ensureCoreSchema, getTenantContext, coreDb } from "@/lib/core/db";
import { ensureChartOfAccounts } from "@/lib/core/accounting";

function uid() {
  return crypto.randomUUID();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = coreDb();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = url.searchParams.get("id") || undefined;

    if (resource === "stores") {
      const { results } = await db.prepare("SELECT * FROM auto_stores WHERE tenant_id=? ORDER BY created_at").bind(tenant.tenantId).all();
      if (!(results || []).length) {
        // Lazily seed a default store the first time this dealer looks — every
        // existing inventory/deal/RO with a null store_id belongs here.
        const now = new Date().toISOString();
        const storeId = uid();
        await db.prepare("INSERT INTO auto_stores (id,tenant_id,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)")
          .bind(storeId, tenant.tenantId, "Main Store", now, now).run();
        const { results: seeded } = await db.prepare("SELECT * FROM auto_stores WHERE tenant_id=?").bind(tenant.tenantId).all();
        return Response.json({ stores: seeded });
      }
      return Response.json({ stores: results });
    }

    if (resource === "accounts") {
      await ensureChartOfAccounts(tenant.tenantId);
      const { results } = await db.prepare(`
        SELECT a.id, a.code, a.name, a.account_type,
          COALESCE(SUM(l.debit_cents),0) AS total_debits,
          COALESCE(SUM(l.credit_cents),0) AS total_credits
        FROM accounting_accounts a
        LEFT JOIN accounting_journal_lines l ON l.account_id = a.id
        WHERE a.tenant_id=?
        GROUP BY a.id
        ORDER BY a.code
      `).bind(tenant.tenantId).all<{ id: string; code: string; name: string; account_type: string; total_debits: number; total_credits: number }>();
      const accounts = (results || []).map((a) => {
        const normalDebit = a.account_type === "ASSET" || a.account_type === "EXPENSE";
        const balanceCents = normalDebit ? a.total_debits - a.total_credits : a.total_credits - a.total_debits;
        return { ...a, balanceCents };
      });
      return Response.json({ accounts });
    }

    if (resource === "journal") {
      if (id) {
        const entry = await db.prepare("SELECT * FROM accounting_journal_entries WHERE tenant_id=? AND id=?").bind(tenant.tenantId, id).first();
        if (!entry) return Response.json({ error: "Entry not found." }, { status: 404 });
        const lines = await db.prepare(`SELECT l.*, a.code, a.name FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.entry_id=?`).bind(id).all();
        return Response.json({ entry, lines: lines.results });
      }
      const { results } = await db.prepare("SELECT * FROM accounting_journal_entries WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(tenant.tenantId).all();
      return Response.json({ entries: results });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_accounting.get_failed", error);
    return Response.json({ error: "Unable to load accounting data." }, { status: 500 });
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

    if (resource === "stores") {
      const name = cleanText(body.name, 200);
      if (!name) return Response.json({ error: "name is required." }, { status: 400 });
      const id = uid();
      await db.prepare("INSERT INTO auto_stores (id,tenant_id,name,address,phone,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)")
        .bind(id, tenant.tenantId, name, cleanText(body.address, 300) || null, cleanText(body.phone, 40) || null, now, now).run();
      return Response.json({ id }, { status: 201 });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_accounting.post_failed", error);
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

    if (resource === "stores") {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (body.active !== undefined) { updates.push("active=?"); vals.push(body.active ? 1 : 0); }
      if (body.address !== undefined) { updates.push("address=?"); vals.push(cleanText(body.address, 300) || null); }
      if (!updates.length) return Response.json({ updated: false });
      updates.push("updated_at=?"); vals.push(now);
      vals.push(tenant.tenantId, id);
      await db.prepare(`UPDATE auto_stores SET ${updates.join(",")} WHERE tenant_id=? AND id=?`).bind(...vals).run();
      return Response.json({ updated: true });
    }

    return Response.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    console.error("automotive_accounting.patch_failed", error);
    return Response.json({ error: "Unable to update." }, { status: 500 });
  }
}
