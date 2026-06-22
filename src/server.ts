import { Elysia, t } from "elysia";
import { aiEffortConfig, answer, resolveInlineInference, shapeSearchResults } from "./ai";
import { loadEnv } from "./env";
import { renderPage } from "./render";
import { renderDocsPage } from "./docs";
import { search } from "./search";
import { suggest } from "./suggest";
import { createWebSearchGenerators } from "./generators/webSearch";
import { createPluginRegistry } from "./plugins/registry";
import { runSlashCommand, slashCommandDescriptors } from "./slash/registry";
import { typedOutputDescriptors, typedOutputRefs } from "./typedOutputs";
import { createMoonshineStreamingSession, transcribeMoonshineWav, type MoonshineStreamingSession } from "./voice";

loadEnv();

const registry = createPluginRegistry();
const isProduction = process.env.NODE_ENV === "production";
let cachedClientScript: string | undefined;
let cachedBrowserMoonshineWorkerScript: string | undefined;
let cachedBrowserGemmaWorkerScript: string | undefined;

type VoiceSocketData = {
  voiceStream?: Promise<MoonshineStreamingSession>;
};

async function browserBundle(entrypoint: string, cachedScript?: string) {
  if (isProduction && cachedScript) {
    return cachedScript;
  }

  const bundle = await Bun.build({
    entrypoints: [entrypoint],
    minify: true,
    target: "browser"
  });

  if (!bundle.success) {
    throw new Error("Failed to build browser client.");
  }

  const script = await bundle.outputs[0].text();
  return script;
}

async function clientScript() {
  const script = await browserBundle("src/client.ts", cachedClientScript);
  if (isProduction) {
    cachedClientScript = script;
  }
  return script;
}

async function browserMoonshineWorkerScript() {
  const script = await browserBundle("src/browserMoonshineWorker.ts", cachedBrowserMoonshineWorkerScript);
  if (isProduction) {
    cachedBrowserMoonshineWorkerScript = script;
  }
  return script;
}

async function browserGemmaWorkerScript() {
  const script = await browserBundle("src/browserGemmaWorker.ts", cachedBrowserGemmaWorkerScript);
  if (isProduction) {
    cachedBrowserGemmaWorkerScript = script;
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

function logRouteError(route: string, context: Record<string, unknown>, error: unknown) {
  console.error(`[server] ${route} failed`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
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
  .get("/browser-moonshine-worker.js", async ({ set }) => {
    try {
      return new Response(await browserMoonshineWorkerScript(), {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Failed to build browser Moonshine worker."
      };
    }
  })
  .get("/browser-gemma-worker.js", async ({ set }) => {
    try {
      return new Response(await browserGemmaWorkerScript(), {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Failed to build browser Gemma worker."
      };
    }
  })
  .get("/gemma-4-e2b.js", () => new Response(Bun.file("vendor/gemma-4-e2b.js"), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  }))
  .get("/docs", () => html(renderDocsPage()))
  .get("/", async ({ query }) => {
    const q = typeof query.q === "string" ? query.q : "";
    if (!q.trim()) {
      return html(renderPage({ query: q }));
    }

    if (typedOutputRefs(q).length > 0) {
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
      logRouteError("GET /api/search", {
        query: typeof query.q === "string" ? query.q : "",
        limit: typeof query.limit === "string" ? Number(query.limit) : undefined
      }, error);
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
      provider: "web-search",
      api: "Web search",
      levels: Object.fromEntries(createWebSearchGenerators().map((generator) => [
        generator.effort,
        generator.describe()
      ]))
    },
    ai: aiEffortConfig()
  }))
  .get("/api/slash/commands", () => ({
    commands: slashCommandDescriptors()
  }))
  .get("/api/typed-outputs", () => ({
    schemas: typedOutputDescriptors()
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
        logRouteError("POST /api/search", {
          query: body.query,
          limit: body.limit,
          effort: body.effort,
          trigger: body.trigger
        }, error);
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
        messages: t.Optional(t.Array(t.Object({
          role: t.Union([
            t.Literal("system"),
            t.Literal("user"),
            t.Literal("assistant")
          ]),
          content: t.String()
        }))),
        effort: t.Optional(t.Number()),
        outputSchemaId: t.Optional(t.String()),
        trigger: t.Optional(t.Object({
          type: t.Literal("keyboard"),
          key: t.Literal("Enter"),
          source: t.Literal("search-box")
        }))
      })
    }
  )
  .post(
    "/api/shape-search",
    async ({ body, set }) => {
      try {
        return await shapeSearchResults(body);
      } catch (error) {
        logRouteError("POST /api/shape-search", {
          prompt: body.prompt,
          searchQuery: body.searchQuery,
          effort: body.effort,
          outputSchemaId: body.outputSchemaId,
          resultCount: body.results.length
        }, error);
        set.status = 502;
        return {
          error: error instanceof Error ? error.message : "Search shaping failed."
        };
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
        searchQuery: t.String(),
        results: t.Array(t.Object({
          url: t.String(),
          title: t.Optional(t.String()),
          score: t.Optional(t.Number()),
          provider: t.String()
        })),
        effort: t.Optional(t.Number()),
        outputSchemaId: t.String(),
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
  .post("/api/voice/transcribe", async ({ request, query, set }) => {
    try {
      const language = typeof query.language === "string" ? query.language : "en";
      return await transcribeMoonshineWav(await request.arrayBuffer(), language);
    } catch (error) {
      set.status = 502;
      return {
        error: error instanceof Error ? error.message : "Voice transcription failed."
      };
    }
  })
  .ws("/api/voice/stream", {
    open(ws) {
      const data = ws.raw.data as VoiceSocketData;
      data.voiceStream = createMoonshineStreamingSession({
        language: typeof ws.data.query.language === "string" ? ws.data.query.language : "en",
        onMessage: (message) => {
          ws.send(message);
        },
        onError: (message) => {
          ws.send(JSON.stringify({
            type: "error",
            error: message
          }));
        }
      });
    },
    async message(ws, message) {
      const sessionPromise = (ws.raw.data as VoiceSocketData).voiceStream;
      if (sessionPromise) {
        const session = await sessionPromise;
        await session.send(typeof message === "string" ? message : JSON.stringify(message));
      }
    },
    close(ws) {
      const data = ws.raw.data as VoiceSocketData;
      data.voiceStream?.then((session) => session.close()).catch(() => undefined);
      data.voiceStream = undefined;
    }
  })
  .listen(Number(process.env.PORT ?? 3000));

console.log(`zip.cat listening on http://localhost:${app.server?.port ?? 3000}`);
