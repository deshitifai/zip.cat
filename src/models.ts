export interface SearchRequest {
  query: string;
  limit?: number;
  effort?: number;
  trigger?: SearchTrigger;
}

export interface SuggestRequest {
  query: string;
  trigger?: SuggestTrigger;
}

export interface AiRequest {
  prompt: string;
  effort?: number;
  trigger?: SearchTrigger;
}

export type EffortLevel = 1 | 2 | 3 | 4 | 5;

export interface SearchResult {
  url: string;
  title?: string;
  score?: number;
  provider: string;
}

export type JsonSchema = Record<string, unknown>;

export interface SearchTrigger {
  type: "keyboard";
  key: "Enter";
  source: "search-box";
}

export interface SuggestTrigger {
  type: "input-change";
  source: "search-box";
}

export interface ResultPlacement {
  target: "results";
  renderer: "url-table";
}

export interface SearchPluginResultSet {
  pluginId: string;
  placement: ResultPlacement;
  schema: JsonSchema;
  results: SearchResult[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  resultSets: SearchPluginResultSet[];
  elapsedMs: number;
}

export interface NormalizedSearchRequest {
  query: string;
  limit: number;
  effort: EffortLevel;
  trigger: SearchTrigger;
}

export interface SearchContext {
  request: NormalizedSearchRequest;
  startedAt: number;
}

export interface Suggestion {
  title: string;
  url: string;
  description?: string;
  fullDescription?: string;
  provider: string;
}

export interface SuggestionPlacement {
  target: "command-line";
  renderer: "pill";
}

export interface SuggestPluginResultSet {
  pluginId: string;
  placement: SuggestionPlacement;
  schema: JsonSchema;
  suggestions: Suggestion[];
}

export interface SuggestResponse {
  query: string;
  suggestions: Suggestion[];
  resultSets: SuggestPluginResultSet[];
  elapsedMs: number;
}

export interface AiResponse {
  prompt: string;
  text: string;
  model: string;
  provider: string;
  elapsedMs: number;
}

export interface SuggestContext {
  request: Required<SuggestRequest>;
  startedAt: number;
}

export interface TriggerQualification {
  qualified: boolean;
  reason?: string;
}

export interface SearchPlugin {
  id: string;
  name: string;
  resultPlacement: ResultPlacement;
  resultsSchema: JsonSchema;
  enabled(): boolean;
  triggerQualify(context: SearchContext): Promise<TriggerQualification> | TriggerQualification;
  triggerExecute(context: SearchContext): Promise<SearchPluginResultSet>;
}

export interface SuggestPlugin {
  id: string;
  name: string;
  resultPlacement: SuggestionPlacement;
  resultsSchema: JsonSchema;
  enabled(): boolean;
  triggerQualify(context: SuggestContext): Promise<TriggerQualification> | TriggerQualification;
  triggerExecute(context: SuggestContext): Promise<SuggestPluginResultSet>;
}

export interface ResultFilterPlugin {
  id: string;
  apply(results: SearchResult[], context: SearchContext): Promise<SearchResult[]> | SearchResult[];
}

export interface PluginRegistry {
  search: SearchPlugin[];
  suggest: SuggestPlugin[];
  filters: ResultFilterPlugin[];
}
