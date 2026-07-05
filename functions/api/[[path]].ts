import { aiEffortConfig, answer, resolveInlineInference, shapeSearchResults } from "../../src/ai";
import { configureRuntimeEnv, type RuntimeEnv } from "../../src/runtimeEnv";
import { search } from "../../src/search";
import { suggest } from "../../src/suggest";
import { createWebSearchGenerators } from "../../src/generators/webSearch";
import { createPluginRegistry } from "../../src/plugins/registry";
import { runSlashCommand, slashCommandDescriptors } from "../../src/slash/registry";
import { typedOutputDescriptors } from "../../src/typedOutputs";

type PagesContext = {
  request: Request;
  env: RuntimeEnv;
};

const registry = createPluginRegistry();

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init?.headers
    }
  });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function routeError(route: string, request: Request, error: unknown) {
  console.error(`[pages] ${route} failed`, {
    method: request.method,
    path: new URL(request.url).pathname,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

export const onRequest = async ({ request, env }: PagesContext) => {
  configureRuntimeEnv(env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const route = `${request.method} /api/${path}`;

  try {
    if (request.method === "GET" && path === "search") {
      return json(await search(registry, {
        query: url.searchParams.get("q") ?? "",
        limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
        trigger: {
          type: "keyboard",
          key: "Enter",
          source: "search-box"
        }
      }));
    }

    if (request.method === "POST" && path === "search") {
      return json(await search(registry, await readJson(request)));
    }

    if (request.method === "GET" && path === "suggest") {
      return json(await suggest(registry, {
        query: url.searchParams.get("q") ?? "",
        trigger: {
          type: "input-change",
          source: "search-box"
        }
      }));
    }

    if (request.method === "POST" && path === "suggest") {
      return json(await suggest(registry, await readJson(request)));
    }

    if (request.method === "GET" && path === "effort") {
      return json({
        search: {
          provider: "web-search",
          api: "Web search",
          levels: Object.fromEntries(createWebSearchGenerators().map((generator) => [
            generator.effort,
            generator.describe()
          ]))
        },
        ai: aiEffortConfig()
      });
    }

    if (request.method === "GET" && path === "slash/commands") {
      return json({
        commands: slashCommandDescriptors()
      });
    }

    if (request.method === "GET" && path === "typed-outputs") {
      return json({
        schemas: typedOutputDescriptors()
      });
    }

    if (request.method === "POST" && path === "ai") {
      return json(await answer(await readJson(request)));
    }

    if (request.method === "POST" && path === "shape-search") {
      return json(await shapeSearchResults(await readJson(request)));
    }

    if (request.method === "POST" && path === "slash") {
      return json(await runSlashCommand(await readJson(request)));
    }

    if (request.method === "POST" && path === "inline-inference") {
      return json(await resolveInlineInference(await readJson(request)));
    }

    return json({ error: "Not found." }, { status: 404 });
  } catch (error) {
    routeError(route, request, error);
    return json({
      error: error instanceof Error ? error.message : "Request failed."
    }, { status: 502 });
  }
};
