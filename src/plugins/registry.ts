import type { PluginRegistry } from "../models";
import { exaWebSearchPlugin } from "./exaWebSearch";
import { limitFilter, uniqueUrlFilter } from "./filters";
import { wikipediaTitlePlugin } from "./wikipediaTitle";
import { wiktionaryHeadwordPlugin } from "./wiktionaryHeadword";

export function createPluginRegistry(): PluginRegistry {
  return {
    search: [exaWebSearchPlugin()],
    suggest: [wikipediaTitlePlugin(), wiktionaryHeadwordPlugin()],
    filters: [uniqueUrlFilter(), limitFilter()]
  };
}
