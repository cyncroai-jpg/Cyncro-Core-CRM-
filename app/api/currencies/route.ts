/**
 * Multi-currency Support API
 *
 * GET /api/currencies — list all currencies
 * GET /api/currencies/config — get tenant currency config
 * POST /api/currencies/config — initialize/update currency config
 * POST /api/currencies/rates — update exchange rates
 * GET /api/currencies/convert — convert between currencies
 * GET /api/currencies/summary — get multi-currency deal summary
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  getAllCurrencies,
  getCurrency,
  getCurrencyConfig,
  initializeCurrencyConfig,
  updateBaseCurrency,
  updateExchangeRate,
  convertCurrency,
  getMultiCurrencyDealSummary,
  type CurrencyCode,
} from "@/lib/core/multi-currency";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/currencies/[section]

    if (section === "config") {
      // GET /api/currencies/config - get tenant currency config
      let config = await getCurrencyConfig(tenant.tenantId);

      if (!config) {
        // Initialize default config
        config = await initializeCurrencyConfig(
          tenant.tenantId,
          "USD",
          ["USD", "EUR", "GBP"]
        );
      }

      return Response.json({ config });
    }

    if (section === "summary") {
      // GET /api/currencies/summary - get multi-currency deal summary
      const config = await getCurrencyConfig(tenant.tenantId);
      if (!config) {
        return Response.json(
          { error: "Currency config not initialized" },
          { status: 400 }
        );
      }

      const summary = await getMultiCurrencyDealSummary(
        tenant.tenantId,
        config.baseCurrency
      );

      return Response.json({ summary });
    }

    // GET /api/currencies - list all available currencies
    const currencies = getAllCurrencies();
    return Response.json({ currencies, total: currencies.length });
  } catch (error) {
    console.error("currencies.get.failed", error);
    return Response.json(
      { error: "Unable to fetch currencies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER can manage currency settings
    if (tenant.role !== "OWNER") {
      return Response.json(
        { error: "Only OWNER can manage currency settings" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "config") {
      // POST /api/currencies/config - initialize/update currency config
      const baseCurrency = (String(body.baseCurrency || "USD") as CurrencyCode) || "USD";
      const supportedCurrencies = Array.isArray(body.supportedCurrencies)
        ? (body.supportedCurrencies as CurrencyCode[])
        : ["USD", "EUR", "GBP"];

      // Validate currencies exist
      const baseCurr = getCurrency(baseCurrency);
      if (!baseCurr) {
        return Response.json(
          { error: `Invalid base currency: ${baseCurrency}` },
          { status: 400 }
        );
      }

      for (const curr of supportedCurrencies) {
        if (!getCurrency(curr)) {
          return Response.json(
            { error: `Invalid currency: ${curr}` },
            { status: 400 }
          );
        }
      }

      let config = await getCurrencyConfig(tenant.tenantId);

      if (config) {
        // Update existing
        config = await updateBaseCurrency(tenant.tenantId, baseCurrency);
      } else {
        // Create new
        config = await initializeCurrencyConfig(
          tenant.tenantId,
          baseCurrency,
          supportedCurrencies
        );
      }

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "currency_config",
        config.id,
        {
          resourceName: "Currency Configuration",
          status: "SUCCESS",
          baseCurrency,
          supportedCurrencies: supportedCurrencies.join(","),
        }
      );

      return Response.json({ config }, { status: 201 });
    }

    if (section === "rates") {
      // POST /api/currencies/rates - update exchange rates
      const fromCurrency = String(body.fromCurrency || "").toUpperCase() as CurrencyCode;
      const toCurrency = String(body.toCurrency || "").toUpperCase() as CurrencyCode;
      const rate = Number(body.rate || 0);
      const source = body.source ? cleanText(String(body.source), 100) : undefined;

      if (!fromCurrency || !toCurrency || rate <= 0) {
        return Response.json(
          { error: "fromCurrency, toCurrency, and rate are required" },
          { status: 400 }
        );
      }

      const exchangeRate = await updateExchangeRate(
        fromCurrency,
        toCurrency,
        rate,
        source
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "exchange_rate",
        exchangeRate.id,
        {
          resourceName: `Exchange Rate: ${fromCurrency}/${toCurrency}`,
          status: "SUCCESS",
          rate: rate.toString(),
        }
      );

      return Response.json({ exchangeRate }, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("currencies.post.failed", error);
    return Response.json(
      { error: "Unable to process currency request" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const body = (await request.json()) as Record<string, unknown>;

    if (action === "convert") {
      // PATCH /api/currencies?action=convert - convert currency amount
      const amount = Number(body.amount || 0);
      const fromCurrency = String(body.fromCurrency || "").toUpperCase() as CurrencyCode;
      const toCurrency = String(body.toCurrency || "").toUpperCase() as CurrencyCode;

      if (amount <= 0 || !fromCurrency || !toCurrency) {
        return Response.json(
          { error: "amount, fromCurrency, and toCurrency are required" },
          { status: 400 }
        );
      }

      const conversion = await convertCurrency(amount, fromCurrency, toCurrency);
      return Response.json({ conversion });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("currencies.patch.failed", error);
    return Response.json(
      { error: "Unable to convert currency" },
      { status: 500 }
    );
  }
}
