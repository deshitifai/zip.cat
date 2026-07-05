import type { CacheDescriptor, JsonSchema, SlashCommandArgument } from "../models";
import { HOUR_MS } from "../cache";
import { LookupSlashCommand, type ImplicitMatch, type SlashCommandContext } from "./base";
import { DEFAULT_INSTALL_CONFIG, type InstallConfig } from "./install";

type ConvertArgs = {
  value: number;
  from: string;
  to: string;
};

export type ConvertOutput = {
  input: { value: number; unit: string };
  output: { value: number; unit: string };
  category: "length" | "mass" | "temperature" | "volume" | "data" | "time" | "currency";
  formatted: string;
  rate?: number;
  source: "offline" | "live-fx";
};

export const convertOutputSchema = {
  type: "object",
  required: ["input", "output", "category", "formatted", "source"],
  properties: {
    input: {
      type: "object",
      required: ["value", "unit"],
      properties: {
        value: { type: "number" },
        unit: { type: "string" }
      }
    },
    output: {
      type: "object",
      required: ["value", "unit"],
      properties: {
        value: { type: "number" },
        unit: { type: "string" }
      }
    },
    category: { type: "string" },
    formatted: { type: "string" },
    rate: { type: "number" },
    source: { type: "string" }
  }
} satisfies JsonSchema;

type Category = ConvertOutput["category"];

// Linear units expressed as a factor to a canonical base unit per category.
// value_in_base = value * factor. To convert: target = value * fromFactor / toFactor.
interface LinearUnit {
  category: Exclude<Category, "temperature" | "currency">;
  factor: number;
  aliases: string[];
}

