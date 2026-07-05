import type {
  AiChatMessage,
  AiRequest,
  AiResponse,
  EffortLevel,
  InlineInferenceRequest,
  InlineInferenceResponse,
  SearchResult,
  SearchShapeRequest,
  SearchShapeResponse,
  TypedOutputDescriptor
} from "./models";
import { createOpenRouterAiGenerators, openRouterAiGeneratorForEffort } from "./generators/openRouter";
import { stripTypedOutputRefs, typedOutputForId } from "./typedOutputs";

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

function typedOutputInstruction(descriptor: TypedOutputDescriptor, prompt: string) {
  return `${prompt}

${typedOutputFormatAppendix(descriptor)}`;
}

function typedOutputMessages(descriptor: TypedOutputDescriptor, messages: AiChatMessage[]) {
  const nextMessages = messages.map((message) => ({ ...message }));
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === "user") {
      nextMessages[index].content = typedOutputInstruction(
        descriptor,
        stripTypedOutputRefs(nextMessages[index].content)
      );
      return nextMessages;
    }
  }
  return [
    ...nextMessages,
    {
      role: "user" as const,
      content: typedOutputFormatAppendix(descriptor)
    }
  ];
}

function typedOutputFormatAppendix(descriptor: TypedOutputDescriptor) {
  if (descriptor.renderer === "boolean") {
    return `Output format requested by the user:
First solve the user's request exactly as you would if no output format had been requested. The format must not change the answer you choose. Then encode only that final answer as a single JSON boolean literal.

Output rules:
- Return exactly true or false and nothing else.
- Correct examples: true, false
- Incorrect examples: {"type":"boolean"}, {"answer":true}, "true", True
- Do not include markdown, prose, code fences, comments, or explanation.`;
  }

  if (descriptor.renderer === "url") {
    return `Output format requested by the user:
First solve the user's request exactly as you would if no output format had been requested. The format must not change the destination you choose. Then encode only the best destination URL as a single JSON string.

URL rules:
- Return the canonical page that best satisfies the user's request.
- Prefer a direct article, product, venue, documentation, profile, or official page over a search-results page or homepage.
- The URL must be absolute and use http:// or https://.
- Do not return tracking redirects, JavaScript URLs, mailto links, or relative URLs.

Output rules:
- Return exactly one JSON string and nothing else.
- Correct example: "https://example.com/path"
- Incorrect examples: {"url":"https://example.com/path"}, https://example.com/path, [https://example.com/path](https://example.com/path)
- Do not include markdown, prose, code fences, comments, or explanation.`;
  }

  if (descriptor.renderer === "restaurant-card" || descriptor.renderer === "restaurant-list") {
    return `Output format requested by the user:
First solve the user's request exactly as you would if no output format had been requested. The format must not change which restaurant/place entity or entities you choose.

Then return only JSON for the chosen entity or entities. The JSON must describe the restaurant/place itself, not the user's search, not why it was chosen, and not a recommendation rationale.

Entity rules:
- Treat each returned item as a place record.
- Do not put answer prose, rankings, "top-rated", "best", "recommended", "known for", or search-context language into any field.
- Prefer concrete fields: name, category, cuisine, address, city, region, postalCode, country, website, phone, priceRange, rating, ratingSource, mapQuery.
- Use category for the type of place, e.g. "Ice cream shop".
- mapQuery should be a stable map lookup string for the entity, preferably "Name, street address, city, region".
- Omit optional fields when the evidence does not support them.
- Do not invent precise addresses, phone numbers, ratings, websites, or map details when uncertain.

Output rules:
- Return exactly one JSON value and nothing else.
- Do not include markdown, prose, code fences, comments, or explanation outside the JSON value.
- The JSON value must validate against the schema below.

Schema:
${JSON.stringify(descriptor.schema, null, 2)}`;
  }

  return `Output format requested by the user:
First solve the user's request exactly as you would if no output format had been requested. The format must not change the answer you choose. Then encode only that final answer as JSON matching ${descriptor.marker}.

Output rules:
- Return exactly one JSON value and nothing else.
- Do not include markdown, prose, code fences, comments, or explanation outside the JSON value.
- The JSON value must validate against the schema below.
- Include only fields that help answer the user's request.
- Omit optional fields when you do not have enough support for them.
- Do not invent precise addresses, phone numbers, ratings, websites, or map details when uncertain.

Schema:
${JSON.stringify(descriptor.schema, null, 2)}`;
}

function parseTypedOutputJson(text: string, descriptor: TypedOutputDescriptor) {
  const trimmed = text.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const jsonText = unwrapped.match(/(?:\{[\s\S]*\}|\[[\s\S]*\]|true|false|null|"[^"]*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0] ?? unwrapped;

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (descriptor.renderer === "boolean" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      for (const key of ["value", "answer", "result", "bool", "boolean", "type"]) {
        if (typeof record[key] === "boolean") {
          return record[key];
        }
      }
      throw new Error(`AI response did not return a boolean for ${descriptor.marker}.`);
    }
    if (descriptor.renderer === "url") {
      if (typeof parsed === "string" && /^https?:\/\//i.test(parsed.trim())) {
        return parsed.trim();
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        for (const key of ["url", "href", "link"]) {
          if (typeof record[key] === "string" && /^https?:\/\//i.test(record[key].trim())) {
            return record[key].trim();
          }
        }
      }
      throw new Error(`AI response did not return an absolute http(s) URL for ${descriptor.marker}.`);
    }
    return parsed;
  } catch {
    throw new Error(`AI response did not return valid JSON for ${descriptor.marker}.`);
  }
}

