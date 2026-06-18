import type { PluginRegistry, SuggestRequest, SuggestResponse } from "./models";

export async function suggest(registry: PluginRegistry, request: SuggestRequest): Promise<SuggestResponse> {
  const startedAt = performance.now();
  const context = {
    request: {
      query: request.query.trim(),
      trigger: request.trigger ?? {
        type: "input-change",
        source: "search-box"
      }
    },
    startedAt
  };

  if (!context.request.query) {
    return {
      query: "",
      suggestions: [],
      resultSets: [],
      elapsedMs: 0
    };
  }

  const enabledPlugins = registry.suggest.filter((plugin) => plugin.enabled());
  const qualifiedPlugins = [];

  for (const plugin of enabledPlugins) {
    const qualification = await plugin.triggerQualify(context);
    if (qualification.qualified) {
      qualifiedPlugins.push(plugin);
    }
  }

  const resultSets = await Promise.all(
    qualifiedPlugins.map((plugin) => plugin.triggerExecute(context))
  );
  const suggestions = resultSets.flatMap((resultSet) => resultSet.suggestions);

  return {
    query: context.request.query,
    suggestions,
    resultSets,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}