const LINEAR_UNITS: LinearUnit[] = [
  // length — base: metre
  { category: "length", factor: 0.001, aliases: ["mm", "millimeter", "millimetre", "millimeters", "millimetres"] },
  { category: "length", factor: 0.01, aliases: ["cm", "centimeter", "centimetre", "centimeters", "centimetres"] },
  { category: "length", factor: 1, aliases: ["m", "meter", "metre", "meters", "metres"] },
  { category: "length", factor: 1000, aliases: ["km", "kilometer", "kilometre", "kilometers", "kilometres"] },
  { category: "length", factor: 0.0254, aliases: ["in", "inch", "inches", "\""] },
  { category: "length", factor: 0.3048, aliases: ["ft", "foot", "feet", "'"] },
  { category: "length", factor: 0.9144, aliases: ["yd", "yard", "yards"] },
  { category: "length", factor: 1609.344, aliases: ["mi", "mile", "miles"] },
  { category: "length", factor: 1852, aliases: ["nmi", "nauticalmile", "nauticalmiles"] },
  // esoteric length
  { category: "length", factor: 1.8288, aliases: ["fathom", "fathoms", "ftm"] },
  { category: "length", factor: 4828.032, aliases: ["league", "leagues", "lea"] },
  { category: "length", factor: 201.168, aliases: ["furlong", "furlongs", "fur"] },
  { category: "length", factor: 20.1168, aliases: ["chain", "chains", "ch"] },
  { category: "length", factor: 5.0292, aliases: ["rod", "rods", "pole", "poles", "perch"] },
  { category: "length", factor: 9.461e15, aliases: ["ly", "lightyear", "lightyears"] },
  { category: "length", factor: 1.495978707e11, aliases: ["au", "astronomicalunit", "astronomicalunits"] },

  // mass — base: gram
  { category: "mass", factor: 0.001, aliases: ["mg", "milligram", "milligrams"] },
  { category: "mass", factor: 1, aliases: ["g", "gram", "grams"] },
  { category: "mass", factor: 1000, aliases: ["kg", "kilogram", "kilograms"] },
  { category: "mass", factor: 1_000_000, aliases: ["t", "tonne", "tonnes", "metricton"] },
  { category: "mass", factor: 28.349523125, aliases: ["oz", "ounce", "ounces"] },
  { category: "mass", factor: 453.59237, aliases: ["lb", "lbs", "pound", "pounds"] },
  { category: "mass", factor: 6350.29318, aliases: ["st", "stone", "stones"] },
  // esoteric mass
  { category: "mass", factor: 0.2, aliases: ["ct", "carat", "carats"] },
  { category: "mass", factor: 0.06479891, aliases: ["gr", "grain", "grains"] },
  { category: "mass", factor: 14593.9029, aliases: ["slug", "slugs"] },
  { category: "mass", factor: 907184.74, aliases: ["uston", "shortton", "shorttons"] },
  { category: "mass", factor: 1016046.9088, aliases: ["ukton", "longton", "longtons"] },

  // volume — base: litre
  { category: "volume", factor: 0.001, aliases: ["ml", "milliliter", "millilitre", "milliliters", "millilitres"] },
  { category: "volume", factor: 1, aliases: ["l", "liter", "litre", "liters", "litres"] },
  { category: "volume", factor: 3.785411784, aliases: ["gal", "gallon", "gallons"] },
  { category: "volume", factor: 0.473176473, aliases: ["pt", "pint", "pints"] },
  { category: "volume", factor: 0.946352946, aliases: ["qt", "quart", "quarts"] },
  { category: "volume", factor: 0.0295735296, aliases: ["floz", "fluidounce", "fluidounces"] },
  { category: "volume", factor: 0.236588236, aliases: ["cup", "cups"] },
  // esoteric volume
  { category: "volume", factor: 0.0147867648, aliases: ["tbsp", "tablespoon", "tablespoons"] },
  { category: "volume", factor: 0.00492892159, aliases: ["tsp", "teaspoon", "teaspoons"] },
  { category: "volume", factor: 158.987294928, aliases: ["bbl", "barrel", "barrels"] },
  { category: "volume", factor: 3.636872, aliases: ["peck", "pecks"] },
  { category: "volume", factor: 36.36872, aliases: ["bushel", "bushels"] },

  // data — base: byte (decimal + binary)
  { category: "data", factor: 0.125, aliases: ["bit", "bits", "b"] },
  { category: "data", factor: 1, aliases: ["byte", "bytes", "B"] },
  { category: "data", factor: 1000, aliases: ["kb", "kilobyte", "kilobytes"] },
  { category: "data", factor: 1024, aliases: ["kib", "kibibyte", "kibibytes"] },
  { category: "data", factor: 1_000_000, aliases: ["mb", "megabyte", "megabytes"] },
  { category: "data", factor: 1_048_576, aliases: ["mib", "mebibyte", "mebibytes"] },
  { category: "data", factor: 1_000_000_000, aliases: ["gb", "gigabyte", "gigabytes"] },
  { category: "data", factor: 1_073_741_824, aliases: ["gib", "gibibyte", "gibibytes"] },
  { category: "data", factor: 1_000_000_000_000, aliases: ["tb", "terabyte", "terabytes"] },
  { category: "data", factor: 1_099_511_627_776, aliases: ["tib", "tebibyte", "tebibytes"] },

  // time — base: second
  { category: "time", factor: 0.001, aliases: ["ms", "millisecond", "milliseconds"] },
  { category: "time", factor: 1, aliases: ["s", "sec", "second", "seconds"] },
  { category: "time", factor: 60, aliases: ["min", "minute", "minutes"] },
  { category: "time", factor: 3600, aliases: ["h", "hr", "hour", "hours"] },
  { category: "time", factor: 86_400, aliases: ["d", "day", "days"] },
  { category: "time", factor: 604_800, aliases: ["wk", "week", "weeks"] },
  { category: "time", factor: 31_557_600, aliases: ["yr", "year", "years"] }
];

// Note: alias case matters only for the data-unit pair `b` (bit) vs `B` (byte);
// every other lookup is case-insensitive. We index the exact-case forms first.
const LINEAR_BY_ALIAS = new Map<string, LinearUnit>();
for (const unit of LINEAR_UNITS) {
  for (const alias of unit.aliases) {
    if (!LINEAR_BY_ALIAS.has(alias)) {
      LINEAR_BY_ALIAS.set(alias, unit);
    }
    const lower = alias.toLowerCase();
    if (!LINEAR_BY_ALIAS.has(lower)) {
      LINEAR_BY_ALIAS.set(lower, unit);
    }
  }
}

function lookupLinear(unit: string): LinearUnit | undefined {
  return LINEAR_BY_ALIAS.get(unit) ?? LINEAR_BY_ALIAS.get(unit.toLowerCase());
}

const TEMPERATURE_ALIASES: Record<string, "C" | "F" | "K"> = {
  c: "C", celsius: "C", centigrade: "C",
  f: "F", fahrenheit: "F",
  k: "K", kelvin: "K"
};

