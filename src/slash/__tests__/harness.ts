// Tiny table-driven test harness shared by the slash-command eval libraries.
// No dependencies — runs under `bun`. Each suite is an array of named cases; a
// case fails loudly with its label so a regression points straight at the input.

export interface Suite {
  name: string;
  run(report: Reporter): void;
}

export interface Reporter {
  ok(label: string): void;
  fail(label: string, detail?: unknown): void;
}

export interface RunResult {
  passed: number;
  failed: number;
}

export function runSuites(suites: Suite[]): RunResult {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  const reporter: Reporter = {
    ok() {
      passed += 1;
    },
    fail(label, detail) {
      failed += 1;
      failures.push(detail === undefined ? label : `${label} — ${JSON.stringify(detail)}`);
    }
  };

  for (const suite of suites) {
    const before = failed;
    suite.run(reporter);
    const suiteFailed = failed - before;
    const mark = suiteFailed === 0 ? "✓" : "✗";
    console.log(`${mark} ${suite.name}`);
  }

  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`  ✗ ${failure}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Approximate-equality helper for floating-point conversions.
export function approxEqual(actual: number, expected: number, epsilon = 1e-6): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= epsilon * scale;
}
