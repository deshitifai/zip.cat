import type { EffortLevel, SearchResult } from "../models";
import { envVar } from "../runtimeEnv";
import { type GeneratorDescriptor, type WebSearchRequest } from "./base";
import { GenericWebSearchGenerator } from "./exa";

// SearXNG (https://github.com/searxng/searxng) is a self-hostable metasearch
// engine. Point SEARXNG_URL at an instance base URL (e.g. http://localhost:8888
// or a private deployment) and these generators light up — no API key, no
// per-request cost. The instance must allow JSON output: its settings.yml needs
// `search.formats` to include `json` (most public instances do not, which is
// why this targets a configured instance rather than scraping public ones).

type SearxngResult = {
  url?: unknown;
  title?: unknown;
  content?: unknown;
  score?: unknown;
};

type SearxngSearchResponse = {
  results?: unknown;
};

// Pure response mapper, exported for tests: keeps only results with a real
// http(s) URL and normalizes title/score.
export function parseSearxngResults(payload: SearxngSearchResponse, providerId: string): SearchResult[] {
  const rawResults = Array.isArray(payload.results) ? payload.results : [];

  return rawResults
    .map<SearchResult | undefined>((result) => {
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        return undefined;
      }

      const searxResult = result as SearxngResult;
      if (typeof searxResult.url !== "string" || !/^https?:\/\//i.test(searxResult.url)) {
        return undefined;
      }

      return {
        url: searxResult.url,
        title: typeof searxResult.title === "string" && searxResult.title ? searxResult.title : undefined,
        score: typeof searxResult.score === "number" && Number.isFinite(searxResult.score)
          ? searxResult.score
          : undefined,
        provider: providerId
      };
    })
    .filter((result): result is SearchResult => Boolean(result));
}

export function searxngBaseUrl() {
  const raw = envVar("SEARXNG_URL")?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export abstract class SearxngWebSearchGenerator extends GenericWebSearchGenerator {
  readonly provider = "searxng";
  readonly api = "SearXNG metasearch JSON API";

  protected abstract readonly numResults: number;
  // Higher efforts pull additional result pages from the instance.
  protected abstract readonly pages: number;

  enabled() {
    return Boolean(searxngBaseUrl());
  }

  describe(): GeneratorDescriptor {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      provider: this.provider,
      api: this.api,
      effort: this.effort,
      label: "searxng",
      detail: `pages ${this.pages}, num ${this.numResults}`,
      pricing: "Self-hosted SearXNG instance; no per-request cost."
    };
  }

  async execute(request: WebSearchRequest): Promise<SearchResult[]> {
    const base = searxngBaseUrl();
    if (!base) {
      throw new Error("SEARXNG_URL is not set (or is not a valid http(s) URL).");
    }

    const limit = Math.min(request.limit, this.numResults);
    const results: SearchResult[] = [];

    for (let page = 1; page <= this.pages && results.length < limit; page += 1) {
      const url = new URL("search", base);
      url.searchParams.set("q", request.query);
      url.searchParams.set("format", "json");
      url.searchParams.set("pageno", String(page));
      url.searchParams.set("safesearch", "1");

      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "zip.cat/0.1 (https://zip.cat)"
        },
        signal: AbortSignal.timeout(8000)
      });

      if (response.status === 403) {
        throw new Error(
          "SearXNG instance refused JSON output (403). Add `json` to search.formats in the instance settings.yml."
        );
      }
      if (!response.ok) {
        throw new Error(`SearXNG search failed with ${response.status}.`);
      }

      const payload = await response.json() as SearxngSearchResponse;
      const pageResults = parseSearxngResults(payload, this.id);
      results.push(...pageResults);

      // An empty page means the instance has no more results; stop paging.
      if (pageResults.length === 0) {
        break;
      }
    }

    return results.slice(0, limit);
  }
}

export class SearxngInstantWebSearchGenerator extends SearxngWebSearchGenerator {
  readonly id = "searxng.instant";
  readonly name = "SearXNG Instant";
  readonly effort = 1 as EffortLevel;
  protected readonly numResults = 10;
  protected readonly pages = 1;
}

export class SearxngFastWebSearchGenerator extends SearxngWebSearchGenerator {
  readonly id = "searxng.fast";
  readonly name = "SearXNG Fast";
  readonly effort = 2 as EffortLevel;
  protected readonly numResults = 15;
  protected readonly pages = 1;
}

export class SearxngAutoWebSearchGenerator extends SearxngWebSearchGenerator {
  readonly id = "searxng.auto";
  readonly name = "SearXNG Auto";
  readonly effort = 3 as EffortLevel;
  protected readonly numResults = 20;
  protected readonly pages = 1;
}

export class SearxngDeepLiteWebSearchGenerator extends SearxngWebSearchGenerator {
  readonly id = "searxng.deep-lite";
  readonly name = "SearXNG Deep Lite";
  readonly effort = 4 as EffortLevel;
  protected readonly numResults = 30;
  protected readonly pages = 2;
}

export class SearxngDeepWebSearchGenerator extends SearxngWebSearchGenerator {
  readonly id = "searxng.deep";
  readonly name = "SearXNG Deep";
  readonly effort = 5 as EffortLevel;
  protected readonly numResults = 50;
  protected readonly pages = 3;
}

export function createSearxngWebSearchGenerators() {
  return [
    new SearxngInstantWebSearchGenerator(),
    new SearxngFastWebSearchGenerator(),
    new SearxngAutoWebSearchGenerator(),
    new SearxngDeepLiteWebSearchGenerator(),
    new SearxngDeepWebSearchGenerator()
  ];
}
