import Exa from "exa-js";
import type { EffortLevel, SearchResult } from "../models";
import { WebSearchGenerator, type GeneratorDescriptor, type WebSearchRequest } from "./base";

type ExaSearchType = "instant" | "fast" | "auto" | "deep-lite" | "deep";

export abstract class GenericWebSearchGenerator extends WebSearchGenerator {}

export abstract class ExaWebSearchGenerator extends GenericWebSearchGenerator {
  readonly provider = "exa";
  readonly api = "Exa search";

  protected abstract readonly searchType: ExaSearchType;
  protected abstract readonly numResults: number;

  enabled() {
    return Boolean(process.env.EXA_API_KEY);
  }

  describe(): GeneratorDescriptor {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      provider: this.provider,
      api: this.api,
      effort: this.effort,
      label: this.searchType,
      detail: `type ${this.searchType}, numResults ${this.numResults}`
    };
  }

  async execute(request: WebSearchRequest): Promise<SearchResult[]> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new Error("EXA_API_KEY is not set.");
    }

    const exa = new Exa(apiKey);
    const response = await exa.search(request.query, {
      type: this.searchType,
      numResults: Math.min(request.limit, this.numResults)
    });

    return response.results
      .map<SearchResult>((result) => ({
        url: result.url,
        title: result.title ?? undefined,
        score: result.score,
        provider: this.id
      }))
      .filter((result) => Boolean(result.url));
  }
}

export class ExaInstantWebSearchGenerator extends ExaWebSearchGenerator {
  readonly id = "exa.web-search.instant";
  readonly name = "Exa Instant Web Search";
  readonly effort = 1;
  protected readonly searchType = "instant";
  protected readonly numResults = 4;
}

export class ExaFastWebSearchGenerator extends ExaWebSearchGenerator {
  readonly id = "exa.web-search.fast";
  readonly name = "Exa Fast Web Search";
  readonly effort = 2;
  protected readonly searchType = "fast";
  protected readonly numResults = 8;
}

export class ExaAutoWebSearchGenerator extends ExaWebSearchGenerator {
  readonly id = "exa.web-search.auto";
  readonly name = "Exa Auto Web Search";
  readonly effort = 3;
  protected readonly searchType = "auto";
  protected readonly numResults = 12;
}

export class ExaDeepLiteWebSearchGenerator extends ExaWebSearchGenerator {
  readonly id = "exa.web-search.deep-lite";
  readonly name = "Exa Deep Lite Web Search";
  readonly effort = 4;
  protected readonly searchType = "deep-lite";
  protected readonly numResults = 20;
}

export class ExaDeepWebSearchGenerator extends ExaWebSearchGenerator {
  readonly id = "exa.web-search.deep";
  readonly name = "Exa Deep Web Search";
  readonly effort = 5;
  protected readonly searchType = "deep";
  protected readonly numResults = 30;
}

export function createExaWebSearchGenerators() {
  return [
    new ExaInstantWebSearchGenerator(),
    new ExaFastWebSearchGenerator(),
    new ExaAutoWebSearchGenerator(),
    new ExaDeepLiteWebSearchGenerator(),
    new ExaDeepWebSearchGenerator()
  ];
}

export function exaWebSearchGeneratorForEffort(effort: EffortLevel) {
  return createExaWebSearchGenerators().find((generator) => generator.effort === effort)
    ?? new ExaAutoWebSearchGenerator();
}
