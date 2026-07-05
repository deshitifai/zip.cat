# Plan 009: Dependency and CI hygiene — declare wrangler, document the vendored Gemma bundle, refresh the lockfile, scope a transformers upgrade

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- package.json bun.lock .github/workflows/ wrangler.jsonc vendor/`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (bun pinning itself is handled in plan 001)
- **Category**: migration / dx
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/14

## Why this matters

Four hygiene gaps that each cost a future debugging session: (1) `wrangler`
is not a declared dependency — `wrangler.jsonc`'s `$schema` points at
`./node_modules/wrangler/config-schema.json` (dangling unless something else
installed it) and CI runs `npx wrangler pages deploy`, pulling whatever
version is latest at deploy time; a breaking wrangler release breaks deploys
with no local repro. (2) `vendor/gemma-4-e2b.js` (~539 KB) has no recorded
origin, version, or refresh instructions. (3) The lockfile has drifted
behind the manifest ranges (dotenv, @types/node minors). (4)
`@huggingface/transformers` is pinned to exact `3.7.1` while 4.x is
current-major — an upgrade needs a scoped investigation, not a blind bump.

## Current state

- `package.json` deps: `@huggingface/transformers: "3.7.1"` (exact),
  `dotenv ^17.2.3`, `elysia ^1.4.28`, `exa-js ^2.13.0`, `marked ^18.0.5`;
  devDeps: `@types/bun ^1.3.14`, `@types/node ^24.10.2`,
  `typescript ^5.9.3`. No `wrangler`.
- `wrangler.jsonc:2` — `"$schema": "./node_modules/wrangler/config-schema.json"`.
- `.github/workflows/deploy.yml:40-46` — `npx wrangler pages deploy dist/static …`.
- `vendor/gemma-4-e2b.js` — served by `src/server.ts:131` with
  `max-age=31536000, immutable`; used by the browser Gemma worker; no
  provenance doc anywhere (`ls vendor/` → the one file).
- Transformers usage surface: `src/browserMoonshineWorker.ts` (imports
  `AutoModel`, `Tensor`, `pipeline` — verify exact imports), and check
  `src/browserGemmaWorker.ts` for its usage. Small surface, but the worker
  runs in-browser with WebGPU — behavior can only be truly verified
  manually.

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Install   | `bun install`              | exit 0, lockfile updated |
| Typecheck | `bunx tsc --noEmit`        | exit 0              |
| Tests     | `bun run test`             | exit 0              |
| Wrangler sanity | `bunx wrangler --version` | prints the pinned version |
| Build     | `bun run build`            | exit 0              |

## Scope

**In scope**:
- `package.json`, `bun.lock`
- `.github/workflows/deploy.yml` (wrangler invocation only)
- `vendor/README.md` (create)
- A written upgrade assessment appended to THIS plan file (transformers)

**Out of scope**:
- Actually upgrading `@huggingface/transformers` (investigation only —
  produce the assessment, stop there).
- `bun-version` pinning in workflows (plan 001 owns it).
- Elysia/marked/exa-js version bumps (in-range, no known need).

## Git workflow

- Branch: `advisor/009-dep-hygiene`; one commit per step; do NOT push or
  open a PR unless the operator instructed it.

## Steps

### Step 1: Declare and pin wrangler

`bun add -d wrangler` then pin to the installed major (e.g. `"wrangler":
"^4.x.y"` — use whatever resolves today). Change deploy.yml's deploy step
from `npx wrangler pages deploy …` to `bunx wrangler pages deploy …` so CI
uses the locked version installed by `bun install --frozen-lockfile`.

**Verify**: `bunx wrangler --version` prints the pinned version;
`ls node_modules/wrangler/config-schema.json` exists (schema reference no
longer dangles); `bun run build` exits 0.

### Step 2: Refresh the lockfile within existing ranges

`bun update dotenv @types/node @types/bun typescript elysia exa-js marked`
(in-range updates only — the manifest ranges must not change except
wrangler from Step 1).

**Verify**: `git diff package.json` shows ONLY the wrangler addition;
`bunx tsc --noEmit` and `bun run test` exit 0.

### Step 3: Document the vendored Gemma bundle

Create `vendor/README.md`: what `gemma-4-e2b.js` is, where it came from
(determine from the file's header comments / the import site in the Gemma
worker; if the origin genuinely cannot be established from the repo, say so
explicitly and record its sha256 as the identity anchor), the date it was
last updated (git log on the file), how to refresh it, and its sha256
(`shasum -a 256 vendor/gemma-4-e2b.js`).

**Verify**: file exists; hash in the doc matches a fresh `shasum` run.

### Step 4: Transformers 4.x upgrade assessment (investigate, don't do)

Enumerate every `@huggingface/transformers` import in `src/`; check the
4.x changelog/migration notes for those specific APIs (AutoModel, Tensor,
pipeline, and anything else found); write a short assessment (append under
a "## Transformers 4.x assessment" heading at the bottom of this plan):
APIs used → changed-or-not, expected effort, and the manual browser test
required (voice via Moonshine worker, local Gemma answer). Recommend
go/no-go.

**Verify**: the assessment section exists and names every import found by
`grep -rn "@huggingface/transformers" src/`.

## Test plan

Steps 1-2 are covered by typecheck + `bun run test` + `bun run build`.
Steps 3-4 produce documents; their verification is the greps/hashes above.

## Done criteria

- [ ] `wrangler` in devDependencies; deploy.yml uses `bunx wrangler`; schema path resolves
- [ ] `bun.lock` refreshed; manifest ranges unchanged except wrangler
- [ ] `vendor/README.md` exists with provenance-or-hash + refresh steps
- [ ] Transformers assessment appended to this plan
- [ ] `bunx tsc --noEmit`, `bun run test`, `bun run build` all exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bun update` changes behavior (any test failure) — pin back the offender
  and report which package.
- Wrangler's current major refuses `pages deploy` with this project layout
  (CLI change) — report; do not restructure deploy.
- You are tempted to actually perform the transformers upgrade — that is
  explicitly out of scope.

## Maintenance notes

- Renovate/dependabot is worth considering later; this plan makes the
  manifest truthful first.
- When the transformers upgrade is executed (separate plan), the manual
  browser checks in the Step 4 assessment are the acceptance gate.
