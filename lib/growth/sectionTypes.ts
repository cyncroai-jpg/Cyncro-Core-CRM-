/** Shared landing-page section types — used by the editor (app/growth/page.tsx) and the public renderer (app/gp/page.tsx). */
export type LpSectionType = "HEADLINE" | "TEXT" | "IMAGE" | "BUTTON" | "TESTIMONIAL" | "PRICING" | "FAQ" | "COUNTDOWN" | "FORM";

export interface LpSection {
  id: string;
  type: LpSectionType;
  data: Record<string, unknown>;
}

export const LP_SECTION_META: Record<LpSectionType, { label: string; icon: string }> = {
  HEADLINE: { label: "Headline", icon: "H" },
  TEXT: { label: "Text", icon: "¶" },
  IMAGE: { label: "Image", icon: "▧" },
  BUTTON: { label: "Button", icon: "▭" },
  TESTIMONIAL: { label: "Testimonial", icon: "❝" },
  PRICING: { label: "Pricing", icon: "$" },
  FAQ: { label: "FAQ", icon: "?" },
  COUNTDOWN: { label: "Countdown", icon: "◷" },
  FORM: { label: "Form embed", icon: "▤" },
};

/**
 * Upgrades a section from any older/legacy shape (flat text/heading/body
 * fields, or an unrecognized type like the pre-rewrite "BENEFITS") into
 * the current {id, type, data} shape, so a page saved before a schema
 * change keeps rendering instead of silently dropping content or
 * crashing the renderer. Called wherever sections_json is read.
 */
export function normalizeSection(raw: unknown): LpSection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : String(Math.random());
  let type = typeof r.type === "string" ? (r.type as string) : "TEXT";
  if (type === "BENEFITS") type = "TEXT"; // pre-rewrite AI-generated type, closest real equivalent
  if (!(type in LP_SECTION_META)) type = "TEXT";
  const validType = type as LpSectionType;

  if (r.data && typeof r.data === "object") {
    return { id, type: validType, data: { ...defaultSectionData(validType), ...(r.data as Record<string, unknown>) } };
  }
  // Legacy flat shape — migrate known field names into the data bag.
  const data: Record<string, unknown> = { ...defaultSectionData(validType) };
  if (typeof r.text === "string" && r.text) data.headline = r.text, (data.text = r.text);
  if (typeof r.sub === "string") data.sub = r.sub;
  if (typeof r.heading === "string") data.heading = r.heading;
  if (typeof r.body === "string") data.body = r.body;
  return { id, type: validType, data };
}

export function normalizeSections(raw: unknown): LpSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSection).filter((s): s is LpSection => s !== null);
}

export function defaultSectionData(type: LpSectionType): Record<string, unknown> {
  switch (type) {
    case "HEADLINE": return { headline: "Your headline here", sub: "A short supporting line." };
    case "TEXT": return { heading: "Section heading", body: "Write the real detail here." };
    case "IMAGE": return { url: "", alt: "" };
    case "BUTTON": return { text: "Get started", href: "#" };
    case "TESTIMONIAL": return { quote: "This made a real difference for our business.", author: "A real customer" };
    case "PRICING": return { title: "Standard", price: "$99/mo", features: "Feature one\nFeature two\nFeature three" };
    case "FAQ": return { question: "A common question?", answer: "A clear, honest answer." };
    case "COUNTDOWN": return { label: "Offer ends in", endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    case "FORM": return { formToken: "", formName: "" };
  }
}
