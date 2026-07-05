# Plan 003: Introduce a theming scheme — CSS custom properties, dark mode, and a theme toggle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/render.ts src/docs.ts src/client.ts`
> This plan was written against commit `d9730c9` **plus uncommitted
> working-tree changes** (branch `feature/slash-commands-i18n-prompt-modes`).
> `src/render.ts` in particular is actively edited; re-count the color
> literals (Step 1) rather than trusting exact numbers.

## Status

- **Priority**: P1 (maintainer-requested)
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction / tech-debt
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/9

## Why this matters

All styling is hardcoded hex: 45 distinct color literals in
`src/render.ts`'s `pageStyles` template string (~1450 lines of CSS) and 8
more in `src/docs.ts`'s separate stylesheet — zero CSS custom properties,
zero `prefers-color-scheme` handling. There is no way to restyle, no dark
mode, and any rebrand means hunting literals across two files. The
maintainer has explicitly requested a theming scheme. Centralizing colors
into a token palette makes dark mode a ~30-line override block and makes
future themes (or seasonal skins) additive instead of invasive.

## Current state

- `src/render.ts` — exports `pageStyles`, one giant template string starting:
  `export const pageStyles = \`    * { box-sizing: border-box; }` (~line 199)
  and running ~1450 lines. Colors used repeatedly include (verified by grep):
  `#111` (primary fg/borders), `#fff` (bg), `#f2f2f2` (hover/active surface),
  `#444`/`#555`/`#666` (muted text), `#ddd`/`#eee` (light borders), plus
  ~35 accent/status colors (blues, reds, greens used by effort bars, status
  marks, pills, debug panel, restaurant cards, weather/stock renderers).
  `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/render.ts | sort -u | wc -l` → 45.
- `src/render.ts` `renderPage()` inlines the CSS into every HTML response:
  `<style>\n${pageStyles}  </style>` and renders a fixed `header.site-header`
  containing a voice button and a `#lang-select` language dropdown — the
  natural home for a theme toggle.
- `src/docs.ts` (~494 lines) — renders `/docs` with its **own** inline style
  string; `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/docs.ts | sort -u | wc -l` → 8.
- `src/client.ts` — no theme handling anywhere; it does have an established
  localStorage-preference pattern to copy:
  `localStorage.setItem("zip.cat.aiEngine", engine)` (in `setAiEngine`).
- The static build (`scripts/build_static.ts`, `scripts/build_pages.ts`)
  reuses `renderPage({ staticBuild: true })`, so token changes flow to the
  static site automatically — no build-script changes required.
- i18n convention: user-visible strings go through `src/i18n.ts` `MESSAGES`
  (EN + CA) and elements use `data-i18n-title`/`data-i18n-aria` attributes —
  the theme toggle's tooltip/aria-label must follow this (see
  `render.ts` site-header for the pattern).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0 (if plan 001 landed; otherwise skip) |
| Dev       | `bun run dev`       | app at :3000, static at :3001 |
| Color sweep | `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/render.ts \| sort \| uniq -c \| sort -rn` | see Step 1 |

## Scope

**In scope**:
- `src/theme.ts` (create — the palette as exported CSS strings)
- `src/render.ts` (consume tokens; add toggle button; add dark block)
- `src/docs.ts` (consume the same tokens)
- `src/client.ts` (theme toggle wiring + persistence)
- `src/i18n.ts` (new message keys for the toggle)

**Out of scope**:
- Layout, spacing, typography — colors only. Do not "improve" any visuals.
- `src/resultFormat.ts` icon markup (icons inherit `currentColor` via CSS).
- Print styles, high-contrast mode — note as follow-ups if tempted.

## Git workflow

- Branch: `advisor/003-theming`
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory and cluster the literals

Run the color sweep command on `src/render.ts` and `src/docs.ts`. Cluster
into semantic tokens — target roughly:

```
--bg, --bg-raised (menus/cards), --bg-hover (#f2f2f2 today),
--fg (#111), --fg-muted (#444/#555), --fg-faint (#666/#888),
--border (#111), --border-light (#ddd/#eee),
--accent, --accent-fg, --link,
--ok, --warn, --error,
--shadow (the rgba() shadow color)
```

Map every one of the 45+8 literals to a token; one-off decorative colors
(e.g. per-renderer chart colors) may become component tokens
(`--stock-up`, `--stock-down`, …) rather than being forced into the core
set. Write the mapping as a comment block at the top of `src/theme.ts`.

**Verify**: every distinct literal from the sweep appears exactly once in
your mapping comment.

