/**
 * Shared "after a form is submitted" behaviour for CRM Forms and Studio
 * landing pages: apply tags, assign a teammate, fire the TAG_ADDED
 * automation trigger, and build the booking hand-off URL.
 */
import { emitAutomationEvent } from "@/lib/automations/engine";
import { coreDb } from "@/lib/core/db";

export type AfterSubmit = { afterSubmit: "message" | "book"; bookingEvent: string; tags: string; assignTo: string; successMessage: string };

export const DEFAULT_AFTER: AfterSubmit = { afterSubmit: "message", bookingEvent: "", tags: "", assignTo: "", successMessage: "" };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseAfterSubmit(raw: unknown): AfterSubmit {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") { try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { obj = {}; } }
  else if (raw && typeof raw === "object") obj = raw as Record<string, unknown>;
  return {
    afterSubmit: obj.afterSubmit === "book" ? "book" : "message",
    bookingEvent: clean(obj.bookingEvent, 120),
    tags: clean(obj.tags, 400),
    assignTo: clean(obj.assignTo, 160).toLowerCase(),
    successMessage: clean(obj.successMessage, 400),
  };
}

export const splitTags = (s: string) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

/** Tags + assigns the contact per the form settings. Emits TAG_ADDED for each new tag. */
export async function applyAfterSubmit(tenantId: string, contactId: string, s: AfterSubmit): Promise<void> {
  const db = coreDb();
  const c = await db.prepare("SELECT tags, assigned_rep FROM crm_contacts WHERE id=? AND tenant_id=?").bind(contactId, tenantId).first<{ tags: string | null; assigned_rep: string | null }>();
  if (!c) return;
  const now = new Date().toISOString();
  let tags: string[] = [];
  try { tags = JSON.parse(c.tags || "[]"); if (!Array.isArray(tags)) tags = []; } catch { tags = []; }
  const added = splitTags(s.tags).filter((t) => !tags.includes(t));
  const rep = s.assignTo && !c.assigned_rep ? s.assignTo : null;
  if (!added.length && !rep) return;
  const next = [...tags, ...added];
  await db.prepare("UPDATE crm_contacts SET tags=?, assigned_rep=COALESCE(?, assigned_rep), updated_at=? WHERE id=?").bind(JSON.stringify(next), rep, now, contactId).run();
  for (const tag of added) await emitAutomationEvent(tenantId, "TAG_ADDED", { contactId, tag, trigger: "TAG_ADDED" });
}

/** Where the visitor goes next: the booking page (prefilled) when the form asks for it, else null. */
export function nextUrl(s: AfterSubmit, who: { name?: string | null; email?: string | null; phone?: string | null }): string | null {
  if (s.afterSubmit !== "book") return null;
  const q = new URLSearchParams();
  if (s.bookingEvent) q.set("event", s.bookingEvent);
  if (who.name) q.set("name", who.name);
  if (who.email) q.set("email", who.email);
  if (who.phone) q.set("phone", who.phone);
  const qs = q.toString();
  return `/${qs ? `?${qs}` : ""}#book`;
}