function searchShapePrompt(options: {
  descriptor: TypedOutputDescriptor;
  prompt: string;
  searchQuery: string;
  results: SearchResult[];
  pageEvidence: PageEvidence[];
}) {
  return `Answer the user's request using the supplied web search results and page evidence.

User request:
${options.prompt}

Search query that produced the evidence:
${options.searchQuery}

Your primary job is to identify the best answer to the user's request from the evidence. Do not merely reformat the first result. Compare relevance, source quality, locality, and specificity. Use fetched page evidence when it materially improves the answer.

${typedOutputFormatAppendix(options.descriptor)}

Search results JSON:
${JSON.stringify(options.results, null, 2)}

Fetched page evidence JSON:
${JSON.stringify(options.pageEvidence, null, 2)}`;
}

type PageEvidence = {
  url: string;
  title?: string;
  ok: boolean;
  text?: string;
  error?: string;
};

function pageTextFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function fetchPageEvidence(results: SearchResult[], effort: EffortLevel): Promise<PageEvidence[]> {
  const pageLimit = Math.min(results.length, Math.max(1, effort));
  return Promise.all(results.slice(0, pageLimit).map(async (result) => {
    try {
      const response = await fetch(result.url, {
        headers: {
          "user-agent": "zip.cat/0.1"
        },
        signal: AbortSignal.timeout(3500)
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        return {
          url: result.url,
          title: result.title,
          ok: false,
          error: `HTTP ${response.status}`
        };
      }
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return {
          url: result.url,
          title: result.title,
          ok: false,
          error: `Unsupported content type ${contentType || "unknown"}`
        };
      }
      return {
        url: result.url,
        title: result.title,
        ok: true,
        text: pageTextFromHtml(await response.text())
      };
    } catch (error) {
      return {
        url: result.url,
        title: result.title,
        ok: false,
        error: error instanceof Error ? error.message : "Fetch failed"
      };
    }
  }));
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
  const requestedTypedOutput = typedOutputForId(request.outputSchemaId);
  const modelPrompt = requestedTypedOutput
    ? typedOutputInstruction(requestedTypedOutput, stripTypedOutputRefs(prompt))
    : prompt;
  const modelMessages = request.messages?.length
    ? requestedTypedOutput
      ? typedOutputMessages(requestedTypedOutput, request.messages)
      : request.messages
    : undefined;
  const result = await generator.execute({
    prompt: modelPrompt,
    messages: modelMessages,
    responseSchema: requestedTypedOutput
      ? {
        name: requestedTypedOutput.name,
        schema: requestedTypedOutput.schema
      }
      : undefined
  });
  const typedValue = requestedTypedOutput
    ? parseTypedOutputJson(result.text, requestedTypedOutput)
    : undefined;

  return {
    prompt,
    text: result.text,
    model: result.model,
    provider: result.provider,
    typedOutput: requestedTypedOutput
      ? {
        descriptor: requestedTypedOutput,
        value: typedValue,
        rawText: result.text
      }
      : undefined,
    usage: result.usage,
    debug: result.debug,
    elapsedMs: performance.now() - startedAt
  };
}

export async function shapeSearchResults(request: SearchShapeRequest): Promise<SearchShapeResponse> {
  const prompt = requiredPrompt({ prompt: request.prompt });
  const searchQuery = request.searchQuery.trim();
  if (!searchQuery) {
    throw new Error("Search query is required.");
  }
  const descriptor = typedOutputForId(request.outputSchemaId);
  if (!descriptor) {
    throw new Error(`Unknown typed output schema ${request.outputSchemaId}.`);
  }

  const effort = normalizeEffort(request.effort);
  const startedAt = performance.now();
  const generator = openRouterAiGeneratorForEffort(effort);
  const pageEvidence = await fetchPageEvidence(request.results, effort);
  const modelPrompt = searchShapePrompt({
    descriptor,
    prompt: stripTypedOutputRefs(prompt),
    searchQuery,
    results: request.results,
    pageEvidence
  });
  const result = await generator.execute({
    prompt: modelPrompt,
    responseSchema: {
      name: descriptor.name,
      schema: descriptor.schema
    }
  });
  const typedValue = parseTypedOutputJson(result.text, descriptor);

  return {
    prompt,
    searchQuery,
    resultCount: request.results.length,
    text: result.text,
    model: result.model,
    provider: result.provider,
    typedOutput: {
      descriptor,
      value: typedValue,
      rawText: result.text
    },
    usage: result.usage,
    debug: {
      searchQuery,
      typedOutput: descriptor.marker,
      modelPrompt,
      pageEvidence,
      modelProviderCall: result.debug?.providerCall
    },
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
