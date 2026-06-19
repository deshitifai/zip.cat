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

export interface InlineInferenceRequest {
  query: string;
  spans: string[];
  effort?: number;
}

export interface InlineInferenceResponse {
  query: string;
  spans: string[];
  substitutions: string[];
  resolvedQuery: string;
  model: string;
  provider: string;
  usage?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  elapsedMs: number;
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

export interface SlashCommandPlacement {
  target: "results";
  renderer: "weather-card" | "json";
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
  usage?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  elapsedMs: number;
}

export type SlashArgumentType = "text" | "number" | "boolean" | "choice";

export interface SlashCommandArgument {
  name: string;
  label: string;
  type: SlashArgumentType;
  required: boolean;
  placeholder?: string;
  widthChars?: number;
  choices?: Array<{
    label: string;
    value: string;
  }>;
}

export interface SlashCommandDescriptor {
  id: string;
  name: string;
  command: `/${string}`;
  description: string;
  arguments: SlashCommandArgument[];
  placement: SlashCommandPlacement;
  outputSchema: JsonSchema;
}

export interface SlashCommandRequest {
  query: string;
  command?: string;
  args?: Record<string, unknown>;
  trigger?: SearchTrigger;
}

export interface SlashCommandResponse {
  commandId: string;
  commandName: string;
  command: `/${string}`;
  query: string;
  args: Record<string, unknown>;
  placement: SlashCommandPlacement;
  schema: JsonSchema;
  output: unknown;
  elapsedMs: number;
  debug?: Record<string, unknown>;
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

export interface SlashCommandRegistry {
  commands: SlashCommandDescriptor[];
}
