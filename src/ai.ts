import type {
  AiRequest,
  AiResponse,
  EffortLevel,
  InlineInferenceRequest,
  InlineInferenceResponse
} from "./models";
import { createOpenRouterAiGenerators, openRouterAiGeneratorForEffort } from "./generators/openRouter";

function normalizeEffort(effort?: number): EffortLevel {
  if (!effort || !Number.isFinite(effort)) {
    return 3;
  }

  return Math.min(Math.max(Math.round(effort), 1), 5) as EffortLevel;
}

function requiredPrompt(request: AiRequest) {
  const prompt = request.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  return prompt;
}

function requiredInlineQuery(request: InlineInferenceRequest) {
  const query = request.query.trim();
  if (!query) {
    throw new Error("Query is required.");
  }

  if (request.spans.length === 0) {
    throw new Error("At least one inline inference span is required.");
  }

  return query;
}

function inlinePrompt(query: string, spans: string[]) {
  return `You resolve inline placeholders in a web search query.

Return only strict JSON with this exact shape:
{"substitutions":["..."],"resolvedQuery":"..."}

Rules:
- The user query may contain placeholders formatted as *(...).
- You are given all placeholder contents in order.
- Return one concise substitution for each placeholder, in the same order.
- Each substitution should make the search query concrete and real.
- Do not include explanations, markdown, code fences, or extra keys.
- resolvedQuery must be the complete search query after replacing every placeholder with its substitution.

Full query:
${JSON.stringify(query)}

Placeholder contents in order:
${JSON.stringify(spans)}`;
}

function parseInlineJson(text: string) {
  const trimmed = text.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const jsonText = unwrapped.match(/\{[\s\S]*\}/)?.[0] ?? unwrapped;
  try {
    return JSON.parse(jsonText) as {
      substitutions?: unknown;
      resolvedQuery?: unknown;
    };
  } catch {
    throw new Error("Inline inference returned invalid JSON.");
  }
}

function reconstructInlineQuery(query: string, substitutions: string[]) {
  let index = 0;
  return query.replace(/\*\(([^)]*)\)/g, () => substitutions[index++] ?? "");
}

export function aiEffortConfig() {
  const generators = createOpenRouterAiGenerators();
  return {
    provider: "openrouter",
    api: "OpenRouter chat completions",
    levels: Object.fromEntries(generators.map((generator) => [
      generator.effort,
      generator.describe()
    ]))
  };
}

export async function answer(request: AiRequest): Promise<AiResponse> {
  const prompt = requiredPrompt(request);
  const effort = normalizeEffort(request.effort);
  const startedAt = performance.now();
  const generator = openRouterAiGeneratorForEffort(effort);
  const result = await generator.execute({ prompt });

  return {
    prompt,
    text: result.text,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    debug: result.debug,
    elapsedMs: performance.now() - startedAt
  };
}

export async function resolveInlineInference(request: InlineInferenceRequest): Promise<InlineInferenceResponse> {
  const query = requiredInlineQuery(request);
  const effort = normalizeEffort(request.effort);
  const startedAt = performance.now();
  const generator = openRouterAiGeneratorForEffort(effort);
  const result = await generator.execute({
    prompt: inlinePrompt(query, request.spans)
  });
  const parsed = parseInlineJson(result.text);

  if (!Array.isArray(parsed.substitutions)) {
    throw new Error("Inline inference response did not include substitutions.");
  }

  const substitutions = parsed.substitutions.map((value) => String(value).trim());
  if (substitutions.length !== request.spans.length) {
    throw new Error("Inline inference substitution count did not match placeholders.");
  }

  if (substitutions.some((value) => value.length === 0)) {
    throw new Error("Inline inference returned an empty substitution.");
  }

  const resolvedQuery = reconstructInlineQuery(query, substitutions);
  if (typeof parsed.resolvedQuery !== "string" || parsed.resolvedQuery.trim() !== resolvedQuery) {
    throw new Error("Inline inference resolved query did not match substitutions.");
  }

  return {
    query,
    spans: request.spans,
    substitutions,
    resolvedQuery,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    debug: result.debug,
    elapsedMs: performance.now() - startedAt
  };
}
