import { Elysia, t } from "elysia";
import { aiEffortConfig, answer, resolveInlineInference } from "./ai";
import { loadEnv } from "./env";
import { renderPage } from "./render";
import { search } from "./search";
import { suggest } from "./suggest";
import { createExaWebSearchGenerators } from "./generators/exa";
import { createPluginRegistry } from "./plugins/registry";
import { runSlashCommand, slashCommandDescriptors } from "./slash/registry";

loadEnv();

const registry = createPluginRegistry();
const isProduction = process.env.NODE_ENV === "production";
let cachedClientScript: string | undefined;

async function clientScript() {
  if (isProduction && cachedClientScript) {
    return cachedClientScript;
  }

  const bundle = await Bun.build({
    entrypoints: ["src/client.ts"],
    minify: true,
    target: "browser"
  });

  if (!bundle.success) {
    throw new Error("Failed to build browser client.");
  }

  const script = await bundle.outputs[0].text();
  if (isProduction) {
    cachedClientScript = script;
  }

  return script;
}

function html(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

const app = new Elysia()
  .get("/client.js", async ({ set }) => {
    try {
      return new Response(await clientScript(), {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Failed to build browser client."
      };
    }
  })
  .get("/", async ({ query }) => {
    const q = typeof query.q === "string" ? query.q : "";
    if (!q.trim()) {
      return html(renderPage({ query: q }));
    }

    try {
      const response = await search(registry, { query: q });
      return html(renderPage({ query: q, response }));
    } catch (error) {
      return html(renderPage({
        query: q,
        error: error instanceof Error ? error.message : "Search failed."
      }));
    }
  })
  .get("/api/search", async ({ query, set }) => {
    try {
      return await search(registry, {
        query: typeof query.q === "string" ? query.q : "",
        limit: typeof query.limit === "string" ? Number(query.limit) : undefined,
        trigger: {
          type: "keyboard",
          key: "Enter",
          source: "search-box"
        }
      });
    } catch (error) {
      set.status = 502;
      return {
        error: error instanceof Error ? error.message : "Search failed."
      };
    }
  })
  .get("/api/suggest", async ({ query, set }) => {
    try {
      return await suggest(registry, {
        query: typeof query.q === "string" ? query.q : "",
        trigger: {
          type: "input-change",
          source: "search-box"
        }
      });
    } catch (error) {
      set.status = 502;
      return {
        error: error instanceof Error ? error.message : "Suggestion failed."
      };
    }
  })
  .get("/api/effort", () => ({
    search: {
      provider: "exa",
      api: "Exa search",
      levels: Object.fromEntries(createExaWebSearchGenerators().map((generator) => [
        generator.effort,
        generator.describe()
      ]))
    },
    ai: aiEffortConfig()
  }))
  .get("/api/slash/commands", () => ({
    commands: slashCommandDescriptors()
  }))
  .post(
    "/api/suggest",
    async ({ body, set }) => {
      try {
        return await suggest(registry, body);
      } catch (error) {
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "Suggestion failed."
        };
      }
    },
    {
      body: t.Object({
        query: t.String(),
        trigger: t.Optional(t.Object({
          type: t.Literal("input-change"),
          source: t.Literal("search-box")
        }))
      })
    }
  )
  .post(
    "/api/search",
    async ({ body, set }) => {
      try {
        return await search(registry, body);
      } catch (error) {
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "Search failed."
        };
      }
    },
    {
      body: t.Object({
        query: t.String(),
        limit: t.Optional(t.Number()),
        effort: t.Optional(t.Number()),
        trigger: t.Optional(t.Object({
          type: t.Literal("keyboard"),
          key: t.Literal("Enter"),
          source: t.Literal("search-box")
        }))
      })
    }
  )
  .post(
    "/api/ai",
    async ({ body, set }) => {
      try {
        return await answer(body);
      } catch (error) {
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "AI request failed."
        };
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
        effort: t.Optional(t.Number()),
        trigger: t.Optional(t.Object({
          type: t.Literal("keyboard"),
          key: t.Literal("Enter"),
          source: t.Literal("search-box")
        }))
      })
    }
  )
  .post(
    "/api/slash",
    async ({ body, set }) => {
      try {
        return await runSlashCommand(body);
      } catch (error) {
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "Slash command failed."
        };
      }
    },
    {
      body: t.Object({
        query: t.String(),
        command: t.Optional(t.String()),
        args: t.Optional(t.Record(t.String(), t.Unknown())),
        trigger: t.Optional(t.Object({
          type: t.Literal("keyboard"),
          key: t.Literal("Enter"),
          source: t.Literal("search-box")
        }))
      })
    }
  )
  .post(
    "/api/inline-inference",
    async ({ body, set }) => {
      try {
        return await resolveInlineInference(body);
      } catch (error) {
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "Inline inference failed."
        };
      }
    },
    {
      body: t.Object({
        query: t.String(),
        spans: t.Array(t.String()),
        effort: t.Optional(t.Number())
      })
    }
  )
  .listen(Number(process.env.PORT ?? 3000));

console.log(`zip.cat listening on http://localhost:${app.server?.port ?? 3000}`);
