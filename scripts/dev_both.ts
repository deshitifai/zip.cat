import { existsSync } from "node:fs";
import { stat, watch } from "node:fs/promises";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dir, "..");
const staticDir = join(rootDir, "dist", "static");
const appPort = Number(process.env.ZIP_CAT_APP_PORT ?? process.env.PORT ?? 3000);
const staticPort = Number(process.env.ZIP_CAT_STATIC_PORT ?? 3001);
const watchPaths = [
  "src",
  "vendor/gemma-4-e2b.js",
  "scripts/build_static.ts",
  "package.json",
  "bun.lock",
  "tsconfig.json"
];

if (appPort === staticPort) {
  throw new Error(`Dynamic and static dev ports must differ. Both resolved to ${appPort}.`);
}

function log(scope: string, message: string) {
  console.log(`[${scope}] ${message}`);
}

async function runStaticBuild(reason: string) {
  log("static", `rebuilding (${reason})`);
  const process = Bun.spawn({
    cmd: ["bun", "scripts/build_static.ts"],
    cwd: rootDir,
    env: processEnv(),
    stdout: "inherit",
    stderr: "inherit"
  });
  const exitCode = await process.exited;
  if (exitCode === 0) {
    log("static", "rebuild complete");
  } else {
    log("static", `rebuild failed with exit code ${exitCode}`);
  }
}

function processEnv() {
  return {
    ...process.env
  };
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let rebuildRunning = false;
let rebuildQueued = false;

function scheduleStaticBuild(reason: string) {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }
  rebuildTimer = setTimeout(() => {
    void rebuildStatic(reason);
  }, 80);
}

async function rebuildStatic(reason: string) {
  if (rebuildRunning) {
    rebuildQueued = true;
    return;
  }

  rebuildRunning = true;
  try {
    await runStaticBuild(reason);
  } finally {
    rebuildRunning = false;
  }

  if (rebuildQueued) {
    rebuildQueued = false;
    await rebuildStatic("queued changes");
  }
}

async function watchForStaticChanges(path: string) {
  const absolutePath = join(rootDir, path);
  if (!existsSync(absolutePath)) {
    return;
  }

  const info = await stat(absolutePath);
  const watcher = watch(absolutePath, {
    recursive: info.isDirectory()
  });

  for await (const event of watcher) {
    const filename = event.filename ? String(event.filename) : path;
    if (
      filename.includes("dist/") ||
      filename.includes("node_modules/") ||
      filename.endsWith(".map")
    ) {
      continue;
    }
    scheduleStaticBuild(`${path} changed`);
  }
}

function contentTypeForPath(pathname: string) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function startStaticServer() {
  return Bun.serve({
    port: staticPort,
    async fetch(request) {
      const url = new URL(request.url);
      const requestedPath = decodeURIComponent(url.pathname);
      const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
      if (safePath.includes("..")) {
        return new Response("Bad request", { status: 400 });
      }

      const filePath = join(staticDir, safePath);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "cache-control": "no-store",
            "content-type": contentTypeForPath(safePath)
          }
        });
      }

      const index = Bun.file(join(staticDir, "index.html"));
      return new Response(index, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8"
        }
      });
    }
  });
}

await rebuildStatic("startup");

const appProcess = Bun.spawn({
  cmd: ["bun", "--watch", "src/server.ts"],
  cwd: rootDir,
  env: {
    ...processEnv(),
    PORT: String(appPort)
  },
  stdout: "inherit",
  stderr: "inherit"
});

const staticServer = startStaticServer();
watchPaths.forEach((path) => {
  void watchForStaticChanges(path).catch((error) => {
    log("watch", `${path}: ${error instanceof Error ? error.message : String(error)}`);
  });
});

log("dev", `dynamic app: http://localhost:${appPort}`);
log("dev", `static site: http://localhost:${staticPort}`);
log("dev", "watching source files for static rebuilds");

function shutdown() {
  appProcess.kill();
  staticServer.stop(true);
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

const appExitCode = await appProcess.exited;
staticServer.stop(true);
process.exit(appExitCode);
