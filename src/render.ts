import type { SearchResponse } from "./models";

const shortcutLabels = "123456789abcdefghijklmnopqrstuvwxyz".split("");

function renderEffortBars(effort = 3) {
  return `<span class="effort-bars" data-effort="${effort}" aria-label="Effort ${effort} of 5" title="Effort ${effort} of 5">${[1, 2, 3, 4, 5]
    .map((level) => `<span class="effort-bar${level <= effort ? " active" : ""}" data-effort-level="${level}" title="Effort ${level} of 5" aria-hidden="true"></span>`)
    .join("")}</span>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function originForUrl(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function renderRows(response?: SearchResponse) {
  const resultSets = response?.resultSets.filter((resultSet) => (
    resultSet.placement.target === "results" &&
    resultSet.placement.renderer === "url-table"
  ));

  if (!resultSets || resultSets.length === 0) {
    return "";
  }

  const rows = resultSets.flatMap((resultSet) => resultSet.results);
  if (rows.length === 0) {
    return "";
  }

  return `<table><tbody>${rows
    .map((result, index) => {
      const url = escapeHtml(result.url);
      const title = escapeHtml(result.title?.trim() || result.url);
      const origin = escapeHtml(originForUrl(result.url));
      const favicon = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(result.url)}&sz=16`;
      const shortcut = shortcutLabels[index];
      const shortcutMarkup = shortcut
        ? `<span class="shortcut" aria-hidden="true">${shortcut}</span>`
        : "";
      return `<tr><td>${shortcutMarkup}<a class="url-line" data-shortcut="${shortcut ?? ""}" href="${url}" title="${url}" target="_blank" rel="noreferrer"><img class="favicon" alt="" src="${favicon}"><span>${origin}</span></a><a class="title" href="${url}" title="${url}" target="_blank" rel="noreferrer">${title}</a></td></tr>`;
    })
    .join("")}</tbody></table>`;
}

function renderEntry(options: {
  query: string;
  response?: SearchResponse;
  error?: string;
}) {
  if (!options.query.trim()) {
    return "";
  }

  const query = escapeHtml(options.query);
  const status = options.error
    ? `<div class="status">${escapeHtml(options.error)}</div>`
    : "";

  return `<div class="query-row">
    <section class="entry" data-mode="search" data-effort="3">
      ${renderEffortBars(3)}
      <form class="entry-form" action="/" method="get" autocomplete="off">
        <span class="prompt" aria-hidden="true">&gt;</span>
        <input class="entry-input" aria-label="Previous search" name="q" value="${query}">
      </form>
      <div class="results">
        ${status}
        ${renderRows(options.response)}
      </div>
    </section>
    <aside class="query-suggestions live-suggestions" aria-live="polite"></aside>
  </div>`;
}

export function renderPage(options: {
  query?: string;
  response?: SearchResponse;
  error?: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zip.cat</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      background: #fff;
      color: #111;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    main {
      width: min(960px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 48px;
    }
    .query-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(180px, 260px);
      gap: 22px;
      align-items: start;
    }
    .line,
    form {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      column-gap: 8px;
      width: 100%;
    }
    .entry {
      border: 1px solid #d8d8d8;
      margin-bottom: 18px;
      padding: 10px 12px 12px;
      position: relative;
    }
    .current-command {
      border: 1px solid #d8d8d8;
      padding: 10px 12px 12px;
      position: relative;
    }
    .effort-bars {
      display: inline-flex;
      align-items: end;
      cursor: pointer;
      gap: 2px;
      height: 12px;
      position: absolute;
      right: 8px;
      top: 6px;
    }
    .effort-bar {
      border: 1px solid #aaa;
      display: block;
      width: 4px;
    }
    .effort-bar:nth-child(1) { height: 4px; }
    .effort-bar:nth-child(2) { height: 6px; }
    .effort-bar:nth-child(3) { height: 8px; }
    .effort-bar:nth-child(4) { height: 10px; }
    .effort-bar:nth-child(5) { height: 12px; }
    .effort-bar.active {
      background: #111;
      border-color: #111;
    }
    .prompt {
      font-size: 15px;
      font-weight: 400;
      line-height: 1;
      transform: none;
    }
    input {
      display: block;
      width: 100%;
      min-width: 0;
      height: 24px;
      border: 0;
      border-radius: 0;
      background: #fff;
      color: #111;
      font: inherit;
      font-size: 15px;
      font-weight: 400;
      outline: none;
      padding: 0;
    }
    input::placeholder { color: #b8b8b8; }
    .results { margin-top: 10px; width: 100%; }
    .live-suggestions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 24px;
      margin: 0;
    }
    .wiki-pill {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 7px;
      max-width: 100%;
      border: 1px solid #d8d8d8;
      color: #111;
      font-size: 13px;
      line-height: 1.25;
      padding: 3px 7px;
      text-decoration: none;
      vertical-align: top;
    }
    .suggestion-shortcut {
      visibility: hidden;
      color: #111;
      min-width: 12px;
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
    }
    .live-suggestions.shortcuts-active .suggestion-shortcut { visibility: visible; }
    .wiki-pill:hover { text-decoration: none; border-color: #111; }
    .wiki-pill.selected {
      border-color: #111;
      background: #f5f5f5;
    }
    .wiki-pill-source { color: #666; }
    .wiki-pill-body {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      min-width: 0;
      grid-column: 1;
      grid-row: 1;
    }
    .wiki-pill-favicon {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
    }
    .wiki-pill-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wiki-pill-description {
      color: #555;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wiki-pill-expanded-description {
      display: none;
      flex: 0 0 100%;
      color: #333;
      line-height: 1.35;
      white-space: normal;
    }
    .wiki-pill:hover .wiki-pill-description,
    .wiki-pill:focus .wiki-pill-description {
      display: none;
    }
    .wiki-pill:hover .wiki-pill-expanded-description,
    .wiki-pill:focus .wiki-pill-expanded-description {
      display: block;
    }
    .status, .meta { color: #555; font-size: 13px; }
    .meta { margin-bottom: 8px; padding-left: 2px; }
    .ai-response {
      font-size: 15px;
      line-height: 1.45;
    }
    .ai-response > :first-child { margin-top: 0; }
    .ai-response > :last-child { margin-bottom: 0; }
    .ai-response p,
    .ai-response ul,
    .ai-response ol,
    .ai-response blockquote,
    .ai-response pre,
    .ai-response table {
      margin: 0 0 12px;
    }
    .ai-response h1,
    .ai-response h2,
    .ai-response h3,
    .ai-response h4,
    .ai-response h5,
    .ai-response h6 {
      font-size: 15px;
      line-height: 1.35;
      margin: 0 0 8px;
    }
    .ai-response ul,
    .ai-response ol { padding-left: 22px; }
    .ai-response li { margin: 3px 0; }
    .ai-response blockquote {
      border-left: 2px solid #d8d8d8;
      color: #444;
      padding-left: 10px;
    }
    .ai-response code {
      background: #f5f5f5;
      font: inherit;
      padding: 1px 3px;
    }
    .ai-response pre {
      background: #f5f5f5;
      overflow-x: auto;
      padding: 8px;
      white-space: pre;
    }
    .ai-response pre code {
      background: transparent;
      padding: 0;
    }
    .ai-response a { text-decoration: underline; }
    .ai-link-shortcut {
      display: none;
      color: #111;
      font-size: 12px;
      margin-left: 4px;
      text-decoration: none;
    }
    .entry.shortcuts-active .ai-link-shortcut { display: inline; }
    .ai-response table {
      border-collapse: collapse;
      table-layout: auto;
      width: 100%;
    }
    .ai-response th,
    .ai-response td {
      border: 1px solid #d8d8d8;
      height: auto;
      padding: 4px 6px;
      position: static;
      vertical-align: top;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { height: 54px; padding: 8px 22px 8px 0; position: relative; overflow: hidden; }
    a { color: #111; text-decoration: none; }
    a:hover { text-decoration: none; }
    .url-line:hover { text-decoration: underline; }
    .url-line {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #666;
      font-size: 12px;
      line-height: 19px;
      height: 19px;
      min-width: 0;
    }
    .url-line span,
    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .favicon {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
    }
    .title { display: block; font-size: 15px; line-height: 19px; height: 19px; }
    .title:hover { text-decoration: none; }
    .shortcut {
      display: none;
      position: absolute;
      right: 0;
      top: 17px;
      color: #111;
      font-size: 15px;
      line-height: 1.35;
    }
    .entry.shortcuts-active .shortcut { display: inline; }
    @media (max-width: 720px) {
      .query-row {
        grid-template-columns: 1fr;
      }
      .live-suggestions {
        order: 2;
      }
    }
  </style>
</head>
<body>
  <main>
    <div id="transcript">
      ${renderEntry({
        query: options.query ?? "",
        response: options.response,
        error: options.error
      })}
    </div>
    <div class="query-row current-row">
      <section class="current-command">
        ${renderEffortBars(3)}
        <form id="terminal-form" action="/" method="get" autocomplete="off">
          <span class="prompt" aria-hidden="true">&gt;</span>
          <input autofocus aria-label="Search" name="q" value="">
        </form>
      </section>
      <aside id="live-suggestions" class="query-suggestions live-suggestions" aria-live="polite"></aside>
    </div>
  </main>
  <script type="module" src="/client.js"></script>
</body>
</html>`;
}
