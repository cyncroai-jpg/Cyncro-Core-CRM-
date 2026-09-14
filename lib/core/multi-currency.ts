/**
 * Multi-currency Support & Localization (Phase 43)
 *
 * Enable global operations with:
 * - Multi-currency deal values and reporting
 * - Real-time exchange rate conversions
 * - Currency-specific formatting and symbols
 * - Historical exchange rate tracking
 * - Automatic currency detection
 * - Consolidated revenue reporting in base currency
 * - Currency-aware forecasting
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "AUD"
  | "CAD"
  | "CHF"
  | "CNY"
  | "SEK"
  | "NZD"
  | "INR"
  | "BRL"
  | "MXN"
  | "SGD"
  | "HKD"
  | "ZAR"
  | "KRW"
  | "IDR"
  | "PHP"
  | "THB";

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  timestamp: string;
  source?: string;
}

export interface CurrencyConfig {
  id: string;
  tenantId: string;
  baseCurrency: CurrencyCode;
  supportedCurrencies: CurrencyCode[];
  autoConvert: boolean;
  rateUpdateFrequency: "HOURLY" | "DAILY" | "WEEKLY"; // How often to refresh rates
  lastUpdated?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyConversion {
  amount: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  convertedAmount: number;
  rate: number;
  timestamp: string;
}

// Predefined currency configurations
const CURRENCY_MAP: Record<CurrencyCode, Currency> = {
  USD: {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  GBP: {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  JPY: {
    code: "JPY",
    name: "Japanese Yen",
    symbol: "¥",
    decimalPlaces: 0,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  AUD: {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  CAD: {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "C$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  CHF: {
    code: "CHF",
    name: "Swiss Franc",
    symbol: "CHF",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  CNY: {
    code: "CNY",
    name: "Chinese Yuan",
    symbol: "¥",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  SEK: {
    code: "SEK",
    name: "Swedish Krona",
    symbol: "kr",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  NZD: {
    code: "NZD",
    name: "New Zealand Dollar",
    symbol: "NZ$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  INR: {
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  BRL: {
    code: "BRL",
    name: "Brazilian Real",
    symbol: "R$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  MXN: {
    code: "MXN",
    name: "Mexican Peso",
    symbol: "$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  SGD: {
    code: "SGD",
    name: "Singapore Dollar",
    symbol: "S$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  HKD: {
    code: "HKD",
    name: "Hong Kong Dollar",
    symbol: "HK$",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  ZAR: {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  KRW: {
    code: "KRW",
    name: "South Korean Won",
    symbol: "₩",
    decimalPlaces: 0,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  IDR: {
    code: "IDR",
    name: "Indonesian Rupiah",
    symbol: "Rp",
    decimalPlaces: 0,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  PHP: {
    code: "PHP",
    name: "Philippine Peso",
    symbol: "₱",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  THB: {
    code: "THB",
    name: "Thai Baht",
    symbol: "฿",
    decimalPlaces: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

/**
 * Initialize currency configuration for a tenant
 */
export async function initializeCurrencyConfig(
  tenantId: string,
  baseCurrency: CurrencyCode = "USD",
  supportedCurrencies: CurrencyCode[] = ["USD", "EUR", "GBP"]
): Promise<CurrencyConfig> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const config: CurrencyConfig = {
    id,
    tenantId,
    baseCurrency,
    supportedCurrencies: Array.from(new Set([baseCurrency, ...supportedCurrencies])),
    autoConvert: true,
    rateUpdateFrequency: "DAILY",
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO currency_config
       (id, tenant_id, base_currency, supported_currencies, auto_convert, rate_update_frequency, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      baseCurrency,
      JSON.stringify(config.supportedCurrencies),
      "DAILY",
      now,
      now
    )
    .run();

  return config;
}

/**
 * Get currency configuration for tenant
 */
export async function getCurrencyConfig(tenantId: string): Promise<CurrencyConfig | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM currency_config WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    baseCurrency: String(row.base_currency) as CurrencyCode,
    supportedCurrencies: JSON.parse(String(row.supported_currencies)),
    autoConvert: Boolean(row.auto_convert),
    rateUpdateFrequency: String(row.rate_update_frequency) as "HOURLY" | "DAILY" | "WEEKLY",
    lastUpdated: row.last_updated ? String(row.last_updated) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Update exchange rate
 */
