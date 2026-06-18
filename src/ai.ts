import type { AiRequest, AiResponse, EffortLevel } from "./models";
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
    elapsedMs: performance.now() - startedAt
  };
}
