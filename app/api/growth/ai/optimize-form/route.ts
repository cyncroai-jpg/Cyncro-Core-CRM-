/**
 * AI Form Optimizer — computes REAL step-by-step drop-off from gi_events
 * (never simulated), then asks Claude to explain the biggest leak and
 * recommend a fix. Never edits the live form itself — only returns a
 * recommendation the user can turn into an Experiment.
 */
import { env } from "cloudflare:workers";
import { coreDb, cleanText, hasCrmAction } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

type CfEnv = Record<string, string | undefined>;

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Permission required." }, { status: 403 });
    const body = (await request.json()) as { formId?: string };
    const formId = cleanText(body.formId, 80);
    if (!formId) return Response.json({ error: "formId is required." }, { status: 400 });
    const db = coreDb();
    const form = await db.prepare("SELECT * FROM gi_forms WHERE id=?").bind(formId).first<Record<string, unknown>>();
    if (!form) return Response.json({ error: "Form not found." }, { status: 404 });
    const steps = JSON.parse(String(form.steps_json || "[]")) as Array<{ id: string; title: string }>;

    const views = Number(form.views || 0);
    const starts = Number(form.starts || 0);
    const submissions = Number(form.submissions || 0);
    const stepReached = await db.prepare(`SELECT json_extract(metadata_json,'$.step') AS step, COUNT(*) AS count FROM gi_events WHERE form_id=? AND event_type='form.step_completed' GROUP BY step`).bind(formId).all<{ step: number; count: number }>();
    const funnel = [
      { label: "Views", count: views },
      { label: "Starts", count: starts },
      ...steps.map((s, i) => ({ label: s.title, count: (stepReached.results || []).find((r) => Number(r.step) === i)?.count || 0 })),
      { label: "Submissions", count: submissions },
    ];
    const withDrop = funnel.map((f, i) => ({ ...f, dropFromPrevious: i > 0 && funnel[i - 1].count > 0 ? Math.round((1 - f.count / funnel[i - 1].count) * 1000) / 10 : 0 }));
    const worst = withDrop.slice(1).reduce((a, b) => (b.dropFromPrevious > (a?.dropFromPrevious ?? -1) ? b : a), withDrop[1]);

    if (!worst || funnel[0].count < 5) {
      return Response.json({ funnel: withDrop, recommendation: null, note: "Not enough traffic yet to reliably identify a conversion leak — needs more views first." });
    }

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ funnel: withDrop, error: "AI recommendation isn't configured (missing API key), but the funnel data above is real." }, { status: 503 });

    const prompt = `A lead form's real funnel data (JSON): ${JSON.stringify(withDrop)}

The biggest drop-off is at "${worst.label}" (${worst.dropFromPrevious}% of people who reached the previous step left here).

In under 80 words, explain the most likely cause of this specific leak and one concrete, specific recommendation to fix it. Base this only on the funnel shape given — do not invent details about the form's questions.`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json({ funnel: withDrop, error: `AI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` }, { status: 502 });
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
    return Response.json({ funnel: withDrop, leakStep: worst.label, dropRate: worst.dropFromPrevious, recommendation: text });
  } catch (error) {
    console.error("growth.ai.optimize_form_failed", error);
    return Response.json({ error: "Unable to analyze form." }, { status: 500 });
  }
}
