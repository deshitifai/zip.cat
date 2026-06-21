import type {
  CacheDescriptor,
  JsonSchema,
  SlashCommandArgument,
  SlashCommandDescriptor,
  SlashCommandPlacement,
  SlashCommandRequest,
  SlashCommandResponse,
  TriggerQualification
} from "../models";

export interface SlashCommandContext {
  request: {
    query: string;
    command?: string;
    args: Record<string, unknown>;
  };
  startedAt: number;
}

export abstract class SlashCommand<TArgs extends Record<string, unknown>, TOutput> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly command: `/${string}`;
  abstract readonly description: string;
  abstract readonly arguments: SlashCommandArgument[];
  abstract readonly placement: SlashCommandPlacement;
  abstract readonly outputSchema: JsonSchema;

  // Optional: declare a cache TTL to make this command's output cacheable in the
  // browser, keyed by command + args and validated against `outputSchema`.
  readonly cache?: CacheDescriptor;

  protected readonly triggerPatterns: RegExp[] = [];

  enabled() {
    return true;
  }

  describe(): SlashCommandDescriptor {
    return {
      id: this.id,
      name: this.name,
      command: this.command,
      description: this.description,
      arguments: this.arguments,
      placement: this.placement,
      outputSchema: this.outputSchema,
      ...(this.cache ? { cache: this.cache } : {})
    };
  }

  triggerQualify(context: SlashCommandContext): TriggerQualification {
    const query = context.request.query.trim();
    const command = context.request.command?.trim();
    const explicitCommand = command === this.command || query === this.command || query.startsWith(`${this.command} `);
    const patternMatch = this.triggerPatterns.some((pattern) => pattern.test(query));

    return {
      qualified: explicitCommand || patternMatch,
      reason: explicitCommand || patternMatch ? undefined : `${this.command} did not match the input.`
    };
  }

  protected argumentValue(context: SlashCommandContext, name: string) {
    const value = context.request.args[name];
    return typeof value === "string" ? value.trim() : value;
  }

  abstract parseArguments(context: SlashCommandContext): TArgs;
  abstract executeCommand(args: TArgs, context: SlashCommandContext): Promise<TOutput> | TOutput;

  async execute(context: SlashCommandContext): Promise<SlashCommandResponse> {
    const args = this.parseArguments(context);
    const output = await this.executeCommand(args, context);

    return {
      commandId: this.id,
      commandName: this.name,
      command: this.command,
      query: context.request.query,
      args,
      placement: this.placement,
      schema: this.outputSchema,
      output,
      elapsedMs: Math.round(performance.now() - context.startedAt)
    };
  }
}

export abstract class LookupSlashCommand<TArgs extends Record<string, unknown>, TOutput>
  extends SlashCommand<TArgs, TOutput> {
  readonly placement: SlashCommandPlacement = {
    target: "results",
    renderer: "json"
  } as const;
}

export abstract class WeatherSlashCommand<TArgs extends Record<string, unknown>, TOutput>
  extends LookupSlashCommand<TArgs, TOutput> {
  readonly placement: SlashCommandPlacement = {
    target: "results",
    renderer: "weather-card"
  } as const;
}

export abstract class LanesSlashCommand<TArgs extends Record<string, unknown>, TOutput>
  extends LookupSlashCommand<TArgs, TOutput> {
  readonly placement: SlashCommandPlacement = {
    target: "results",
    renderer: "lanes-card"
  } as const;
}

export function createSlashContext(request: SlashCommandRequest): SlashCommandContext {
  return {
    request: {
      query: request.query.trim(),
      command: request.command,
      args: request.args ?? {}
    },
    startedAt: performance.now()
  };
}
