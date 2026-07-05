# Plan 002: Consolidate typed-output marker parsing and HTML/URL utilities into shared modules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/typedOutputs.ts src/resultFormat.ts src/client.ts src/render.ts src/ai.ts`
> This plan was written against commit `d9730c9` **plus uncommitted
> working-tree changes** (branch `feature/slash-commands-i18n-prompt-modes`);
> compare the "Current state" excerpts against the live working tree. On a
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-test-baseline-and-ci.md
- **Category**: tech-debt
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/8

## Why this matters

The typed-output marker grammar (`#bool`, `#Restaurant[]` — regex
`/#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g`) is implemented three times:
`src/typedOutputs.ts`, `src/resultFormat.ts`, and `src/client.ts`. `escapeHtml`
is implemented three times (`src/resultFormat.ts:19`, `src/render.ts:57`,
`src/client.ts:384`) and `originForUrl` twice (`src/render.ts:65`,
`src/client.ts` ~397). Any change to the marker grammar (e.g. a new suffix, a
normalization fix) must be synchronized across files or browser and server
silently diverge on which markers they recognize. Consolidating to one module
each removes that failure mode and gives the grammar its first unit tests.

## Current state

- `src/typedOutputs.ts:80-115` — canonical server copy:

```ts
function normalizeTypedOutputMarker(marker: string) {
  return marker.replace(/\s+\[\]$/, "[]");
}

export function typedOutputForMarker(marker: string) {
  const normalized = normalizeTypedOutputMarker(marker);
  return typedOutputs.find((descriptor) => descriptor.marker.toLowerCase() === normalized.toLowerCase());
}

export function typedOutputRefs(prompt: string): TypedOutputRef[] {
  const refs: TypedOutputRef[] = [];
  const pattern = /#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g;
  for (const match of prompt.matchAll(pattern)) {
    const marker = `#${match[1]}${match[2] ? "[]" : ""}`;
    const descriptor = typedOutputForMarker(marker);
    if (!descriptor) { continue; }
    refs.push({ id: descriptor.id, marker: descriptor.marker, name: descriptor.name,
      start: match.index, end: match.index + match[0].length });
  }
  return refs;
}

export function stripTypedOutputRefs(prompt: string) {
  return prompt.replace(/#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g, (value) => (
    typedOutputForMarker(value) ? "" : value
  )).replace(/\s{2,}/g, " ").trim();
}
```

  Note: this copy closes over the module-level hardcoded `typedOutputs` array.

- `src/resultFormat.ts:26-45` — parameterized copy (takes `descriptors` as an
  argument; this is the shape the shared module should keep):

```ts
function normalizeTypedOutputMarker(marker: string) {
  return marker.replace(/\s+\[\]$/, "[]");
}

function typedOutputForMarker(marker: string, descriptors: TypedOutputDescriptor[]) {
  const normalized = normalizeTypedOutputMarker(marker);
  return descriptors.find((descriptor) => descriptor.marker.toLowerCase() === normalized.toLowerCase());
}