// Canonical, human-readable name for each unit — what autocomplete expands a
// partial token into. Keyed by the unit's primary (first) alias so we have one
// stable name per LinearUnit, plus temperature names below.
const CANONICAL_NAME: Record<string, string> = {
  mm: "millimeters", cm: "centimeters", m: "meters", km: "kilometers",
  in: "inches", ft: "feet", yd: "yards", mi: "miles", nmi: "nautical miles",
  fathom: "fathoms", league: "leagues", furlong: "furlongs", chain: "chains",
  rod: "rods", ly: "light years", au: "astronomical units",
  mg: "milligrams", g: "grams", kg: "kilograms", t: "tonnes", oz: "ounces",
  lb: "pounds", st: "stones",
  ct: "carats", gr: "grains", slug: "slugs", uston: "US tons", ukton: "UK tons",
  ml: "milliliters", l: "liters", gal: "gallons", pt: "pints", qt: "quarts",
  floz: "fluid ounces", cup: "cups",
  tbsp: "tablespoons", tsp: "teaspoons", bbl: "barrels", peck: "pecks", bushel: "bushels",
  bit: "bits", byte: "bytes", kb: "kilobytes", kib: "kibibytes",
  mb: "megabytes", mib: "mebibytes", gb: "gigabytes", gib: "gibibytes",
  tb: "terabytes", tib: "tebibytes",
  ms: "milliseconds", s: "seconds", min: "minutes", h: "hours", d: "days",
  wk: "weeks", yr: "years"
};

// Every token a user might type for a unit, paired with its canonical full name.
// Used for prefix-based autocomplete ("fah" → "fahrenheit", "cel" → "celsius",
// "qua" → "quarts"). Sorted longest-canonical-first so the most specific
// completion is preferred deterministically.
interface CompletionEntry {
  alias: string;
  canonical: string;
  category: Category;
}

const COMPLETION_ENTRIES: CompletionEntry[] = (() => {
  const entries: CompletionEntry[] = [];
  const seen = new Set<string>();

  const push = (alias: string, canonical: string, category: Category) => {
    const key = `${alias} ${canonical}`;
    if (alias && !seen.has(key)) {
      seen.add(key);
      entries.push({ alias: alias.toLowerCase(), canonical, category });
    }
  };

  for (const unit of LINEAR_UNITS) {
    const canonical = CANONICAL_NAME[unit.aliases[0]!] ?? unit.aliases[0]!;
    for (const alias of unit.aliases) {
      push(alias, canonical, unit.category);
    }
    // The canonical name itself (and its singular) should also complete.
    push(canonical, canonical, unit.category);
    if (canonical.endsWith("s")) {
      push(canonical.slice(0, -1), canonical, unit.category);
    }
  }

  for (const [alias, unit] of Object.entries(TEMPERATURE_ALIASES)) {
    const canonical = unit === "C" ? "celsius" : unit === "F" ? "fahrenheit" : "kelvin";
    push(alias, canonical, "temperature");
    push(canonical, canonical, "temperature");
  }

  return entries;
})();

// Complete a partial unit token to its canonical name. Returns the canonical
// name if `partial` is a prefix of exactly one canonical (or an alias of one),
// else undefined. Case-insensitive. When `category` is given, only candidates in
// that category are considered — this disambiguates "mil" → "miles" once we know
// the source unit was a length.
export function completeUnitToken(partial: string, category?: Category): string | undefined {
  const needle = partial.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  const inScope = (entry: CompletionEntry) => category === undefined || entry.category === category;

  // Exact alias/canonical match → already complete, expand to canonical.
  const exact = COMPLETION_ENTRIES.find((entry) => entry.alias === needle && inScope(entry));
  if (exact) {
    return exact.canonical;
  }
  // Prefix match across canonical names — collect the distinct canonicals.
  const matches = new Set<string>();
  for (const entry of COMPLETION_ENTRIES) {
    if (inScope(entry) && (entry.canonical.startsWith(needle) || entry.alias.startsWith(needle))) {
      matches.add(entry.canonical);
    }
  }
  if (matches.size === 1) {
    return [...matches][0];
  }
  // Ambiguous or none.
  return undefined;
}

// Is this token an already-complete, recognised unit? True for real unit aliases
// (km, mi, gal), temperature aliases (f, celsius), and canonical names (miles).
// Deliberately NOT true for synthesized singulars like "mile" — those should
// still autocomplete up to the canonical plural ("miles").
function isCompleteUnit(token: string): boolean {
  const lower = token.toLowerCase();
  if (lookupLinear(token) || TEMPERATURE_ALIASES[lower]) {
    return true;
  }
  return COMPLETION_ENTRIES.some((entry) => entry.canonical === lower);
}

