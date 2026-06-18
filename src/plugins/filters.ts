import type { ResultFilterPlugin } from "../models";

export function uniqueUrlFilter(): ResultFilterPlugin {
  return {
    id: "result.unique-url",
    apply(results) {
      const seen = new Set<string>();

      return results.filter((result) => {
        if (!result.url || seen.has(result.url)) {
          return false;
        }

        seen.add(result.url);
        return true;
      });
    }
  };
}

export function limitFilter(): ResultFilterPlugin {
  return {
    id: "result.limit",
    apply(results, context) {
      return results.slice(0, context.request.limit);
    }
  };
}
