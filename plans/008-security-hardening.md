# Plan 008: Defense-in-depth hardening — CSP headers, server-side input limits, complete build-time secret scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9730c9..HEAD -- src/server.ts functions/api/ scripts/build_static.ts scripts/build_pages.ts src/slash/qr.ts`
> Written against commit `d9730c9` plus uncommitted working-tree changes.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (composes with plans/004 if it lands first)
- **Category**: security
- **Planned at**: commit `d9730c9`, 2026-07-02
- **Issue**: https://github.com/deshitifai/zip.cat/issues/18 (published with
  maintainer approval)

## Why this matters

Defensive maintenance, no known exploit: (1) HTML responses carry no
Content-Security-Policy, so the app's XSS posture rests entirely on its
(good) sanitizers — `escapeHtml` everywhere plus a DOMParser-allowlist
`sanitizeMarkdownHtml` for AI markdown. A CSP makes a future sanitizer bug
non-exploitable instead of exploitable. (2) `/api/slash` accepts
`args: t.Record(t.String(), t.Unknown())` with no size limits; `/qr`
enforces its 900-char limit client-side only. (3) The static/pages build
secret scans are incomplete: `scripts/build_static.ts` checks env-var *names*
only, `scripts/build_pages.ts` checks values but skips values shorter than
8 chars and omits `CANON_POOL_LOGIN`, `CANON_POOL_PASSWORD`, and
`TURBOPUFFER_API_KEY` from both lists.

## Current state

- `src/server.ts` — `html()` helper (~line 69) returns only
  `content-type: text/html; charset=utf-8`. HTML routes: `/` and `/docs`.
  Inline `<style>` and an inline i18n `<script>` are load-bearing
  (`renderPage()` in `src/render.ts`), and `client.js` is same-origin; the
  page loads favicons from `https://www.google.com/s2/favicons` and QR
  images from `https://api.qrserver.com`; browser voice/AI workers load
  same-origin scripts + fetch model weights from `https://huggingface.co`
  (check `src/browserMoonshineWorker.ts`/`browserGemmaWorker.ts` for exact
  hosts before writing the policy).
- Static deploy: Cloudflare Pages serves `dist/static/`; Pages supports a
  `_headers` file at the output root for response headers.
- `functions/api/[[path]].ts` — `json()` helper sets only
  `cache-control: no-store`.
- `src/server.ts:350-361` area — `/api/slash` body schema:
  `args: t.Record(t.String(), t.Unknown())`.
- `src/slash/qr.ts:70-88` — 900-char validation exists in the client-side
  path only; the command's server `run` does not re-check.
- `scripts/build_static.ts:27-43`:

```ts
async function assertNoSecrets(paths: string[]) {
  const forbidden = ["EXA_API_KEY","SERP_API_KEY","OPENROUTER_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"];
  // name-substring scan over artifacts
}
```

- `scripts/build_pages.ts:27-46`:

```ts
async function assertNoSecretValues(paths: string[]) {
  const secretValues = [same six names].flatMap((name) => {
    const value = process.env[name];
    return value && value.length >= 8 ? [value] : [];
  });
  // value-substring scan over artifacts
}
```

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bunx tsc --noEmit` | exit 0              |
| Tests     | `bun run test`      | exit 0              |
| Builds    | `bun run build:static && bun run build:pages` | exit 0 |
| Header check | `curl -sI http://localhost:3000/ \| grep -i content-security` | CSP present |

## Scope

**In scope**:
- `src/server.ts` (`html()` headers; `/api/slash` size limits)
- `scripts/build_static.ts`, `scripts/build_pages.ts` (secret-scan
  completeness + emit `_headers`)
- `src/slash/qr.ts` (server-side length check)

**Out of scope**:
- Rewriting `sanitizeMarkdownHtml` or any sanitizer (works; separate
  review if ever needed).
- Auth/rate limiting (product decision, not hardening).
- The debug panel's response metadata (documented feature).
- CORS changes: the API sends no `Access-Control-Allow-Origin`, which is
  already the restrictive default (cross-origin reads blocked). Do NOT add
  permissive CORS.

## Git workflow

- Branch: `advisor/008-hardening`; one commit per step; do NOT push or open
  a PR unless the operator instructed it.

## Steps

