import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { env } from "cloudflare:workers";

type CfEnv = Record<string, string | undefined>;

async function requireDispatchAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT role,active FROM workspace_members WHERE email=?").bind(email).first<{ role: string; active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

const CATEGORIES = ["PARTS", "MATERIALS", "TOOLS", "CONSUMABLES", "SAFETY", "EQUIPMENT", "OTHER"];
const LOCATIONS = ["TRUCK", "WAREHOUSE", "SHOP", "JOB_SITE", "OTHER"];
const num = (v: unknown): number | null => { if (v === undefined || v === null || v === "") return null; const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const cents = (v: unknown): number | null => { const n = num(v); return n === null ? null : Math.round(n * 100); };
const upper = (v: unknown, allowed: string[], fallback: string | null) => { const t = cleanText(v, 30).toUpperCase().replace(/[\s-]+/g, "_"); return allowed.includes(t) ? t : fallback; };

/** Normalise one item body (from the scanner or a manual form) into columns. */
function itemColumns(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.name !== undefined) out.name = cleanText(body.name, 200);
  if (body.category !== undefined) out.category = upper(body.category, CATEGORIES, "OTHER");
  if (body.brand !== undefined) out.brand = cleanText(body.brand, 100) || null;
  if (body.size !== undefined) out.size = cleanText(body.size, 100) || null;
  if (body.sku !== undefined) out.sku = cleanText(body.sku, 100) || null;
  if (body.quantity !== undefined) out.quantity = Math.max(0, num(body.quantity) ?? 0);
  if (body.unit !== undefined) out.unit = cleanText(body.unit, 30) || null;
  if (body.minQuantity !== undefined) out.min_quantity = num(body.minQuantity);
  if (body.unitCost !== undefined) out.unit_cost_cents = cents(body.unitCost);
  if (body.location !== undefined) out.location = upper(body.location, LOCATIONS, null);
  if (body.condition !== undefined) out.condition = cleanText(body.condition, 40) || null;
  if (body.notes !== undefined) out.notes = cleanText(body.notes, 1000) || null;
  return out;
}

export type ScanItem = {
  name: string; category: string; quantity: number; unit: string; brand: string; size: string; condition: string;
  confidence: "high" | "medium" | "low"; notes: string;
};

/** Pull a JSON array/object out of a model reply that may be wrapped in prose or code fences. */
export function parseScanReply(text: string): { items: ScanItem[]; summary: string } {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in reply");
  const raw = JSON.parse(cleaned.slice(start, end + 1)) as { items?: unknown[]; summary?: unknown };
  const items = (Array.isArray(raw.items) ? raw.items : []).map((r) => {
    const o = (r || {}) as Record<string, unknown>;
    const conf = String(o.confidence || "medium").toLowerCase();
    return {
      name: cleanText(o.name, 200), category: upper(o.category, CATEGORIES, "OTHER") as string,
      quantity: Math.max(0, num(o.quantity) ?? 1), unit: cleanText(o.unit, 30) || "each",
      brand: cleanText(o.brand, 100), size: cleanText(o.size, 100), condition: cleanText(o.condition, 40),
      confidence: (conf === "high" || conf === "low" ? conf : "medium") as ScanItem["confidence"], notes: cleanText(o.notes, 300),
    };
  }).filter((i) => i.name);
  return { items, summary: cleanText(raw.summary, 500) };
}

