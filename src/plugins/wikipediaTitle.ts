import type { JsonSchema, SuggestPlugin, Suggestion } from "../models";
import { isLookupTitleMatch, isSuggestibleLookupQuery } from "./matching";

export const wikipediaTitleResultSchema = {
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
    provider: {
      type: "string",
      const: "wikipedia.title"
    }
  }
} satisfies JsonSchema;

type OpenSearchResponse = [
  string,
  string[],
  string[],
  string[]
];

export function wikipediaTitlePlugin(): SuggestPlugin {
  const resultPlacement = {
    target: "command-line",
    renderer: "pill"
  } as const;

  return {
    id: "wikipedia.title",
    name: "Wikipedia Title",
    resultPlacement,
    resultsSchema: wikipediaTitleResultSchema,
    enabled: () => true,
    triggerQualify(context) {
      const isInputChange =
        context.request.trigger.type === "input-change" &&
        context.request.trigger.source === "search-box";

      return {
        qualified: isInputChange && isSuggestibleLookupQuery(context.request.query),
        reason: isInputChange ? undefined : "Wikipedia title matching only fires from command-line input changes."
      };
    },
    async triggerExecute(context) {
      const params = new URLSearchParams({
        action: "opensearch",
        format: "json",
        limit: "1",
        namespace: "0",
        origin: "*",
        search: context.request.query
      });

      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        headers: {
          "user-agent": "zip.cat/0.1 (https://zip.cat)"
        }
      });

      if (!response.ok) {
        throw new Error(`Wikipedia title match failed with ${response.status}.`);
      }

      const [, titles, , urls] = await response.json() as OpenSearchResponse;
      const suggestions = titles.slice(0, 1)
        .map<Suggestion>((title, index) => ({
          title,
          url: urls[index],
          provider: "wikipedia.title"
        }))
        .filter((suggestion) => Boolean(
          suggestion.title &&
          suggestion.url &&
          isLookupTitleMatch(context.request.query, suggestion.title)
        ));

      return {
        pluginId: "wikipedia.title",
        placement: resultPlacement,
        schema: wikipediaTitleResultSchema,
        suggestions
      };
    }
  };
}
