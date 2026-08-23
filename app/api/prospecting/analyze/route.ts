import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

type Signals = {
  websiteExists: boolean;
  booking: boolean;
  contactForm: boolean;
  chat: boolean;
  sms: boolean;
  strongCta: boolean;
  facebook: boolean;
  instagram: boolean;
};

function rank(score: number) {
  if (score >= 90) return "CALL FIRST";
  if (score >= 80) return "HOT";
  if (score >= 60) return "HIGH POTENTIAL";
  if (score >= 40) return "RESEARCH";
  return "LOW";
}

function safeWebsite(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Unsupported website URL.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  )
    throw new Error("Private network URLs are not allowed.");
  return url;
}

async function fetchPublicHtml(start: URL, signal?: AbortSignal) {
  let current = start;
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "User-Agent": "CyncroProspecting/1.0 (+public-website-analysis)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = safeWebsite(new URL(location, current).toString()) as URL;
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return null;
    return { html: (await response.text()).slice(0, 500_000), url: current };
  }
  return null;
}

function discoverInternalPages(html: string, base: URL) {
  const links = html.match(/href=["'][^"']+["']/gi) || [];
  const preferred = /(contact|about|team|staff|leadership|company)/i;
  const pages: URL[] = [];
  for (const token of links) {
    const href = token.slice(6, -1).trim();
    if (!preferred.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname !== base.hostname || !["http:", "https:"].includes(url.protocol)) continue;
      url.hash = "";
      if (!pages.some((item) => item.toString() === url.toString())) pages.push(url);
    } catch { /* Ignore malformed links. */ }
    if (pages.length >= 3) break;
  }
  return pages;
}

