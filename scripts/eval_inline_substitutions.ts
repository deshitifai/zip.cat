import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadEnv } from "../src/env";

type EvalCase = {
  id: string;
  category: string;
  query: string;
  spans: string[];
  expectedSubstitutions: string[][];
  expectedResolvedQuery: string;
};

type EvalFile = {
  cases: EvalCase[];
};

type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ModelResult = {
  model: string;
  provider: string;
  text: string;
  elapsedMs: number;
  usage?: unknown;
  skipped?: false;
};

type SkippedModelResult = {
  model: string;
  provider: string;
  text: "";
  elapsedMs: 0;
  skipped: true;
  skipReason: string;
};

type ParsedInline = {
  substitutions: string[];
  resolvedQuery: string;
};

type CaseResult = {
  model: string;
  provider: string;
  caseId: string;
  category: string;
  query: string;
  spans: string[];
  expectedSubstitutions: string[][];
  expectedResolvedQuery: string;
  prompt: string;
  messages: AiChatMessage[];
  rawText: string;
  parsed?: ParsedInline;
  reconstructedQuery?: string;
  checks: {
    skipped: boolean;
    parseValid: boolean;
    substitutionsMatch: boolean;
    resolvedMatchesReconstructionExact: boolean;
    resolvedMatchesExpectedNormalized: boolean;
    reconstructedMatchesExpectedNormalized: boolean;
  };
  passed: boolean;
  elapsedMs: number;
  usage?: unknown;
  error?: string;
  skipReason?: string;
};

const defaultCasesPath = "evals/inline-substitutions.json";
const defaultModels = ["openrouter:openai/gpt-4.1-mini", "local-gemma-node"];

function usage() {
  return `Usage:
  bun scripts/eval_inline_substitutions.ts [options]

Options:
  --models <list>       Comma-separated model adapters.
                        Examples: openrouter:openai/gpt-4.1-mini,openrouter:openrouter/auto,local-gemma-node
  --cases <path>        Eval JSON path. Default: ${defaultCasesPath}
  --case <id>           Run only one case id. Can be repeated.
  --out <path>          Write JSON results to path. Default: evals/results/inline-substitutions-<timestamp>.json
  --no-out             Do not write JSON results.
  --help               Show this help.
`;
}

function args() {
  const result = {
    models: defaultModels,
    casesPath: defaultCasesPath,
    caseIds: [] as string[],
    outPath: undefined as string | undefined,
    writeOut: true
  };

  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--models") {
      result.models = (argv[++index] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--cases") {
      result.casesPath = argv[++index] ?? result.casesPath;
      continue;
    }
    if (arg === "--case") {
      result.caseIds.push(argv[++index] ?? "");
      continue;
    }
    if (arg === "--out") {
      result.outPath = argv[++index];
      continue;
    }
    if (arg === "--no-out") {
      result.writeOut = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return result;
}

function inlineResolutionPrompt(query: string, spans: string[]) {
  return `Resolve inline placeholders in a web search query.

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

function inlineResolutionMessages(query: string, spans: string[]): AiChatMessage[] {
  return [
    {
      role: "system",
      content: "You are a JSON-only query placeholder resolver. Return exactly one valid JSON object and no prose."
    },
    {
      role: "user",
      content: inlineResolutionPrompt(query, spans)
    }
  ];
}

function parseInlineResolutionJson(text: string): ParsedInline {
  const trimmed = text.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const jsonText = unwrapped.match(/\{[\s\S]*\}/)?.[0] ?? unwrapped;
  const parsed = JSON.parse(jsonText) as {
    substitutions?: unknown;
    resolvedQuery?: unknown;
  };
  if (!Array.isArray(parsed.substitutions) || typeof parsed.resolvedQuery !== "string") {
    throw new Error("Inline inference returned invalid JSON shape.");
  }
  return {
    substitutions: parsed.substitutions.map((value) => String(value).trim()),
    resolvedQuery: parsed.resolvedQuery.trim()
  };
}

function reconstructInlineQuery(query: string, substitutions: string[]) {
  let index = 0;
  return query.replace(/\*\(([^)]*)\)/g, () => substitutions[index++] ?? "");
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function substitutionMatches(actual: string | undefined, allowed: string[]) {
  if (!actual) {
    return false;
  }
  const normalizedActual = normalize(actual);
  return allowed.some((expected) => normalize(expected) === normalizedActual);
}

async function runOpenRouter(model: string, messages: AiChatMessage[]): Promise<ModelResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const startedAt = performance.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://zip.cat",
      "x-title": "zip.cat evals"
    },
    body: JSON.stringify({
      model,
      messages
    })
  });
  const text = await response.text();
  let payload: {
    model?: string;
    usage?: unknown;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter returned non-JSON HTTP ${response.status}: ${text.slice(0, 180)}`);
  }
  if (!response.ok) {
    throw new Error(`OpenRouter ${model} failed with HTTP ${response.status}: ${payload.error?.message ?? "unknown error"}`);
  }
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`OpenRouter ${model} returned an empty completion.`);
  }
  return {
    model: payload.model ?? model,
    provider: "openrouter",
    text: content,
    elapsedMs: performance.now() - startedAt,
    usage: payload.usage
  };
}

