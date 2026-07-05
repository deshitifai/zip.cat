import type { EffortLevel } from "../models";
import type { GeneratorDescriptor } from "./base";
import {
  ExaAutoWebSearchGenerator,
  ExaDeepWebSearchGenerator,
  ExaDeepLiteWebSearchGenerator,
  ExaFastWebSearchGenerator,
  ExaInstantWebSearchGenerator
} from "./exa";
import { createSearxngWebSearchGenerators } from "./searxng";

// Ordered by preference within each effort level: Exa first (hosted, ranked),
// then SearXNG (self-hosted metasearch) as the keyless fallback. Selection
// below only ever returns an enabled generator, so setting just SEARXNG_URL
// (no EXA_API_KEY) routes every effort level to the SearXNG instance.
export function createWebSearchGenerators() {
  return [
    new ExaInstantWebSearchGenerator(),
    new ExaFastWebSearchGenerator(),
    new ExaAutoWebSearchGenerator(),
    new ExaDeepLiteWebSearchGenerator(),
    new ExaDeepWebSearchGenerator(),
    ...createSearxngWebSearchGenerators()
  ];
}

export function webSearchGeneratorForEffort(effort: EffortLevel) {
  const generators = createWebSearchGenerators();
  const enabled = generators.filter((generator) => generator.enabled());

  // Exact effort match among enabled generators, honouring list order.
  const exact = enabled.find((generator) => generator.effort === effort);
  if (exact) {
    return exact;
  }

  // Nearest enabled effort as a fallback, then the historical default (Exa
  // Auto) so the caller still gets a generator whose execute() reports the
  // missing configuration.
  const nearest = [...enabled].sort((a, b) =>
    Math.abs(a.effort - effort) - Math.abs(b.effort - effort)
  )[0];
  return nearest ?? new ExaAutoWebSearchGenerator();
}

// The effort→generator map as it will actually resolve at request time (the
// same selection logic as webSearchGeneratorForEffort). Shared by the server
// and the Pages Function so /api/effort never advertises a generator that a
// search wouldn't use.
export function webSearchEffortLevels(): Record<string, GeneratorDescriptor> {
  const levels: Record<string, GeneratorDescriptor> = {};
  for (const effort of [1, 2, 3, 4, 5] as EffortLevel[]) {
    levels[String(effort)] = webSearchGeneratorForEffort(effort).describe();
  }
  return levels;
}
