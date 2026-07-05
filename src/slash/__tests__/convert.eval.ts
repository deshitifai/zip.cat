// Eval library for /convert: phrase → resolved value, plus the autocomplete
// table for implicit pickups. Drives the real parseConvertPhrase + computeOffline
// + completeConvertInput functions.
import {
  ConvertCommand,
  completeConvertInput,
  completeUnitToken,
  computeOffline,
  parseConvertPhrase
} from "../convert";
import { approxEqual, type Suite } from "./harness";

const convert = new ConvertCommand();

interface ConvCase {
  input: string;
  expected: number;
  epsilon?: number;
}

// "phrase the user typed" → numeric result of the conversion
const CONVERT_CASES: ConvCase[] = [
  // length
  { input: "10 km to mi", expected: 6.2137119 },
  { input: "1 mi in km", expected: 1.609344 },
  { input: "100 cm in m", expected: 1 },
  { input: "12 in to cm", expected: 30.48 },
  { input: "1 ft in in", expected: 12 },
  { input: "3 yd in ft", expected: 9 },
  { input: "5280 ft in mi", expected: 1 },
  { input: "1 nmi in km", expected: 1.852 },
  // mass
  { input: "1 kg in lb", expected: 2.2046226 },
  { input: "16 oz in lb", expected: 1 },
  { input: "1000 g in kg", expected: 1 },
  { input: "1 st in lb", expected: 14 },
  { input: "1 t in kg", expected: 1000 },
  // temperature (the explicit example from the user: works both short + long)
  { input: "100 C to F", expected: 212 },
  { input: "0 C in F", expected: 32 },
  { input: "32 F in C", expected: 0 },
  { input: "98.6 F in C", expected: 37 },
  { input: "0 C in K", expected: 273.15 },
  { input: "300 K in C", expected: 26.85 },
  { input: "35 f in c", expected: 1.6666667 },
  { input: "50 fahrenheit in celsius", expected: 10 },
  { input: "20 celsius to fahrenheit", expected: 68 },
  // volume — the explicit example from the user: "1 cup in qt"
  { input: "1 cup in qt", expected: 0.25 },
  { input: "1 cup in qt", expected: 0.25 },
  { input: "4 cup in qt", expected: 1 },
  { input: "1 gal in qt", expected: 4 },
  { input: "2 qt in pt", expected: 4 },
  { input: "1 l in ml", expected: 1000 },
  { input: "1 gal in l", expected: 3.785411784 },
  { input: "8 floz in cup", expected: 1 },
  // data
  { input: "1 gb in mb", expected: 1000 },
  { input: "1 gib in mib", expected: 1024 },
  { input: "1024 kib in mib", expected: 1 },
  { input: "8 bit in byte", expected: 1 },
  { input: "1 mb in kb", expected: 1000 },
  // time
  { input: "1 h in min", expected: 60 },
  { input: "90 min in h", expected: 1.5 },
  { input: "1 d in h", expected: 24 },
  { input: "1 wk in d", expected: 7 },
  { input: "2 min in s", expected: 120 },
  // esoteric length
  { input: "1 league in mi", expected: 3 },
  { input: "1 fathom in ft", expected: 6 },
  { input: "1 furlong in ft", expected: 660 },
  { input: "1 mi in furlong", expected: 8 },
  { input: "1 chain in ft", expected: 66 },
  { input: "1 mi in fathom", expected: 880 },
  { input: "1 fathom in m", expected: 1.8288 },
  { input: "1 league in km", expected: 4.828032 },
  { input: "8 furlong in mi", expected: 1 },
  // esoteric mass
  { input: "1 carat in g", expected: 0.2 },
  { input: "5 carat in mg", expected: 1000 },
  { input: "1 grain in mg", expected: 64.79891 },
  { input: "1 slug in kg", expected: 14.5939029 },
  { input: "1 uston in lb", expected: 2000 },
  { input: "1 ukton in lb", expected: 2240 },
  // esoteric volume
  { input: "1 tbsp in tsp", expected: 3 },
  { input: "3 tsp in tbsp", expected: 1 },
  { input: "1 cup in tbsp", expected: 16 },
  { input: "1 bbl in gal", expected: 42 },
  { input: "16 tbsp in cup", expected: 1 },
  // formatting / connective variety
  { input: "10 km mi", expected: 6.2137119 },         // no connective
  { input: "10 km -> mi", expected: 6.2137119 },       // arrow
  { input: "10km in mi", expected: 6.2137119 },        // glued number+unit
  { input: "1,000 m in km", expected: 1 },             // thousands sep
  { input: "10 km as mi", expected: 6.2137119 }        // "as" connective
];