export function typedOutputReferencesForFormat(query: string, descriptors: TypedOutputDescriptor[]) {
  const refs: TypedOutputDescriptor[] = [];
  for (const match of query.matchAll(/#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g)) {
    const marker = `#${match[1]}${match[2] ? "[]" : ""}`;
    const descriptor = typedOutputForMarker(marker, descriptors);
    if (descriptor) { refs.push(descriptor); }
  }
  return refs;
}
```

- `src/client.ts` ~443-500 — browser copy. IMPORTANT: the client's descriptor
  list is **dynamic state** (`let typedOutputs: TypedOutputDescriptor[]`,
  fetched from `/api/typed-outputs` at startup or seeded from
  `typedOutputDescriptors()` in static mode), so the client cannot use the
  closure-based server functions — the shared functions must accept
  `descriptors` as a parameter. Client also has `typedOutputReferences(query)`
  returning `{descriptor, marker, start, end}` and `stripTypedOutputMarkers`.

- `escapeHtml` — byte-identical in three places:

```ts
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
```

- `originForUrl` — identical in `src/render.ts:65-71` and `src/client.ts`:

```ts
function originForUrl(url: string) {
  try { return new URL(url).origin; } catch { return url; }
}
```

- `src/client.ts` already imports from `./typedOutputs`, `./resultFormat`,
  `./i18n` — client and server sharing modules is established practice; the
  bundler (Bun.build, target browser) handles it.

- Types live in `src/models.ts` (`TypedOutputDescriptor`, `TypedOutputRef`,
  `JsonSchema`).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0 (from plan 001) |
| Dev smoke | `bun run dev` then load http://localhost:3000 | typed pill renders for `dogs have legs #bool` |

## Scope

**In scope**:
- `src/typedOutputMarkers.ts` (create — shared parsing)
- `src/html.ts` (create — `escapeHtml`, `originForUrl`)
- `src/typedOutputMarkers.test.ts` (create)
- `src/typedOutputs.ts`, `src/resultFormat.ts`, `src/render.ts`,
  `src/client.ts`, `src/ai.ts` (switch to the shared modules; delete local
  copies)

**Out of scope**:
- The typed-output *descriptor list* itself (`typedOutputs` array in
  `src/typedOutputs.ts`) — do not change schemas or markers.
- The prompt-appendix duplication between `src/ai.ts` and `src/client.ts`
  (`typedOutputFormatAppendix` etc.) — real debt, but consolidating prompt
  text is riskier (AI behavior) and is deliberately deferred.
- `src/docs.ts` — has its own small `escapeHtml`? Check; if it does, you MAY
  switch it to `src/html.ts` as a trivial import swap, nothing more.

## Git workflow

- Branch: `advisor/002-shared-marker-utils`
- Commit per step; message style: short imperative sentence.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/typedOutputMarkers.ts`

Export (all parameterized by `descriptors: TypedOutputDescriptor[]`):
- `TYPED_OUTPUT_MARKER_PATTERN` (the global regex; document that callers must
  not rely on shared `lastIndex` — construct with a factory or use
  `matchAll` on a fresh instance internally)
- `normalizeTypedOutputMarker(marker: string): string`
- `typedOutputForMarker(marker, descriptors)`
- `typedOutputMarkerRefs(prompt, descriptors)` returning
  `{ descriptor, marker, start, end }[]` (superset of both existing ref
  shapes)
- `stripTypedOutputMarkers(prompt, descriptors)`

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 2: Create `src/html.ts` with `escapeHtml` and `originForUrl`

Copy the implementations verbatim.

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 3: Write `src/typedOutputMarkers.test.ts` BEFORE switching callers

Characterization cases (use the real descriptor list from
`typedOutputDescriptors()`):
- `"dogs have legs #bool"` → one ref, marker `#bool`, correct start/end
- `"ice cream #Restaurant []"` → normalizes to `#Restaurant[]`
- case-insensitive: `#restaurant` matches the `#Restaurant` descriptor
- unknown marker `#Nope` → no refs; `stripTypedOutputMarkers` leaves it intact
- strip: `"best tapas #Restaurant[] in girona"` → `"best tapas in girona"`
  (double-space collapsed, trimmed)
- multiple markers → refs in document order

**Verify**: `bun test src/typedOutputMarkers.test.ts` → all pass.

### Step 4: Switch `src/typedOutputs.ts` to the shared module

Keep its public API unchanged (`typedOutputForMarker(marker)` with the
closure over the local list, `typedOutputRefs`, `stripTypedOutputRefs`) but
implement them as one-line delegations to `typedOutputMarkers.ts`, passing
the local `typedOutputs` array. Delete the local regex/normalize copies.

**Verify**: `bun run test` → exit 0.

### Step 5: Switch `src/resultFormat.ts`

Replace its private `normalizeTypedOutputMarker`/`typedOutputForMarker` and
the inline regex in `typedOutputReferencesForFormat` with imports. Replace
its private `escapeHtml` with the `src/html.ts` import.

**Verify**: `bun run test` → exit 0; `bunx tsc --noEmit` → exit 0.

### Step 6: Switch `src/render.ts` and `src/client.ts`

- `render.ts`: import `escapeHtml`/`originForUrl` from `./html`; delete local
  copies.
- `client.ts`: delete local `normalizeTypedOutputMarker`, the parsing bodies
  of `typedOutputForMarker`, `typedOutputReferences`,
  `stripTypedOutputMarkers`, and local `escapeHtml`/`originForUrl`; delegate
  to the shared modules passing the client's dynamic `typedOutputs` state.
  Keep the thin local wrappers so the ~40 call sites don't all change.
- `ai.ts`: if it has its own marker helpers or imports the old names, align
  imports.

**Verify**: `bunx tsc --noEmit` → exit 0; `bun run test` → exit 0.

### Step 7: Browser smoke test

`bun run dev`, open http://localhost:3000, type `dogs have legs #bool` — the
`#bool` pill must highlight and the format indicator must switch to the
boolean icon. Type `#R` and confirm ghost-text completion still offers
`#Restaurant`.

**Verify**: visual behaviors above; browser console free of errors.

## Test plan

- New: `src/typedOutputMarkers.test.ts` (Step 3 cases — these are the
  regression net for the whole consolidation).
- Existing: `bun run test` (plan 001) must stay green after every step.
- Pattern to follow: `src/cache.test.ts` from plan 001.

## Done criteria

- [ ] `grep -rn "replace(/\\\\s+\\\\[\\\\]\$/" src/ --include="*.ts" | grep -v typedOutputMarkers` → no matches (normalization exists once)
- [ ] `grep -rn "function escapeHtml" src/` → exactly one match, in `src/html.ts`
- [ ] `grep -rn "function originForUrl" src/` → exactly one match, in `src/html.ts`
- [ ] `bunx tsc --noEmit` exits 0; `bun run test` exits 0 incl. new marker tests
- [ ] Browser smoke (Step 7) passes
- [ ] `plans/README.md` status row updated

## STOP conditions

- The client copies turn out NOT to be behavior-identical to the server
  copies (e.g. different regex or different strip semantics) — that is a
  live browser/server divergence; report it as a finding instead of silently
  picking one.
- Bundling `src/html.ts` into the client fails (unexpected server-only
  transitive import).
- Any existing eval in `bun run test` fails after a switch step and the fix
  isn't an import correction.

## Maintenance notes

- Future marker-grammar changes happen in `src/typedOutputMarkers.ts` only;
  reviewers should reject new inline `/#(...)/` regexes elsewhere.
- Plan 011 (user-defined schemas spike) builds directly on this module.
- Deferred: prompt-appendix duplication between `ai.ts` and `client.ts`.
