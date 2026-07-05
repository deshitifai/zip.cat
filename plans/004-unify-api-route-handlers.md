# Plan 004: Unify API route handlers shared by the Elysia server and the Cloudflare Pages Function

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/server.ts functions/api/ src/runtimeEnv.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes;
> compare excerpts against the working tree. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-test-baseline-and-ci.md
- **Category**: tech-debt
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/10

## Why this matters

Ten `/api/*` endpoints are wired twice: once in `src/server.ts` (Elysia, for
local/server mode) and once in `functions/api/[[path]].ts` (Cloudflare Pages
Function, for production static mode). The business logic is already shared
(`search()`, `suggest()`, `answer()`, `runSlashCommand()`, …), but request
decoding, route matching, error handling, and logging are duplicated with
already-divergent behavior: the server logs context via `logRouteError` on
only *some* routes, while the Pages Function logs all routes with a different
shape. Every new endpoint must be added twice or production silently 404s.
One handler registry consumed by both transports removes the divergence.

## Current state

- `functions/api/[[path]].ts` (131 lines) — full route inventory it serves:
  `GET/POST search`, `GET/POST suggest`, `GET effort`, `GET slash/commands`,
  `GET typed-outputs`, `POST ai`, `POST shape-search`, `POST slash`,
  `POST inline-inference`. Pattern per route:

```ts
if (request.method === "POST" && path === "ai") {
  return json(await answer(await readJson(request)));
}
// ...
} catch (error) {
  routeError(route, request, error);
  return json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 502 });
}
```

  It calls `configureRuntimeEnv(env)` first (Pages env → `src/runtimeEnv.ts`)
  and answers everything under `/api/` via the catch-all `[[path]]`.

- `src/server.ts` — same ten routes as Elysia handlers (lines ~158-381; route
  list: `.get("/api/search")`, `.get("/api/suggest")`, `.get("/api/effort")`,
  `.get("/api/slash/commands")`, `.get("/api/typed-outputs")`, five `.post()`
  routes for search/suggest/ai/shape-search/slash/inline-inference between
  lines 213-381) plus **server-only** routes that must NOT move: `/client.js`,
  `/browser-moonshine-worker.js`, `/browser-gemma-worker.js`,
  `/gemma-4-e2b.js`, `/docs`, `/` (HTML), `/api/voice/transcribe`,
  `.ws("/api/voice/stream")`. Elysia POST routes use `t.Object(...)` schema
  validation; the Pages Function has no equivalent validation.

- Error logging on the server (`logRouteError`, server.ts ~75-83) includes
  route-specific context on `/api/search` and `/api/shape-search` but not on
  `/api/suggest` or `/api/ai`.

- `src/runtimeEnv.ts` — `envVar()` reads process.env or the configured Pages
  env; services below the route layer are transport-agnostic already.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0              |
| Server smoke | `bun run dev` then `curl -s "http://localhost:3000/api/effort" \| head -c 200` | JSON with search+ai levels |
| Pages build | `bun run build:pages` | exit 0, artifacts in dist/static |

## Scope

**In scope**:
- `src/api/handlers.ts` (create — transport-neutral handler registry)
- `src/server.ts` (consume registry for the ten shared routes)
- `functions/api/[[path]].ts` (consume registry)

**Out of scope**:
- Server-only routes (bundles, HTML, docs, voice HTTP + websocket) — leave
  exactly as they are.
- Adding validation the Pages Function never had is IN scope only insofar as
  the shared handler can carry a lightweight parse/validate step; do NOT
  redesign the Elysia `t.Object` schemas.
- Response shapes — byte-for-byte identical JSON before/after.

## Git workflow

- Branch: `advisor/004-shared-api-handlers`
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the registry

`src/api/handlers.ts` exporting something like:

```ts
export type ApiHandler = {
  method: "GET" | "POST";
  path: string; // e.g. "search", "slash/commands" (no /api/ prefix)
  handle: (input: { query: URLSearchParams; body?: unknown }) => Promise<unknown>;
  logContext?: (input: ...) => Record<string, unknown>; // for error logs
};
export const apiHandlers: ApiHandler[];
export function findApiHandler(method: string, path: string): ApiHandler | undefined;
```

Port the ten shared routes' bodies from `functions/api/[[path]].ts` (they are
the lower-common-denominator implementation). GET search/suggest build their
request objects from `query` exactly as the Pages Function does today.

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 2: Switch the Pages Function to the registry

`functions/api/[[path]].ts` becomes: `configureRuntimeEnv(env)` → parse
method/path → `findApiHandler` → run → wrap result in the existing `json()`
helper; keep the 404 and the catch → 502 with `routeError` logging, now
enriched with `handler.logContext` when present.

**Verify**: `bun run build:pages` → exit 0. `bunx tsc --noEmit` → exit 0.

### Step 3: Switch `src/server.ts`

Replace the bodies of the ten shared routes with calls into the same
handlers. Keep the Elysia `t.Object` schemas on the POST routes (they gate
malformed bodies before the handler runs — that is fine and stays). Keep
`logRouteError` and extend it to use `handler.logContext` so ALL shared
routes now log context on failure (this closes the suggest/ai logging gap).

**Verify**: `bun run dev`; then:
- `curl -s "http://localhost:3000/api/effort"` → same JSON shape as before
- `curl -s "http://localhost:3000/api/slash/commands" | head -c 120` → command list
- `curl -s -X POST http://localhost:3000/api/slash -H 'content-type: application/json' -d '{"query":"/calc 2+2","args":{}}'` → result 4 payload
- `bun run test` → exit 0

### Step 4: Route-inventory guard

Add `src/api/handlers.test.ts`: assert the registry contains exactly the ten
expected `(method, path)` pairs, and that `findApiHandler` resolves
`"slash/commands"` and rejects unknown paths. This is the tripwire that a
future endpoint added to one transport but not the registry fails loudly.

**Verify**: `bun test src/api/handlers.test.ts` → pass.

## Test plan

- New: `src/api/handlers.test.ts` (Step 4).
- Existing: `bun run test`; manual curl checks in Step 3 double as the
  contract check (compare against the same curls run BEFORE the change —
  capture them first).

## Done criteria

- [ ] `grep -c "path ===" functions/api/[[path]].ts` → 0 (no inline route table left)
- [ ] The ten shared endpoints return identical JSON to pre-change captures (search GET may vary by live provider — compare shape, not content)
- [ ] All shared routes log context on error in both transports
- [ ] `bunx tsc --noEmit`, `bun run test`, `bun run build:pages` all exit 0
- [ ] Server-only routes untouched (`git diff src/server.ts` shows changes only inside the ten shared route bodies)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A shared route's server and Pages implementations turn out to differ in
  *behavior* (not just plumbing) — e.g. different defaults or validation
  semantics that clients may depend on. Report the divergence; do not pick a
  winner silently.
- Elysia's handler signature can't cleanly delegate without changing response
  shapes.
- `bun run build:pages` starts pulling server-only modules (Bun APIs) into
  the Pages bundle via the new import graph.

## Maintenance notes

- New API endpoints: add to `src/api/handlers.ts` + the inventory test;
  transports pick them up automatically (server may add a `t.Object` schema).
- Plan 008 (security hardening) adds headers/limits at the transport layer —
  it composes with this registry; land this first if possible.
- Reviewer: diff the curl captures, and check the Pages Function still calls
  `configureRuntimeEnv(env)` before any handler.