// Phrases that must NOT resolve offline (unknown/mismatched/currency).
const NON_OFFLINE: string[] = [
  "10 km in kg",     // cross-category
  "10 foo in bar",   // unknown units
  "10 USD in EUR",   // currency (network only)
  "hello world",
  "5"
];

interface CompleteCase {
  input: string;
  expected: string;
}

// "partial input" → "completed input" (the explicit examples + more)
const COMPLETE_CASES: CompleteCase[] = [
  { input: "35 f i", expected: "35 f in c" },
  { input: "50 fah", expected: "50 fahrenheit in celsius" },
  { input: "20 cel", expected: "20 celsius in fahrenheit" },
  { input: "100 c i", expected: "100 c in f" },
  { input: "1 cup in q", expected: "1 cup in quarts" },
  { input: "1 cup in qua", expected: "1 cup in quarts" },
  { input: "10 mi in kilom", expected: "10 mi in kilometers" },   // partial target → canonical
  { input: "5 fahrenheit i", expected: "5 fahrenheit in celsius" },
  { input: "32 fahrenheit in cel", expected: "32 fahrenheit in celsius" },
  { input: "1 gal in gallo", expected: "1 gal in gallons" }
];

// TRAILING-SPACE completions: source unit done, suggest the most common target.
// The headline example: "12 in " → "12 in in ft".
const TRAILING_SPACE_CASES: CompleteCase[] = [
  { input: "12 in ", expected: "12 in in ft" },
  { input: "5 kg ", expected: "5 kg in lb" },
  { input: "100 c ", expected: "100 c in f" },
  { input: "10 mi ", expected: "10 mi in km" },
  { input: "1 cup ", expected: "1 cup in ml" },
  { input: "3 ft ", expected: "3 ft in m" },
  { input: "2 lb ", expected: "2 lb in kg" },
  { input: "1 gal ", expected: "1 gal in l" },
  { input: "12 in in ", expected: "12 in in ft" },     // connective already present
  { input: "5 kilograms ", expected: "5 kilograms in pounds" },  // long source → long target
  { input: "2 league ", expected: "2 league in miles" },         // esoteric
  { input: "1 fathom ", expected: "1 fathom in feet" }
];

// Inputs where autocomplete should produce nothing (already complete / ambiguous).
const NO_COMPLETE: string[] = [
  "10 km in mi",       // both sides complete (mi is an exact alias)
  "10 km to m",        // target "m" is an exact alias (meters) → already complete
  "10 km in mil",      // "mil" ambiguous within length (miles vs millimeters)
  "hello",
  "5 + 7"
];

export const convertValueSuite: Suite = {
  name: "/convert values (phrase → result)",
  run(report) {
    for (const { input, expected, epsilon } of CONVERT_CASES) {
      const parsed = parseConvertPhrase(input);
      if (!parsed) {
        report.fail(`parse("${input}")`, "undefined");
        continue;
      }
      const result = computeOffline(parsed.value, parsed.from, parsed.to);
      if (!result) {
        report.fail(`compute("${input}")`, "undefined");
      } else if (!approxEqual(result.value, expected, epsilon ?? 1e-5)) {
        report.fail(`"${input}"`, { got: result.value, expected });
      } else {
        report.ok(input);
      }
    }
  }
};

export const convertRejectSuite: Suite = {
  name: "/convert rejects (no offline result)",
  run(report) {
    for (const input of NON_OFFLINE) {
      const parsed = parseConvertPhrase(input);
      const result = parsed ? computeOffline(parsed.value, parsed.from, parsed.to) : undefined;
      if (result) {
        report.fail(`"${input}" should not resolve offline`, result);
      } else {
        report.ok(input);
      }
      // Implicit detection must also decline these (currency/unknown).
      const match = convert.detectImplicit(input);
      if (match) {
        report.fail(`detectImplicit("${input}") should be undefined`, match);
      } else {
        report.ok(`no implicit: ${input}`);
      }
    }
  }
};

