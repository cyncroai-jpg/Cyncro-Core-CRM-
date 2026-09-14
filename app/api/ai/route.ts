/**
 * AI Assistant API
 *
 * POST /api/ai/email-draft — generate email draft
 * GET /api/ai/contact?id=X — get AI summary of contact
 * GET /api/ai/deal?id=X — get deal analysis
 * POST /api/ai/extract-actions — extract action items from text
 * GET /api/ai/workflows — get workflow recommendations
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  generateEmailDraft,
  getContactSummary,
  analyzeDeal,
  extractActionItems,
  analyzeSentiment,
  recommendWorkflows,
} from "@/lib/core/ai-assistant";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);

    // GET /api/ai/contact?id=X
    if (url.pathname.includes("/ai/contact")) {
      const contactId = cleanText(url.searchParams.get("id"), 80);
      if (!contactId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const summary = await getContactSummary(tenant.tenantId, contactId);
      return Response.json(summary);
    }

    // GET /api/ai/deal?id=X
    if (url.pathname.includes("/ai/deal")) {
      const dealId = cleanText(url.searchParams.get("id"), 80);
      if (!dealId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const analysis = await analyzeDeal(tenant.tenantId, dealId);
      return Response.json(analysis);
    }

    // GET /api/ai/workflows
    if (url.pathname.includes("/ai/workflows")) {
      const recommendations = await recommendWorkflows(tenant.tenantId);
      return Response.json({ workflows: recommendations });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("ai.get.failed", error);
    return Response.json(
      { error: "Unable to get AI suggestion" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const body = (await request.json()) as Record<string, unknown>;

    // POST /api/ai/email-draft
    if (url.pathname.includes("/ai/email-draft")) {
      const contactId = cleanText(String(body.contactId || ""), 80);
      const context = String(body.context || "follow_up");

      if (!contactId) {
        return Response.json({ error: "contactId is required" }, { status: 400 });
      }

      const draft = await generateEmailDraft(
        tenant.tenantId,
        contactId,
        context as "follow_up" | "proposal" | "follow_up_after_meeting" | "close"
      );

      return Response.json(draft);
    }

    // POST /api/ai/extract-actions
    if (url.pathname.includes("/ai/extract-actions")) {
      const text = String(body.text || "");
      if (!text) {
        return Response.json({ error: "text is required" }, { status: 400 });
      }

      const actions = await extractActionItems(text);
      return Response.json({ actions });
    }

    // POST /api/ai/sentiment
    if (url.pathname.includes("/ai/sentiment")) {
      const text = String(body.text || "");
      if (!text) {
        return Response.json({ error: "text is required" }, { status: 400 });
      }

      const sentiment = await analyzeSentiment(text);
      return Response.json({ sentiment });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("ai.post.failed", error);
    return Response.json(
      { error: "Unable to process AI request" },
      { status: 500 }
    );
  }
}
