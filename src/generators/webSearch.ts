import type { EffortLevel } from "../models";
import {
  ExaAutoWebSearchGenerator,
  ExaDeepLiteWebSearchGenerator,
  ExaFastWebSearchGenerator,
  ExaInstantWebSearchGenerator
} from "./exa";
import { SerpApiGoogleWebSearchGenerator } from "./serpApi";

export function createWebSearchGenerators() {
  return [
    new ExaInstantWebSearchGenerator(),
    new ExaFastWebSearchGenerator(),
    new ExaAutoWebSearchGenerator(),
    new ExaDeepLiteWebSearchGenerator(),
    new SerpApiGoogleWebSearchGenerator()
  ];
}

export function webSearchGeneratorForEffort(effort: EffortLevel) {
  return createWebSearchGenerators().find((generator) => generator.effort === effort)
    ?? new ExaAutoWebSearchGenerator();
}
