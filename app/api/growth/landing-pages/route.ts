import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { normalizeSections } from "@/lib/growth/sectionTypes";

/** Re-serializes sections_json through normalizeSections so a page saved under an older schema (or with an unrecognized/legacy section type) still renders instead of silently dropping content. */
function withNormalizedSections<T extends { sections_json?: unknown }>(page: T): T {
  if (page && typeof page.sections_json === "string") {
    return { ...page, sections_json: JSON.stringify(normalizeSections(JSON.parse(page.sections_json))) };
  }
  return page;
}

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    const db = coreDb();
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get("slug"), 80);
    if (slug) {
      const page = await db.prepare("SELECT id, name, sections_json, form_id, seo_json FROM gi_landing_pages WHERE slug=? AND status='PUBLISHED'").bind(slug).first();
      if (!page) return Response.json({ error: "This page is not available." }, { status: 404 });
      await db.prepare("UPDATE gi_landing_pages SET views = views + 1 WHERE slug=?").bind(slug).run();
      return Response.json({ page: withNormalizedSections(page) });
    }
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const page = await db.prepare("SELECT * FROM gi_landing_pages WHERE id=?").bind(id).first();
      return page ? Response.json({ page: withNormalizedSections(page) }) : Response.json({ error: "Not found." }, { status: 404 });
    }
    const { results } = await db.prepare("SELECT id, name, slug, status, views, created_at, updated_at FROM gi_landing_pages ORDER BY updated_at DESC").all();
    return Response.json({ pages: results });
  } catch (error) {
    console.error("growth.landing_pages.list_failed", error);
    return Response.json({ error: "Unable to load landing pages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Page name is required." }, { status: 400 });
    const db = coreDb();
    let slug = cleanText(body.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-") || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const existing = await db.prepare("SELECT id FROM gi_landing_pages WHERE slug=?").bind(slug).first();
    if (existing) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO gi_landing_pages (id, name, slug, status, sections_json, form_id, campaign_id, seo_json, conversion_goal, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, name, slug, "DRAFT", JSON.stringify(body.sections || [{ id: crypto.randomUUID(), type: "HEADLINE", text: name }]),
        cleanText(body.formId, 80) || null, cleanText(body.campaignId, 80) || null, JSON.stringify(body.seo || {}),
        cleanText(body.conversionGoal, 80) || null, requestUser(request), now, now).run();
    const page = await db.prepare("SELECT * FROM gi_landing_pages WHERE id=?").bind(id).first();
    return Response.json({ page }, { status: 201 });
  } catch (error) {
    console.error("growth.landing_pages.create_failed", error);
    return Response.json({ error: "Unable to create landing page." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Page id is required." }, { status: 400 });
    const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.name !== undefined) add("name", cleanText(updates.name, 160));
    if (updates.status !== undefined) { const v = cleanText(updates.status, 20).toUpperCase(); if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(v)) return Response.json({ error: "Invalid status." }, { status: 400 }); add("status", v); }
    if (updates.sections !== undefined) add("sections_json", JSON.stringify(updates.sections));
    if (updates.formId !== undefined) add("form_id", cleanText(updates.formId, 80) || null);
    if (updates.seo !== undefined) add("seo_json", JSON.stringify(updates.seo));
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    const db = coreDb();
    await db.prepare(`UPDATE gi_landing_pages SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const page = await db.prepare("SELECT * FROM gi_landing_pages WHERE id=?").bind(id).first();
    return page ? Response.json({ page }) : Response.json({ error: "Page not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.landing_pages.update_failed", error);
    return Response.json({ error: "Unable to update landing page." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Page id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM gi_landing_pages WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("growth.landing_pages.delete_failed", error);
    return Response.json({ error: "Unable to delete landing page." }, { status: 500 });
  }
}