### Step 2: Create `src/theme.ts`

Export:

```ts
export const themeTokens = `:root { --bg: #fff; --fg: #111; ... }`;
export const darkThemeOverrides = `...`; // the same custom properties, dark values
export const themeStyles = `
${themeTokens}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${'{'}...dark values...{'}'} } }
:root[data-theme="dark"] { ...dark values... }
`;
```

Semantics: `data-theme` attribute on `<html>` wins; otherwise the OS
preference applies; otherwise light. Choose dark values by keeping the
existing monochrome character (near-black bg `#111`-family, near-white fg),
and check the four highest-traffic pairs (fg/bg, fg-muted/bg, link/bg,
fg/bg-hover) meet WCAG AA 4.5:1 using a contrast calculation you compute
yourself (relative-luminance formula) in a throwaway script.

**Verify**: `bunx tsc --noEmit` → exit 0.

### Step 3: Replace literals in `src/render.ts`

Prepend `themeStyles` to `pageStyles` (or interpolate at the top of the
template) and replace every hex literal with `var(--token)`. Mechanical,
long, low-risk — go section by section, checking rendering after each chunk
in the dev server.

**Verify**: `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/render.ts | wc -l` → 0
(all literals now live in `src/theme.ts`); visual smoke on :3000 in light
mode is pixel-equivalent to before.

### Step 4: Same for `src/docs.ts`

Import the shared `themeStyles`, replace its 8 literals with tokens.

**Verify**: `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/docs.ts | wc -l` → 0; /docs
renders correctly.

### Step 5: Theme toggle

- `src/i18n.ts`: add keys `themeToggle` (EN "Theme", CA translation to match
  the existing catalog's style) and any aria variant needed.
- `src/render.ts`: add a small button to `.site-header` next to
  `#lang-select` with `id="theme-toggle"`, `data-i18n-title`, `data-i18n-aria`
  attributes per the existing header controls.
- `src/client.ts`: on click cycle `auto → light → dark`; set/remove
  `document.documentElement.dataset.theme`; persist as
  `localStorage.setItem("zip.cat.theme", value)` (match the
  `zip.cat.aiEngine` pattern); on startup, apply the stored value before
  first paint is not possible from client.js (loads late) — ALSO emit a
  tiny inline script in `renderPage()` head that reads
  `localStorage["zip.cat.theme"]` and sets `data-theme` synchronously to
  avoid a flash of wrong theme.

**Verify**: in the dev app — toggle cycles through three states; reload
preserves choice; with `auto` + OS dark mode (emulate via devtools), dark
palette applies.

### Step 6: Dark-mode visual sweep

In dark mode click through: search results table, AI response markdown,
suggestion sidebar, effort menu, format menu, slash-arg inputs, debug panel
(double-click a window), restaurant card, /weather card. Fix any token
mis-assignments found (tokens only — no new literals).

**Verify**: no unreadable text or invisible borders in the surfaces listed;
`grep -o '#[0-9a-fA-F]\{3,6\}\b' src/render.ts src/docs.ts | wc -l` still 0.

## Test plan

This is CSS; automated coverage is the greps in the done criteria plus
`bun run test` staying green. The behavioral bit (toggle persistence) gets a
manual check in Step 5; if plan 001's harness later grows DOM testing, add a
toggle unit test then (deferred).

## Done criteria

- [ ] `grep -o '#[0-9a-fA-F]\{3,6\}\b' src/render.ts src/docs.ts | wc -l` → 0
- [ ] `src/theme.ts` contains every color literal, each defined once
- [ ] Dark mode via OS preference AND via toggle both work; choice persists across reload
- [ ] Light mode is visually unchanged from before the plan
- [ ] `bunx tsc --noEmit` exits 0; `bun run test` exits 0 (if present)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `pageStyles` turns out to be consumed somewhere that can't see
  `src/theme.ts` (e.g. a build script string-manipulating the CSS) — report
  before restructuring.
- The number of distinct literals has grown far beyond ~53 since planning
  (drift) — re-inventory and report if the mapping no longer fits.
- Any step requires touching layout/spacing to make dark mode work.

## Maintenance notes

- New CSS must use `var(--token)`; reviewers should reject raw hex in
  `render.ts`/`docs.ts` (the grep in done criteria is CI-able later).
- The `data-theme`/localStorage contract is the seed for future named themes
  (e.g. `data-theme="solarized"`), which become new override blocks in
  `src/theme.ts` only.
- Follow-ups deliberately deferred: extracting CSS to a cacheable static
  asset (see plans/010), high-contrast theme, favicon/dark variants.
