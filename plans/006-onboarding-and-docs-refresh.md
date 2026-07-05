# Plan 006: Onboarding and docs refresh — .env.example, README/USER_GUIDE catch-up, requirements.txt, CLAUDE.md

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- README.md USER_GUIDE.md src/docs.ts src/slash/ src/env.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/12

## Why this matters

The docs lag the code by two feature waves. README's "Slash Commands"
section documents only `/weather` and `/lanes`, but `src/slash/` ships
eleven commands (`calc`, `convert`, `stock`, `tickers`, `password`, `qr`,
`install`, plus registry/base). USER_GUIDE.md predates i18n (EN/CA language
dropdown), cyclable prompt modes, quick-utility commands, implicit triggers,
and result caching. There is no `.env.example` (README prose is the only
env-var inventory, and it's incomplete), no Python requirements file for the
optional voice scripts, and no CLAUDE.md codebase map for agents executing
the other plans in this directory. Every plan handed to an executor pays a
reverse-engineering tax this plan removes.

## Current state

- `README.md` — "Keys" documents `EXA_API_KEY`, `SERP_API_KEY`,
  `OPENROUTER_API_KEY` (+ optional `pip install moonshine-voice`); "Slash
  Commands" documents `/weather` and `/lanes` (with
  `CANON_POOL_LOGIN`/`CANON_POOL_PASSWORD`) and the caching section. Missing:
  `/calc`, `/convert`, `/stock`, `/tickers`, `/password`, `/qr`, `/install`,
  implicit no-slash triggers (e.g. `5+7` → `/calc`, `MSFT` → `/stock`), and
  the i18n header/language dropdown.
- `USER_GUIDE.md` — last touched at the initial-features commit (June 17);
  check and update against the feature set below.
- `src/slash/` — command modules: `calc.ts`, `convert.ts`, `weather.ts`,
  `stock.ts`, `tickers.ts`, `lanes.ts`, `password.ts`, `qr.ts`, `install.ts`.
  Read each command's descriptor (`command`, `description`, `arguments`,
  `cache`) — these are the source of truth for the docs table.
- `src/env.ts` — loads `.env` from repo root, `~/cats/.env`,
  `~/projects/cats/.env` (documented behavior; keep).
- Env-var names actually read by the code (verify with
  `grep -rhn "envVar(\|process.env." src/ scripts/ --include="*.ts" -o | sort -u`
  and by grepping for the literals): `EXA_API_KEY`, `SERP_API_KEY`,
  `OPENROUTER_API_KEY`, `CANON_POOL_LOGIN`, `CANON_POOL_PASSWORD`,
  `TURBOPUFFER_API_KEY` (check whether anything actually reads this one —
  if nothing does, leave it OUT of .env.example), `NODE_ENV`,
  `ZIP_CAT_APP_PORT`, `ZIP_CAT_STATIC_PORT`, `PORT`.
- `scripts/moonshine_transcribe.py` / `scripts/moonshine_stream.py` — import
  `moonshine_voice`; no requirements file exists.
- `src/docs.ts` — renders the `/docs` features page from its own content;
  check whether it covers i18n, prompt modes, quick-utility commands, and
  the typed-result-type picker; update the gaps.
- No `CLAUDE.md` exists. `AGENTS.md` exists but is a *deployment* guide (do
  not duplicate it — link to it).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0 (docs.ts edits) |
| Tests     | `bun run test`      | exit 0 (if plan 001 landed) |
| Command inventory | `ls src/slash/*.ts` | matches docs table |

## Scope

**In scope**:
- `.env.example` (create — NAMES with placeholder values only, never real
  values)
- `README.md`, `USER_GUIDE.md`
- `requirements.txt` (create)
- `CLAUDE.md` (create)
- `src/docs.ts` (content additions only)

**Out of scope**:
- `AGENTS.md` (deployment guide — leave as is)
- Any behavioral code change; `src/env.ts` stays untouched.
- `docs/images/` — reuse existing screenshots; do NOT try to generate new
  ones (note wanted screenshots as TODO comments instead).

## Git workflow

- Branch: `advisor/006-docs-refresh`; short imperative commits; do NOT push
  or open a PR unless the operator instructed it.

## Steps

### Step 1: `.env.example`

