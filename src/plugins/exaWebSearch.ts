import type { JsonSchema, SearchPlugin } from "../models";
import { createExaWebSearchGenerators, exaWebSearchGeneratorForEffort } from "../generators/exa";

export const exaWebSearchResultSchema = {
  type: "object",
  required: ["url", "provider"],
  properties: {
    title: {
      type: "string"
    },
    url: {
      type: "string",
      format: "uri"
    },
    score: {
      type: "number"
    },
    provider: {
      type: "string",
      const: "exa.web-search"
    }
  }
} satisfies JsonSchema;

export function exaWebSearchPlugin(): SearchPlugin {
  const resultPlacement = {
    target: "results",
    renderer: "url-table"
  } as const;

  return {
    id: "exa.web-search",
    name: "Exa.ai Web Search",
    resultPlacement,
    resultsSchema: exaWebSearchResultSchema,
    enabled: () => createExaWebSearchGenerators().some((generator) => generator.enabled()),
    triggerQualify(context) {
      const isSearchBoxReturn =
        context.request.trigger.type === "keyboard" &&
        context.request.trigger.key === "Enter" &&
        context.request.trigger.source === "search-box";

      return {
        qualified: isSearchBoxReturn && context.request.query.length > 0,
        reason: isSearchBoxReturn ? undefined : "Exa web search only fires from Return in the search box."
      };
    },
    async triggerExecute(context) {
      const generator = exaWebSearchGeneratorForEffort(context.request.effort);
      const results = await generator.execute({
        query: context.request.query,
        limit: context.request.limit
      });

      return {
        pluginId: generator.id,
        placement: resultPlacement,
        schema: exaWebSearchResultSchema,
        results
      };
    }
  };
}
