// Runs the full slash-command implicit/eval test library.
//   bun scripts/test_implicit.ts
import { runSuites } from "../src/slash/__tests__/harness";
import { calcSuites } from "../src/slash/__tests__/calc.eval";
import { convertSuites } from "../src/slash/__tests__/convert.eval";
import { dispatchSuites } from "../src/slash/__tests__/dispatch.eval";

const result = runSuites([...calcSuites, ...convertSuites, ...dispatchSuites]);

if (result.failed > 0) {
  process.exit(1);
}