export async function updateExchangeRate(
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rate: number,
  source?: string
): Promise<ExchangeRate> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const exchangeRate: ExchangeRate = {
    id,
    fromCurrency,
    toCurrency,
    rate,
    timestamp: now,
    source,
  };

  await db
    .prepare(
      `INSERT INTO exchange_rates
       (id, from_currency, to_currency, rate, timestamp, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, fromCurrency, toCurrency, rate, now, source || null)
    .run();

  return exchangeRate;
}

/**
 * Get latest exchange rate between two currencies
 */
export async function getExchangeRate(
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<number | null> {
  const db = coreDb();

  const row = await db
    .prepare(
      `SELECT rate FROM exchange_rates
       WHERE from_currency = ? AND to_currency = ?
       ORDER BY timestamp DESC
       LIMIT 1`
    )
    .bind(fromCurrency, toCurrency)
    .first<{ rate: number }>();

  return row ? row.rate : null;
}

/**
 * Convert currency amount
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<CurrencyConversion> {
  const timestamp = new Date().toISOString();

  // If converting to same currency, return 1:1
  if (fromCurrency === toCurrency) {
    return {
      amount,
      fromCurrency,
      toCurrency,
      convertedAmount: amount,
      rate: 1,
      timestamp,
    };
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  if (!rate) {
    throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
  }

  return {
    amount,
    fromCurrency,
    toCurrency,
    convertedAmount: Number((amount * rate).toFixed(2)),
    rate,
    timestamp,
  };
}

/**
 * Format amount as localized currency string
 */
export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode,
  locale: string = "en-US"
): string {
  const currency = CURRENCY_MAP[currencyCode];
  if (!currency) {
    return `${amount} ${currencyCode}`;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  }).format(amount);
}

/**
 * Get currency information
 */
export function getCurrency(currencyCode: CurrencyCode): Currency | null {
  return CURRENCY_MAP[currencyCode] || null;
}

/**
 * Get all available currencies
 */
export function getAllCurrencies(): Currency[] {
  return Object.values(CURRENCY_MAP).filter((c) => c.enabled);
}

/**
 * Convert deal value to base currency for reporting
 */
export async function convertDealValueToBase(
  dealAmount: number,
  dealCurrency: CurrencyCode,
  baseCurrency: CurrencyCode
): Promise<number> {
  if (dealCurrency === baseCurrency) {
    return dealAmount;
  }

  const conversion = await convertCurrency(dealAmount, dealCurrency, baseCurrency);
  return conversion.convertedAmount;
}

/**
 * Get multi-currency summary for deals
 */
export async function getMultiCurrencyDealSummary(
  tenantId: string,
  baseCurrency: CurrencyCode
): Promise<Record<string, unknown>> {
  const db = coreDb();

  // Get all deals grouped by currency
  const { results: deals } = await db
    .prepare(
      `SELECT currency, COUNT(*) as count, SUM(COALESCE(value, 0)) as totalValue
       FROM crm_opportunities
       WHERE tenant_id = ?
       GROUP BY currency`
    )
    .bind(tenantId)
    .all<{
      currency: string;
      count: number;
      totalValue: number;
    }>();

  let baseCurrencyTotal = 0;
  const currencyBreakdown: Record<string, unknown> = {};

  // Convert each currency to base currency
  for (const deal of deals) {
    const currency = deal.currency as CurrencyCode;
    const conversionKey = `${currency}_to_${baseCurrency}`;

    try {
      const baseCurrencyAmount = await convertDealValueToBase(
        deal.totalValue,
        currency,
        baseCurrency
      );

      baseCurrencyTotal += baseCurrencyAmount;
      currencyBreakdown[currency] = {
        count: deal.count,
        originalValue: deal.totalValue,
        convertedValue: baseCurrencyAmount,
      };
    } catch (err) {
      console.error(`Failed to convert ${currency}:`, err);
      currencyBreakdown[currency] = {
        count: deal.count,
        originalValue: deal.totalValue,
        convertedValue: 0,
        error: "Conversion failed",
      };
    }
  }

  return {
    baseCurrency,
    baseCurrencyTotal,
    currencyBreakdown,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a currency conversion history record for audit purposes
 */
export async function logCurrencyConversion(
  tenantId: string,
  entityType: string,
  entityId: string,
  originalAmount: number,
  originalCurrency: CurrencyCode,
  convertedAmount: number,
  convertedCurrency: CurrencyCode,
  rate: number
): Promise<void> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO currency_conversions_log
       (id, tenant_id, entity_type, entity_id, original_amount, original_currency, converted_amount, converted_currency, rate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      entityType,
      entityId,
      originalAmount,
      originalCurrency,
      convertedAmount,
      convertedCurrency,
      rate,
      now
    )
    .run();
}

/**
 * Update base currency for a tenant
 */
export async function updateBaseCurrency(
  tenantId: string,
  newBaseCurrency: CurrencyCode
): Promise<CurrencyConfig> {
  const db = coreDb();
  const now = new Date().toISOString();

  // Get current config
  const config = await getCurrencyConfig(tenantId);
  if (!config) {
    throw new Error("Currency config not found");
  }

  // Update base currency, ensuring it's in supported currencies
  const supported = Array.from(
    new Set([newBaseCurrency, ...config.supportedCurrencies])
  );

  await db
    .prepare(
      `UPDATE currency_config
       SET base_currency = ?, supported_currencies = ?, updated_at = ?
       WHERE tenant_id = ?`
    )
    .bind(newBaseCurrency, JSON.stringify(supported), now, tenantId)
    .run();

  return {
    ...config,
    baseCurrency: newBaseCurrency,
    supportedCurrencies: supported,
    updatedAt: now,
  };
}
