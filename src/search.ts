import type { PluginRegistry, SearchRequest, SearchResponse } from "./models";

function normalizeEffort(effort?: number) {
  if (!effort || !Number.isFinite(effort)) {
    return 3;
  }

  return Math.min(Math.max(Math.round(effort), 1), 5) as 1 | 2 | 3 | 4 | 5;
}

export async function search(registry: PluginRegistry, request: SearchRequest): Promise<SearchResponse> {
  const startedAt = performance.now();
  const effort = normalizeEffort(request.effort);
  const context = {
    request: {
      query: request.query.trim(),
      limit: Math.min(Math.max(request.limit ?? 50, 1), 50),
      effort,
      trigger: request.trigger ?? {
        type: "keyboard",
        key: "Enter",
        source: "search-box"
      }
    },
    startedAt
  };

  if (!context.request.query) {
    return {
      query: "",
      results: [],
      resultSets: [],
      elapsedMs: 0
    };
  }

  const enabledPlugins = registry.search.filter((plugin) => plugin.enabled());
  if (enabledPlugins.length === 0) {
    throw new Error("No search plugin enabled. Set EXA_API_KEY, SERP_API_KEY, or SEARXNG_URL.");
  }

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

  let results = resultSets.flatMap((resultSet) => resultSet.results);

  for (const filter of registry.filters) {
    results = await filter.apply(results, context);
  }

  return {
    query: context.request.query,
    results,
    resultSets: resultSets.map((resultSet) => ({
      ...resultSet,
      results: resultSet.results.filter((result) => results.includes(result))
    })),
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}
