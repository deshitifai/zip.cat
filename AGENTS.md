# Cat Site Deployment Guide For Agents

Use this guide whenever creating, deploying, or repairing any `.cat` site in
`~/projects`.

## Default Stack

- Registrar: Namecheap.
- Authoritative DNS: Cloudflare zone for the apex domain.
- Hosting: Cloudflare Pages.
- Automation: GitHub Actions.
- Secrets: never commit `.env`; mirror required values into GitHub Actions
  secrets.

## New Domain Launch

1. Register the domain in Namecheap.
2. Enable auto-renew.
3. Create the Cloudflare zone for the apex domain.
4. Copy the two Cloudflare nameservers into Namecheap as custom nameservers.
5. Wait until Cloudflare marks the zone active.
6. Create or update the site repo.
7. Add a deploy script or workflow that stages a clean `dist/` or `public/`
   directory. Do not deploy `node_modules`.
8. Create the Cloudflare Pages project.
9. Deploy the staged directory.
10. Attach custom domains to the Pages project.
11. Upsert Cloudflare DNS records to the Pages target.
12. Add or update the CATS inventory/dashboard entry.

Cloudflare can automate Pages and DNS only after the zone exists and Namecheap
nameservers point at Cloudflare. Namecheap registration and nameserver changes
are manual unless Namecheap API credentials are present and the runner IP is
allowlisted.

## Required Secrets

Every deploying GitHub repo should have:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Single-zone repos can use:

- `CLOUDFLARE_ZONE_ID`

Multi-zone or standalone apex repos can use zone-specific names:

- `CLOUDFLARE_ZONE_ID_DEW_CAT`
- `CLOUDFLARE_ZONE_ID_FLW_CAT`
- `CLOUDFLARE_ZONE_ID_WRK_CAT`

Event or duplicate-detection builds may also need:

- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`

## DNS Rules

- Prefer CNAME records pointing to `<pages-project>.pages.dev`.
- Use `proxied: true`.
- Upsert records; do not blindly create duplicates.
- Do not delete existing DNS records unless the user explicitly asks.
- For apex domains on Cloudflare, CNAME flattening allows a CNAME-like Pages
  target at the apex.

## Cloudflare Pages Rules

- Prefer the repo's deploy script over raw Wrangler when present.
- Treat "Pages project already exists" as success.
- Treat "domain already attached" as success.
- Always stage a minimal artifact directory before deploy.
- Keep branch as `main` unless the site profile says otherwise.

## Per-Site Commands

| Repo | Update/build/deploy path |
| --- | --- |
| `lite.cat` | `npm ci`; `python3 scripts/scrape_events.py --site <site>`; `python3 scripts/build_site.py --site <site>`; `python3 scripts/deploy_cloudflare.py --site <site>` |
| `mve.cat` | `npm ci`; `python3 scripts/scrape_showtimes.py --site northbay`; `python3 scripts/build_site.py --site northbay`; `python3 scripts/build_site.py --site home`; `python3 scripts/deploy_cloudflare.py --site northbay`; `python3 scripts/deploy_cloudflare.py --site home` |
| `flw.cat` | `npm ci`; `npm run update`; `npm test`; `npm run build`; stage `index.html data.json query.js schema.json assets/`; deploy `flw-cat` |
| `wrk.cat` | `npm ci`; `npm run prepare`; `npm run deploy` |
| `dew.cat` | stage `index.html styles.css script.js`; deploy `dew-cat` |
| `zip.cat` | inspect `package.json` before deploy; add this repo to CATS inventory before launch |

## zip.cat Local Development

The user runs the local zip.cat dev server. Agents should not start, stop, or
restart the server unless the user explicitly asks.

Use this command for hot reloading during local development:

```sh
bun run dev
```

The `dev` script runs `bun --watch src/server.ts`, which restarts the server
process when server-side files change. The server also rebuilds `/client.js` on
each request during local development, so browser/client changes are picked up by
reloading the page. If a browser view looks stale, reload the page rather than
restarting the server.

## GitHub Actions Baseline

Each site repo should have `.github/workflows/deploy.yml` with:

- `push` on `main`
- `workflow_dispatch`
- scheduled runs appropriate to freshness needs
- `concurrency` to avoid overlapping production deploys
- install/update/build/deploy steps
- Cloudflare secrets from GitHub Actions

Time-sensitive sites must scrape or crawl before build:

- Event sites: daily local midnight.
- Movie/showtime sites: daily local midnight.
- Social/feed crawler sites: every 6 hours unless rate limits require less.
- Jobs/listings: at least twice daily once crawling exists.
- Static utilities: weekly redeploy/smoke check.

## Agent Safety

- Never print secret values.
- Never commit `.env`.
- Never publish a repo publicly.
- Do not revert unrelated local changes.
- Confirm before first public launch of a brand-new domain.
- Prefer additive fixes and idempotent Cloudflare API calls.
