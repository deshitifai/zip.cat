import type { PluginRegistry, SuggestPlugin, SuggestRequest, SuggestResponse } from "./models";

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

  if (!context.request.query || context.request.query.startsWith("/")) {
    return {
      query: context.request.query,
      suggestions: [],
      resultSets: [],
      elapsedMs: 0
    };
  }

  const enabledPlugins = registry.suggest.filter((plugin) => plugin.enabled());
  const qualifiedPlugins: SuggestPlugin[] = [];

  for (const plugin of enabledPlugins) {
    const qualification = await plugin.triggerQualify(context);
    if (qualification.qualified) {
      qualifiedPlugins.push(plugin);
    }
  }

  const settledResultSets = await Promise.allSettled(
    qualifiedPlugins.map((plugin) => plugin.triggerExecute(context))
  );
  const resultSets = settledResultSets.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    console.warn(`Suggest plugin ${qualifiedPlugins[index].id} failed:`, result.reason);
    return [];
  });
  const suggestions = resultSets.flatMap((resultSet) => resultSet.suggestions);

  return {
    query: context.request.query,
    suggestions,
    resultSets,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}
