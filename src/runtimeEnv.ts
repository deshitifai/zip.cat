export type RuntimeEnv = Record<string, unknown>;

let runtimeEnv: RuntimeEnv | undefined;

export function configureRuntimeEnv(env: RuntimeEnv | undefined) {
  runtimeEnv = env;
}

export function envVar(name: string) {
  const boundValue = runtimeEnv?.[name];
  if (typeof boundValue === "string" && boundValue.length > 0) {
    return boundValue;
  }

  return typeof process !== "undefined" ? process.env[name] : undefined;
}