async function runLocalGemmaNode(messages: AiChatMessage[]): Promise<ModelResult | SkippedModelResult> {
  const gpu = (globalThis.navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<unknown>;
    };
  } | undefined)?.gpu;
  if (!gpu) {
    return {
      model: "google/gemma-4-E2B-it-qat-mobile-transformers",
      provider: "local-gemma-node",
      text: "",
      elapsedMs: 0,
      skipped: true,
      skipReason: "navigator.gpu is not available in this Node/Bun runtime. Run local Gemma browser evals in a WebGPU browser context."
    };
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    return {
      model: "google/gemma-4-E2B-it-qat-mobile-transformers",
      provider: "local-gemma-node",
      text: "",
      elapsedMs: 0,
      skipped: true,
      skipReason: "WebGPU is present but no adapter was available."
    };
  }

  const startedAt = performance.now();
  const { Gemma4Mobile } = await import("../vendor/gemma-4-e2b.js") as {
    Gemma4Mobile: {
      load: (
        model?: string | null,
        options?: {
          cache?: boolean;
          cacheName?: string;
          onProgress?: (progress: unknown) => void;
        }
      ) => Promise<{
        warmup?: () => Promise<void>;
        generate: (
          messages: AiChatMessage[],
          options: { maxNewTokens?: number }
        ) => AsyncGenerator<{ text: string }>;
      }>;
    };
  };
  const model = await Gemma4Mobile.load(null, {
    cache: true,
    cacheName: "zip-cat-gemma-4-webgpu-node-evals"
  });
  await model.warmup?.();

  let text = "";
  for await (const chunk of model.generate(messages, { maxNewTokens: 128 })) {
    text = chunk.text;
  }

  return {
    model: "google/gemma-4-E2B-it-qat-mobile-transformers",
    provider: "local-gemma-node",
    text: text.trim(),
    elapsedMs: performance.now() - startedAt
  };
}

async function runModel(modelSpec: string, messages: AiChatMessage[]) {
  if (modelSpec.startsWith("openrouter:")) {
    return runOpenRouter(modelSpec.slice("openrouter:".length), messages);
  }
  if (modelSpec === "local-gemma-node") {
    return runLocalGemmaNode(messages);
  }
  throw new Error(`Unknown model adapter: ${modelSpec}`);
}