const SCAN_PROMPT = `You are an inventory clerk for a field-service company (HVAC, plumbing, electrical, landscaping, cleaning and similar trades). The photo shows stock on a truck shelf, in a warehouse, a shop, or a job site.

List every distinct item you can identify. For each item give:
- name: short plain name a tech would use (e.g. "PVC elbow 3/4in", "Nitrile gloves", "Copper fitting 1/2in", "Cordless drill")
- category: one of PARTS, MATERIALS, TOOLS, CONSUMABLES, SAFETY, EQUIPMENT, OTHER
- quantity: your best count. Count individual pieces when they are visible; for boxes or bags count the containers and say so in notes. If you truly cannot count, estimate and set confidence to low.
- unit: each, box, bag, roll, ft, gal, case, pair, set, or similar
- brand: brand name if printed and legible, else ""
- size: size or spec if legible (e.g. "3/4in", "10mm", "50ft"), else ""
- condition: new, used, opened, damaged, or ""
- confidence: high, medium, or low for the identification and count together
- notes: anything useful (partial box, label unreadable, mixed sizes)

Only list what is actually visible. Do not invent items. Merge duplicates of the same item into one line with the total quantity.

Respond with ONLY a JSON object of the form {"summary": "<one sentence about what the photo shows>", "items": [ ... ]} and nothing else.`;