### Step 1: Inventory external origins, then add CSP to server HTML

First enumerate real external loads: grep `https://` across `src/render.ts`,
`src/client.ts`, `src/docs.ts`, worker files; expect at least Google
favicons (img), qrserver (img), huggingface (connect/fetch from workers).
Then set on `html()` responses:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
connect-src 'self' <the worker model hosts you found>;
worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

(`'unsafe-inline'` script is required by the inline i18n script — note in a
comment; tightening to nonces is a follow-up.) Also add
`X-Content-Type-Options: nosniff` and `Referrer-Policy:
no-referrer-when-downgrade` (or stricter).

**Verify**: `bun run dev`; the app fully works with devtools console open —
NO CSP violation reports while: searching, AI prompt, /qr render, voice
init, /docs. `curl -sI http://localhost:3000/ | grep -i content-security` →
header present.

### Step 2: Same headers for the static deployment via `_headers`

In `scripts/build_static.ts` and `scripts/build_pages.ts`, write a
`_headers` file into the output dir with the same policy for `/*`. Source
the policy string from ONE shared constant (new small module
`src/securityHeaders.ts`) so server and static can't drift.

**Verify**: `bun run build:static && bun run build:pages` → exit 0;
`cat dist/static/_headers` shows the policy; serve dist statically
(`bun run dev` serves :3001) and confirm the static app works without CSP
violations.

### Step 3: Server-side input limits

- `/api/slash` (server.ts): before dispatch, reject bodies where
  `JSON.stringify(args).length > 10_000` with a 400 and clear message.
- `src/slash/qr.ts`: enforce the existing 900-char limit inside the
  command's argument parsing/run (server path), mirroring the client
  message.

**Verify**: `curl -s -X POST localhost:3000/api/slash -H 'content-type: application/json' -d '{"query":"/qr","args":{"data":"'"$(python3 -c 'print("a"*2000)')"'"}}'`
→ 4xx with the length error, not a 502. `bun run test` → exit 0.

### Step 4: Complete the build secret scans

Factor one list of secret env-var names —
`["EXA_API_KEY","SERP_API_KEY","OPENROUTER_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","CANON_POOL_LOGIN","CANON_POOL_PASSWORD","TURBOPUFFER_API_KEY"]`
— into the shared module from Step 2. Both build scripts scan artifacts for
(a) the names (as today) AND (b) the values of any that are set in the
build env; replace the `length >= 8` skip with: values shorter than 8 chars
emit a build WARNING (they're too short to substring-scan safely) instead
of being silently ignored. NEVER print the value itself — print the NAME.

**Verify**: `EXA_API_KEY=fake-value-123456 bun run build:pages` → exit 0
(value not in artifacts). Then prove the tripwire: temporarily append
`console.log("fake-value-123456")` to `src/client.ts`, rerun → build FAILS
naming EXA_API_KEY; revert the temporary line.

## Test plan

- Steps carry their own curl/build verifications; the CSP smoke in Step 1
  (full app click-through with console open) is the critical one.
- `bun run test` green throughout.

## Done criteria

- [ ] `curl -sI localhost:3000/` shows CSP + nosniff headers; no CSP violations during the Step 1 click-through
- [ ] `dist/static/_headers` exists with the same policy (both build scripts)
- [ ] Oversized `/qr` data and >10KB slash args rejected server-side with 4xx
- [ ] Secret scan covers all nine names in BOTH scripts, values scanned when set, short values warn; tripwire test demonstrated
- [ ] `bunx tsc --noEmit`, `bun run test`, both builds exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The CSP breaks a load you can't attribute (unknown origin in violation
  report) — report the origin; do not loosen to wildcards beyond `img-src
  https:`.
- Cloudflare Pages `_headers` conflicts with existing project config you
  find in `wrangler.jsonc` or the dashboard-managed settings — report.
- Any change would require printing a secret value to logs to debug.

## Maintenance notes

- New external resource loads (fonts, APIs, CDNs) must be added to
  `src/securityHeaders.ts` — CSP violations in the console are the signal.
- Follow-ups deferred: nonce-based script-src (drop 'unsafe-inline'),
  Permissions-Policy, rate limiting on /api.
- Reviewer: confirm no secret value appears in any diff, log, or test.
