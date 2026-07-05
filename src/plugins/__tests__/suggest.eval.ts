import { wikipediaTitlePlugin } from "../wikipediaTitle";
import { wiktionaryHeadwordPlugin } from "../wiktionaryHeadword";
import { isLookupExactMatch, isLookupPrefixMatch, isLookupTitleMatch, isSuggestibleLookupQuery } from "../matching";
import { runSuites, type Suite } from "../../slash/__tests__/harness";
import type { SuggestContext } from "../../models";

function inputChangeContext(query: string): SuggestContext {
  return {
    request: {
      query,
      trigger: {
        type: "input-change",
        source: "search-box"
      }
    },
    startedAt: 0
  };
}

export const suggestSuites: Suite[] = [
  {
    name: "suggest lookup qualification",
    run(report) {
      const cases: Array<{ query: string; expected: boolean }> = [
        { query: "#f", expected: false },
        { query: "fu", expected: true },
        { query: "c+", expected: true },
        { query: "new y", expected: true },
        { query: "/weather", expected: false }
      ];

      for (const { query, expected } of cases) {
        const got = isSuggestibleLookupQuery(query);
        if (got !== expected) {
          report.fail(`isSuggestibleLookupQuery("${query}")`, { got, expected });
        } else {
          report.ok(query);
        }
      }
    }
  },
  {
    name: "suggest plugins do not qualify typed-output marker fragments",
    run(report) {
      const context = inputChangeContext("#f");
      for (const plugin of [wikipediaTitlePlugin(), wiktionaryHeadwordPlugin()]) {
        const qualification = plugin.triggerQualify(context);
        if (qualification instanceof Promise) {
          report.fail(`${plugin.id} triggerQualify("#f")`, "unexpected async qualification");
          continue;
        }
        if (qualification.qualified) {
          report.fail(`${plugin.id} triggerQualify("#f")`, qualification);
        } else {
          report.ok(`${plugin.id} rejects #f`);
        }
      }
    }
  },
  {
    name: "suggest result title must match typed lookup prefix",
    run(report) {
      const cases: Array<{ query: string; title: string; expected: boolean }> = [
        { query: "#f", title: "Fuck", expected: false },
        { query: "fu", title: "Fuck", expected: true },
        { query: "c+", title: "C++", expected: true },
        { query: "new y", title: "New York City", expected: true },
        { query: "ny", title: "New York City", expected: false }
      ];

      for (const { query, title, expected } of cases) {
        const got = isLookupPrefixMatch(query, title);
        if (got !== expected) {
          report.fail(`isLookupPrefixMatch("${query}", "${title}")`, { got, expected });
        } else {
          report.ok(`${query} -> ${title}`);
        }
      }
    }
  },
  {
    name: "wikipedia title requires exact typed title",
    run(report) {
      const cases: Array<{ query: string; title: string; expected: boolean }> = [
        { query: "New York City", title: "New York City", expected: true },
        { query: "new york city", title: "New York City", expected: true },
        { query: "new y", title: "New York City", expected: false },
        { query: "ny", title: "New York City", expected: false }
      ];

      for (const { query, title, expected } of cases) {
        const got = isLookupExactMatch(query, title);
        if (got !== expected) {
          report.fail(`isLookupExactMatch("${query}", "${title}")`, { got, expected });
        } else {
          report.ok(`${query} exact ${title}`);
        }
      }
    }
  },
  {
    name: "wikipedia title accepts exact or redirect-resolved whole-word titles",
    run(report) {
      const cases: Array<{ query: string; title: string; expected: boolean }> = [
        { query: "New York City", title: "New York City", expected: true },
        { query: "einstein", title: "Albert Einstein", expected: true },
        { query: "obama", title: "Barack Obama", expected: true },
        { query: "new y", title: "New York City", expected: false },
        { query: "ny", title: "New York City", expected: false },
        { query: "#f", title: "Fuck", expected: false }
      ];

      for (const { query, title, expected } of cases) {
        const got = isLookupTitleMatch(query, title);
        if (got !== expected) {
          report.fail(`isLookupTitleMatch("${query}", "${title}")`, { got, expected });
        } else {
          report.ok(`${query} title ${title}`);
        }
      }
    }
  }
];

if (import.meta.main) {
  const result = runSuites(suggestSuites);
  if (result.failed > 0) {
    process.exit(1);
  }
}
