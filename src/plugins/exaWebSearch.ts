import type { JsonSchema, SearchPlugin } from "../models";
import { createWebSearchGenerators, webSearchGeneratorForEffort } from "../generators/webSearch";

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
      type: "string"
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
    name: "Web Search",
    resultPlacement,
    resultsSchema: exaWebSearchResultSchema,
    enabled: () => createWebSearchGenerators().some((generator) => generator.enabled()),
    triggerQualify(context) {
      const isSearchBoxReturn =
        context.request.trigger.type === "keyboard" &&
        context.request.trigger.key === "Enter" &&
        context.request.trigger.source === "search-box";

      return {
        qualified: isSearchBoxReturn && context.request.query.length > 0,
        reason: isSearchBoxReturn ? undefined : "Web search only fires from Return in the search box."
      };
    },
    async triggerExecute(context) {
      const generator = webSearchGeneratorForEffort(context.request.effort);
      try {
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
      } catch (error) {
        console.error("[search] generator failed", {
          generatorId: generator.id,
          provider: generator.provider,
          effort: context.request.effort,
          query: context.request.query,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    }
  };
}
