import type { CacheDescriptor, JsonSchema, SlashCommandArgument } from "../models";
import { MINUTE_MS } from "../cache";
import { StockSlashCommand, type ImplicitMatch, type SlashCommandContext } from "./base";
import { DEFAULT_INSTALL_CONFIG, type InstallConfig } from "./install";
import { isKnownTicker } from "./tickers";

type StockArgs = {
  symbol: string;
};

export type StockOutput = {
  symbol: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  previousClose: number;
  asOf: string;
  sparkline: Array<{
    date: string;
    close: number;
  }>;
  source: { name: string; url: string };
};

export const stockOutputSchema = {
  type: "object",
  required: ["symbol", "price", "currency", "change", "changePercent", "previousClose", "asOf", "sparkline", "source"],
  properties: {
    symbol: { type: "string" },
    price: { type: "number" },
    currency: { type: "string" },
    change: { type: "number" },
    changePercent: { type: "number" },
    previousClose: { type: "number" },
    asOf: { type: "string" },
    sparkline: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "close"],
        properties: {
          date: { type: "string" },
          close: { type: "number" }
        }
      }
    },
    source: {
      type: "object",
      required: ["name", "url"],
      properties: {
        name: { type: "string" },
        url: { type: "string" }
      }
    }
  }
} satisfies JsonSchema;

// Common English words that collide with real ticker symbols — we don't want
// lowercase "cat" (CAT), "all" (ALL), or "now" (NOW) implicitly firing a stock
// lookup while someone types a normal search. Typing the uppercase form is a
// deliberate signal and bypasses this list.
const TICKER_STOPWORDS = new Set([
  "a", "i", "in", "to", "as", "is", "it", "at", "of", "on", "or", "be", "do",
  "go", "no", "so", "up", "us", "we", "the", "and", "for", "are", "but", "not",
  "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has",
  "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
  "boy", "did", "its", "let", "put", "say", "she", "too", "use", "pi", "qt",
  "ai", "arm", "ball", "cat", "cost", "fast", "key", "keys", "low", "mar",
  "met", "net", "open", "snap", "snow", "spot", "tap", "team", "well"
]);

export function looksLikeTicker(token: string): boolean {
  // Shape: 1–5 letters, optionally with a dot-suffix class ("BRK.B") — and the
  // symbol must be a known, listed ticker (see ./tickers.ts). Uppercase form is
  // the strong signal; lowercase additionally requires it not be a common word.
  if (!/^[A-Za-z]{1,5}(?:\.[A-Za-z]{1,2})?$/.test(token)) {
    return false;
  }
  if (!isKnownTicker(token)) {
    return false;
  }
  if (token === token.toUpperCase()) {
    return true;
  }
  // Single lowercase letters ("f", "u") are typing fragments, not tickers.
  if (token.length === 1) {
    return false;
  }
  return !TICKER_STOPWORDS.has(token.split(".")[0]!.toLowerCase());
}

// Yahoo Finance's chart endpoint is key-less and returns price + previous close
// as JSON, so /stock resolves in static mode (from the browser) with no secrets.
interface QuoteData {
  price: number;
  previousClose: number;
  currency: string;
  asOf: string;
  sparkline: Array<{
    date: string;
    close: number;
  }>;
}

