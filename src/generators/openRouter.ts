import type { EffortLevel } from "../models";
import {
  AiGenerator,
  type AiGenerateRequest,
  type AiGenerationResult,
  type GeneratorDescriptor
} from "./base";

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export abstract class GenericAiGenerator extends AiGenerator {}

export abstract class OpenRouterAiGenerator extends GenericAiGenerator {
  readonly provider = "openrouter";
  readonly api = "OpenRouter chat completions";

  protected abstract readonly configuredModel: string;

  enabled() {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }

  describe(): GeneratorDescriptor {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      provider: this.provider,
      api: this.api,
      effort: this.effort,
      label: this.configuredModel,
      detail: `model ${this.configuredModel}`
    };
  }

  async execute(request: AiGenerateRequest): Promise<AiGenerationResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
        "http-referer": "https://zip.cat",
        "x-title": "zip.cat"
      },
      body: JSON.stringify({
        model: this.configuredModel,
        messages: [
          {
            role: "system",
            content: "Answer directly and concisely."
          },
          {
            role: "user",
            content: request.prompt
          }
        ]
      })
    });

    const payload = await response.json() as ChatCompletionResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `AI request failed with ${response.status}.`);
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("AI response was empty.");
    }

    return {
      text,
      model: payload.model ?? this.configuredModel,
      provider: this.provider
    };
  }
}

export class OpenRouterGpt41NanoGenerator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.gpt-4.1-nano";
  readonly name = "OpenRouter GPT-4.1 Nano";
  readonly effort = 1;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_1
    ?? process.env.OPENROUTER_MODEL_EFFORT_1
    ?? "openai/gpt-4.1-nano";
}

export class OpenRouterGpt41MiniGenerator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.gpt-4.1-mini";
  readonly name = "OpenRouter GPT-4.1 Mini";
  readonly effort = 2;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_2
    ?? process.env.OPENROUTER_MODEL_EFFORT_2
    ?? "openai/gpt-4.1-mini";
}

export class OpenRouterAutoGenerator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.auto";
  readonly name = "OpenRouter Auto";
  readonly effort = 3;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_3
    ?? process.env.OPENROUTER_MODEL_EFFORT_3
    ?? process.env.AI_MODEL
    ?? "openrouter/auto";
}

export class OpenRouterGpt41Generator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.gpt-4.1";
  readonly name = "OpenRouter GPT-4.1";
  readonly effort = 4;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_4
    ?? process.env.OPENROUTER_MODEL_EFFORT_4
    ?? "openai/gpt-4.1";
}

export class OpenRouterGpt55Generator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.gpt-5.5";
  readonly name = "OpenRouter GPT-5.5";
  readonly effort = 5;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_5
    ?? process.env.OPENROUTER_MODEL_EFFORT_5
    ?? "openai/gpt-5.5-20260423";
}

export function createOpenRouterAiGenerators() {
  return [
    new OpenRouterGpt41NanoGenerator(),
    new OpenRouterGpt41MiniGenerator(),
    new OpenRouterAutoGenerator(),
    new OpenRouterGpt41Generator(),
    new OpenRouterGpt55Generator()
  ];
}

export function openRouterAiGeneratorForEffort(effort: EffortLevel) {
  return createOpenRouterAiGenerators().find((generator) => generator.effort === effort)
    ?? new OpenRouterAutoGenerator();
}
