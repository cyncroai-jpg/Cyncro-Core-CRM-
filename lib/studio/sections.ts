// Shared section type definitions for Cyncro Studio, used by both the
// builder (app/page.tsx CRMStudio) and the public renderer (app/s/page.tsx).

export type StudioFormField = {
  id: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required: boolean;
};

export type StudioSectionType = "hero" | "text" | "image" | "form" | "testimonial" | "faq" | "cta";

export type StudioSection = {
  id: string;
  type: StudioSectionType;
  props: Record<string, unknown>;
};

export const SECTION_LABELS: Record<StudioSectionType, string> = {
  hero: "Hero",
  text: "Text block",
  image: "Image",
  form: "Lead form",
  testimonial: "Testimonial",
  faq: "FAQ",
  cta: "Call to action",
};

export function defaultPropsFor(type: StudioSectionType): Record<string, unknown> {
  switch (type) {
    case "hero":
      return { eyebrow: "NEW", headline: "Your headline here", subheadline: "Supporting subheadline goes here.", ctaLabel: "Get started", ctaHref: "#lead-form", align: "center" };
    case "text":
      return { heading: "Section heading", body: "Write your copy here." };
    case "image":
      return { url: "", caption: "" };
    case "form":
      return { heading: "Get in touch", subheading: "Tell us a bit about your business.", fields: [{ id: "name", label: "Full name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }] as StudioFormField[], submitLabel: "Submit", successMessage: "Thanks — we'll be in touch shortly." };
    case "testimonial":
      return { quote: "This changed how we run our business.", name: "Jane Doe", role: "Owner, Acme Co." };
    case "faq":
      return { items: [{ q: "What's included?", a: "Everything you need to get started." }] };
    case "cta":
      return { heading: "Ready to talk?", buttonLabel: "Book a call", buttonHref: "#lead-form" };
  }
}