export const convertCompleteSuite: Suite = {
  name: "/convert autocomplete (partial → completed)",
  run(report) {
    for (const { input, expected } of COMPLETE_CASES) {
      const completed = completeConvertInput(input);
      if (completed !== expected) {
        report.fail(`complete("${input}")`, { got: completed, expected });
      } else {
        report.ok(`${input} → ${expected}`);
      }
    }
    for (const input of NO_COMPLETE) {
      const completed = completeConvertInput(input);
      if (completed !== undefined) {
        report.fail(`complete("${input}") should be undefined`, { got: completed });
      } else {
        report.ok(`no complete: ${input}`);
      }
    }
  }
};

export const convertTrailingSpaceSuite: Suite = {
  name: "/convert trailing-space target suggestion",
  run(report) {
    for (const { input, expected } of TRAILING_SPACE_CASES) {
      const completed = completeConvertInput(input);
      if (completed !== expected) {
        report.fail(`complete("${input}")`, { got: completed, expected });
      } else {
        report.ok(`${input}→ ${expected}`);
      }
    }
  }
};

export const convertTokenSuite: Suite = {
  name: "/convert unit-token completion",
  run(report) {
    const cases: Array<[string, string | undefined]> = [
      ["fah", "fahrenheit"],
      ["cel", "celsius"],
      ["kel", "kelvin"],
      ["qua", "quarts"],
      ["gal", "gallons"],
      ["mil", undefined],      // ambiguous: millimeters/milliliters/miles/...
      ["kilom", "kilometers"],
      ["celsius", "celsius"],  // exact → canonical
      ["f", "fahrenheit"]      // exact alias → canonical
    ];
    for (const [input, expected] of cases) {
      const got = completeUnitToken(input);
      if (got !== expected) {
        report.fail(`completeUnitToken("${input}")`, { got, expected });
      } else {
        report.ok(`${input} → ${expected ?? "∅"}`);
      }
    }
  }
};

export const convertExplicitArgsSuite: Suite = {
  name: "/convert explicit args (client splitter mis-grouping)",
  run(report) {
    // The client's generic inline-arg splitter can leak a connective into an
    // arg (to="to mi"). parseArguments must recover via phrase parsing.
    const ctx = (query: string, args: Record<string, unknown>) => ({
      request: { query, command: "/convert", args },
      startedAt: 0
    });
    const cases: Array<{ query: string; args: Record<string, unknown>; from: string; to: string; value: number }> = [
      { query: "/convert 10 km to mi", args: { value: "10", from: "km", to: "to mi" }, value: 10, from: "km", to: "mi" },
      { query: "/convert 1 cup in qt", args: { value: "1", from: "cup", to: "in qt" }, value: 1, from: "cup", to: "qt" },
      { query: "/convert 5 kg to lb", args: { value: "5", from: "kg", to: "to lb" }, value: 5, from: "kg", to: "lb" },
      // Clean explicit args should still pass straight through.
      { query: "/convert 10 km mi", args: { value: "10", from: "km", to: "mi" }, value: 10, from: "km", to: "mi" }
    ];
    for (const c of cases) {
      try {
        const parsed = convert.parseArguments(ctx(c.query, c.args));
        if (parsed.value !== c.value || parsed.from !== c.from || parsed.to !== c.to) {
          report.fail(`parseArguments("${c.query}")`, { got: parsed, expected: c });
        } else {
          report.ok(`${c.query} → ${c.value} ${c.from}→${c.to}`);
        }
      } catch (error) {
        report.fail(`parseArguments("${c.query}") threw`, String(error));
      }
    }
  }
};

export const convertImplicitSuite: Suite = {
  name: "/convert implicit match",
  run(report) {
    const match = convert.detectImplicit("1 cup in qt");
    if (!match) {
      report.fail('detectImplicit("1 cup in qt")', "undefined");
      return;
    }
    if (match.args.from !== "cup" || match.args.to !== "qt" || match.args.value !== 1) {
      report.fail("implicit args", match.args);
    } else {
      report.ok("args carried");
    }
    if (!match.label?.includes("0.25")) {
      report.fail("label shows result", match.label);
    } else {
      report.ok("label shows 0.25");
    }
    // "in" connective → high confidence.
    if (match.confidence < 0.9) {
      report.fail("connective confidence", match.confidence);
    } else {
      report.ok("high confidence with connective");
    }
  }
};

export const convertSuites: Suite[] = [
  convertValueSuite,
  convertRejectSuite,
  convertCompleteSuite,
  convertTrailingSpaceSuite,
  convertTokenSuite,
  convertExplicitArgsSuite,
  convertImplicitSuite
];