function scoreCase(testCase: EvalCase, modelSpec: string, modelResult: ModelResult | SkippedModelResult, prompt: string, messages: AiChatMessage[]): CaseResult {
  if (modelResult.skipped) {
    return {
      model: modelResult.model,
      provider: modelResult.provider,
      caseId: testCase.id,
      category: testCase.category,
      query: testCase.query,
      spans: testCase.spans,
      expectedSubstitutions: testCase.expectedSubstitutions,
      expectedResolvedQuery: testCase.expectedResolvedQuery,
      prompt,
      messages,
      rawText: "",
      checks: {
        skipped: true,
        parseValid: false,
        substitutionsMatch: false,
        resolvedMatchesReconstructionExact: false,
        resolvedMatchesExpectedNormalized: false,
        reconstructedMatchesExpectedNormalized: false
      },
      passed: false,
      elapsedMs: 0,
      skipReason: modelResult.skipReason
    };
  }

  let parsed: ParsedInline | undefined;
  let parseError: string | undefined;
  try {
    parsed = parseInlineResolutionJson(modelResult.text);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const reconstructedQuery = parsed ? reconstructInlineQuery(testCase.query, parsed.substitutions) : undefined;
  const substitutionsMatch = Boolean(parsed) &&
    parsed.substitutions.length === testCase.expectedSubstitutions.length &&
    parsed.substitutions.every((substitution, index) => substitutionMatches(substitution, testCase.expectedSubstitutions[index] ?? []));
  const resolvedMatchesReconstructionExact = Boolean(parsed && reconstructedQuery && parsed.resolvedQuery === reconstructedQuery);
  const resolvedMatchesExpectedNormalized = Boolean(parsed && normalize(parsed.resolvedQuery) === normalize(testCase.expectedResolvedQuery));
  const reconstructedMatchesExpectedNormalized = Boolean(reconstructedQuery && normalize(reconstructedQuery) === normalize(testCase.expectedResolvedQuery));
  const passed = Boolean(parsed) &&
    substitutionsMatch &&
    resolvedMatchesReconstructionExact &&
    resolvedMatchesExpectedNormalized &&
    reconstructedMatchesExpectedNormalized;

  return {
    model: modelResult.model || modelSpec,
    provider: modelResult.provider,
    caseId: testCase.id,
    category: testCase.category,
    query: testCase.query,
    spans: testCase.spans,
    expectedSubstitutions: testCase.expectedSubstitutions,
    expectedResolvedQuery: testCase.expectedResolvedQuery,
    prompt,
    messages,
    rawText: modelResult.text,
    parsed,
    reconstructedQuery,
    checks: {
      skipped: false,
      parseValid: Boolean(parsed),
      substitutionsMatch,
      resolvedMatchesReconstructionExact,
      resolvedMatchesExpectedNormalized,
      reconstructedMatchesExpectedNormalized
    },
    passed,
    elapsedMs: modelResult.elapsedMs,
    usage: modelResult.usage,
    error: parseError
  };
}

async function loadCases(path: string) {
  const file = await Bun.file(path).json() as EvalFile;
  return file.cases;
}

function statusFor(result: CaseResult) {
  if (result.checks.skipped) return "SKIP";
  return result.passed ? "PASS" : "FAIL";
}

function printSummary(results: CaseResult[]) {
  const runnable = results.filter((result) => !result.checks.skipped);
  const passed = runnable.filter((result) => result.passed).length;
  const skipped = results.filter((result) => result.checks.skipped).length;
  console.log("");
  console.log("Inline substitution eval results");
  console.log("model\tcase\tstatus\tparse\tsubs\tcontract\texpected\tms");
  results.forEach((result) => {
    console.log([
      result.provider === "openrouter" ? result.model : result.provider,
      result.caseId,
      statusFor(result),
      result.checks.parseValid ? "ok" : "bad",
      result.checks.substitutionsMatch ? "ok" : "bad",
      result.checks.resolvedMatchesReconstructionExact ? "ok" : "bad",
      result.checks.reconstructedMatchesExpectedNormalized ? "ok" : "bad",
      Math.round(result.elapsedMs)
    ].join("\t"));
    if (result.error || result.skipReason) {
      console.log(`  ${result.error ?? result.skipReason}`);
    }
  });
  console.log("");
  console.log(`passed ${passed}/${runnable.length}; skipped ${skipped}; total ${results.length}`);
}

async function main() {
  loadEnv();
  const options = args();
  const caseIdSet = new Set(options.caseIds.filter(Boolean));
  const cases = (await loadCases(options.casesPath))
    .filter((testCase) => caseIdSet.size === 0 || caseIdSet.has(testCase.id));
  if (cases.length === 0) {
    throw new Error("No eval cases selected.");
  }

  const results: CaseResult[] = [];
  for (const modelSpec of options.models) {
    for (const testCase of cases) {
      const prompt = inlineResolutionPrompt(testCase.query, testCase.spans);
      const messages = inlineResolutionMessages(testCase.query, testCase.spans);
      try {
        const modelResult = await runModel(modelSpec, messages);
        results.push(scoreCase(testCase, modelSpec, modelResult, prompt, messages));
      } catch (error) {
        results.push({
          model: modelSpec,
          provider: modelSpec.split(":")[0] ?? modelSpec,
          caseId: testCase.id,
          category: testCase.category,
          query: testCase.query,
          spans: testCase.spans,
          expectedSubstitutions: testCase.expectedSubstitutions,
          expectedResolvedQuery: testCase.expectedResolvedQuery,
          prompt,
          messages,
          rawText: "",
          checks: {
            skipped: false,
            parseValid: false,
            substitutionsMatch: false,
            resolvedMatchesReconstructionExact: false,
            resolvedMatchesExpectedNormalized: false,
            reconstructedMatchesExpectedNormalized: false
          },
          passed: false,
          elapsedMs: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  printSummary(results);

  if (options.writeOut) {
    const outPath = options.outPath ?? join("evals", "results", `inline-substitutions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await Bun.write(outPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      models: options.models,
      casesPath: options.casesPath,
      results
    }, null, 2));
    console.log(`wrote ${outPath}`);
  }

  const failed = results.some((result) => !result.checks.skipped && !result.passed);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
