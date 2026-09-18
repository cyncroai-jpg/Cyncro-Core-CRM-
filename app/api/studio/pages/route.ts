import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

async function requireStudioAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT role,active FROM workspace_members WHERE email=?").bind(email).first<{ role: string; active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || crypto.randomUUID().slice(0, 8);
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireStudioAccess(request))) return Response.json({ error: "Studio access required." }, { status: 403 });
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const page = await db.prepare("SELECT * FROM studio_pages WHERE id=?").bind(id).first<Record<string, unknown>>();
      if (!page) return Response.json({ error: "Page not found." }, { status: 404 });
      const submissions = await db.prepare("SELECT * FROM studio_submissions WHERE page_id=? ORDER BY created_at DESC LIMIT 50").bind(id).all();
      return Response.json({ page: { ...page, sections: JSON.parse(String(page.sections_json || "[]")) }, submissions: submissions.results });
    }
    const { results } = await db.prepare("SELECT id,slug,title,status,submission_count,created_at,updated_at FROM studio_pages ORDER BY updated_at DESC").all();
    return Response.json({ pages: results });
  } catch (error) {
    console.error("studio.pages.list_failed", error);
    return Response.json({ error: "Unable to load pages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireStudioAccess(request))) return Response.json({ error: "Studio access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const title = cleanText(body.title, 160);
    if (!title) return Response.json({ error: "Page title is required." }, { status: 400 });
    const db = coreDb();
    let slug = slugify(String(body.slug || title));
    const existing = await db.prepare("SELECT id FROM studio_pages WHERE slug=?").bind(slug).first();
    if (existing) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultSections = [
      { id: crypto.randomUUID(), type: "hero", props: { eyebrow: "NEW", headline: title, subheadline: "Write a compelling subheadline here.", ctaLabel: "Get started", ctaHref: "#lead-form", align: "center" } },
      { id: crypto.randomUUID(), type: "form", props: { heading: "Get in touch", subheading: "Tell us a bit about your business.", fields: [{ id: "name", label: "Full name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }, { id: "phone", label: "Phone", type: "tel", required: false }], submitLabel: "Submit", successMessage: "Thanks — we'll be in touch shortly." } },
    ];
    await db.prepare("INSERT INTO studio_pages (id,slug,title,sections_json,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, slug, title, JSON.stringify(defaultSections), "DRAFT", requestUser(request), now, now).run();
    return Response.json({ id, slug }, { status: 201 });
  } catch (error) {
    console.error("studio.pages.create_failed", error);
    return Response.json({ error: "Unable to create page." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireStudioAccess(request))) return Response.json({ error: "Studio access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Page id is required." }, { status: 400 });
    const db = coreDb();
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.title !== undefined) { updates.push("title=?"); vals.push(cleanText(body.title, 160)); }
    if (body.sections !== undefined) { updates.push("sections_json=?"); vals.push(JSON.stringify(body.sections)); }
    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!["DRAFT", "PUBLISHED"].includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
      updates.push("status=?"); vals.push(status);
    }
    if (body.seoTitle !== undefined) { updates.push("seo_title=?"); vals.push(cleanText(body.seoTitle, 200) || null); }
    if (body.seoDescription !== undefined) { updates.push("seo_description=?"); vals.push(cleanText(body.seoDescription, 400) || null); }
    if (body.slug !== undefined) {
      const newSlug = slugify(String(body.slug));
      const conflict = await db.prepare("SELECT id FROM studio_pages WHERE slug=? AND id!=?").bind(newSlug, id).first();
      if (conflict) return Response.json({ error: "That URL is already in use by another page." }, { status: 400 });
      updates.push("slug=?"); vals.push(newSlug);
    }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(id);
    await db.prepare(`UPDATE studio_pages SET ${updates.join(",")} WHERE id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("studio.pages.update_failed", error);
    return Response.json({ error: "Unable to update page." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireStudioAccess(request))) return Response.json({ error: "Studio access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Page id is required." }, { status: 400 });
    await coreDb().batch([
      coreDb().prepare("DELETE FROM studio_submissions WHERE page_id=?").bind(id),
      coreDb().prepare("DELETE FROM studio_pages WHERE id=?").bind(id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("studio.pages.delete_failed", error);
    return Response.json({ error: "Unable to delete page." }, { status: 500 });
  }
}
