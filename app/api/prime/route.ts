import { env } from "cloudflare:workers";
import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

// Cyncro Prime — AI orchestrator that reads live CRM context and coordinates specialist agents

const SYSTEM_PROMPT = `You are Cyncro Prime, an elite AI operating system that coordinates 12 specialist agents:
EON (executive intelligence), NOVA (sales acquisition), ATLAS (operations), VYRA (marketing intelligence),
ONYX (analytics), KRONOS (scheduling), SAGE (knowledge engine), VEGA (customer success),
APEX (lead intelligence), ORBIT (workflow control), TITAN (revenue operations), LUX (brand + creative).

You receive a command from a business operator and live business context (CRM snapshot).
You respond with a structured JSON object:

{
  "summary": "1-2 sentence executive summary of the mission and expected outcome",
  "agents": [
    {
      "name": "AGENT_NAME",
      "action": "specific action this agent will take",
      "impact": "projected outcome (metric, $, %, or qualitative)",
      "priority": "HIGH|MEDIUM|LOW",
      "requires_approval": true|false
    }
  ],
  "timeline": "e.g. Actions begin in 2–4 hours · completion by EOD",
  "projected_impact": "e.g. +$12,400 pipeline · 94% show rate recovery",
  "risk": "LOW|MEDIUM|HIGH",
  "risk_note": "brief risk or caveat if any"
}

Only include agents that are genuinely relevant to the command. 2-5 agents is typical.
Be specific with numbers when context supports it. Be honest when data is insufficient.
High-stakes actions (sending emails, cancellations, financial changes) require_approval: true.
Return ONLY valid JSON, no markdown, no extra text.`;

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const query = String(body.query || "").slice(0, 2000).trim();
    if (!query) return Response.json({ error: "A command is required." }, { status: 400 });

    const apiKey = String((env as Record<string, unknown>).ANTHROPIC_API_KEY || "");
    if (!apiKey) {
      // Graceful demo response when no API key configured
      return Response.json({
        summary: "Cyncro Prime received your command and is ready to coordinate your specialist agents. Configure ANTHROPIC_API_KEY to enable live AI responses.",
        agents: [
          { name: "EON", action: "Analyzing business-wide signals for mission scope", impact: "Executive brief ready in 30s", priority: "HIGH", requires_approval: false },
          { name: "TITAN", action: "Running revenue impact model for this scenario", impact: "Projected output pending live data", priority: "HIGH", requires_approval: false },
        ],
        timeline: "Actions begin once API key is configured",
        projected_impact: "Live analysis available with ANTHROPIC_API_KEY",
        risk: "LOW",
        risk_note: "Add ANTHROPIC_API_KEY to your deployment environment to enable Cyncro Prime AI",
      });
    }

    // Pull live CRM context snapshot
    const db = coreDb();
    const user = requestUser(request);

    const [contactCount, openDeals, upcomingBookings, recentActivities] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM crm_contacts").first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n, SUM(COALESCE(value,0)) AS v FROM crm_opportunities WHERE stage NOT IN ('WON','LOST')").first<{ n: number; v: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM calendar_bookings WHERE starts_at >= ? AND status IN ('CONFIRMED','RESCHEDULED')").bind(new Date().toISOString()).first<{ n: number }>(),
      db.prepare("SELECT title, activity_type, created_at FROM crm_activities ORDER BY created_at DESC LIMIT 5").all<Record<string, unknown>>(),
    ]).catch(() => [null, null, null, null]);

    const context = [
      `CRM contacts: ${contactCount?.n ?? "unknown"}`,
      `Open pipeline: ${openDeals?.n ?? 0} deals · $${Number(openDeals?.v ?? 0).toLocaleString()}`,
      `Upcoming bookings: ${upcomingBookings?.n ?? 0}`,
      `Recent activity: ${Array.isArray(recentActivities) ? recentActivities.slice(0, 3).map((a: Record<string, unknown>) => String(a.title)).join(", ") : "none"}`,
      `Operator: ${user}`,
    ].join("\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `COMMAND: ${query}\n\nLIVE BUSINESS CONTEXT:\n${context}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text().catch(() => "");
      console.error("prime.claude_error", claudeRes.status, errBody);
      return Response.json({ error: "Prime AI is temporarily unavailable. Try again in a moment." }, { status: 502 });
    }

    const claudeData = (await claudeRes.json()) as { content?: { type: string; text: string }[] };
    const rawText = claudeData.content?.find(c => c.type === "text")?.text ?? "{}";

    let plan: Record<string, unknown>;
    try {
      plan = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      console.error("prime.json_parse_failed", rawText.slice(0, 200));
      return Response.json({ error: "Prime AI returned an unexpected format. Please retry." }, { status: 502 });
    }

    // Store the mission in the DB for history
    try {
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO prime_missions (id, created_by, query, plan, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user, query, JSON.stringify(plan), now).run();
    } catch { /* table may not exist yet — migrations run async */ }

    return Response.json({ plan });
  } catch (error) {
    console.error("prime.orchestrate_failed", error);
    return Response.json({ error: "Prime AI encountered an error." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const db = coreDb();
    const { results } = await db.prepare(
      "SELECT id, created_by, query, plan, created_at FROM prime_missions ORDER BY created_at DESC LIMIT 20"
    ).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] }));
    return Response.json({ missions: results });
  } catch {
    return Response.json({ missions: [] });
  }
}
