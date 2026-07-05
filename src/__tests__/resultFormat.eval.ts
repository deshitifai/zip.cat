// Eval for the result-format helpers that drive the format indicator + picker
// menu: marker parsing, format resolution, and indicator/icon markup safety.
//   bun src/__tests__/resultFormat.eval.ts
import {
  defaultResultFormat,
  resultFormatForQuery,
  resultFormatForTypedOutput,
  resultFormatIndicatorMarkup,
  typedOutputReferencesForFormat,
  type ResultFormatKind
} from "../resultFormat";
import { typedOutputDescriptors } from "../typedOutputs";
import { runSuites, type Suite } from "../slash/__tests__/harness";

const descriptors = typedOutputDescriptors();

export const resultFormatSuites: Suite[] = [
  {
    name: "typed-output marker parsing for format",
    run(report) {
      const cases: Array<{ query: string; expected: string[] }> = [
        { query: "best pizza #url", expected: ["url"] },
        { query: "open now? #bool", expected: ["bool"] },
        { query: "sushi #Restaurant[]", expected: ["Restaurant[]"] },
        { query: "sushi #Restaurant []", expected: ["Restaurant[]"] }, // spaced array marker
        { query: "#url then #bool", expected: ["url", "bool"] },       // multiple, in order
        { query: "plain search", expected: [] },
        { query: "#nonexistent", expected: [] },                        // unknown marker ignored
        { query: "code #URL", expected: ["url"] }                       // case-insensitive
      ];
      for (const { query, expected } of cases) {
        const got = typedOutputReferencesForFormat(query, descriptors).map((d) => d.marker.replace(/^#/, ""));
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          report.fail(`refs("${query}")`, { got, expected });
        } else {
          report.ok(query);
        }
      }
    }
  },
  {
    name: "format resolution (query + mode → kind)",
    run(report) {
      const cases: Array<{ query: string; mode: "search" | "ai"; expected: ResultFormatKind }> = [
        { query: "anything", mode: "search", expected: "search-list" },
        { query: "anything", mode: "ai", expected: "string" },
        { query: "best pizza #url", mode: "search", expected: "url" },
        { query: "open? #bool", mode: "ai", expected: "boolean" },
        { query: "sushi #Restaurant", mode: "search", expected: "restaurant-card" },
        { query: "sushi #Restaurant[]", mode: "search", expected: "restaurant-list" },
        // First marker wins when several are present.
        { query: "#bool and #url", mode: "ai", expected: "boolean" }
      ];
      for (const { query, mode, expected } of cases) {
        const got = resultFormatForQuery(query, mode, descriptors).kind;
        if (got !== expected) {
          report.fail(`format("${query}", ${mode})`, { got, expected });
        } else {
          report.ok(`${query} (${mode}) → ${expected}`);
        }
      }
    }
  },
  {
    name: "descriptor → format mapping + defaults",
    run(report) {
      for (const descriptor of descriptors) {
        const format = resultFormatForTypedOutput(descriptor);
        if (!format.kind || !format.label || format.schemaName !== descriptor.name) {
          report.fail(`resultFormatForTypedOutput(${descriptor.id})`, format);
        } else {
          report.ok(`${descriptor.id} → ${format.kind}`);
        }
      }
      if (defaultResultFormat("search").kind !== "search-list") {
        report.fail("default search format");
      } else {
        report.ok("default search → search-list");
      }
      if (defaultResultFormat("ai").kind !== "string") {
        report.fail("default ai format");
      } else {
        report.ok("default ai → string");
      }
    }
  },
  {
    name: "indicator markup safety",
    run(report) {
      const markup = resultFormatIndicatorMarkup({
        kind: "url",
        label: `<script>alert(1)</script>`,
        schemaName: `"><img onerror=x>`
      });
      if (markup.includes("<script>") || markup.includes("<img")) {
        report.fail("indicator markup must escape label/schemaName", markup);
      } else {
        report.ok("labels escaped");
      }
      if (!markup.includes(`role="button"`) || !markup.includes(`tabindex="0"`)) {
        report.fail("indicator must be keyboard-focusable", markup);
      } else {
        report.ok("keyboard-accessible");
      }
    }
  }
];

if (import.meta.main) {
  const result = runSuites(resultFormatSuites);
  if (result.failed > 0) {
    process.exit(1);
  }
}
