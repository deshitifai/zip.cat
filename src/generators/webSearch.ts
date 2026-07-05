import type { EffortLevel } from "../models";
import {
  ExaAutoWebSearchGenerator,
  ExaDeepWebSearchGenerator,
  ExaDeepLiteWebSearchGenerator,
  ExaFastWebSearchGenerator,
  ExaInstantWebSearchGenerator
} from "./exa";

export function createWebSearchGenerators() {
  return [
    new ExaInstantWebSearchGenerator(),
    new ExaFastWebSearchGenerator(),
    new ExaAutoWebSearchGenerator(),
    new ExaDeepLiteWebSearchGenerator(),
    new ExaDeepWebSearchGenerator()
  ];
}

export function webSearchGeneratorForEffort(effort: EffortLevel) {
  return createWebSearchGenerators().find((generator) => generator.effort === effort)
    ?? new ExaAutoWebSearchGenerator();
}
