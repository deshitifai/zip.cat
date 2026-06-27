import type { SlashCommandDescriptor } from "../models";
import { type ImplicitMatch, type SlashCommand, createSlashContext } from "./base";
import { type InstallConfig, type InstallOverrides, resolveInstallConfig } from "./install";
import { weatherSlashCommand } from "./weather";
import { lanesSlashCommand } from "./lanes";
import { calcSlashCommand } from "./calc";
import { convertSlashCommand } from "./convert";
import { passwordSlashCommand } from "./password";
import { qrSlashCommand } from "./qr";
import { stockSlashCommand } from "./stock";

export function createSlashCommandRegistry() {
  return [
    weatherSlashCommand(),
    lanesSlashCommand(),
    calcSlashCommand(),
    convertSlashCommand(),
    passwordSlashCommand(),
    qrSlashCommand(),
    stockSlashCommand()
  ];
}

// A command paired with its resolved (default → env → localStorage → runtime)
// install config. This is what callers iterate over to honour per-installation
// enable/implicit/priority settings.
export interface InstalledCommand {
  command: SlashCommand<Record<string, unknown>, unknown>;
  config: InstallConfig;
}

export function createInstalledRegistry(overrides?: InstallOverrides): InstalledCommand[] {
  return createSlashCommandRegistry().map((command) => ({
    command: command as SlashCommand<Record<string, unknown>, unknown>,
    config: resolveInstallConfig(command.id, command.installDefaults, overrides)
  }));
}

export function slashCommandDescriptors(): SlashCommandDescriptor[] {
  return createInstalledRegistry()
    .filter(({ command, config }) => config.enabled && command.enabled())
    .map(({ command }) => command.describe());
}

export async function runSlashCommand(request: Parameters<typeof createSlashContext>[0]) {
  const context = createSlashContext(request);
  const commands = createInstalledRegistry()
    .filter(({ command, config }) => config.enabled && command.enabled())
    .map(({ command }) => command);

  for (const command of commands) {
    const qualification = command.triggerQualify(context);
    if (qualification.qualified) {
      return command.execute(context);
    }
  }

  throw new Error(`No slash command matched ${context.request.query || context.request.command || "the request"}.`);
}

// ---------------------------------------------------------------------------
// Implicit (no leading slash) dispatch — pure + synchronous, safe to call on
// every keystroke client-side. Returns the single best implicit match across
// all enabled commands, honouring each command's install config.
// ---------------------------------------------------------------------------

export interface ImplicitDetection {
  commandId: string;
  command: SlashCommand<Record<string, unknown>, unknown>;
  config: InstallConfig;
  match: ImplicitMatch;
}

export function detectImplicitCommand(query: string, overrides?: InstallOverrides): ImplicitDetection | undefined {
  const trimmed = query.trim();
  // Explicit slash commands and empty input never go through implicit pickup.
  if (!trimmed || trimmed.startsWith("/")) {
    return undefined;
  }

  const candidates: ImplicitDetection[] = [];
  for (const { command, config } of createInstalledRegistry(overrides)) {
    if (!config.enabled || !config.implicit.enabled || !command.enabled() || !command.detectImplicit) {
      continue;
    }
    const match = command.detectImplicit(trimmed);
    if (match && match.confidence >= config.implicit.minConfidence) {
      candidates.push({ commandId: command.id, command, config, match });
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  // Winner: highest confidence, then highest install priority as a tie-break.
  candidates.sort((a, b) => {
    if (b.match.confidence !== a.match.confidence) {
      return b.match.confidence - a.match.confidence;
    }
    return b.config.priority - a.config.priority;
  });
  return candidates[0];
}

// Autocomplete the raw (no-slash) input via whichever enabled command can
// complete it. Returns the full completed string, or undefined.
export function completeImplicitInput(query: string, overrides?: InstallOverrides): string | undefined {
  const trimmed = query;
  if (!trimmed.trim() || trimmed.trimStart().startsWith("/")) {
    return undefined;
  }
  for (const { command, config } of createInstalledRegistry(overrides)) {
    if (!config.enabled || !config.implicit.enabled || !command.enabled() || !command.completeImplicit) {
      continue;
    }
    const completed = command.completeImplicit(trimmed);
    if (completed && completed !== trimmed) {
      return completed;
    }
  }
  return undefined;
}
