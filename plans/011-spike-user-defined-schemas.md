# Plan 011 (design spike): User-defined typed-output schemas

> **Executor instructions**: This is a DESIGN SPIKE — the deliverable is a
> design document plus at most a throwaway prototype branch, NOT shipped
> code. Follow the steps; honor STOP conditions; update the status row in
> `plans/README.md` when done — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/typedOutputs.ts src/models.ts src/cache.ts src/slash/install.ts src/resultFormat.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (no production code changes)
- **Depends on**: plans/002-consolidate-typed-output-and-html-utils.md (the
  marker module is the extension point)
- **Category**: direction
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/16

## Why this matters

Typed outputs are one of zip.cat's distinctive features, but the schema set
is four hardcoded descriptors (`#bool`, `#url`, `#Restaurant`,
`#Restaurant[]`) in `src/typedOutputs.ts`. The infrastructure is already
general: `TypedOutputDescriptor` (id/marker/name/label/description/renderer/
schema) in `src/models.ts`, `/api/typed-outputs` serving the list, the
client fetching it dynamically at startup, JSON-schema validation in
`src/cache.ts` (`matchesSchema`), a generic JSON renderer fallback, ghost
text (`#R` → Tab) driven by the descriptor list, and a per-install override
store (`src/slash/install.ts`) persisting config to localStorage. A user who
wants `#Job[]` or `#Listing` today must fork. This spike decides how users
define their own schemas — it's the feature's natural next step, and the
answer shapes plans that follow.

## Current state (extension points, verified)

- `src/typedOutputs.ts` — hardcoded `typedOutputs: TypedOutputDescriptor[]`;
  `typedOutputDescriptors()` returns it.
- Client startup — `typedOutputs = payload.schemas` from
  `GET /api/typed-outputs` (server mode) or `typedOutputDescriptors()`
  (static mode); everything downstream (pills, ghost text, format
  indicator/picker, shaping instructions) consumes that array.
- Renderers are a fixed enum today: `boolean`, `url`, `restaurant-card`,
  `restaurant-list`, `markdown`, `json` — `src/resultFormat.ts` maps any
  unknown renderer to the JSON view, which is the safe default for custom
  schemas.
- `src/cache.ts` `matchesSchema()` — structural validator supporting
  type/required/properties/items; reusable for validating model output
  against user schemas.
- `src/slash/install.ts` — existing pattern for per-install customization
  persisted client-side.
- AI shaping: the format appendix instructing the model to emit JSON
  matching the marker lives in `src/ai.ts` and `src/client.ts` (duplicated;
  see plan 002's deferred note).

## Deliverable

`plans/design/user-defined-schemas.md` answering, with a recommendation and
rejected alternatives for each:

1. **Registration surface** — where does a user define a schema? Candidates
   to evaluate: (a) client-side only, persisted like install.ts overrides
   (works in static mode, zero server state); (b) a `/schema` slash command
   that creates/edits/lists schemas interactively; (c) server-side registry.
   Evaluate against static mode (must keep working) and multi-device use.
2. **Descriptor lifecycle** — id/marker collision rules vs. built-ins,
   rename/delete semantics, and what happens to old cached/rendered windows
   whose schema changed (cache.ts hashes schemas already — reuse that).
3. **Validation & limits** — max schema size/depth, allowed JSON-schema
   subset (mirror what `matchesSchema` supports — document that subset
   precisely), and validation feedback UX when a model response doesn't
   match.
4. **Rendering** — custom schemas get the `json` renderer initially; sketch
   (don't build) a "field-table" generic renderer driven by
   `properties` order, and note what card-level customization would need.
5. **Shaping prompt** — how the format appendix embeds a user schema
   (schema JSON inline vs. property list), with token-cost notes.
6. **Prototype** (throwaway, worktree/branch only): hardcode ONE extra
   descriptor loaded from localStorage at startup behind the existing
   array; demonstrate marker pill + ghost text + JSON render end-to-end.
   Screenshot or terminal capture into the design doc. Delete or park the
   branch after.
7. **Open questions** for the maintainer, each with your recommended answer.

## Scope

**In scope**: `plans/design/user-defined-schemas.md` (create); a throwaway
prototype branch touching whatever it needs (never merged; not reviewed as
product code).

**Out of scope**: merging ANY runtime change to the main branch; changing
built-in schemas; server persistence work.

## Steps & verification

1. Read the five "Current state" files end-to-end. **Verify**: the design
   doc's extension-point section cites exact symbols/lines.
2. Write sections 1-5, 7. **Verify**: each has a recommendation + at least
   one rejected alternative with a reason.
3. Build the Step-6 prototype on branch `spike/011-user-schemas`.
   **Verify**: capture embedded in the doc; `git status` on the main branch
   clean.

## Done criteria

- [ ] `plans/design/user-defined-schemas.md` exists covering all 7 sections
- [ ] Prototype evidence embedded; main branch untouched
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 002 hasn't landed and the marker logic is still triplicated — the
  spike can proceed for sections 1-5 but STOP before the prototype and note
  the dependency.
- The prototype needs > ~150 lines of change to demonstrate the loop —
  the extension points aren't as clean as believed; document what blocked
  it instead of forcing it.

## Maintenance notes

- The chosen registration surface constrains plan 012 (window-ref piping)
  and any future sync feature — flag the interaction in the doc.
