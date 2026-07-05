import type { EffortLevel, SearchResult } from "../models";
import { envVar } from "../runtimeEnv";
import { type GeneratorDescriptor, type WebSearchRequest } from "./base";
import { GenericWebSearchGenerator } from "./exa";

type SerpApiOrganicResult = {
  title?: unknown;
  link?: unknown;
  displayed_link?: unknown;
  position?: unknown;
};

type SerpApiSearchResponse = {
  organic_results?: unknown;
  error?: unknown;
  search_metadata?: {
    status?: unknown;
    total_time_taken?: unknown;
  };
};

export abstract class SerpApiWebSearchGenerator extends GenericWebSearchGenerator {
  readonly provider = "serpapi";
  readonly api = "SerpAPI Google Search";

  protected readonly engine = "google";
  protected abstract readonly numResults: number;

  enabled() {
    return Boolean(envVar("SERP_API_KEY"));
  }

  describe(): GeneratorDescriptor {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      provider: this.provider,
      api: this.api,
      effort: this.effort,
      label: "google",
      detail: `engine ${this.engine}, num ${this.numResults}`,
      pricing: "SerpAPI metered Google Search request; cached searches may be free depending on SerpAPI account rules."
    };
  }

  async execute(request: WebSearchRequest): Promise<SearchResult[]> {
    const apiKey = envVar("SERP_API_KEY");
    if (!apiKey) {
      throw new Error("SERP_API_KEY is not set.");
    }

    const url = new URL("https://serpapi.com/search");
    url.searchParams.set("engine", this.engine);
    url.searchParams.set("q", request.query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("output", "json");
    url.searchParams.set("num", String(Math.min(request.limit, this.numResults)));

    const response = await fetch(url);
    const payload = await response.json() as SerpApiSearchResponse;
    if (!response.ok || payload.error) {
      throw new Error(typeof payload.error === "string"
        ? payload.error
        : `SerpAPI Google Search failed with ${response.status}.`);
    }

    const organicResults = Array.isArray(payload.organic_results)
      ? payload.organic_results
      : [];

    return organicResults
      .map<SearchResult | undefined>((result) => {
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          return undefined;
        }

        const organicResult = result as SerpApiOrganicResult;
        if (typeof organicResult.link !== "string" || !organicResult.link) {
          return undefined;
        }

        return {
          url: organicResult.link,
          title: typeof organicResult.title === "string" ? organicResult.title : undefined,
          score: typeof organicResult.position === "number" ? organicResult.position : undefined,
          provider: this.id
        };
      })
      .filter((result): result is SearchResult => Boolean(result));
  }
}

export class SerpApiGoogleWebSearchGenerator extends SerpApiWebSearchGenerator {
  readonly id = "serpapi.google-search";
  readonly name = "SerpAPI Google Search";
  readonly effort = 5 as EffortLevel;
  protected readonly numResults = 30;
}
