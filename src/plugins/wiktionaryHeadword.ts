import type { JsonSchema, SuggestPlugin, Suggestion } from "../models";

export const wiktionaryHeadwordResultSchema = {
  type: "object",
  required: ["title", "url", "provider"],
  properties: {
    title: {
      type: "string"
    },
    url: {
      type: "string",
      format: "uri"
    },
    description: {
      type: "string"
    },
    fullDescription: {
      type: "string"
    },
    provider: {
      type: "string",
      const: "wiktionary.headword"
    }
  }
} satisfies JsonSchema;

type OpenSearchResponse = [
  string,
  string[],
  string[],
  string[]
];

type WiktionaryDefinition = Record<string, Array<{
  language?: string;
  partOfSpeech?: string;
  definitions?: Array<{
    definition?: string;
  }>;
}>>;

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value: string, limit = 140) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1).trim()}…`;
}

function definitionScore(entry: {
  language?: string;
  partOfSpeech?: string;
}) {
  let score = 0;

  if (entry.language === "English") {
    score += 10;
  }

  if (["Noun", "Verb", "Adjective", "Adverb"].includes(entry.partOfSpeech ?? "")) {
    score += 5;
  }

  return score;
}

async function findHeadword(query: string) {
  const params = new URLSearchParams({
    action: "opensearch",
    format: "json",
    limit: "1",
    namespace: "0",
    origin: "*",
    search: query
  });

  const response = await fetch(`https://en.wiktionary.org/w/api.php?${params}`, {
    headers: {
      "api-user-agent": "zip.cat/0.1 (https://zip.cat)"
    }
  });

  if (!response.ok) {
    throw new Error(`Wiktionary headword match failed with ${response.status}.`);
  }

  const [, titles, , urls] = await response.json() as OpenSearchResponse;
  const title = titles[0];
  const url = urls[0];

  return title && url ? { title, url } : undefined;
}

async function findDefinition(title: string) {
  const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`, {
    headers: {
      "api-user-agent": "zip.cat/0.1 (https://zip.cat)"
    }
  });

  if (!response.ok) {
    return undefined;
  }

  const data = await response.json() as WiktionaryDefinition;
  const englishEntries = [...(data.en ?? [])].sort((left, right) => (
    definitionScore(right) - definitionScore(left)
  ));

  for (const entry of englishEntries) {
    for (const item of entry.definitions ?? []) {
      const definition = stripHtml(item.definition ?? "");
      if (
        definition.length > 24 &&
        !definition.includes("language code for") &&
        !definition.startsWith("Terms relating")
      ) {
        return {
          compact: shorten(definition),
          full: definition
        };
      }
    }
  }

  return undefined;
}

export function wiktionaryHeadwordPlugin(): SuggestPlugin {
  const resultPlacement = {
    target: "command-line",
    renderer: "pill"
  } as const;

  return {
    id: "wiktionary.headword",
    name: "Wiktionary Headword",
    resultPlacement,
    resultsSchema: wiktionaryHeadwordResultSchema,
    enabled: () => true,
    triggerQualify(context) {
      const isInputChange =
        context.request.trigger.type === "input-change" &&
        context.request.trigger.source === "search-box";

      return {
        qualified: isInputChange && context.request.query.length >= 2,
        reason: isInputChange ? undefined : "Wiktionary headword matching only fires from command-line input changes."
      };
    },
    async triggerExecute(context) {
      const headword = await findHeadword(context.request.query);
      if (!headword) {
        return {
          pluginId: "wiktionary.headword",
          placement: resultPlacement,
          schema: wiktionaryHeadwordResultSchema,
          suggestions: []
        };
      }

      const definition = await findDefinition(headword.title);
      const suggestions: Suggestion[] = [{
        title: headword.title,
        url: headword.url,
        description: definition?.compact,
        fullDescription: definition?.full,
        provider: "wiktionary.headword"
      }];

      return {
        pluginId: "wiktionary.headword",
        placement: resultPlacement,
        schema: wiktionaryHeadwordResultSchema,
        suggestions
      };
    }
  };
}
