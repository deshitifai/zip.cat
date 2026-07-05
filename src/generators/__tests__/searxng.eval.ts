// Eval for the SearXNG web-search generator: response parsing, base-URL
// validation, and enabled-aware effort selection across Exa/SearXNG.
//   bun src/generators/__tests__/searxng.eval.ts
import { parseSearxngResults, searxngBaseUrl } from "../searxng";
import { webSearchGeneratorForEffort, webSearchEffortLevels } from "../webSearch";
import { runSuites, type Suite } from "../../slash/__tests__/harness";
import type { EffortLevel } from "../../models";

// Bun auto-loads .env, so selection tests must pin the exact env they assume.
const ENV_KEYS = ["SEARXNG_URL", "EXA_API_KEY", "SERP_API_KEY"] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  try {
    for (const key of ENV_KEYS) {
      const value = overrides[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export const searxngSuites: Suite[] = [
  {
    name: "searxng response parsing",
    run(report) {
      const parsed = parseSearxngResults({
        results: [
          { url: "https://example.com/a", title: "A", score: 4.2 },
          { url: "https://example.com/b", title: "", content: "no title" },   // empty title → undefined
          { url: "https://example.com/c", score: "high" },                     // non-numeric score dropped
          { url: "ftp://example.com/skip", title: "not http" },                // non-http(s) rejected
          { url: 42, title: "bad url type" },                                  // wrong type rejected
          "not an object",                                                     // junk entry rejected
          null,
          { title: "no url at all" }
        ]
      }, "searxng.test");

      if (parsed.length !== 3) {
        report.fail("keeps only http(s) results", { got: parsed.length, expected: 3 });
      } else {
        report.ok("filters malformed entries");
      }
      if (parsed[0]?.title !== "A" || parsed[0]?.score !== 4.2 || parsed[0]?.provider !== "searxng.test") {
        report.fail("first result normalized", parsed[0]);
      } else {
        report.ok("title/score/provider mapped");
      }
      if (parsed[1]?.title !== undefined) {
        report.fail("empty title becomes undefined", parsed[1]);
      } else {
        report.ok("empty title dropped");
      }
      if (parsed[2]?.score !== undefined) {
        report.fail("non-numeric score becomes undefined", parsed[2]);
      } else {
        report.ok("non-numeric score dropped");
      }

      const empty = parseSearxngResults({}, "searxng.test");
      if (empty.length !== 0) {
        report.fail("missing results array → empty", empty);
      } else {
        report.ok("tolerates missing results");
      }
    }
  },
  {
    name: "searxng base URL validation",
    run(report) {
      const cases: Array<{ value: string | undefined; valid: boolean }> = [
        { value: "http://localhost:8888", valid: true },
        { value: "https://searx.internal.example", valid: true },
        { value: "  https://searx.example/  ", valid: true },   // trimmed
        { value: "localhost:8888", valid: false },               // no scheme
        { value: "file:///etc/passwd", valid: false },           // wrong scheme
        { value: "not a url", valid: false },
        { value: "", valid: false },
        { value: undefined, valid: false }
      ];
      for (const { value, valid } of cases) {
        withEnv({ SEARXNG_URL: value }, () => {
          const got = Boolean(searxngBaseUrl());
          if (got !== valid) {
            report.fail(`searxngBaseUrl(${JSON.stringify(value)})`, { got, expected: valid });
          } else {
            report.ok(`${JSON.stringify(value)} → ${valid ? "valid" : "rejected"}`);
          }
        });
      }
    }
  },
  {
    name: "enabled-aware effort selection",
    run(report) {
      const efforts = [1, 2, 3, 4, 5] as EffortLevel[];

      // Only SearXNG configured → every effort resolves to a searxng generator.
      withEnv({ SEARXNG_URL: "http://localhost:8888", EXA_API_KEY: undefined, SERP_API_KEY: undefined }, () => {
        for (const effort of efforts) {
          const generator = webSearchGeneratorForEffort(effort);
          if (generator.provider !== "searxng" || generator.effort !== effort) {
            report.fail(`effort ${effort} with only SEARXNG_URL`, generator.id);
          } else {
            report.ok(`effort ${effort} → ${generator.id}`);
          }
        }
        const levels = webSearchEffortLevels();
        if (!efforts.every((effort) => levels[String(effort)]?.provider === "searxng")) {
          report.fail("effort levels advertise searxng", levels);
        } else {
          report.ok("effort endpoint advertises searxng");
        }
      });

      // Exa + SearXNG both configured → Exa wins by list order.
      withEnv({ SEARXNG_URL: "http://localhost:8888", EXA_API_KEY: "test-key", SERP_API_KEY: undefined }, () => {
        for (const effort of efforts) {
          const generator = webSearchGeneratorForEffort(effort);
          if (generator.provider !== "exa") {
            report.fail(`effort ${effort} with both keys should prefer exa`, generator.id);
          } else {
            report.ok(`effort ${effort} prefers exa`);
          }
        }
      });

      // Nothing configured → historical Exa Auto default (its execute() then
      // reports the missing key).
      withEnv({ SEARXNG_URL: undefined, EXA_API_KEY: undefined, SERP_API_KEY: undefined }, () => {
        const generator = webSearchGeneratorForEffort(3);
        if (generator.id !== "exa.web-search.auto" && generator.provider !== "exa") {
          report.fail("no-config fallback", generator.id);
        } else {
          report.ok("no-config falls back to exa auto");
        }
      });
    }
  }
];

if (import.meta.main) {
  const result = runSuites(searxngSuites);
  if (result.failed > 0) {
    process.exit(1);
  }
}