function publicLeadership(html: string) {
  const people = new Set<string>();
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const kind = String(record["@type"] || "").toLowerCase();
    const role = String(record.jobTitle || "");
    const name = String(record.name || "").trim();
    if (kind === "person" && name && (!role || /(owner|founder|president|chief|director|manager|partner)/i.test(role))) {
      people.add(role ? `${name} — ${role}` : name);
    }
    Object.values(record).forEach(visit);
  };
  for (const script of scripts) {
    const json = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try { visit(JSON.parse(json)); } catch { /* Ignore invalid structured data. */ }
  }
  return [...people].slice(0, 10);
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "website-analyze", 60, 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    const businessName = String(body.businessName || "This business").slice(
      0,
      120,
    );
    const category = String(body.category || "business").slice(0, 80);
    const rating = Number(body.rating) || 0;
    const reviewCount = Math.max(Number(body.reviewCount) || 0, 0);
    const website = safeWebsite(body.website);
    let html = "";
    let rawHtml = "";
    let sourceUrl = website?.toString() || "";
    let websiteReachable = false;

    if (website) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const home = await fetchPublicHtml(website, controller.signal);
        if (home) {
          const pages = [home];
          for (const pageUrl of discoverInternalPages(home.html, home.url)) {
            const page = await fetchPublicHtml(pageUrl, controller.signal);
            if (page) pages.push(page);
          }
          rawHtml = pages.map((page) => page.html).join("\n").slice(0, 1_500_000);
          html = rawHtml.toLowerCase();
          websiteReachable = true;
          sourceUrl = home.url.toString();
        }
      } finally {
        clearTimeout(timer);
      }
    }

    const has = (pattern: RegExp) => pattern.test(html);
    const emails = [...new Set((rawHtml.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
      .filter((email) => !/example\.|sentry\.|wixpress\.|cloudflare\.|domain\.com/.test(email))
      .slice(0, 12))];
    const extractedPhones = [...new Set((rawHtml.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || [])
      .map((phone) => phone.trim()).slice(0, 12))];
    const socialUrls = [...new Set((rawHtml.match(/https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin)\.com\/[^\s"'<>]+/gi) || [])
      .map((url) => url.replace(/&amp;.*/, "").replace(/[),.;]+$/, "")).slice(0, 12))];
    const signals: Signals = {
      websiteExists: Boolean(website && websiteReachable),
      booking: has(
        /calendly|acuityscheduling|booksy|mindbody|squareup\.com\/appointments|schedule (a|an|your)|book (a|an|your|now)|appointment/,
      ),
      contactForm: has(
        /<form\b|contact-form|wpforms|gravityforms|hubspot-form/,
      ),
      chat: has(
        /intercom|drift|tawk\.to|crisp\.chat|livechat|zendesk|chat-widget|chatbot/,
      ),
      sms: has(/sms:|text us|text message|text now|message us/),
      strongCta: has(
        /get started|get a quote|request (a )?(quote|consultation)|call now|book now|schedule now|free consultation/,
      ),
      facebook: has(/facebook\.com|fb\.com/),
      instagram: has(/instagram\.com/),
    };

    let score = 18;
    const reasons: string[] = [];
    if (reviewCount >= 1000) {
      score += 24;
      reasons.push(
        `${reviewCount.toLocaleString()} reviews signal proven demand.`,
      );
    } else if (reviewCount >= 300) {
      score += 19;
      reasons.push(
        `${reviewCount.toLocaleString()} reviews show strong market traction.`,
      );
    } else if (reviewCount >= 75) {
      score += 13;
      reasons.push(
        `${reviewCount.toLocaleString()} reviews provide meaningful demand.`,
      );
    } else if (reviewCount >= 20) {
      score += 7;
      reasons.push("Established local review activity.");
    }
    if (rating >= 4.5) {
      score += 8;
      reasons.push(`Strong ${rating.toFixed(1)}★ reputation.`);
    } else if (rating >= 4) score += 5;
    if (signals.websiteExists) score += 8;
    else {
      score += 4;
      reasons.push(
        "No reachable public website found—digital foundation opportunity.",
      );
    }
    if (!signals.booking) {
      score += 14;
      reasons.push("No observable online booking path.");
    }
    if (!signals.contactForm) {
      score += 9;
      reasons.push("No observable contact form.");
    }
    if (!signals.chat) {
      score += 8;
      reasons.push("No observable website chat.");
    }
    if (!signals.sms) {
      score += 7;
      reasons.push("No observable SMS conversion path.");
    }
    if (!signals.strongCta) {
      score += 7;
      reasons.push("Primary conversion CTA can be stronger.");
    }
    if (signals.facebook || signals.instagram) {
      score += 4;
      reasons.push("Social audience can feed automated follow-up.");
    }
    score = Math.min(score, 100);

    const gaps = [
      !signals.booking && "appointment setter",
      !signals.chat && "AI receptionist",
      !signals.sms && "SMS follow-up",
      !signals.contactForm && "high-converting lead capture",
      !signals.strongCta && "conversion-focused website flow",
    ].filter(Boolean) as string[];
    const solutions = [
      !signals.chat && "AI Receptionist",
      !signals.booking && "Appointment Setter",
      !signals.sms && "SMS Follow-Up",
      "Cyncro CRM",
    ].filter(Boolean) as string[];

    return Response.json({
      score,
      rankLabel: rank(score),
      signals,
      reasons: reasons.slice(0, 5),
      whyCall: reviewCount
        ? `${businessName} has visible demand, but its public conversion path leaves revenue on the table.`
        : `${businessName} has clear room to strengthen lead capture and follow-up.`,
      whatFound: gaps.length
        ? `${gaps.slice(0, 3).join(", ")} ${gaps.length === 1 ? "is" : "are"} not clearly visible.`
        : "Strong public conversion fundamentals; focus the call on speed-to-lead and CRM follow-up.",
      recommendedSolution: solutions.join(" + "),
      callOpener: `Hi, I was reviewing ${businessName}'s customer journey. You have a strong ${category.toLowerCase()} presence, and I spotted a few places Cyncro could help convert more inquiries without adding front-desk workload.`,
      nextAction: `Call ${businessName}, confirm the current lead-response process, then offer a 15-minute conversion demo.`,
      emails,
      extractedPhones,
      leadership: publicLeadership(rawHtml),
      sourceUrls: [sourceUrl, ...socialUrls].filter(Boolean),
      lastExtractedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("prospecting.analyze.failed", error);
    if (error instanceof RateLimitError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Website analysis could not be completed." },
      { status: 422 },
    );
  }
}
