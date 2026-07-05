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
import { DEFAULT_INSTALL_CONFIG, type InstallConfig } from "./install";

export interface SlashCommandContext {
  request: {
    query: string;
    command?: string;
    args: Record<string, unknown>;
  };
  startedAt: number;
}

// Result of an *implicit* (no leading slash) detection: the command recognised
// the raw input as something it can handle — a math formula, a "1 cup in qt"
// phrase, a ticker symbol — without the user typing `/command`.
export interface ImplicitMatch<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  // 0..1 — how sure the command is that this input is meant for it. Used to pick
  // a winner when several commands match and to gate against the configured
  // minConfidence threshold.
  confidence: number;
  // Parsed arguments, ready to hand straight to executeCommand — no re-parse.
  args: TArgs;
  // A short, human-readable label for the match (e.g. the normalised expression
  // or the resolved "1 cup → qt"). Optional; the renderer may show it.
  label?: string;
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

  // Default install config for this command. Subclasses override to opt into
  // implicit pickup and choose its render mode; deployments layer further
  // overrides via resolveInstallConfig (see ./install.ts).
  readonly installDefaults: InstallConfig = DEFAULT_INSTALL_CONFIG;

  enabled() {
    return true;
  }

  // Optional: implicit (no-slash) detection. Return a match when the raw input
  // — without a leading `/command` — should be handled by this command, e.g.
  // a bare math formula for /calc or a ticker symbol for /stock. Return
  // undefined when the input isn't ours. Must be pure + synchronous so the
  // client can run every command's detector on each keystroke with no network.
  detectImplicit?(query: string): ImplicitMatch<TArgs> | undefined;

  // Optional: autocomplete a partial implicit input to a fuller form, e.g.
  // "35 f i" -> "35 f in c". Return the completed string (the full input,
  // not just the suffix) or undefined when there's nothing to complete.
  completeImplicit?(query: string): string | undefined;

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

export abstract class StockSlashCommand<TArgs extends Record<string, unknown>, TOutput>
  extends LookupSlashCommand<TArgs, TOutput> {
  readonly placement: SlashCommandPlacement = {
    target: "results",
    renderer: "stock-card"
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
