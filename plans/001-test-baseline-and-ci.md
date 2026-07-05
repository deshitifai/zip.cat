# Plan 001: Establish a one-command test baseline and run it in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- package.json .github/workflows/ scripts/test_implicit.ts scripts/test_quick_utils.ts src/cache.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Note: this plan was written against
> commit `d9730c9` **plus uncommitted working-tree changes** on branch
> `feature/slash-commands-i18n-prompt-modes`; verify against the working tree.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/7

## Why this matters

The repo has real, fully-offline test suites (~150 assertions across calc,
convert, dispatch, and quick-utility slash commands) but no `test` script and
no CI execution — CI only builds and deploys. A refactor to `src/slash/calc.ts`
or `src/slash/convert.ts` can pass `bun run build` and deploy to production
with regressions the existing suites would have caught. There is also no
`bun test`-discovered unit test anywhere, so contributors have no one-command
way to know the codebase works. This plan is the prerequisite for every
riskier plan in this directory (002, 004, 007).

## Current state

- `package.json` — scripts today (no `test` entry):

```json
"scripts": {
  "dev": "bun scripts/dev_both.ts",
  "dev:both": "bun scripts/dev_both.ts",
  "dev:server": "bun --watch src/server.ts",
  "eval:suggest": "bun src/plugins/__tests__/suggest.eval.ts",
  "eval:inline": "bun scripts/eval_inline_substitutions.ts",
  "eval:inline:openrouter": "bun scripts/eval_inline_substitutions.ts --models openrouter:openai/gpt-4.1-mini",
  "eval:inline:local": "bun scripts/eval_inline_substitutions.ts --models local-gemma-node",
  "build": "tsc --noEmit && bun run build:pages",
  "build:pages": "bun scripts/build_pages.ts",
  "build:static": "bun scripts/build_static.ts",
  "start": "bun src/server.ts"
}
```

- `scripts/test_implicit.ts` — runs the offline eval suites and exits nonzero
  on failure:

```ts
// scripts/test_implicit.ts:1-13
import { runSuites } from "../src/slash/__tests__/harness";
import { calcSuites } from "../src/slash/__tests__/calc.eval";
import { convertSuites } from "../src/slash/__tests__/convert.eval";
import { dispatchSuites } from "../src/slash/__tests__/dispatch.eval";

const result = runSuites([...calcSuites, ...convertSuites, ...dispatchSuites]);

if (result.failed > 0) {
  process.exit(1);
}
```

- `scripts/test_quick_utils.ts` — end-to-end harness driving the real
  `runSlashCommand` entry point for `/calc`, `/convert`, `/password`, `/qr`.
  Verified offline: `grep -n "fetch(" src/slash/calc.ts src/slash/convert.ts
  src/slash/password.ts src/slash/qr.ts` returns no matches. Check its tail
  for how it reports failures (it counts `failed` — confirm it exits nonzero;
  if it does not, add `process.exit(1)` when `failed > 0`).

- `.github/workflows/deploy.yml:1-47` — single `deploy` job on push to `main`
  and `workflow_dispatch`. Steps: checkout@v4, setup-bun@v2 with
  `bun-version: latest`, `bun install --frozen-lockfile`, `bun run build`,
  wrangler pages deploy. No test step, no PR-triggered workflow.

- `src/cache.ts` (~216 lines) — pure, self-contained localStorage cache with
  `hashSchema()` (DJB2), `matchesSchema()` (structural JSON-schema check),
  `readCache()`/`writeCache()`. It has a `storage()` indirection; check
  whether it guards `typeof localStorage === "undefined"` — if it doesn't,
  unit-test only the pure functions (`hashSchema`, `matchesSchema`).

- Do NOT run `bun run eval:suggest` or `eval:inline*` in CI — those hit real
  networks/APIs.

- Convention: TypeScript strict, two-space indent, no semicolon omission,
  double quotes. Match `scripts/test_implicit.ts` for script style.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `bun install`                    | exit 0              |
| Typecheck | `bunx tsc --noEmit`              | exit 0, no output   |
| Eval lib  | `bun scripts/test_implicit.ts`   | exit 0, pass counts |
| Quick utils | `bun scripts/test_quick_utils.ts` | exit 0, ✓ lines   |
| Unit tests | `bun test`                      | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (add `test` script)
- `.github/workflows/ci.yml` (create)
- `.github/workflows/deploy.yml` (pin bun version, add test step)
- `src/cache.test.ts` (create)
- `scripts/test_quick_utils.ts` (only if it lacks a nonzero exit on failure)

