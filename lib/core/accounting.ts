/**
 * Cyncro Automotive — accounting backbone.
 *
 * A minimal but real double-entry ledger: a standard dealership chart of
 * accounts, seeded lazily per tenant, and journal entries auto-posted when
 * a deal is marked FUNDED or a repair order is marked INVOICED/CLOSED.
 * Every entry is verified balanced (sum debits === sum credits) before
 * it's written — if the math doesn't balance, it throws rather than
 * silently posting bad books.
 */
import { coreDb } from "@/lib/core/db";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

const CHART_OF_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1100", name: "Contracts in Transit", type: "ASSET" },
  { code: "1200", name: "Accounts Receivable — Service", type: "ASSET" },
  { code: "1300", name: "Vehicle Inventory", type: "ASSET" },
  { code: "2100", name: "Sales Tax Payable", type: "LIABILITY" },
  { code: "2200", name: "Accounts Payable — F&I Product Providers", type: "LIABILITY" },
  { code: "4000", name: "Vehicle Gross Profit", type: "REVENUE" },
  { code: "4100", name: "F&I Gross Profit", type: "REVENUE" },
  { code: "4200", name: "Labor Revenue", type: "REVENUE" },
  { code: "4300", name: "Parts Revenue", type: "REVENUE" },
  { code: "4400", name: "Sublet Revenue", type: "REVENUE" },
  { code: "5000", name: "F&I Product Cost", type: "EXPENSE" },
];

export async function ensureChartOfAccounts(tenantId: string): Promise<Record<string, string>> {
  const db = coreDb();
  const existing = await db.prepare("SELECT id, code FROM accounting_accounts WHERE tenant_id=?").bind(tenantId).all<{ id: string; code: string }>();
  const byCode: Record<string, string> = {};
  for (const row of existing.results || []) byCode[row.code] = row.id;
  const missing = CHART_OF_ACCOUNTS.filter((a) => !byCode[a.code]);
  if (missing.length) {
    const now = new Date().toISOString();
    await db.batch(missing.map((a) => {
      const id = crypto.randomUUID();
      byCode[a.code] = id;
      return db.prepare("INSERT INTO accounting_accounts (id,tenant_id,code,name,account_type,created_at) VALUES (?,?,?,?,?,?)")
        .bind(id, tenantId, a.code, a.name, a.type, now);
    }));
  }
  return byCode;
}

export async function postJournalEntry(
  tenantId: string,
  storeId: string | null,
  sourceType: string,
  sourceId: string,
  description: string,
  lines: { code: string; debitCents?: number; creditCents?: number }[],
): Promise<{ posted: boolean; reason?: string }> {
  const db = coreDb();
  const already = await db.prepare("SELECT id FROM accounting_journal_entries WHERE tenant_id=? AND source_type=? AND source_id=?").bind(tenantId, sourceType, sourceId).first<{ id: string }>();
  if (already) return { posted: false, reason: "already_posted" };

  const totalDebits = lines.reduce((sum, l) => sum + (l.debitCents || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditCents || 0), 0);
  if (totalDebits !== totalCredits) {
    throw new Error(`Journal entry for ${sourceType}:${sourceId} does not balance (debits ${totalDebits} != credits ${totalCredits})`);
  }
  if (totalDebits === 0) return { posted: false, reason: "zero_amount" };

  const accounts = await ensureChartOfAccounts(tenantId);
  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const statements = [
    db.prepare("INSERT INTO accounting_journal_entries (id,tenant_id,store_id,source_type,source_id,description,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(entryId, tenantId, storeId, sourceType, sourceId, description, now),
    ...lines.filter((l) => (l.debitCents || 0) > 0 || (l.creditCents || 0) > 0).map((l) => {
      const accountId = accounts[l.code];
      if (!accountId) throw new Error(`Unknown chart-of-accounts code: ${l.code}`);
      return db.prepare("INSERT INTO accounting_journal_lines (id,entry_id,account_id,debit_cents,credit_cents) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, accountId, l.debitCents || 0, l.creditCents || 0);
    }),
  ];
  await db.batch(statements);
  return { posted: true };
}
