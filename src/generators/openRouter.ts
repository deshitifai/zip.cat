import type { AiChatMessage, EffortLevel } from "../models";
import {
  AiGenerator,
  type AiGenerateRequest,
  type AiGenerationResult,
  type GeneratorDescriptor
} from "./base";

type ChatCompletionResponse = {
  model?: string;
  usage?: Record<string, unknown>;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type OpenRouterRequestBody = {
  model: string;
  messages: AiChatMessage[];
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
};

function parseOpenRouterJson(text: string, status: number) {
  try {
    return JSON.parse(text) as ChatCompletionResponse & { error?: { message?: string } };
  } catch {
    const preview = text.trim().slice(0, 160);
    throw new Error(preview
      ? `OpenRouter returned non-JSON response (${status}): ${preview}`
      : `OpenRouter returned an empty non-JSON response (${status}).`);
  }
}

function pricingForModel(model: string) {
  const knownPrices: Record<string, string> = {
    "openai/gpt-4.1-nano": "$0.10/M input tokens, $0.40/M output tokens",
    "openai/gpt-4.1-mini": "$0.40/M input tokens, $1.60/M output tokens",
    "openai/gpt-4.1": "$2.00/M input tokens, $8.00/M output tokens",
    "openai/gpt-5.5-20260423": "$5.00/M input tokens, $30.00/M output tokens"
  };

  if (model === "openrouter/auto") {
    return "Varies by routed model on OpenRouter Auto.";
  }

  return knownPrices[model] ?? `Varies by configured OpenRouter model (${model}).`;
}

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
      detail: `model ${this.configuredModel}`,
      pricing: pricingForModel(this.configuredModel)
    };
  }

  async execute(request: AiGenerateRequest): Promise<AiGenerationResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const chatMessages = request.messages?.length
      ? [
        ...(request.system
          ? [{
            role: "system" as const,
            content: request.system
          }]
          : []),
        ...request.messages
      ]
      : [
        {
          role: "system" as const,
          content: request.system ?? "Answer directly and concisely."
        },
        {
          role: "user" as const,
          content: request.prompt
        }
      ];

    const makeRequestBody = (includeResponseSchema: boolean): OpenRouterRequestBody => ({
      model: this.configuredModel,
      messages: chatMessages,
      ...(includeResponseSchema && request.responseSchema
        ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.responseSchema.name.replace(/[^A-Za-z0-9_-]/g, "_"),
              strict: false,
              schema: request.responseSchema.schema
            }
          }
        }
        : {})
    });

    const callProvider = async (requestBody: OpenRouterRequestBody) => {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
          "http-referer": "https://zip.cat",
          "x-title": "zip.cat"
        },
        body: JSON.stringify(requestBody)
      });
      return {
        response,
        payload: parseOpenRouterJson(await response.text(), response.status),
        requestBody
      };
    };

    let attempt = await callProvider(makeRequestBody(Boolean(request.responseSchema)));
    const attempts = [attempt];
    if (!attempt.response.ok && request.responseSchema) {
      attempt = await callProvider(makeRequestBody(false));
      attempts.push(attempt);
    }

    const debug = {
      providerCall: {
        url: "https://openrouter.ai/api/v1/chat/completions",
        method: "POST",
        requestHeaders: {
          "content-type": "application/json",
          "http-referer": "https://zip.cat",
          "x-title": "zip.cat"
        },
        requestBody: attempt.requestBody,
        responseStatus: attempt.response.status,
        responseBody: attempt.payload
      },
      attempts: attempts.map((item) => ({
        requestBody: item.requestBody,
        responseStatus: item.response.status,
        responseBody: item.payload
      }))
    };

    if (!attempt.response.ok) {
      const messages = attempts
        .map((item) => {
          const message = item.payload.error?.message ?? "AI request failed.";
          return `OpenRouter ${item.requestBody.model} failed with ${item.response.status}: ${message}`;
        })
        .filter(Boolean);
      throw new Error([...new Set(messages)].join(" Then fallback failed: "));
    }

    const text = attempt.payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("AI response was empty.");
    }

    return {
      text,
      model: attempt.payload.model ?? this.configuredModel,
      provider: this.provider,
      usage: attempt.payload.usage,
      debug
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

export class OpenRouterGpt41HighGenerator extends OpenRouterAiGenerator {
  readonly id = "openrouter.ai.gpt-4.1-high";
  readonly name = "OpenRouter GPT-4.1 High";
  readonly effort = 5;
  protected readonly configuredModel = process.env.AI_MODEL_EFFORT_5
    ?? process.env.OPENROUTER_MODEL_EFFORT_5
    ?? "openai/gpt-4.1";
}

export function createOpenRouterAiGenerators() {
  return [
    new OpenRouterGpt41NanoGenerator(),
    new OpenRouterGpt41MiniGenerator(),
    new OpenRouterAutoGenerator(),
    new OpenRouterGpt41Generator(),
    new OpenRouterGpt41HighGenerator()
  ];
}

export function openRouterAiGeneratorForEffort(effort: EffortLevel) {
  return createOpenRouterAiGenerators().find((generator) => generator.effort === effort)
    ?? new OpenRouterAutoGenerator();
}
