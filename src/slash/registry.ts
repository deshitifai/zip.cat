import type { SlashCommandDescriptor } from "../models";
import { type SlashCommand, createSlashContext } from "./base";
import { weatherSlashCommand } from "./weather";

export function createSlashCommandRegistry() {
  return [
    weatherSlashCommand()
  ];
}

export function slashCommandDescriptors(): SlashCommandDescriptor[] {
  return createSlashCommandRegistry()
    .filter((command) => command.enabled())
    .map((command) => command.describe());
}

export async function runSlashCommand(request: Parameters<typeof createSlashContext>[0]) {
  const context = createSlashContext(request);
  const commands: SlashCommand<Record<string, unknown>, unknown>[] = createSlashCommandRegistry()
    .filter((command) => command.enabled());

  for (const command of commands) {
    const qualification = command.triggerQualify(context);
    if (qualification.qualified) {
      return command.execute(context);
    }
  }

  throw new Error(`No slash command matched ${context.request.query || context.request.command || "the request"}.`);
}