**Out of scope** (do NOT touch):
- Any file under `src/` other than the new test file — no refactors here.
- `scripts/eval_inline_substitutions.ts`, `src/plugins/__tests__/suggest.eval.ts`
  — network-dependent evals stay out of the test command.
- The deploy job's wrangler step.

## Git workflow

- Branch: `advisor/001-test-baseline` (repo uses `feature/<slug>` branches;
  either prefix is acceptable — do not commit to `main`).
- Commit style from `git log`: short imperative sentence, e.g.
  "Add quick-utility slash commands with implicit triggers and autocomplete".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the two offline suites pass and exit nonzero on failure

Run `bun scripts/test_implicit.ts` and `bun scripts/test_quick_utils.ts`.
Then confirm failure propagation in `scripts/test_quick_utils.ts`: it must
`process.exit(1)` (or throw) when any check fails. If it doesn't, add that at
the end of its `main()` (mirroring `test_implicit.ts`).

**Verify**: `bun scripts/test_implicit.ts; echo "exit=$?"` → prints `exit=0`.
Same for `test_quick_utils.ts`.

### Step 2: Seed `bun test` with a unit test for the pure cache functions

Create `src/cache.test.ts` using Bun's test runner (`import { test, expect }
from "bun:test"`). Cover, at minimum:
- `hashSchema` stability: same schema → same hash; structurally different
  schema (added required field) → different hash.
- `matchesSchema` accepts: object matching `{type:"object", required:["a"],
  properties:{a:{type:"string"}}}`; array of objects vs `{type:"array",
  items:…}`; boolean/string/number primitives.
- `matchesSchema` rejects: missing required field, wrong primitive type,
  array containing one mismatching item.

If `readCache`/`writeCache` are testable without a DOM `localStorage`, add a
happy-path + TTL-expiry test using a stub; otherwise skip them (pure
functions only) and note it in the test file header comment.

**Verify**: `bun test` → all tests pass, exit 0.

### Step 3: Add the `test` script

In `package.json` add:

```json
"test": "bun test && bun scripts/test_implicit.ts && bun scripts/test_quick_utils.ts"
```

**Verify**: `bun run test; echo "exit=$?"` → `exit=0`.

### Step 4: Add a PR CI workflow

Create `.github/workflows/ci.yml`:
- trigger: `pull_request` plus `push` to any branch except `main`
- steps: checkout, setup-bun (pinned version — use the version reported by
  `bun --version` locally), `bun install --frozen-lockfile`,
  `bunx tsc --noEmit`, `bun run test`
- 10-minute timeout, `permissions: contents: read`.

**Verify**: `bunx tsc --noEmit` and `bun run test` succeed locally (the exact
commands the workflow runs). YAML parses: `bunx yaml-lint` is NOT available —
instead verify with `node -e "require('js-yaml')"`-style checks only if
already installed; otherwise rely on careful review and GitHub's parse on
push.

### Step 5: Pin bun and add the test gate to deploy.yml

In `.github/workflows/deploy.yml`: change `bun-version: latest` to the same
pinned version used in Step 4, and insert `- name: Test\n  run: bun run test`
between the install and build steps.

**Verify**: `git diff .github/workflows/deploy.yml` shows exactly the two
edits (pin + test step); nothing else changed.

## Test plan

The plan *is* the test infrastructure. New tests: `src/cache.test.ts` (Step 2
cases). Verification: `bun run test` exits 0 and runs three stages (bun test,
implicit evals, quick-utils harness).

## Done criteria

- [ ] `bun run test` exits 0 and executes all three stages
- [ ] `bunx tsc --noEmit` exits 0
- [ ] `.github/workflows/ci.yml` exists with typecheck + test on pull_request
- [ ] `deploy.yml` has a pinned `bun-version` and a test step before build
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- `bun scripts/test_implicit.ts` or `bun scripts/test_quick_utils.ts` FAILS
  on the current tree — the baseline is red; fixing product code is out of
  scope for this plan.
- `bun test` cannot run `src/cache.test.ts` because `cache.ts` unconditionally
  touches `localStorage` at import time — report instead of restructuring
  cache.ts (that refactor belongs elsewhere).
- Any eval suite turns out to make network calls.

## Maintenance notes

- Every future plan in this directory assumes `bun run test` is the
  verification gate — keep it fast and offline.
- When new slash commands gain offline harness coverage, extend
  `scripts/test_quick_utils.ts`, not the CI YAML.
- Reviewer should scrutinize: that CI pins the same bun version developers
  use, and that the deploy job still deploys unchanged.
