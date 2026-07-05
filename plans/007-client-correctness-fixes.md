# Plan 007: Small correctness fixes — silent startup-config failures, shape-search response handling, O(n²) result filter, password entropy label

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/client.ts src/search.ts src/slash/password.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes on
> branch `feature/slash-commands-i18n-prompt-modes`. `src/client.ts` line
> numbers WILL have drifted — locate excerpts by content, not line number.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-test-baseline-and-ci.md
- **Category**: bug
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/13

## Why this matters

Four small, independently-verified defects. (1) The three startup fetches
that load effort config, slash-command descriptors, and typed-output schemas
all end in `.catch(() => undefined)` — if one fails, slash commands or typed
outputs silently vanish with nothing in the console to debug. (2) The
typed-search flow parses `shapeResponse.json()` before checking
`shapeResponse.ok`, so a non-JSON error response (e.g. an HTML 502 from a
proxy) throws a parse error that masks the real failure. (3)
`src/search.ts` rebuilds per-plugin result sets with
`results.includes(result)` inside a map — O(n²) on every search. (4)
`/password` in words mode reports an entropy figure whose
`Math.log2(args.length)` capital-position term overstates strength (the
generated password is fine; the *label* is wrong).

## Current state

- `src/client.ts` — three startup fetches (locate by searching
  `catch(() => undefined)`; currently ~lines 3744-3782), pattern:

```ts
void fetch("/api/slash/commands")
  .then(async (response) => {
    if (!response.ok) { return; }
    const payload = await response.json() as { commands?: SlashCommandDescriptor[] };
    slashCommands = payload.commands ?? [];
    // ...updates controls/highlights...
  })
  .catch(() => undefined);
```

  Same shape for `/api/effort` and `/api/typed-outputs`. Note the
  `if (!response.ok) return;` branches are ALSO silent.

- `src/client.ts` typed-search flow (locate by `"/api/shape-search"`):

```ts
const shapeResponse = await fetch("/api/shape-search", { ... });
const shapePayload = await shapeResponse.json() as SearchShapeResponse;
// ...debug plumbing...
if (!shapeResponse.ok) {
  setRunStatus(results, "ai", "error", ...);
  results.innerHTML = `<div class="status">${escapeHtml(shapePayload.error ?? "Search shaping failed.")}</div>`;
```

- `src/search.ts:60-67`:

```ts
return {
  query: context.request.query,
  results,
  resultSets: resultSets.map((resultSet) => ({
    ...resultSet,
    results: resultSet.results.filter((result) => results.includes(result))
  })),
  elapsedMs: Math.round(performance.now() - startedAt)
};
```

  `results` at this point is the filtered flat list; identity (`includes`)
  is the intended semantics (same object references) — keep identity, use a
  `Set`.

- `src/slash/password.ts` words-mode entropy (~lines 155-181): the reported
  bits are `args.length * log2(WORDLIST.length) + log2(100) +
  log2(args.length)`. Read the generation code first: entropy terms must
  mirror exactly the random choices made (`randomBelow` calls) — if the
  capital position IS chosen uniformly at random among `args.length` words,
  the current formula is right and only needs a comment; if the position is
  deterministic, drop the `log2(args.length)` term.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0              |
| Dev smoke | `bun run dev`       | see per-step checks |

## Scope

**In scope**:
- `src/client.ts` (the two locations above ONLY)
- `src/search.ts` (the resultSets mapping ONLY)
- `src/slash/password.ts` (entropy calculation/comment ONLY)
- `src/search.test.ts` (create)

**Out of scope**:
- Any other `.catch` in client.ts (there are many; only the three startup
  config fetches).
- UI redesign of error surfaces — a `console.warn` is the deliverable, not
  a toast system.
- The password generator's random source (`randomBelow`) — crypto-grade
  already; do not touch generation.

## Git workflow

- Branch: `advisor/007-small-fixes`; one commit per numbered fix; do NOT
  push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make startup-config failures visible

For each of the three fetches: in the `!response.ok` branch and in the
`.catch`, emit `console.warn("[zip.cat] failed to load <what>", detail)`
(match the existing console message style — server code uses
`console.error("[search] generator failed", {...})`). Behavior otherwise
unchanged (features still degrade gracefully).

**Verify**: `bun run dev`, open :3000 with devtools; temporarily block
`/api/typed-outputs` via devtools request blocking, reload → exactly one
warn appears naming typed outputs; unblock, reload → no warns.

### Step 2: Check `shapeResponse.ok` before parsing, and parse defensively

Reorder: check `shapeResponse.ok` first; on failure, attempt
`await shapeResponse.json()` inside try/catch to extract `error`, fall back
to `"Search shaping failed."` — keeping the existing error rendering and
debug fields intact (debug's `responseBody` may be `undefined` on non-JSON
failures; that's acceptable).

**Verify**: `bunx tsc --noEmit` → exit 0; typed search still works in dev
(`ice cream fairfax #Restaurant` renders a card in server mode — needs
keys; if no keys available locally, verify the search+shape path compiles
and the error branch renders by blocking `/api/shape-search` in devtools →
status shows "Search shaping failed." instead of an unhandled rejection).

### Step 3: Set-based resultSet reconstruction

```ts
const kept = new Set(results);
// ...
results: resultSet.results.filter((result) => kept.has(result))
```

Build the Set once, outside the `.map`.

**Verify**: new `src/search.test.ts`: construct a fake registry with two
inline plugins returning overlapping result objects and a filter that drops
one; assert each returned resultSet contains exactly its own kept objects
(identity), and the dropped object is absent. `bun test src/search.test.ts`
→ pass.

### Step 4: Password entropy label

Read the words-mode generation path. Apply the rule from "Current state":
formula mirrors the actual random choices; add a one-line comment deriving
each term. If the formula changes, update any eval in
`scripts/test_quick_utils.ts` that asserts on entropy.

**Verify**: `bun run test` → exit 0 (quick-utils password checks pass).

## Test plan

- New: `src/search.test.ts` (Step 3).
- Manual: the devtools request-blocking checks in Steps 1-2.
- Existing: `bun run test` green after every step.

## Done criteria

- [ ] `grep -c "catch(() => undefined)" src/client.ts` → 0
- [ ] Blocking any of the three config endpoints produces a console.warn naming it
- [ ] shape-search failure path renders its status without a JSON parse crash on non-JSON responses
- [ ] `src/search.ts` uses a Set (no `results.includes(` remains in the file)
- [ ] Password entropy formula matches generation, with derivation comment
- [ ] `bunx tsc --noEmit` and `bun run test` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The password generation turns out to randomize MORE than (word choice ×
  args.length) + 2 digits + capital position — the formula question is then
  bigger than a label fix; report the actual choice inventory instead.
- `src/search.ts` result identity turns out NOT to be reference-stable
  across filters (a filter clones objects) — the Set fix would then change
  behavior; report.
- Any fix requires touching files outside the scope list.

## Maintenance notes

- Reviewers: check no OTHER `.catch(() => undefined)` was "helpfully"
  changed — the scope is the three startup fetches.
- If a user-visible degraded-mode banner is ever wanted, Step 1's warn
  sites are where it hooks in.
