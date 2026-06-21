import type { JsonSchema } from "./models";

// A small, schema-based caching layer shared by every cacheable `/` command and
// plugin. Each cache entry is bound to a JSON Schema: data is only served from the
// cache when it still validates against that schema (structurally) AND the schema
// itself hasn't changed since the entry was written. This keeps cached payloads
// honest as plugin output shapes evolve.

export interface CachePolicy {
  // Stable key for the cache slot (one command/plugin may key by argument set).
  key: string;
  // The schema the cached data must satisfy.
  schema: JsonSchema;
  // Time-to-live in milliseconds before the entry is considered stale.
  ttlMs: number;
}

export interface CacheEntry<T = unknown> {
  data: T;
  schemaHash: string;
  storedAt: number;
  ttlMs: number;
}

export interface CacheHit<T = unknown> {
  data: T;
  storedAt: number;
  ttlMs: number;
  ageMs: number;
  stale: boolean;
}

const STORAGE_PREFIX = "zip.cat.cache.";

function now(): number {
  return Date.now();
}

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === "undefined") {
      return undefined;
    }
    return localStorage;
  } catch {
    return undefined;
  }
}

// A cheap, stable hash of the schema so a changed schema invalidates old entries.
export function hashSchema(schema: JsonSchema): string {
  const json = stableStringify(schema);
  let hash = 5381;
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Lightweight structural validation driven by the schema's `type`/`required`/`items`.
// Not a full JSON Schema validator — just enough to reject obviously wrong shapes
// (e.g. after a schema change that the schema hash didn't already catch).
export function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  const type = schema.type as string | undefined;

  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in record)) {
        return false;
      }
    }
    const properties = schema.properties as Record<string, JsonSchema> | undefined;
    if (properties) {
      for (const key of required) {
        const propertySchema = properties[key];
        if (propertySchema && !matchesSchema(record[key], propertySchema)) {
          return false;
        }
      }
    }
    return true;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      return false;
    }
    const items = schema.items as JsonSchema | undefined;
    if (items) {
      return value.every((item) => matchesSchema(item, items));
    }
    return true;
  }

  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number" || type === "integer") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (type === "boolean") {
    return typeof value === "boolean";
  }

  // Unknown/absent type — accept (the schema hash still guards shape changes).
  return true;
}

export function readCache<T = unknown>(policy: CachePolicy): CacheHit<T> | undefined {
  const store = storage();
  if (!store) {
    return undefined;
  }

  const raw = store.getItem(STORAGE_PREFIX + policy.key);
  if (!raw) {
    return undefined;
  }

  let entry: CacheEntry<T>;
  try {
    entry = JSON.parse(raw) as CacheEntry<T>;
  } catch {
    store.removeItem(STORAGE_PREFIX + policy.key);
    return undefined;
  }

  if (entry.schemaHash !== hashSchema(policy.schema) || !matchesSchema(entry.data, policy.schema)) {
    store.removeItem(STORAGE_PREFIX + policy.key);
    return undefined;
  }

  const ttlMs = typeof entry.ttlMs === "number" ? entry.ttlMs : policy.ttlMs;
  const ageMs = Math.max(now() - entry.storedAt, 0);
  return {
    data: entry.data,
    storedAt: entry.storedAt,
    ttlMs,
    ageMs,
    stale: ageMs >= ttlMs
  };
}

export function writeCache<T = unknown>(policy: CachePolicy, data: T): CacheHit<T> | undefined {
  const store = storage();
  if (!store) {
    return undefined;
  }
  if (!matchesSchema(data, policy.schema)) {
    return undefined;
  }

  const entry: CacheEntry<T> = {
    data,
    schemaHash: hashSchema(policy.schema),
    storedAt: now(),
    ttlMs: policy.ttlMs
  };
  try {
    store.setItem(STORAGE_PREFIX + policy.key, JSON.stringify(entry));
  } catch {
    return undefined;
  }

  return {
    data,
    storedAt: entry.storedAt,
    ttlMs: entry.ttlMs,
    ageMs: 0,
    stale: false
  };
}

export function clearCache(key: string): void {
  storage()?.removeItem(STORAGE_PREFIX + key);
}

// Human-friendly age label: "now", "1m", "15m", "3h", "4h", "2d".
export function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 45) {
    return "now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${Math.max(minutes, 1)}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// Common TTL constants for descriptors.
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
