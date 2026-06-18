import type { EffortLevel, SearchResult } from "../models";

export type GeneratorKind = "web-search" | "ai";

export interface GeneratorDescriptor {
  id: string;
  name: string;
  kind: GeneratorKind;
  provider: string;
  api: string;
  effort: EffortLevel;
  label: string;
  detail: string;
}

export interface WebSearchRequest {
  query: string;
  limit: number;
}

export interface AiGenerateRequest {
  prompt: string;
}

export abstract class ResultGenerator<TRequest, TResult> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly kind: GeneratorKind;
  abstract readonly provider: string;
  abstract readonly api: string;
  abstract readonly effort: EffortLevel;

  abstract describe(): GeneratorDescriptor;
  abstract execute(request: TRequest): Promise<TResult>;
}

export abstract class WebSearchGenerator extends ResultGenerator<WebSearchRequest, SearchResult[]> {
  readonly kind = "web-search" as const;
}

export interface AiGenerationResult {
  text: string;
  model: string;
  provider: string;
}

export abstract class AiGenerator extends ResultGenerator<AiGenerateRequest, AiGenerationResult> {
  readonly kind = "ai" as const;
}
