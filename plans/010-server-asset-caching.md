# Plan 010: Let browsers cache server-mode bundles — ETag revalidation for /client.js and worker scripts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/server.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/15

## Why this matters

In server mode (`bun src/server.ts`, `NODE_ENV=production`), the server
correctly caches the built bundles in memory (`isProduction && cachedScript`)
but tells every browser `cache-control: no-store` — so each page load
re-downloads `/client.js` plus both voice/AI worker scripts in full. Scope
honestly: the production deployment is Cloudflare Pages (static, has its own
caching), so this only affects self-hosted/server-mode use — the README's
primary local workflow. ETag-based revalidation keeps dev behavior fresh AND
gives warm loads 304s.

## Current state

- `src/server.ts:17` — `const isProduction = process.env.NODE_ENV === "production";`
- `src/server.ts:26-51` — `browserBundle()` rebuilds via `Bun.build` per
  request in dev; returns the in-memory `cachedScript` in production.
- Three routes with identical shape (`/client.js` at ~86,
  `/browser-moonshine-worker.js` at ~101, `/browser-gemma-worker.js` at
  ~116):

```ts
.get("/client.js", async ({ set }) => {
  try {
    return new Response(await clientScript(), {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) { set.status = 500; return { error: ... }; }
})
```

- `/gemma-4-e2b.js` (~131) already does `public, max-age=31536000, immutable`
  — leave it.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0              |
| Cold fetch | `curl -sI localhost:3000/client.js` | 200 + ETag header |
| Warm fetch | `curl -sI -H 'If-None-Match: <etag>' localhost:3000/client.js` | 304 |

## Scope

**In scope**: `src/server.ts` only (the three bundle routes + a small etag
helper).

**Out of scope**:
- `/gemma-4-e2b.js` (already immutable), HTML routes (must stay fresh),
  API routes.
- Content-hashed URLs (`/client-abc123.js`) — bigger change touching
  `render.ts`; ETag gets ~the same win without it. Deliberately rejected
  here.
- gzip/brotli middleware — separate concern; note as follow-up if desired.

## Git workflow

- Branch: `advisor/010-bundle-etag`; single commit is fine; do NOT push or
  open a PR unless the operator instructed it.

## Steps

### Step 1: Add an ETag helper and use it in the three routes

Compute a weak ETag from the script content each time the script string is
obtained (hash with `Bun.hash(script)` → `W/"<hex>"`; in production this is
effectively computed once since the string is cached — memoize alongside
`cachedClientScript` if you prefer). Route logic:

- read `if-none-match` from the request headers; if it matches, return 304
  with no body (keep `etag` header on the 304);
- otherwise 200 with headers: `etag`, and `cache-control: no-cache` (forces
  revalidation every load — correct for BOTH dev and production; dev
  rebuilds change the hash, so edits still show up on reload).

Apply identically to all three routes (factor a small `scriptResponse()`
helper to avoid triplicating — the three routes differ only in the script
getter and error message).

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 2: Behavior check, dev mode

`bun run dev`; then:
- `curl -sI localhost:3000/client.js` → 200, `etag` present,
  `cache-control: no-cache`;
- repeat with `If-None-Match` set to that etag → 304;
- touch `src/client.ts` (add a comment), reload page → change visible
  (rebuild-on-request still works; etag changed).
  Revert the comment.

**Verify**: the three checks above; app loads normally in the browser.

### Step 3: Behavior check, production mode

`NODE_ENV=production bun src/server.ts` (use a spare port via `PORT` if
:3000 is busy): cold fetch 200 + etag; warm conditional fetch 304; two
consecutive cold fetches return identical etags (memoized script).

**Verify**: the checks above.

## Test plan

The curl checks in Steps 2-3 are the acceptance tests. `bun run test`
stays green (no shared code touched).

## Done criteria

- [ ] All three bundle routes: 200+ETag cold, 304 on matching If-None-Match, `no-cache` (not `no-store`)
- [ ] Dev edit-reload cycle still picks up client changes
- [ ] `/gemma-4-e2b.js`, HTML, and API routes unchanged (`git diff` confined to the three routes + helper)
- [ ] `bunx tsc --noEmit` and `bun run test` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Elysia interferes with returning a bare 304 Response (framework wraps or
  rewrites it) — report the observed behavior; do not fight the framework
  with hacks.
- `Bun.hash` unavailable in the installed Bun — use `crypto` instead; if
  neither works cleanly, STOP.

## Maintenance notes

- If bundles ever move to content-hashed URLs (immutable caching), this
  ETag layer becomes redundant — remove it then.
- Follow-up deliberately deferred: response compression for HTML/JS in
  server mode.
