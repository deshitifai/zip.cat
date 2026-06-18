import { Elysia, t } from "elysia";
import { aiEffortConfig, answer } from "./ai";
import { loadEnv } from "./env";
import { renderPage } from "./render";
import { search } from "./search";
import { suggest } from "./suggest";
import { createExaWebSearchGenerators } from "./generators/exa";
import { createPluginRegistry } from "./plugins/registry";

loadEnv();

const registry = createPluginRegistry();
const clientBundle = await Bun.build({
  entrypoints: ["src/client.ts"],
  minify: true,
  target: "browser"
});

if (!clientBundle.success) {
  throw new Error("Failed to build browser client.");
}

const clientScript = await clientBundle.outputs[0].text();

function html(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

const app = new Elysia()
  .get("/client.js", () => new Response(clientScript, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store"
    }
  }))
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
  .listen(Number(process.env.PORT ?? 3000));

console.log(`zip.cat listening on http://localhost:${app.server?.port ?? 3000}`);
