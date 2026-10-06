import Anthropic from "@anthropic-ai/sdk";
import {
  applyScreen,
  compact,
  investorPortfolio,
  listInvestors,
  parseFilters,
  recentInsiderTrades,
  scoredCompanies,
  type ScoredCompany,
  type ScreenFilters,
} from "./engine";

export type AnalystTurn = { role: "user" | "assistant"; content: string };

export type AnalystReply = {
  answer: string;
  tickers: string[];
  filters: ScreenFilters | null;
  engine: "claude" | "local";
};

const MODEL = "claude-opus-5-5";

const SYSTEM = `You are Cyncro Smart Money, an elite equity research analyst embedded in a CRM.
You answer questions about what billionaire and ultra-high-net-worth investors are buying, holding and selling, and about open-market insider purchases.

Ground every claim in the tool results: quote exact numbers (holder counts, $ stake sizes, % of portfolio, quarter-over-quarter changes, smart-money score, price vs. smart-money quarter-end price). Never invent holdings, prices or investors. If the data does not cover something, say so plainly.

Context you must keep in mind:
- 13F holdings come from SEC filings due 45 days after each quarter end, so they lag; they cover US long equity positions only (no shorts, no options counted here).
- Insider buys come from live SEC Form 4 filings (transaction code P, open-market purchases).
- The Smart Money Score (0-100) = breadth (30) + conviction (20) + quarter-over-quarter momentum (25) + insider buying (10) + discount to the smart-money entry price (15).

Style: decisive and punchy, built for someone hunting for ideas. Lead with the answer, then a short ranked list (ticker — why, with numbers). Close with one line on the key risk or caveat. This is research, not personalized financial advice; say so once, briefly, at the end.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "screen_companies",
    description:
      "Screen companies held by the tracked billionaire investors. Returns the top matches with score, holders, quarter-over-quarter activity, conviction, insider buys and price vs smart-money price. Use this for any 'what are billionaires buying' style question.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Company name or ticker substring" },
        investors: { type: "array", items: { type: "string" }, description: "Investor names or CIKs to restrict to (use list_investors to resolve)" },
        match: { type: "string", enum: ["any", "all"], description: "Held by any vs all of the listed investors" },
        minHolders: { type: "integer", description: "Minimum number of tracked investors holding it" },
        minWeight: { type: "number", description: "Minimum % of at least one holder's portfolio (e.g. 5 for 5%)" },
        activity: { type: "string", enum: ["any", "new", "added", "accumulating", "exiting"] },
        minValue: { type: "number", description: "Minimum combined USD stake" },
        insiderOnly: { type: "boolean", description: "Only companies with insider open-market buys in the last 30 days" },
        belowSmartPrice: { type: "boolean", description: "Only names trading below the smart-money quarter-end price" },
        sort: { type: "string", enum: ["score", "holders", "value", "momentum", "conviction", "discount", "insider"] },
        limit: { type: "integer", description: "Max rows (default 12)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "company_detail",
    description: "Full smart-money breakdown for one company by ticker or name: every holder with stake, % of portfolio, change, exits, insider buys and score factors.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Ticker or company name" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "investor_portfolio",
    description: "Latest 13F portfolio of one tracked investor with quarter-over-quarter changes (NEW, ADDED, TRIMMED, HELD, EXITED).",
    input_schema: {
      type: "object",
      properties: { investor: { type: "string", description: "Investor name, fund name or CIK" } },
      required: ["investor"],
      additionalProperties: false,
    },
  },
  {
    name: "list_investors",
    description: "List every tracked billionaire investor with fund, CIK, 13F portfolio value, position count and latest reporting period.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "recent_insider_buys",
    description: "Recent open-market insider purchases from live SEC Form 4 filings.",
    input_schema: {
      type: "object",
      properties: {
        minValue: { type: "number", description: "Minimum USD value (default 100000)" },
        days: { type: "integer", description: "Look-back window in days (default 14)" },
        ticker: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];

function compactCompany(c: ScoredCompany) {
  return {
    ticker: c.ticker,
    name: c.name,
    score: c.score,
    factors: c.factors,
    holders: c.holderCount,
    topHolders: c.holders.slice(0, 5).map((h) => `${h.investor} $${compact(h.valueUsd)} (${(h.weight * 100).toFixed(1)}%, ${h.change})`),
    combinedStake: `$${compact(c.totalValue)}`,
    activity: { new: c.newCount, added: c.addedCount, trimmed: c.trimmedCount, exited: c.exitCount, netFlow: `$${compact(c.netFlowUsd)}` },
    smartPrice: c.smartPrice ? Number(c.smartPrice.toFixed(2)) : null,
    price: c.price,
    vsSmartPct: c.vsSmartPct !== null ? Number((c.vsSmartPct * 100).toFixed(1)) : null,
    insiderBuys30d: c.insiderBuys30d,
    insiderValue30d: c.insiderValue30d,
    badges: c.badges,
  };
}

async function resolveInvestorCiks(names: string[]) {
  const investors = await listInvestors();
  return names
    .map((value) => {
      const needle = value.toLowerCase().trim();
      const digits = needle.replace(/\D/g, "");
      return investors.find(
        (inv) =>
          (digits.length >= 4 && inv.cik.endsWith(digits)) ||
          inv.name.toLowerCase().includes(needle) ||
          inv.fund.toLowerCase().includes(needle) ||
          needle.includes(inv.name.toLowerCase().split(" ").slice(-1)[0]),
      )?.cik;
    })
    .filter(Boolean) as string[];
}

function findCompany(companies: ScoredCompany[], query: string) {
  const q = query.trim().toLowerCase();
  return (
    companies.find((c) => (c.ticker || "").toLowerCase() === q) ||
    companies.filter((c) => c.name.toLowerCase().includes(q)).sort((a, b) => b.totalValue - a.totalValue)[0] ||
    null
  );
}

type ToolContext = { tickers: Set<string>; filters: ScreenFilters | null };

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext) {
  const companies = await scoredCompanies();
  switch (name) {
    case "screen_companies": {
      const investorNames = Array.isArray(input.investors) ? input.investors.map(String) : [];
      const filters = parseFilters({ ...input, investors: await resolveInvestorCiks(investorNames), limit: input.limit || 12 });
      ctx.filters = { ...filters, limit: undefined };
      const { total, rows } = applyScreen(companies, filters);
      rows.forEach((r) => r.ticker && ctx.tickers.add(r.ticker));
      return { totalMatches: total, rows: rows.map(compactCompany) };
    }
    case "company_detail": {
      const company = findCompany(companies, String(input.query || ""));
      if (!company) return { error: "No tracked investor holds a company matching that query." };
      if (company.ticker) ctx.tickers.add(company.ticker);
      return {
        ...compactCompany(company),
        reasons: company.reasons,
        allHolders: company.holders.map((h) => ({
          investor: h.investor,
          fund: h.fund,
          stake: `$${compact(h.valueUsd)}`,
          shares: h.shares,
          pctOfPortfolio: Number((h.weight * 100).toFixed(2)),
          change: h.change,
          sharesChangePct: h.deltaPct !== null ? Number((h.deltaPct * 100).toFixed(1)) : null,
        })),
        exits: company.exits.map((e) => `${e.investor} (was $${compact(e.prevValueUsd)})`),
        insiderTrades: company.ticker ? (await recentInsiderTrades({ ticker: company.ticker, days: 90, limit: 10 })).map((t) => `${t.trade_date} ${t.owner} (${t.role}) $${compact(t.value_usd)}`) : [],
      };
    }
    case "investor_portfolio": {
      const [cik] = await resolveInvestorCiks([String(input.investor || "")]);
      if (!cik) return { error: "That investor is not on the radar. Use list_investors." };
      const data = await investorPortfolio(cik);
      if (!data) return { error: "Investor not found." };
      data.positions.slice(0, 15).forEach((p) => p.ticker && ctx.tickers.add(p.ticker));
      return {
        investor: data.investor.name,
        fund: data.investor.fund,
        period: data.investor.latest_period,
        filed: data.investor.latest_filed,
        portfolioValue: `$${compact(data.investor.portfolio_value || 0)}`,
        positions: data.positions.slice(0, 30).map((p) => ({
          ticker: p.ticker,
          name: p.name,
          stake: `$${compact(p.valueUsd)}`,
          pct: Number((p.weight * 100).toFixed(2)),
          change: p.change,
          score: p.score,
        })),
      };
    }
    case "list_investors":
      return (await listInvestors()).map((inv) => ({
        name: inv.name,
        fund: inv.fund,
        cik: inv.cik,
        style: inv.style,
        portfolio: inv.portfolio_value ? `$${compact(inv.portfolio_value)}` : "not synced",
        positions: inv.positions,
        period: inv.latest_period,
      }));
    case "recent_insider_buys": {
      const trades = await recentInsiderTrades({
        minValue: Number(input.minValue) || 100_000,
        days: Number(input.days) || 14,
        ticker: typeof input.ticker === "string" ? input.ticker : undefined,
        limit: 25,
      });
      trades.forEach((t) => t.ticker && ctx.tickers.add(t.ticker));
      return trades.map((t) => ({ ticker: t.ticker, issuer: t.issuer, insider: t.owner, role: t.role, date: t.trade_date, value: `$${compact(t.value_usd)}`, price: t.price }));
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

function apiKey() {
  return typeof process !== "undefined" ? process.env?.ANTHROPIC_API_KEY : undefined;
}

export async function askAnalyst(history: AnalystTurn[]): Promise<AnalystReply> {
  if (!apiKey()) return localAnalyst(history[history.length - 1]?.content || "");
  const client = new Anthropic({ apiKey: apiKey() });
  const ctx: ToolContext = { tickers: new Set(), filters: null };
  const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content }));

  for (let step = 0; step < 8; step += 1) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { answer: "I can't help with that request. Try asking about holdings, buys, sells or insider activity.", tickers: [], filters: null, engine: "claude" };
    }
    if (response.stop_reason !== "tool_use") {
      const answer = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { answer: answer || "No answer was produced.", tickers: [...ctx.tickers].slice(0, 20), filters: ctx.filters, engine: "claude" };
    }
    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (block) => {
        try {
          const output = await runTool(block.name, (block.input || {}) as Record<string, unknown>, ctx);
          return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify(output) };
        } catch (error) {
          return { type: "tool_result" as const, tool_use_id: block.id, content: error instanceof Error ? error.message : "Tool failed", is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { answer: "That question needed more steps than allowed. Try narrowing it down.", tickers: [...ctx.tickers], filters: ctx.filters, engine: "claude" };
}

// ─── Local analyst (no API key) — keyword intent → screener ──────────────────

export async function localAnalyst(question: string): Promise<AnalystReply> {
  const text = question.toLowerCase();
  const investors = await listInvestors();
  const mentioned = investors.filter((inv) => {
    const last = inv.name.toLowerCase().split(" ").slice(-1)[0];
    return text.includes(inv.name.toLowerCase()) || text.includes(inv.fund.toLowerCase()) || new RegExp(`\\b${last}\\b`).test(text);
  });
  const companies = await scoredCompanies();
  const ctx: ToolContext = { tickers: new Set(), filters: null };

  const tickerToken = question.match(/\$?\b([A-Z]{1,5}(?:\.[A-Z])?)\b/g)?.map((t) => t.replace("$", "")).find((t) => companies.some((c) => c.ticker === t));
  if (tickerToken && !mentioned.length) {
    const c = findCompany(companies, tickerToken)!;
    ctx.tickers.add(tickerToken);
    return {
      answer: [
        `**${c.ticker} — ${c.name}** · Smart Money Score **${c.score}/100**`,
        ...c.reasons.map((r) => `• ${r}`),
        `Holders: ${c.holders.map((h) => `${h.investor} $${compact(h.valueUsd)} (${(h.weight * 100).toFixed(1)}%, ${h.change})`).join("; ") || "none"}.`,
        "_13F data lags up to 45 days after quarter end. Research only, not financial advice._",
      ].join("\n"),
      tickers: [...ctx.tickers],
      filters: { q: tickerToken },
      engine: "local",
    };
  }

  if (mentioned.length === 1 && /portfolio|hold|own|top|position/.test(text) && !/buy|bought|add|new/.test(text)) {
    const data = await investorPortfolio(mentioned[0].cik);
    const top = data?.positions.filter((p) => p.valueUsd > 0).slice(0, 10) || [];
    return {
      answer: [
        `**${mentioned[0].name} — ${mentioned[0].fund}** (${mentioned[0].latest_period || "not synced"}) · $${compact(mentioned[0].portfolio_value || 0)} across ${mentioned[0].positions || 0} positions`,
        ...top.map((p, i) => `${i + 1}. **${p.ticker || p.name}** — $${compact(p.valueUsd)} · ${(p.weight * 100).toFixed(1)}% · ${p.change}`),
        "_Research only, not financial advice._",
      ].join("\n"),
      tickers: top.map((p) => p.ticker).filter(Boolean) as string[],
      filters: { investors: [mentioned[0].cik] },
      engine: "local",
    };
  }

  const holdersMatch = text.match(/(?:at least|min(?:imum)?|>=?)\s*(\d+)\s*(?:billionaire|investor|holder|fund)/) || text.match(/(\d+)\+\s*(?:billionaire|investor|holder|fund)/);
  const filters = parseFilters({
    investors: mentioned.map((inv) => inv.cik),
    match: /\bboth\b|\ball of\b|\band\b/.test(text) && mentioned.length > 1 ? "all" : "any",
    minHolders: holdersMatch ? Number(holdersMatch[1]) : /consensus|everyone|most/.test(text) ? 3 : undefined,
    activity: /\bnew\b|just bought|opened|initiat/.test(text)
      ? "new"
      : /sell|sold|exit|dump|trim/.test(text)
        ? "exiting"
        : /buy|bought|add|accumulat|loading/.test(text)
          ? "accumulating"
          : "any",
    insiderOnly: /insider/.test(text),
    belowSmartPrice: /cheap|discount|below|undervalued|bargain/.test(text),
    minWeight: /conviction|big bet|concentrated/.test(text) ? 5 : undefined,
    sort: /insider/.test(text) ? "insider" : /cheap|discount|bargain/.test(text) ? "discount" : /conviction/.test(text) ? "conviction" : "score",
    limit: 10,
  });
  const { total, rows } = applyScreen(companies, filters);
  rows.forEach((r) => r.ticker && ctx.tickers.add(r.ticker));
  if (!rows.length) {
    return {
      answer: companies.length
        ? "Nothing on the radar matches that yet. Loosen a filter (fewer holders, any activity) or sync more investors."
        : "The radar is still empty — hit **Sync all** on the Billionaires tab to pull the latest 13F filings from SEC EDGAR.",
      tickers: [],
      filters,
      engine: "local",
    };
  }
  return {
    answer: [
      `**${total} match${total === 1 ? "" : "es"}** — top ${rows.length} by ${filters.sort || "score"}:`,
      ...rows.map(
        (c, i) =>
          `${i + 1}. **${c.ticker || c.name}** · score ${c.score} · ${c.holderCount} holder${c.holderCount === 1 ? "" : "s"} · $${compact(c.totalValue)}${c.newCount ? ` · ${c.newCount} new` : ""}${c.insiderBuys30d ? ` · ${c.insiderBuys30d} insider buys` : ""} — ${c.reasons[0] || ""}`,
      ),
      "_Local analyst mode — add an Anthropic API key on the server for full Claude reasoning. 13F data lags up to 45 days. Research only, not financial advice._",
    ].join("\n"),
    tickers: [...ctx.tickers],
    filters,
    engine: "local",
  };
}