interface YahooChartMeta {
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

async function fetchQuote(symbol: string): Promise<QuoteData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const response = await fetch(url, {
    headers: { "user-agent": "zip.cat/0.1" },
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) {
    throw new Error(`Quote lookup failed with ${response.status}.`);
  }
  const payload = (await response.json()) as YahooChartResponse;
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description ?? `No quote for ${symbol}.`);
  }
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number") {
    throw new Error(`No quote available for ${symbol}.`);
  }
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];
  let sparkline = closes
    .map((close, index) => {
      if (typeof close !== "number" || !Number.isFinite(close)) {
        return undefined;
      }
      const timestamp = timestamps[index];
      return {
        date: typeof timestamp === "number" ? new Date(timestamp * 1000).toISOString().slice(0, 10) : "",
        close: Number(close.toFixed(4))
      };
    })
    .filter((point): point is { date: string; close: number } => Boolean(point));
  const asOf = meta?.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : sparkline.at(-1)?.date ?? "";
  const latestSparklineClose = sparkline.at(-1)?.close;
  if (typeof latestSparklineClose !== "number" || Math.abs(latestSparklineClose - price) > 0.0001) {
    sparkline = [...sparkline, { date: asOf, close: Number(price.toFixed(4)) }];
  }
  const previousSparklineClose = sparkline.length >= 2
    ? sparkline[sparkline.length - 2]?.close
    : undefined;
  const previousClose = meta?.previousClose ?? previousSparklineClose ?? meta?.chartPreviousClose;
  if (typeof previousClose !== "number") {
    throw new Error(`No quote available for ${symbol}.`);
  }
  return { price, previousClose, currency: meta?.currency ?? "USD", asOf, sparkline };
}

export class StockCommand extends StockSlashCommand<StockArgs, StockOutput> {
  readonly id = "slash.stock";
  readonly name = "Stock";
  readonly command = "/stock";
  readonly description = "Latest quote for a stock ticker symbol.";
  readonly arguments: SlashCommandArgument[] = [{
    name: "symbol",
    label: "symbol",
    type: "text",
    required: true,
    placeholder: "MSFT",
    widthChars: 8
  }];
  readonly outputSchema = stockOutputSchema;
  // Quotes move fast; cache per symbol for a minute.
  readonly cache: CacheDescriptor = { ttlMs: MINUTE_MS };

  protected readonly triggerPatterns = [/^\/(stock|quote|ticker)\b/i];

  // Implicit pickup ON, but rendered as a PILL (not inline-live): it's a network
  // call, so we surface it for the user to confirm rather than firing a request
  // on every keystroke. "msft" at the start of the input → MSFT quote pill.
  readonly installDefaults: InstallConfig = {
    ...DEFAULT_INSTALL_CONFIG,
    priority: 5,
    implicit: { enabled: true, render: "pill", minConfidence: 0.5 }
  };

  detectImplicit(query: string): ImplicitMatch<StockArgs> | undefined {
    const trimmed = query.trim();
    // Implicit stock pickup is intentionally strict: the whole input must be a
    // ticker token. Phrases like "MSFT stock" should remain normal searches.
    if (!looksLikeTicker(trimmed)) {
      return undefined;
    }
    const isUpper = trimmed === trimmed.toUpperCase();
    return {
      confidence: isUpper ? 0.9 : 0.6,
      args: { symbol: trimmed.toUpperCase() },
      label: `${trimmed.toUpperCase()} quote`
    };
  }

  parseArguments(context: SlashCommandContext): StockArgs {
    const explicit = this.argumentValue(context, "symbol");
    const inline = context.request.query.replace(/^\/(stock|quote|ticker)\b/i, "").trim();
    const symbol = String(explicit || inline).trim().split(/\s+/)[0] ?? "";
    if (!symbol) {
      throw new Error("/stock requires a ticker symbol.");
    }
    return { symbol: symbol.toUpperCase() };
  }

  async executeCommand(args: StockArgs): Promise<StockOutput> {
    const quote = await fetchQuote(args.symbol);
    const change = quote.price - quote.previousClose;
    const changePercent = quote.previousClose ? (change / quote.previousClose) * 100 : 0;
    return {
      symbol: args.symbol,
      price: Number(quote.price.toFixed(4)),
      currency: quote.currency,
      change: Number(change.toFixed(4)),
      changePercent: Number(changePercent.toFixed(2)),
      previousClose: quote.previousClose,
      asOf: quote.asOf,
      sparkline: quote.sparkline,
      source: { name: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(args.symbol)}` }
    };
  }
}

export function stockSlashCommand() {
  return new StockCommand();
}