function toKelvin(value: number, unit: "C" | "F" | "K"): number {
  if (unit === "C") return value + 273.15;
  if (unit === "F") return (value - 32) * (5 / 9) + 273.15;
  return value;
}

function fromKelvin(value: number, unit: "C" | "F" | "K"): number {
  if (unit === "C") return value - 273.15;
  if (unit === "F") return (value - 273.15) * (9 / 5) + 32;
  return value;
}

function convertTemperature(value: number, from: string, to: string): number | undefined {
  const fromUnit = TEMPERATURE_ALIASES[from.toLowerCase()];
  const toUnit = TEMPERATURE_ALIASES[to.toLowerCase()];
  if (!fromUnit || !toUnit) {
    return undefined;
  }
  return fromKelvin(toKelvin(value, fromUnit), toUnit);
}

// Currency is recognised structurally as a 3-letter ISO-4217-ish code. The live
// rate is only ever fetched server-side (FX_API_KEY present) — see executeCommand.
function isCurrencyCode(unit: string): boolean {
  return /^[A-Za-z]{3}$/.test(unit) && !lookupLinear(unit) && !TEMPERATURE_ALIASES[unit.toLowerCase()];
}

// Words that connect the source and target unit in natural input. All optional
// in parsing ("10 km mi" works) but recognised so "10 km in mi", "10 km to mi",
// "10 km as mi", "10 km -> mi" all parse identically.
const CONNECTIVES = new Set(["in", "to", "as", "into"]);

export interface ParsedPhrase {
  value: number;
  from: string;
  to: string;
}

// Parse a free-form conversion phrase into {value, from, to}. Accepts:
//   "10 km to mi"  "10km in mi"  "1 cup in qt"  "35 f -> c"  "10 km mi"
// Returns undefined when it isn't a recognisable conversion phrase. Pure; no
// network and no unit validation (callers validate via lookup/compute).
export function parseConvertPhrase(input: string): ParsedPhrase | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  // Leading number (supports "10", "-3.5", "1,000", "10.").
  const numberMatch = trimmed.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/s);
  if (!numberMatch) {
    return undefined;
  }
  const value = Number(numberMatch[1]!.replace(/,/g, ""));
  if (!Number.isFinite(value)) {
    return undefined;
  }

  // Remaining text → tokens. Normalise arrow connectives to spaces first.
  const rest = numberMatch[2]!.replace(/->|=>|>/g, " ").trim();
  if (!rest) {
    return undefined;
  }
  const tokens = rest.split(/\s+/).filter(Boolean);

  // `in` is both a unit (inches) AND a connective, so we can't blindly strip
  // connectives. Structure is `from [connective] to`: take the first token as
  // `from`, the last as `to`, and require any *interior* tokens to be pure
  // connectives ("10 km in mi" → interior ["in"], fine; "12 in to cm" → from
  // "in", interior ["to"], to "cm", fine). This keeps inches-as-source working.
  if (tokens.length === 2) {
    return { value, from: tokens[0]!, to: tokens[1]! };
  }
  if (tokens.length >= 3) {
    const from = tokens[0]!;
    const to = tokens[tokens.length - 1]!;
    const interior = tokens.slice(1, -1);
    if (interior.every((token) => CONNECTIVES.has(token.toLowerCase()))) {
      return { value, from, to };
    }
  }
  return undefined;
}

export type OfflineResult = {
  value: number;
  category: Exclude<Category, "currency">;
};

// Compute an offline conversion (everything except live currency). Returns
// undefined when the units are unknown, mismatched, or currency. Pure.
export function computeOffline(value: number, from: string, to: string): OfflineResult | undefined {
  if (TEMPERATURE_ALIASES[from.toLowerCase()] || TEMPERATURE_ALIASES[to.toLowerCase()]) {
    const converted = convertTemperature(value, from, to);
    return converted === undefined ? undefined : { value: converted, category: "temperature" };
  }
  const fromUnit = lookupLinear(from);
  const toUnit = lookupLinear(to);
  if (fromUnit && toUnit && fromUnit.category === toUnit.category) {
    return { value: (value * fromUnit.factor) / toUnit.factor, category: fromUnit.category };
  }
  return undefined;
}