One line per variable actually read by the code (verify each with grep
before including), grouped with comments (search/AI keys; /lanes
credentials; ports), placeholder values like `EXA_API_KEY=your-exa-key`.
Include the multi-location note (`~/cats/.env`, `~/projects/cats/.env`) as a
comment. NEVER copy a real value from any local `.env`.

**Verify**: `grep -c "=" .env.example` ≥ 7; no value in the file appears in
the local `.env` (spot-check by eye — do not print `.env` contents into any
log).

### Step 2: README slash-command and i18n catch-up

- Extend the Slash Commands section with a table of all user-facing commands
  (command, one-line purpose, example invocation) sourced from each module's
  descriptor. Keep `/weather` and `/lanes` detail subsections.
- Add a short "Implicit commands" paragraph (no-slash triggers with 2
  examples).
- Add a "Language" note (EN/CA dropdown in the fixed header; `?lang=` URL
  param).
- Point Keys at `.env.example`.

**Verify**: every file in `ls src/slash/*.ts` that defines a user-facing
command appears in the README table (registry check: compare against
`slashCommandDescriptors()` names in `src/slash/registry.ts`).

### Step 3: USER_GUIDE refresh

Add sections mirroring Step 2 (commands, implicit triggers, language
switching, prompt modes cycling via the `>`/`*` glyph, cached-result age
chip + refresh button). Match the guide's existing voice/tone (short,
imperative, example-first).

**Verify**: `grep -n "calc\|convert\|password" USER_GUIDE.md` → hits.

### Step 4: `requirements.txt`

```
# Optional: server-mode voice transcription (see README "Voice")
moonshine-voice
```

Pin a version only if you can determine the currently-installed one
(`pip show moonshine-voice` in the repo's venv if present); otherwise leave
unpinned with a comment. Update README's voice section to
`pip install -r requirements.txt`.

**Verify**: file exists; README references it.

### Step 5: CLAUDE.md

Write ~150-250 lines covering, in this order: what zip.cat is (2 sentences);
architecture map (server.ts Elysia entry; client.ts browser app bundled by
Bun.build; render.ts SSR + inline CSS; static build scripts +
functions/api/[[path]].ts Pages Function; runtimeEnv dual-mode env);
key abstractions (SearchPlugin, generators + effort levels, SlashCommand +
registry + implicit triggers, TypedOutputDescriptor + markers, cache.ts
schema-validated localStorage cache, i18n MESSAGES/locales); dev workflow
(`bun run dev` = both servers, client rebuilt per request — reload, don't
restart; the user usually runs the dev server themselves); verification
(`bunx tsc --noEmit`, `bun run test` if plan 001 landed, which evals need
keys); conventions (strict TS, two-space, double quotes, HTML-in-template-
strings with escapeHtml, i18n data-attributes); links to AGENTS.md for
deployment and plans/README.md for the improvement backlog.

**Verify**: every command named in CLAUDE.md actually runs (`bun run dev`
excluded — just confirm the script exists in package.json).

### Step 6: `/docs` page catch-up

In `src/docs.ts`, add feature sections for anything missing among: i18n,
prompt modes, quick-utility commands + implicit triggers, caching age chip,
typed result-type picker. Add a header comment: "When adding a user-facing
feature, add a section here." Match existing section markup exactly.

**Verify**: `bunx tsc --noEmit` → exit 0; `bun run dev` → /docs renders the
new sections.

## Test plan

Docs-only plan; the machine checks are the greps above plus typecheck for
`src/docs.ts`. `bun run test` must stay green.

## Done criteria

- [ ] `.env.example` exists, covers every env var the code reads, contains no real secret values
- [ ] README lists all user-facing slash commands + implicit triggers + language switching
- [ ] USER_GUIDE covers the post-June-17 features listed in Step 3
- [ ] `requirements.txt` exists and README references it
- [ ] `CLAUDE.md` exists with the Step 5 contents
- [ ] `bunx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- You cannot determine whether an env var is actually read (grep ambiguity)
  — list it in the report instead of guessing into `.env.example`.
- `src/docs.ts` content turns out to be generated from elsewhere (check for
  a generator script before hand-editing).
- Anything would require pasting a real credential value anywhere.

## Maintenance notes

- The README command table and `/docs` sections will drift again — the
  registry-vs-README check in Step 2 is easy to script later as a test.
- CLAUDE.md should be updated when plans 002/004 land (module map changes).
- Deferred: auto-generating command docs from `slashCommandDescriptors()`.
