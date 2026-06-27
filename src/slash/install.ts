// Per-installation configuration for slash commands.
//
// Every command ships a *default* install config. A given deployment of zip.cat
// can override that config — to disable a command, turn its implicit (no-slash)
// pickup on/off, change how an implicit result renders, or re-prioritise which
// command wins when two both match the same input. For now everything loads with
// defaults, but the full load → merge → resolve pipeline is implemented so future
// environments can layer overrides without touching command code.
//
// Resolution order (later wins):
//   1. command-declared defaults        (in code)
//   2. environment overrides            (process.env.ZIP_CAT_SLASH_CONFIG JSON, server)
//   3. localStorage overrides           (per-browser, static/client)
//   4. explicit runtime overrides       (passed to resolveInstallConfig)

export type ImplicitRenderMode =
  // Render the result inline, live, beneath the input as the user types
  // (offline + instant commands: calc, convert).
  | "inline-live"
  // Surface as a suggestion pill the user clicks/Enters to run (network or
  // side-effecting commands: stock, weather).
  | "pill"
  // Implicit pickup detected but nothing is auto-rendered (reserved).
  | "none";

export interface ImplicitConfig {
  // Whether this command participates in implicit (no-leading-slash) pickup.
  enabled: boolean;
  // How an implicit match is surfaced.
  render: ImplicitRenderMode;
  // Minimum confidence (0..1) an implicit match must reach to be shown. Lets a
  // deployment make a noisy detector stricter without code changes.
  minConfidence: number;
}

export interface InstallConfig {
  // Whether the command is installed/available at all in this environment.
  enabled: boolean;
  // Tie-breaker when multiple commands match the same input. Higher wins.
  // (Explicit `/command` always beats implicit, regardless of priority.)
  priority: number;
  implicit: ImplicitConfig;
}

export type PartialInstallConfig = {
  enabled?: boolean;
  priority?: number;
  implicit?: Partial<ImplicitConfig>;
};

export type InstallOverrides = Record<string, PartialInstallConfig>;

export const DEFAULT_INSTALL_CONFIG: InstallConfig = {
  enabled: true,
  priority: 0,
  implicit: {
    enabled: false,
    render: "none",
    minConfidence: 0.6
  }
};

function mergeConfig(base: InstallConfig, override: PartialInstallConfig | undefined): InstallConfig {
  if (!override) {
    return base;
  }
  return {
    enabled: override.enabled ?? base.enabled,
    priority: override.priority ?? base.priority,
    implicit: {
      enabled: override.implicit?.enabled ?? base.implicit.enabled,
      render: override.implicit?.render ?? base.implicit.render,
      minConfidence: override.implicit?.minConfidence ?? base.implicit.minConfidence
    }
  };
}

const STORAGE_KEY = "zip.cat.slash.install";

function readJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

// Environment overrides (server-side): a JSON object mapping command id → partial config.
function envOverrides(): InstallOverrides {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return readJson<InstallOverrides>(env?.ZIP_CAT_SLASH_CONFIG) ?? {};
}

// localStorage overrides (browser): same shape, per-installation.
function storageOverrides(): InstallOverrides {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    return readJson<InstallOverrides>(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

// Resolve the effective install config for one command id. Merges, in order:
// command default → env → localStorage → explicit runtime override.
export function resolveInstallConfig(
  commandId: string,
  commandDefault: InstallConfig,
  runtimeOverrides?: InstallOverrides
): InstallConfig {
  let resolved = mergeConfig(DEFAULT_INSTALL_CONFIG, {
    enabled: commandDefault.enabled,
    priority: commandDefault.priority,
    implicit: commandDefault.implicit
  });
  resolved = mergeConfig(resolved, envOverrides()[commandId]);
  resolved = mergeConfig(resolved, storageOverrides()[commandId]);
  resolved = mergeConfig(resolved, runtimeOverrides?.[commandId]);
  return resolved;
}

// Persist a per-browser override for a single command (settings UI, future use).
export function saveInstallOverride(commandId: string, override: PartialInstallConfig): void {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const current = storageOverrides();
    current[commandId] = { ...current[commandId], ...override };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // best-effort; ignore quota/availability errors
  }
}

export { mergeConfig as _mergeConfigForTest };