// Trim floating-point noise from a converted value while keeping useful
// precision. 0.2499999994716559 → 0.25, 6.2137119223733395 → 6.2137119.
// 8 significant figures is enough to clear binary-fraction artifacts that
// survive at 9–10 figures while preserving real precision for everyday units.
function roundValue(value: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return value;
  }
  return Number(value.toPrecision(8));
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US");
  }
  return Number(value.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// Category of a (possibly partial) unit token, used to pick a sensible default
// target when the user hasn't typed one yet.
function categoryOfToken(token: string): Category | undefined {
  const lower = token.toLowerCase();
  if (TEMPERATURE_ALIASES[lower]) {
    return "temperature";
  }
  const linear = lookupLinear(token);
  if (linear) {
    return linear.category;
  }
  const completed = completeUnitToken(token);
  if (completed) {
    const linearCompleted = lookupLinear(completed);
    if (linearCompleted) {
      return linearCompleted.category;
    }
    if (TEMPERATURE_ALIASES[completed.toLowerCase()]) {
      return "temperature";
    }
  }
  return undefined;
}

// The most common conversion *target* for a given source unit, keyed by the
// source's canonical name and giving the target's {short alias, long canonical}.
// This is the curated "what do people actually convert this to" table that
// powers autocomplete suggestions like "12 in " → "12 in in ft". Cross-system
// pairings dominate (imperial↔metric), since same-system conversions are rarer.
const PREFERRED_TARGET: Record<string, { short: string; long: string }> = {
  // length
  inches: { short: "ft", long: "feet" },
  feet: { short: "m", long: "meters" },
  yards: { short: "m", long: "meters" },
  miles: { short: "km", long: "kilometers" },
  kilometers: { short: "mi", long: "miles" },
  meters: { short: "ft", long: "feet" },
  centimeters: { short: "in", long: "inches" },
  millimeters: { short: "in", long: "inches" },
  "nautical miles": { short: "km", long: "kilometers" },
  fathoms: { short: "ft", long: "feet" },
  leagues: { short: "mi", long: "miles" },
  furlongs: { short: "ft", long: "feet" },
  chains: { short: "ft", long: "feet" },
  rods: { short: "ft", long: "feet" },
  "light years": { short: "km", long: "kilometers" },
  "astronomical units": { short: "km", long: "kilometers" },
  // mass
  pounds: { short: "kg", long: "kilograms" },
  kilograms: { short: "lb", long: "pounds" },
  ounces: { short: "g", long: "grams" },
  grams: { short: "oz", long: "ounces" },
  stones: { short: "lb", long: "pounds" },
  tonnes: { short: "lb", long: "pounds" },
  milligrams: { short: "g", long: "grams" },
  carats: { short: "g", long: "grams" },
  grains: { short: "g", long: "grams" },
  slugs: { short: "kg", long: "kilograms" },
  "US tons": { short: "kg", long: "kilograms" },
  "UK tons": { short: "kg", long: "kilograms" },
  // volume
  cups: { short: "ml", long: "milliliters" },
  liters: { short: "gal", long: "gallons" },
  gallons: { short: "l", long: "liters" },
  milliliters: { short: "floz", long: "fluid ounces" },
  pints: { short: "ml", long: "milliliters" },
  quarts: { short: "l", long: "liters" },
  "fluid ounces": { short: "ml", long: "milliliters" },
  tablespoons: { short: "tsp", long: "teaspoons" },
  teaspoons: { short: "ml", long: "milliliters" },
  barrels: { short: "l", long: "liters" },
  pecks: { short: "l", long: "liters" },
  bushels: { short: "l", long: "liters" },
  // data
  bytes: { short: "kb", long: "kilobytes" },
  kilobytes: { short: "mb", long: "megabytes" },
  megabytes: { short: "gb", long: "gigabytes" },
  gigabytes: { short: "mb", long: "megabytes" },
  terabytes: { short: "gb", long: "gigabytes" },
  // time
  seconds: { short: "min", long: "minutes" },
  minutes: { short: "h", long: "hours" },
  hours: { short: "min", long: "minutes" },
  days: { short: "h", long: "hours" },
  weeks: { short: "d", long: "days" },
  years: { short: "d", long: "days" }
};

// The most common target for a source unit, or undefined if we have no strong
// default. Temperature is special-cased: F↔C, anything else → celsius.
function defaultTarget(category: Category, sourceToken: string, sourceCanonical: string): { short: string; long: string } | undefined {
  if (category === "temperature") {
    const src = TEMPERATURE_ALIASES[sourceToken.toLowerCase()] ?? TEMPERATURE_ALIASES[sourceCanonical.toLowerCase()];
    if (src === "C") return { short: "f", long: "fahrenheit" };
    return { short: "c", long: "celsius" };
  }
  // Resolve the source to its canonical name, then look up its preferred target.
  const canonical = (lookupLinear(sourceToken) ? CANONICAL_NAME[lookupLinear(sourceToken)!.aliases[0]!] : undefined)
    ?? completeUnitToken(sourceCanonical)
    ?? sourceCanonical;
  return PREFERRED_TARGET[canonical];
}

// Autocomplete a partial conversion input to a fuller form. Returns the FULL
// completed string (not just the suffix), or undefined when nothing sensible can
// be added. Only the token the user is actively typing is expanded; tokens that
// are already valid are preserved verbatim.
//
//   "50 fah"     -> "50 fahrenheit in celsius"
//   "35 f i"     -> "35 f in c"
//   "1 cup in q" -> "1 cup in quarts"
//   "10 km to m" -> ambiguous target (m/mi/...) -> undefined
// Handle a trailing-space input where the tokens so far are complete and the
// user wants the next token suggested. Two shapes:
//   "12 in "      → source complete, no connective  → "12 in in ft"
//   "12 in in "   → source + connective, no target  → "12 in in ft"
// `core` is the input with surrounding whitespace stripped. Returns the full
// completed string or undefined.
function completeAfterTrailingSpace(core: string): string | undefined {
  const numberMatch = core.match(/^(-?\d[\d,]*(?:\.\d+)?)\s+(.*)$/s);
  if (!numberMatch) {
    return undefined;
  }
  const valuePart = numberMatch[1]!;
  const tokens = numberMatch[2]!.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  // Source is ALWAYS the first token (never a connective), so "in" (inches) as
  // the sole unit isn't misread as the connective "in". A trailing connective is
  // only meaningful when it follows the source — i.e. there are ≥2 tokens.
  const sourceToken = tokens[0]!;
  const lastIsConnective = tokens.length >= 2 && CONNECTIVES.has(tokens[tokens.length - 1]!.toLowerCase());
  const category = categoryOfToken(sourceToken);
  if (!category || !isCompleteUnit(sourceToken)) {
    return undefined;
  }
  const canonical = lookupLinear(sourceToken)
    ? CANONICAL_NAME[lookupLinear(sourceToken)!.aliases[0]!] ?? sourceToken
    : sourceToken;
  const target = defaultTarget(category, sourceToken, canonical);
  if (!target) {
    return undefined;
  }

  // Match the form the user is using: a short source token → short target.
  const useShort = sourceToken.length <= 4 && !isLongName(sourceToken);
  const targetText = useShort ? target.short : target.long;

  if (lastIsConnective && tokens.length === 2) {
    // "12 in in " → already has source + connective, just add the target.
    return `${valuePart} ${tokens.join(" ")} ${targetText}`;
  }
  if (!lastIsConnective && tokens.length === 1) {
    // "12 in " → add connective + target.
    return `${valuePart} ${sourceToken} in ${targetText}`;
  }
  return undefined;
}

// Is this token a spelled-out unit name (e.g. "fahrenheit", "inches") rather
// than a short symbol (e.g. "f", "in")? Used to keep the suggested target in the
// same register as the source.
function isLongName(token: string): boolean {
  const lower = token.toLowerCase();
  return COMPLETION_ENTRIES.some((entry) => entry.canonical === lower)
    || /[a-z]{4,}/i.test(token);
}

export function completeConvertInput(input: string): string | undefined {
  // A TRAILING SPACE is a signal the user finished a token and wants the next
  // one. "12 in " → source done, suggest the most common target ("12 in in ft").
  // We check this before trimEnd() destroys the trailing whitespace.
  const hasTrailingSpace = /\s$/.test(input) && input.trim().length > 0;
  if (hasTrailingSpace) {
    const completedWithTarget = completeAfterTrailingSpace(input.trim());
    if (completedWithTarget) {
      return completedWithTarget;
    }
  }

  const trimmed = input.trimEnd();
  const numberMatch = trimmed.match(/^(\s*-?\d[\d,]*(?:\.\d+)?\s+)(.*)$/s);
  if (!numberMatch) {
    return undefined;
  }
  const prefix = numberMatch[1]!; // includes the value and trailing space(s)
  const rest = numberMatch[2]!;
  if (!rest) {
    return undefined;
  }

  const tokens = rest.split(/\s+/);
  const last = tokens[tokens.length - 1]!;
  const head = tokens.slice(0, -1);

  // Case A: user is typing the connective ("35 f i" → complete "i" to "in").
  if (head.length >= 1 && /^(i|in|t|to|a|as|into?)$/i.test(last) && !CONNECTIVES.has(last.toLowerCase())) {
    const connective = /^i/i.test(last) ? "in" : /^t/i.test(last) ? "to" : /^a/i.test(last) ? "as" : "into";
    const sourceToken = head[head.length - 1]!;
    const category = categoryOfToken(sourceToken);
    if (category) {
      const canonical = completeUnitToken(sourceToken) ?? sourceToken;
      const target = defaultTarget(category, sourceToken, canonical);
      if (target) {
        const useShort = sourceToken.length <= 3 && sourceToken.toLowerCase() !== canonical;
        return `${prefix}${head.join(" ")} ${connective} ${useShort ? target.short : target.long}`;
      }
    }
    // Connective completes but no default target — still help with the connective.
    return `${prefix}${head.join(" ")} ${connective} `.trimEnd();
  }

  // Case B: last token is (part of) the target unit, after a connective.
  const connectiveIndex = head.findIndex((token) => CONNECTIVES.has(token.toLowerCase()));
  if (connectiveIndex !== -1) {
    // Already a complete, recognised unit → nothing to add.
    if (isCompleteUnit(last)) {
      return undefined;
    }
    // Disambiguate the target by the source unit's category when we can.
    const sourceToken = head[0]!;
    const sourceCategory = categoryOfToken(sourceToken);
    const completedTarget =
      completeUnitToken(last, sourceCategory) ?? completeUnitToken(last);
    if (completedTarget && completedTarget.toLowerCase() !== last.toLowerCase()) {
      return `${prefix}${head.join(" ")} ${completedTarget}`;
    }
    return undefined;
  }

  // Case C: last token is (part of) the source unit, no connective yet
  // ("50 fah" → "50 fahrenheit in celsius").
  if (head.length === 0) {
    const canonical = completeUnitToken(last);
    if (canonical) {
      const category = categoryOfToken(last);
      const expandedSource = canonical;
      if (category) {
        const target = defaultTarget(category, last, canonical);
        if (target) {
          return `${prefix}${expandedSource} in ${target.long}`;
        }
      }
      // Source expands but no default target: just expand the source and add "in".
      if (canonical.toLowerCase() !== last.toLowerCase()) {
        return `${prefix}${expandedSource} in `.trimEnd();
      }
    }
  }

  return undefined;
}

interface FxResponse {
  result?: number;
  info?: { rate?: number };
  error?: { info?: string };
}

// Live FX is server-only: the key never ships to the browser, so in static mode
// `process.env` is undefined and this branch is skipped entirely.
async function fetchLiveRate(value: number, from: string, to: string): Promise<{ converted: number; rate: number }> {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const key = env?.FX_API_KEY;
  if (!key) {
    throw new Error("Currency conversion is unavailable in this build (no FX provider configured).");
  }

  const params = new URLSearchParams({
    access_key: key,
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    amount: String(value)
  });
  const url = `https://api.exchangerate.host/convert?${params}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const payload = (await response.json()) as FxResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.info ?? `FX lookup failed with ${response.status}.`);
  }
  const converted = payload.result;
  const rate = payload.info?.rate ?? (typeof converted === "number" ? converted / value : undefined);
  if (typeof converted !== "number" || typeof rate !== "number") {
    throw new Error("FX provider returned an unexpected response.");
  }
  return { converted, rate };
}

export class ConvertCommand extends LookupSlashCommand<ConvertArgs, ConvertOutput> {
  readonly id = "slash.convert";
  readonly name = "Convert";
  readonly command = "/convert";
  readonly description = "Convert between units of length, mass, temperature, volume, data, time, or currency.";
  readonly arguments: SlashCommandArgument[] = [
    { name: "value", label: "value", type: "number", required: true, placeholder: "10", widthChars: 8 },
    { name: "from", label: "from", type: "text", required: true, placeholder: "km", widthChars: 8 },
    { name: "to", label: "to", type: "text", required: true, placeholder: "mi", widthChars: 8 }
  ];
  readonly outputSchema = convertOutputSchema;
  // Currency is the only live path; cache its (and every) result for an hour.
  readonly cache: CacheDescriptor = { ttlMs: HOUR_MS };

  // Implicit pickup ON by default with inline-live rendering: offline unit
  // conversions resolve as the user types ("1 cup in qt" → 0.25 qt). Currency,
  // being a network call, is detected but not auto-run inline (see detectImplicit).
  readonly installDefaults: InstallConfig = {
    ...DEFAULT_INSTALL_CONFIG,
    priority: 9,
    implicit: { enabled: true, render: "inline-live", minConfidence: 0.6 }
  };

  parseArguments(context: SlashCommandContext): ConvertArgs {
    const explicitValue = this.argumentValue(context, "value");
    const explicitFrom = this.argumentValue(context, "from");
    const explicitTo = this.argumentValue(context, "to");

    if (explicitValue !== undefined && explicitFrom && explicitTo) {
      const value = Number(explicitValue);
      const from = String(explicitFrom).trim();
      const to = String(explicitTo).trim();
      // The generic inline-arg splitter can mis-group a connective into an arg
      // (e.g. "/convert 10 km to mi" → to="to mi"). If an arg still carries a
      // connective or extra whitespace, fall through to phrase parsing below.
      const clean = (unit: string) =>
        !/\s/.test(unit) && !CONNECTIVES.has(unit.toLowerCase());
      if (!Number.isNaN(value) && clean(from) && clean(to)) {
        return { value, from, to };
      }
    }

    // Inline form: "/convert 10 km to mi", "/convert 1 cup in qt", "/convert 10 km mi".
    const inline = context.request.query.replace(/^\/convert\b/i, "").trim();
    const parsed = parseConvertPhrase(inline);
    if (!parsed) {
      throw new Error("/convert needs a value, a source unit, and a target unit (e.g. /convert 10 km to mi).");
    }
    return parsed;
  }

  detectImplicit(query: string): ImplicitMatch<ConvertArgs> | undefined {
    const parsed = parseConvertPhrase(query);
    if (!parsed) {
      return undefined;
    }
    // Only surface inline when we can actually resolve it offline. Currency
    // (network) is recognised but left to the explicit/pill path.
    const result = computeOffline(parsed.value, parsed.from, parsed.to);
    if (!result) {
      return undefined;
    }
    // Higher confidence when the input used an explicit connective ("in"/"to"),
    // which strongly signals conversion intent over a coincidental "5 m" phrase.
    const usedConnective = /\b(in|to|as|into)\b/i.test(query) || /->|=>|>/.test(query);
    const confidence = usedConnective ? 0.95 : 0.75;
    return {
      confidence,
      args: parsed,
      label: `${formatNumber(parsed.value)} ${parsed.from} = ${formatNumber(result.value)} ${parsed.to}`
    };
  }

  completeImplicit(query: string): string | undefined {
    return completeConvertInput(query);
  }

  async executeCommand(args: ConvertArgs): Promise<ConvertOutput> {
    const { value, from, to } = args;

    // All offline conversions (temperature, length, mass, volume, data, time)
    // share one compute path so the raw `output.value` is rounded consistently
    // and never carries floating-point noise (e.g. 0.2499999994716559 → 0.25).
    const offline = computeOffline(value, from, to);
    if (offline) {
      const rounded = roundValue(offline.value);
      return {
        input: { value, unit: from },
        output: { value: rounded, unit: to },
        category: offline.category,
        formatted: `${formatNumber(value)} ${from} = ${formatNumber(rounded)} ${to}`,
        source: "offline"
      };
    }

    // A from/to that name known-but-mismatched unit categories is a user error.
    const fromUnit = lookupLinear(from);
    const toUnit = lookupLinear(to);
    if (fromUnit && toUnit && fromUnit.category !== toUnit.category) {
      throw new Error(`Cannot convert ${fromUnit.category} to ${toUnit.category}.`);
    }

    // Currency — server-only live FX.
    if (isCurrencyCode(from) && isCurrencyCode(to)) {
      const { converted, rate } = await fetchLiveRate(value, from, to);
      return {
        input: { value, unit: from.toUpperCase() },
        output: { value: converted, unit: to.toUpperCase() },
        category: "currency",
        formatted: `${formatNumber(value)} ${from.toUpperCase()} = ${formatNumber(converted)} ${to.toUpperCase()}`,
        rate,
        source: "live-fx"
      };
    }

    throw new Error(`Unknown or mismatched units "${from}" and "${to}".`);
  }
}

export function convertSlashCommand() {
  return new ConvertCommand();
}
