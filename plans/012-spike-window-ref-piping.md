# Plan 012 (design spike): Pipe window references ($N) into slash commands

> **Executor instructions**: This is a DESIGN SPIKE — the deliverable is a
> design document plus at most a throwaway prototype branch, NOT shipped
> code. Follow the steps; honor STOP conditions; update the status row in
> `plans/README.md` when done — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/slash/base.ts src/slash/registry.ts src/client.ts src/models.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (no production code changes)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/17

## Why this matters

Window references are one-directional today: `$N` labels work in AI prompts
("summarize $0" ships the referenced window's structured JSON to the model)
but slash commands can't consume them — `/weather $0` after finding a place,
or `/convert $1` on a quantity in a result, forces re-typing. The dispatch
context (`SlashCommandContext`) carries only `query` + `args`; the client
already resolves `$N` to full structured snapshots (result kind + raw
resultData) for the AI path. Completing the pair turns isolated commands
into composable ones — the "terminal" metaphor's missing pipe operator.

## Current state (verified)

- Client AI path: window refs resolve to snapshots with `resultKind` and
  structured `resultData` JSON, sent as referenced-window context (see the
  system prompt construction in `src/client.ts` around the text "Each
  referenced window includes resultKind"; and `commandWindowReferences()` /
  `commandBlockForIndex()` for parsing+lookup).
- Slash dispatch: `runSlashCommand({ query, args })` in
  `src/slash/registry.ts`; commands parse their own arguments in
  `parseArguments`/`run` on `SlashCommandContext` (see `src/slash/base.ts`)
  — no window data reaches them. Dispatch happens BOTH client-side (static
  mode) and via `POST /api/slash` (server mode) — a design must work for
  both, and the server never sees the transcript, so snapshots must travel
  in the request.
- Highlighting: `$N` pills render in inputs already
  (`window-ref-pill` in `commandHighlightHtml`, `src/client.ts` ~571-588).
- Types: `src/models.ts` holds `SlashCommandDescriptor`, request shapes for
  `/api/slash`.

## Deliverable

`plans/design/window-ref-piping.md` with a recommendation + rejected
alternatives per section:

1. **Syntax & resolution point** — `/weather $0` resolves where? (client
   resolves to snapshot before dispatch — required for server mode since
   the server has no transcript; evaluate anyway and document.)
2. **Transport** — extend the `/api/slash` body with
   `windowRefs: Record<string, WindowSnapshot>`; size limits (snapshots can
   embed whole search responses — cap and truncate rules); privacy note
   (server sees referenced window content — same trust as the AI path).
3. **Coercion rules** — how a snapshot satisfies a typed argument: e.g.
   string arg ← result title/URL/text; number arg ← first numeric field?
   Define a small, explicit coercion table per `resultKind` (search-result,
   ai-response, weather, stock, restaurant-card…), with "no match →
   command-level error message" as the fallback. NO fuzzy magic in v1;
   consider an AI-assisted extraction as an explicitly-listed v2 option.
4. **Per-command opt-in** — commands declare which arguments accept refs
   (descriptor flag) so /password never receives one; ghost-text/UI hint
   for accepting commands.
5. **Caching interaction** — cache keys are command+args; a ref-fed arg
   must key on the RESOLVED value, not `$0` (stale-window hazard —
   `src/cache.ts`).
6. **Prototype** (throwaway): hardcode `/qr $0` → QR of the referenced
   window's first URL, client-mode only; screenshot into the doc.
7. **Open questions** with recommended answers.

## Scope

**In scope**: `plans/design/window-ref-piping.md`; throwaway prototype
branch `spike/012-window-piping` (never merged).

**Out of scope**: merging runtime changes; changing the AI window-ref path;
new slash commands.

## Steps & verification

1. Read `src/slash/base.ts`, `src/slash/registry.ts`, the client window-ref
   code, and the `/api/slash` route + models. **Verify**: doc cites exact
   symbols for the dispatch chain in both static and server modes.
2. Write sections 1-5, 7. **Verify**: coercion table covers every
   `resultKind` the client currently produces (enumerate them from the
   code, list the enumeration in the doc).
3. Prototype (section 6). **Verify**: capture embedded; main branch clean.

## Done criteria

- [ ] `plans/design/window-ref-piping.md` exists covering all 7 sections
- [ ] resultKind enumeration in the doc matches the code
- [ ] Prototype evidence embedded; main branch untouched
- [ ] `plans/README.md` status row updated

## STOP conditions

- The client's snapshot shape turns out to be unavailable at slash-dispatch
  time (ordering problem in client.ts) — document the restructuring needed
  and stop there.
- Any design would require the server to fetch or store transcripts.

## Maintenance notes

- Interacts with plan 011 (user schemas make snapshots more structured and
  coercion more reliable) — cross-reference in both design docs.
