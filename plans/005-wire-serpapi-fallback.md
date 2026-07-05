# Plan 005: Wire the dormant SerpAPI generator in as a real fallback (or make the docs stop advertising it)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/generators/ src/search.ts README.md`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (001 recommended first for the test gate)
- **Category**: bug / tech-debt
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/11

## Why this matters

`src/generators/serpApi.ts` is a complete, working SerpAPI Google Search
generator (effort 5, enabled when `SERP_API_KEY` is set) that is **never
registered**: `createWebSearchGenerators()` returns only the five Exa
generators. Meanwhile `src/search.ts:39` tells users `"Set EXA_API_KEY or
SERP_API_KEY."` and README lists `SERP_API_KEY` under Keys — so a user who
sets only `SERP_API_KEY` is told they've configured search, yet every query
fails. Wire it in as a genuine fallback and make generator selection respect
`enabled()`.

## Current state

- `src/generators/webSearch.ts` (entire file):

```ts
import type { EffortLevel } from "../models";
import {
  ExaAutoWebSearchGenerator, ExaDeepWebSearchGenerator, ExaDeepLiteWebSearchGenerator,
  ExaFastWebSearchGenerator, ExaInstantWebSearchGenerator
} from "./exa";

export function createWebSearchGenerators() {
  return [
    new ExaInstantWebSearchGenerator(),
    new ExaFastWebSearchGenerator(),
    new ExaAutoWebSearchGenerator(),
    new ExaDeepLiteWebSearchGenerator(),
    new ExaDeepWebSearchGenerator()
  ];
}

export function webSearchGeneratorForEffort(effort: EffortLevel) {
  return createWebSearchGenerators().find((generator) => generator.effort === effort)
    ?? new ExaAutoWebSearchGenerator();
}
```

  Note `webSearchGeneratorForEffort` ignores `enabled()` entirely — with no
  EXA key it still returns a disabled Exa generator, which then throws at
  execute time.

- `src/generators/serpApi.ts:22-99` — `SerpApiWebSearchGenerator` (abstract,
  `enabled()` = `Boolean(envVar("SERP_API_KEY"))`, full `execute()` mapping
  `organic_results` → `SearchResult[]`) and concrete
  `SerpApiGoogleWebSearchGenerator` (`id: "serpapi.google-search"`,
  `effort: 5`, `numResults: 30`). It extends `GenericWebSearchGenerator`
  from `./exa`.

- `src/plugins/exaWebSearch.ts:35` — plugin enablement already generalizes:
  `enabled: () => createWebSearchGenerators().some((generator) => generator.enabled())`,
  and `triggerExecute` calls `webSearchGeneratorForEffort(effort)`. So the
  ONLY missing pieces are registration and enabled-aware selection.

- `src/search.ts:38-40`:

```ts
if (enabledPlugins.length === 0) {
  throw new Error("No search plugin enabled. Set EXA_API_KEY or SERP_API_KEY.");
}
```

- README "Keys" section documents `SERP_API_KEY=...`; the search-effort table
  documents Exa levels only.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0 (if plan 001 landed) |
| Selection unit test | `bun test src/generators/webSearch.test.ts` | pass |

## Scope

**In scope**:
- `src/generators/webSearch.ts`
- `src/generators/webSearch.test.ts` (create)
- `README.md` (effort table note)

**Out of scope**:
- `src/generators/serpApi.ts` — do not modify the generator itself.
- `src/generators/exa.ts`, `src/plugins/exaWebSearch.ts`, `src/search.ts`.
- Any live SerpAPI request — tests must not hit the network.

## Git workflow

- Branch: `advisor/005-serpapi-fallback`; short imperative commits; do NOT
  push or open a PR unless the operator instructed it.

## Steps

### Step 1: Register the generator and make selection enabled-aware

In `src/generators/webSearch.ts`:
- append `new SerpApiGoogleWebSearchGenerator()` to the list AFTER the Exa
  generators (Exa stays preferred when both keys exist);
- change `webSearchGeneratorForEffort` to prefer an **enabled** generator at
  the requested effort, then any enabled generator at the nearest effort
  below, then the current behavior as final fallback:

```ts
export function webSearchGeneratorForEffort(effort: EffortLevel) {
  const generators = createWebSearchGenerators();
  return generators.find((g) => g.effort === effort && g.enabled())
    ?? [...generators].filter((g) => g.enabled()).sort((a, b) => b.effort - a.effort)[0]
    ?? generators.find((g) => g.effort === effort)
    ?? new ExaAutoWebSearchGenerator();
}
```

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 2: Unit-test selection with env manipulation

`src/generators/webSearch.test.ts` (bun:test). `envVar` reads
`process.env` in server mode (see `src/runtimeEnv.ts`), so set/delete
`process.env.EXA_API_KEY` / `SERP_API_KEY` per test (save & restore in
`beforeEach`/`afterEach`):
- both keys set → effort 3 picks `exa.*`, effort 5 picks Exa deep (Exa order preserved)
- only SERP set → every effort resolves to `serpapi.google-search`
- only EXA set → unchanged Exa behavior
- neither set → falls back to a generator (no throw at selection time)

**Verify**: `bun test src/generators/webSearch.test.ts` → all pass; no
network calls (execute() is never invoked).

### Step 3: README touch-up

In the search-effort table section, add one line: SerpAPI Google serves as
the fallback provider at any effort when only `SERP_API_KEY` is configured.

**Verify**: `grep -n "SerpAPI" README.md` → the new line.

## Test plan

Step 2 is the test plan; model file structure after `src/cache.test.ts`
(plan 001). `bun run test` stays green.

## Done criteria

- [ ] `grep -n "SerpApiGoogleWebSearchGenerator" src/generators/webSearch.ts` → registered
- [ ] Selection unit tests pass; `bun run test` exits 0; `bunx tsc --noEmit` exits 0
- [ ] With only `SERP_API_KEY` in env, `webSearchGeneratorForEffort(3).id` = `"serpapi.google-search"` (covered by test)
- [ ] README documents the fallback
- [ ] `plans/README.md` status row updated

## STOP conditions

- `envVar()` turns out to read from somewhere tests can't control (not
  process.env) — report rather than hacking the env layer.
- The maintainer would rather DELETE SerpAPI support than wire it: if you
  find a decision record to that effect anywhere in the repo, stop and
  report (the alternative is: delete `serpApi.ts`, drop `SERP_API_KEY` from
  `src/search.ts:39` and README — but that choice belongs to the maintainer).
- Registering the generator changes `/api/effort` output in a way that
  breaks the client effort UI (check `GET /api/effort` before/after — the
  levels map is keyed by effort; two generators at effort 5 must not
  produce a duplicate key regression).

## Maintenance notes

- Watch `GET /api/effort`: `createWebSearchGenerators()` feeds its levels
  map (`Object.fromEntries` keyed by effort). With SerpAPI appended, effort
  5's descriptor becomes the LAST entry at that key — meaning the effort
  UI would describe level 5 as SerpAPI even when Exa is enabled. If that
  matters, build the levels map from enabled generators only — flag it in
  review (this is exactly the kind of duplication plan 004's registry makes
  visible).
- Future providers: same pattern — implement generator, register, selection
  respects `enabled()`.
