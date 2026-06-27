import type { CacheDescriptor, JsonSchema, SlashCommandArgument } from "../models";
import { MINUTE_MS } from "../cache";
import { LookupSlashCommand, type ImplicitMatch, type SlashCommandContext } from "./base";
import { DEFAULT_INSTALL_CONFIG, type InstallConfig } from "./install";

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
  source: { name: string; url: string };
};

export const stockOutputSchema = {
  type: "object",
  required: ["symbol", "price", "currency", "change", "changePercent", "previousClose", "asOf", "source"],
  properties: {
    symbol: { type: "string" },
    price: { type: "number" },
    currency: { type: "string" },
    change: { type: "number" },
    changePercent: { type: "number" },
    previousClose: { type: "number" },
    asOf: { type: "string" },
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

// Common English words that happen to be valid-looking tickers — we don't want
// "in", "to", "as", "the" implicitly firing a stock lookup. Keep this list to
// short, high-frequency words that collide with the 1–5 letter ticker shape.
const TICKER_STOPWORDS = new Set([
  "a", "i", "in", "to", "as", "is", "it", "at", "of", "on", "or", "be", "do",
  "go", "no", "so", "up", "us", "we", "the", "and", "for", "are", "but", "not",
  "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has",
  "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
  "boy", "did", "its", "let", "put", "say", "she", "too", "use", "pi", "qt"
]);

export function looksLikeTicker(token: string): boolean {
  // 1–5 letters, optionally with a dot-suffix exchange ("BRK.B"). Uppercase
  // form is the strong signal; lowercase requires it not be a stopword.
  if (!/^[A-Za-z]{1,5}(?:\.[A-Za-z]{1,2})?$/.test(token)) {
    return false;
  }
  const bare = token.split(".")[0]!.toLowerCase();
  return !TICKER_STOPWORDS.has(bare);
}

// Yahoo Finance's chart endpoint is key-less and returns price + previous close
// as JSON, so /stock resolves in static mode (from the browser) with no secrets.
interface QuoteData {
  price: number;
  previousClose: number;
  currency: string;
  asOf: string;
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
    result?: Array<{ meta?: YahooChartMeta }>;
    error?: { description?: string } | null;
  };
}

async function fetchQuote(symbol: string): Promise<QuoteData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
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
  const meta = payload.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const previousClose = meta?.chartPreviousClose ?? meta?.previousClose;
  if (typeof price !== "number" || typeof previousClose !== "number") {
    throw new Error(`No quote available for ${symbol}.`);
  }
  const asOf = meta?.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : "";
  return { price, previousClose, currency: meta?.currency ?? "USD", asOf };
}

export class StockCommand extends LookupSlashCommand<StockArgs, StockOutput> {
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
    // Only the FIRST token, and only when it's alone or clearly a ticker query.
    const tokens = trimmed.split(/\s+/);
    const first = tokens[0] ?? "";
    if (!looksLikeTicker(first)) {
      return undefined;
    }
    // A lone uppercase token ("MSFT") is a strong signal; a lone lowercase token
    // ("msft") is moderate; a ticker followed by other words is weak (likely
    // prose) unless the trailing word is "stock"/"price"/"quote".
    const isUpper = first === first.toUpperCase();
    let confidence: number;
    if (tokens.length === 1) {
      confidence = isUpper ? 0.9 : 0.6;
    } else if (/\b(stock|price|quote|share|shares)\b/i.test(trimmed)) {
      confidence = 0.8;
    } else {
      return undefined;
    }
    return {
      confidence,
      args: { symbol: first.toUpperCase() },
      label: `${first.toUpperCase()} quote`
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
      source: { name: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(args.symbol)}` }
    };
  }
}

export function stockSlashCommand() {
  return new StockCommand();
}
