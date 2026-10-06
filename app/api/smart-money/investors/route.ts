import { cleanText } from "@/lib/core/db";
import { investorPortfolio, syncInvestor } from "@/lib/smart-money/engine";
import { setMeta, smartMoneyDb } from "@/lib/smart-money/db";
import { normalizeCik } from "@/lib/smart-money/investors";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

/** GET ?cik= → that investor's portfolio with quarter-over-quarter changes. */
export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const cik = normalizeCik(new URL(request.url).searchParams.get("cik"));
    if (!cik) return Response.json({ error: "A valid SEC CIK is required." }, { status: 400 });
    const data = await investorPortfolio(cik);
    if (!data) return Response.json({ error: "Investor is not on the radar." }, { status: 404 });
    return Response.json(data);
  } catch (error) {
    return smartMoneyError("portfolio", error);
  }
}

/** Adds any 13F filer by CIK to the radar and runs the first sync. */
export async function POST(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const body = (await request.json()) as Record<string, unknown>;
    const cik = normalizeCik(body.cik);
    if (!cik) return Response.json({ error: "A valid SEC CIK is required." }, { status: 400 });
    const name = cleanText(body.name, 80) || `Filer ${Number(cik)}`;
    const fund = cleanText(body.fund, 120) || name;
    const db = smartMoneyDb();
    const existing = await db.prepare("SELECT cik FROM sm_investors WHERE cik=?").bind(cik).first();
    if (existing) return Response.json({ error: "That filer is already on the radar." }, { status: 409 });
    await db
      .prepare("INSERT INTO sm_investors (cik,name,fund,style,is_custom,created_at) VALUES (?,?,?,?,1,?)")
      .bind(cik, name, fund, cleanText(body.style, 60) || "Custom watch", new Date().toISOString())
      .run();
    try {
      const result = await syncInvestor(cik);
      return Response.json({ cik, added: true, sync: result }, { status: 201 });
    } catch (error) {
      return Response.json({ cik, added: true, syncError: error instanceof Error ? error.message : "Sync failed" }, { status: 201 });
    }
  } catch (error) {
    return smartMoneyError("add-investor", error);
  }
}

/** Removes a custom investor (curated billionaires stay). */
export async function DELETE(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const cik = normalizeCik(new URL(request.url).searchParams.get("cik"));
    if (!cik) return Response.json({ error: "A valid SEC CIK is required." }, { status: 400 });
    const db = smartMoneyDb();
    const row = await db.prepare("SELECT is_custom FROM sm_investors WHERE cik=?").bind(cik).first<{ is_custom: number }>();
    if (!row) return Response.json({ error: "Investor is not on the radar." }, { status: 404 });
    if (!row.is_custom) return Response.json({ error: "Curated billionaires cannot be removed." }, { status: 400 });
    await db.batch([
      db.prepare("DELETE FROM sm_holdings WHERE cik=?").bind(cik),
      db.prepare("DELETE FROM sm_investors WHERE cik=?").bind(cik),
    ]);
    await setMeta("data_version", String(Date.now()));
    return Response.json({ removed: cik });
  } catch (error) {
    return smartMoneyError("remove-investor", error);
  }
}