async function scanImage(image: string, mediaType: string, hint: string): Promise<{ items: ScanItem[]; summary: string; model: string }> {
  const apiKey = (env as CfEnv).ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error("ANTHROPIC_API_KEY is not configured on this deployment, so photo analysis is off. Add it with `npx wrangler secret put ANTHROPIC_API_KEY`."), { status: 503 });
  const model = "claude-opus-5";
  const baseUrl = ((env as CfEnv).ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      output_config: { effort: "medium" },
      system: SCAN_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: hint ? `Context from the tech: ${hint}. Now list the items in this photo.` : "List the items in this photo." },
        ],
      }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn("dispatch.inventory.scan_failed", response.status, detail.slice(0, 300));
    let apiMessage = "";
    try { apiMessage = String((JSON.parse(detail) as { error?: { message?: string } }).error?.message || ""); } catch { /* not JSON */ }
    const friendly = response.status === 401 ? "The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret."
      : response.status === 429 ? "The AI service is rate-limited right now. Try again in a moment."
      : /credit|billing|balance/i.test(apiMessage) ? `Anthropic says: ${apiMessage} Add credits at console.anthropic.com and try again.`
      : response.status === 400 && apiMessage ? `The AI service rejected the request: ${apiMessage}`
      : "The AI service could not analyze this photo.";
    throw Object.assign(new Error(friendly), { status: 502 });
  }
  type Reply = { stop_reason?: string; content?: Array<{ type: string; text?: string }> };
  const data = (await response.json()) as Reply;
  if (data.stop_reason === "refusal") throw Object.assign(new Error("The AI declined to analyze this photo."), { status: 422 });
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("\n");
  const parsed = parseScanReply(text);
  return { ...parsed, model };
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const db = coreDb();
    const { results } = await db.prepare("SELECT * FROM dispatch_inventory ORDER BY updated_at DESC LIMIT 2000").all();
    const items = results as Array<{ quantity: number; min_quantity: number | null; unit_cost_cents: number | null; source: string; updated_at: string }>;
    const low = items.filter((i) => i.min_quantity !== null && Number(i.quantity) <= Number(i.min_quantity)).length;
    const valueCents = items.reduce((a, i) => a + (Number(i.unit_cost_cents) || 0) * Number(i.quantity || 0), 0);
    const lastScan = items.filter((i) => i.source === "SCAN").map((i) => i.updated_at).sort().pop() || null;
    return Response.json({ items, summary: { count: items.length, low, valueCents, lastScan, scanEnabled: Boolean((env as CfEnv).ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) } });
  } catch (error) {
    console.error("dispatch.inventory.list_failed", error);
    return Response.json({ error: "Unable to load inventory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const body = (await request.json()) as Record<string, unknown>;
    const db = coreDb();
    const now = new Date().toISOString();

    if (action === "scan") {
      const image = typeof body.image === "string" ? body.image.replace(/^data:[^;]+;base64,/, "") : "";
      const mediaType = cleanText(body.mediaType, 40) || "image/jpeg";
      if (!image) return Response.json({ error: "Attach a photo first." }, { status: 400 });
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) return Response.json({ error: "Use a JPEG, PNG, WebP or GIF photo." }, { status: 400 });
      if (image.length > 7_000_000) return Response.json({ error: "That photo is too large. Keep it under 5 MB." }, { status: 413 });
      try {
        const result = await scanImage(image, mediaType, cleanText(body.hint, 300));
        return Response.json(result);
      } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status) return Response.json({ error: e.message }, { status: e.status });
        console.warn("dispatch.inventory.scan_parse_failed", e);
        return Response.json({ error: "The AI reply could not be read as an item list. Try a clearer, closer photo." }, { status: 502 });
      }
    }

    // Bulk add (from the scanner) or single add. `merge: true` tops up quantity on an existing item with the same name + location.
    const rows = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [body];
    if (!rows.length) return Response.json({ error: "No items to add." }, { status: 400 });
    if (rows.length > 500) return Response.json({ error: "Add at most 500 items at a time." }, { status: 400 });
    const merge = body.merge !== false;
    const source = cleanText(body.source, 20).toUpperCase() === "SCAN" ? "SCAN" : "MANUAL";
    let inserted = 0, merged = 0; const errors: string[] = []; const ids: string[] = [];
    for (const [i, row] of rows.entries()) {
      const cols = itemColumns(row);
      if (!cols.name) { errors.push(`Row ${i + 1}: missing name`); continue; }
      if (!("category" in cols)) cols.category = "OTHER";
      if (!("quantity" in cols)) cols.quantity = 1;
      if (row.confidence !== undefined) cols.scan_confidence = cleanText(row.confidence, 10).toLowerCase() || null;
      const existing = merge
        ? await db.prepare("SELECT id, quantity FROM dispatch_inventory WHERE lower(name)=lower(?) AND COALESCE(location,'')=COALESCE(?,'') LIMIT 1").bind(cols.name, cols.location ?? null).first<{ id: string; quantity: number }>()
        : null;
      if (existing) {
        await db.prepare("UPDATE dispatch_inventory SET quantity=?, source=?, scan_confidence=COALESCE(?, scan_confidence), updated_at=? WHERE id=?")
          .bind(Number(existing.quantity || 0) + Number(cols.quantity || 0), source, cols.scan_confidence ?? null, now, existing.id).run();
        merged++; ids.push(existing.id);
      } else {
        const id = crypto.randomUUID();
        const names = ["id", ...Object.keys(cols), "source", "created_at", "updated_at"];
        const values = [id, ...Object.values(cols), source, now, now];
        await db.prepare(`INSERT INTO dispatch_inventory (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).bind(...values).run();
        inserted++; ids.push(id);
      }
    }
    return Response.json({ inserted, merged, errors, ids }, { status: 201 });
  } catch (error) {
    console.error("dispatch.inventory.create_failed", error);
    return Response.json({ error: "Unable to add inventory." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const cols = itemColumns(body);
    if ("name" in cols && !cols.name) delete cols.name;
    if (!Object.keys(cols).length) return Response.json({ updated: false });
    await coreDb().prepare(`UPDATE dispatch_inventory SET ${Object.keys(cols).map((c) => `${c}=?`).join(",")}, updated_at=? WHERE id=?`).bind(...Object.values(cols), new Date().toISOString(), id).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("dispatch.inventory.update_failed", error);
    return Response.json({ error: "Unable to update item." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const url = new URL(request.url);
    const ids = String(url.searchParams.get("ids") || url.searchParams.get("id") || "").split(",").map((x) => cleanText(x, 80)).filter(Boolean);
    if (!ids.length) return Response.json({ error: "id is required." }, { status: 400 });
    const db = coreDb();
    for (const id of ids) await db.prepare("DELETE FROM dispatch_inventory WHERE id=?").bind(id).run();
    return Response.json({ deleted: ids.length });
  } catch (error) {
    console.error("dispatch.inventory.delete_failed", error);
    return Response.json({ error: "Unable to delete item." }, { status: 500 });
  }
}
