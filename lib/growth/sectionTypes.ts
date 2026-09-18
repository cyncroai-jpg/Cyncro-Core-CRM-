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
