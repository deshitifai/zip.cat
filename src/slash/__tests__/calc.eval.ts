// Eval library for /calc. Each case is "what the user typed" → "the number that
// should show". These exercise the exact path the inline-live UI uses:
// detectImplicit() for the formula gate + evaluate() for the value.
import { CalcCommand, evaluate, looksLikeFormula, tryEvaluate } from "../calc";
import { approxEqual, type Suite } from "./harness";

const calc = new CalcCommand();

interface ValueCase {
  input: string;
  expected: number;
}

// typed → numeric result
const VALUE_CASES: ValueCase[] = [
  { input: "2 + 2", expected: 4 },
  { input: "5 + 7", expected: 12 },
  { input: "2 + 2 * 10", expected: 22 },
  { input: "(2 + 2) * 10", expected: 40 },
  { input: "100 / 4", expected: 25 },
  { input: "10 - 3 - 2", expected: 5 },
  { input: "2 ^ 10", expected: 1024 },
  { input: "2 ^ 3 ^ 2", expected: 512 },        // right-assoc
  { input: "-5 + 3", expected: -2 },
  { input: "-(5 + 3)", expected: -8 },
  { input: "3 * -4", expected: -12 },
  { input: "17 % 5", expected: 2 },
  { input: "20 % 6 % 3", expected: 2 },
  { input: "1 + 2 * 3 - 4 / 2", expected: 5 },
  { input: "((1 + 2) * (3 + 4))", expected: 21 },
  { input: "2 * (3 + (4 - 1))", expected: 12 },
  { input: "1.5 + 2.5", expected: 4 },
  { input: "0.1 + 0.2", expected: 0.3 },        // float tolerance
  { input: "10 / 3", expected: 3.333333333333 },
  { input: "1_000 + 1", expected: 1001 },        // digit separators
  { input: "1e3 + 0", expected: 1000 },          // sci-notation (with an op so it's a "formula")
  { input: "2.5e-1 * 1", expected: 0.25 },
  { input: "3.5 * 2", expected: 7 },
  { input: "100 - 50 * 2", expected: 0 },
  { input: "2^0.5", expected: Math.SQRT2 },
  { input: "pi", expected: Math.PI },
  { input: "e", expected: Math.E },
  { input: "pi * 2", expected: Math.PI * 2 },
  { input: "2 * pi", expected: Math.PI * 2 },
  { input: "e ^ 2", expected: Math.E ** 2 },
  { input: "(pi + e)", expected: Math.PI + Math.E },
  { input: "  7   +   8  ", expected: 15 },       // whitespace
  { input: "9*9", expected: 81 },                 // no spaces
  { input: "2+2*2", expected: 6 },
  { input: "5 + 7 = ", expected: 12 }             // trailing noise the UI may pass... see note
];

// Inputs that must NOT evaluate (parse errors / unsafe).
const ERROR_CASES: string[] = [
  "1 / 0",
  "5 % 0",
  "2 + foo()",
  "alert(1)",
  "2 +",
  "* 3",
  "(1 + 2",
  "1 + 2)",
  "2 ** 3",      // ** is not our operator
  "0x10",        // hex not supported
  "abc"
];

// Inputs that are NOT formulas (should be ignored by implicit detection) — a
// bare number or non-math text must not hijack the input.
const NOT_FORMULA: string[] = [
  "5",
  "2024",
  "42",
  "hello world",
  "msft",
  "the answer",
  "-3",          // bare signed number, no operation
  "3.14"
];

export const calcValueSuite: Suite = {
  name: "/calc values (typed → result)",
  run(report) {
    for (const { input, expected } of VALUE_CASES) {
      // Note: the trailing "= " case documents that the strict evaluator rejects
      // trailing tokens; the UI trims to the formula. Verify via tryEvaluate of
      // the trimmed core for that one, strict evaluate for the rest.
      const value = input.trim().endsWith("=")
        ? tryEvaluate(input.replace(/=\s*$/, ""))
        : tryEvaluate(input);
      if (value === undefined) {
        report.fail(`evaluate("${input}")`, "returned undefined");
      } else if (!approxEqual(value, expected, 1e-9)) {
        report.fail(`evaluate("${input}")`, { got: value, expected });
      } else {
        report.ok(input);
      }
    }
  }
};

export const calcErrorSuite: Suite = {
  name: "/calc errors (must not evaluate)",
  run(report) {
    for (const input of ERROR_CASES) {
      const value = tryEvaluate(input);
      if (value !== undefined) {
        report.fail(`"${input}" should error`, { got: value });
      } else {
        report.ok(input);
      }
      // evaluate() should throw for the same inputs.
      let threw = false;
      try {
        evaluate(input);
      } catch {
        threw = true;
      }
      if (!threw) {
        report.fail(`evaluate("${input}") should throw`);
      } else {
        report.ok(`throws: ${input}`);
      }
    }
  }
};

export const calcFormulaGateSuite: Suite = {
  name: "/calc implicit gate (formula detection)",
  run(report) {
    for (const { input } of VALUE_CASES) {
      const core = input.replace(/=\s*$/, "").trim();
      if (!looksLikeFormula(core)) {
        report.fail(`looksLikeFormula("${core}") should be true`);
      } else {
        report.ok(`formula: ${core}`);
      }
    }
    for (const input of NOT_FORMULA) {
      if (looksLikeFormula(input)) {
        report.fail(`looksLikeFormula("${input}") should be false`);
      } else {
        report.ok(`not formula: ${input}`);
      }
      // detectImplicit must also decline.
      const match = calc.detectImplicit(input);
      if (match) {
        report.fail(`detectImplicit("${input}") should be undefined`, match);
      } else {
        report.ok(`no implicit: ${input}`);
      }
    }
  }
};

export const calcImplicitSuite: Suite = {
  name: "/calc implicit match (detect → args + label)",
  run(report) {
    const match = calc.detectImplicit("5 + 7");
    if (!match) {
      report.fail('detectImplicit("5 + 7")', "undefined");
      return;
    }
    if (match.args.expression !== "5 + 7") {
      report.fail("implicit args.expression", match.args);
    } else {
      report.ok("args carried");
    }
    if (!match.label?.includes("12")) {
      report.fail("implicit label shows result", match.label);
    } else {
      report.ok("label shows 12");
    }
    if (match.confidence < 0.6) {
      report.fail("implicit confidence", match.confidence);
    } else {
      report.ok("confidence ok");
    }
  }
};

export const calcSuites: Suite[] = [
  calcValueSuite,
  calcErrorSuite,
  calcFormulaGateSuite,
  calcImplicitSuite
];
