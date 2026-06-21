import type { SearchResponse } from "./models";

const shortcutLabels = "123456789abcdefghijklmnopqrstuvwxyz".split("");

function renderEffortBars(effort = 3, levels = [1, 2, 3, 4, 5]) {
  const available = new Set(levels);
  const label = levels.length === 1 ? "DuckDuckGo Instant Answer" : `Effort ${effort} of 5`;
  return `<span class="effort-bars" data-effort="${effort}" aria-label="${label}" title="${label}">${[1, 2, 3, 4, 5]
    .map((level) => {
      const isAvailable = available.has(level);
      const classes = [
        "effort-bar",
        isAvailable && level <= effort ? "active" : "",
        isAvailable ? "" : "unavailable"
      ].filter(Boolean).join(" ");
      const title = isAvailable
        ? levels.length === 1 ? label : `Effort ${level} of 5`
        : `Level ${level} is not configured`;
      return `<span class="${classes}" data-effort-level="${level}" title="${title}" aria-hidden="true"></span>`;
    })
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
  staticBuild?: boolean;
}) {
  if (!options.query.trim()) {
    return "";
  }

  const query = escapeHtml(options.query);
  const status = options.error
    ? `<div class="status">${escapeHtml(options.error)}</div>`
    : "";

  const effort = options.staticBuild ? 1 : 3;
  const levels = options.staticBuild ? [1] : [1, 2, 3, 4, 5];

  return `<div class="query-row">
    <section class="entry" data-mode="search" data-effort="${effort}">
      <span class="status-label" aria-hidden="true">$0</span>
      ${renderEffortBars(effort, levels)}
      <form class="entry-form" action="/" method="get" autocomplete="off">
        <span class="prompt" aria-hidden="true">&gt;</span>
        <span class="input-shell">
          <textarea class="entry-input" aria-label="Previous search" name="q" rows="1">${query}</textarea>
          <span class="inline-inference-highlight" aria-hidden="true"></span>
        </span>
        <button class="voice-button" type="button" aria-label="Voice input" title="Voice input with Moonshine">●</button>
        <div class="slash-args" hidden></div>
      </form>
      <div class="results">
        ${status}
        ${renderRows(options.response)}
      </div>
      <div class="debug-panel" hidden></div>
    </section>
    <aside class="query-suggestions live-suggestions" aria-live="polite"></aside>
  </div>`;
}

export function renderPage(options: {
  query?: string;
  response?: SearchResponse;
  error?: string;
  staticBuild?: boolean;
}) {
  return `<!doctype html>
<html lang="en"${options.staticBuild ? ` data-zip-static="true"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zip.cat</title>
  <style>
${pageStyles}  </style>
</head>
<body>
  <main>
    <div id="transcript">
      ${renderEntry({
        query: options.query ?? "",
        response: options.response,
        error: options.error,
        staticBuild: options.staticBuild
      })}
    </div>
    <div class="query-row current-row">
      <section class="current-command" data-mode="search">
        <span class="status-label" aria-hidden="true">$0</span>
        ${renderEffortBars(options.staticBuild ? 1 : 3, options.staticBuild ? [1] : [1, 2, 3, 4, 5])}
        <form id="terminal-form" action="/" method="get" autocomplete="off">
          <span class="prompt" aria-hidden="true">&gt;</span>
          <span class="input-shell">
            <textarea autofocus aria-label="Search" name="q" rows="1"></textarea>
            <span class="inline-inference-highlight" aria-hidden="true"></span>
          </span>
          <button class="voice-button" type="button" aria-label="Voice input" title="Voice input with Moonshine">●</button>
          <div class="slash-args" hidden></div>
        </form>
      </section>
      <aside id="live-suggestions" class="query-suggestions live-suggestions" aria-live="polite"></aside>
    </div>
  </main>
  ${options.staticBuild ? `<script>window.ZIP_CAT_STATIC = true;</script>` : ""}
  <script type="module" src="/client.js"></script>
</body>
</html>`;
}

export const pageStyles = `    * { box-sizing: border-box; }
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
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: start;
      column-gap: 8px;
      width: 100%;
    }
    .entry-form:has(.slash-args:not([hidden])),
    #terminal-form:has(.slash-args:not([hidden])) {
      grid-template-columns: auto max-content minmax(120px, 220px) minmax(0, 1fr) auto;
    }
    .entry {
      border: 1px solid #d8d8d8;
      margin-bottom: 18px;
      padding: 32px 12px 12px;
      position: relative;
    }
    .current-command {
      border: 1px solid #d8d8d8;
      padding: 32px 12px 12px;
      position: relative;
    }
    .entry::before,
    .current-command::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 24px;
      border-top: 1px solid #d8d8d8;
    }
    .entry.run-active-ai {
      animation: ai-border-pulse 620ms linear infinite;
    }
    .entry.run-active-search {
      animation: search-border-pulse 620ms linear infinite;
    }
    .entry.run-active-ai::before,
    .entry.run-active-ai .results,
    .entry.run-active-ai .debug-panel {
      animation: ai-border-top-pulse 620ms linear infinite;
    }
    .entry.run-active-search::before,
    .entry.run-active-search .results,
    .entry.run-active-search .debug-panel {
      animation: search-border-top-pulse 620ms linear infinite;
    }
    .entry.run-active-ai .prompt {
      animation: ai-phase-pulse 620ms linear infinite;
    }
    .entry.run-active-search .prompt {
      animation: search-phase-pulse 620ms linear infinite;
    }
    .status-label {
      position: absolute;
      left: 8px;
      top: 4px;
      color: #666;
      font-size: 13px;
      line-height: 18px;
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
    .effort-bar.unavailable {
      background: transparent;
      border-color: #cfcfcf;
      opacity: 0.35;
    }
    .effort-menu {
      background: #fff;
      border: 1px solid #111;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
      display: flex;
      flex-direction: column;
      gap: 0;
      max-width: min(420px, calc(100vw - 16px));
      min-width: 320px;
      padding: 4px;
      position: fixed;
      z-index: 20;
    }
    .effort-menu-option {
      appearance: none;
      background: #fff;
      border: 0;
      color: #111;
      cursor: pointer;
      display: grid;
      gap: 2px;
      grid-template-columns: 70px minmax(0, 1fr);
      min-height: 34px;
      padding: 6px 8px;
      text-align: left;
    }
    .effort-menu-option:hover,
    .effort-menu-option.active {
      background: #f2f2f2;
    }
    .effort-menu-level {
      font-size: 13px;
      line-height: 1.25;
    }
    .effort-menu-detail {
      color: #444;
      font-size: 12px;
      line-height: 1.25;
      min-width: 0;
    }
    .run-status {
      align-items: center;
      background: transparent;
      border: 0;
      box-shadow: none;
      display: inline-flex;
      gap: 6px;
      position: absolute;
      right: 45px;
      top: 4px;
      font-size: 15px;
      height: 16px;
      line-height: 16px;
      overflow: visible;
    }
    .run-status-mark {
      background: transparent;
      border: 0;
      box-shadow: none;
      color: #c8c8c8;
      display: none;
      font: inherit;
      height: 16px;
      line-height: 16px;
      overflow: visible;
      text-shadow: none;
      transition: color 120ms ease;
    }
    .run-status-mark.used {
      display: inline-flex;
      align-items: center;
    }
    .run-status-mark[data-status-kind="ai"].active {
      animation: ai-phase-pulse 620ms linear infinite;
    }
    .run-status-mark[data-status-kind="search"].active {
      animation: search-phase-pulse 620ms linear infinite;
    }
    .run-status-mark.done {
      animation: none;
      color: #128a33;
    }
    .run-status-mark.error {
      animation: none;
      color: #b00020;
    }
    .model-load-progress {
      left: 72px;
      position: absolute;
      right: 176px;
      top: 4px;
      z-index: 2;
    }
    .model-progress {
      color: #555;
      display: grid;
      font-size: 11px;
      gap: 3px;
      line-height: 13px;
      min-width: 0;
    }
    .model-progress-row {
      align-items: baseline;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      min-width: 0;
      white-space: nowrap;
    }
    .model-progress-row span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .model-progress-row span:last-child {
      color: #777;
      flex: none;
    }
    .model-progress-track {
      background: #ececec;
      height: 2px;
      overflow: hidden;
      position: relative;
      width: 100%;
    }
    .model-progress-track span {
      background: #111;
      display: block;
      height: 100%;
      min-width: 2px;
      transition: width 160ms linear;
    }
    .model-progress-ready .model-progress-track span {
      background: #128a33;
      width: 100% !important;
    }
    .model-progress-error .model-progress-track span {
      background: #b00020;
      width: 100% !important;
    }
    .model-progress.indeterminate .model-progress-track span {
      animation: model-progress-indeterminate 900ms ease-in-out infinite;
      min-width: 30%;
      position: absolute;
      width: 30% !important;
    }
    @keyframes ai-phase-pulse {
      0%, 100% { color: #ff4d00; }
      20% { color: #ffcc00; }
      40% { color: #ff008c; }
      60% { color: #7c2cff; }
      80% { color: #00b7ff; }
    }
    @keyframes search-phase-pulse {
      0%, 100% { color: #0057ff; }
      20% { color: #00a3ff; }
      40% { color: #00d084; }
      60% { color: #b6f500; }
      80% { color: #009a44; }
    }
    @keyframes ai-border-pulse {
      0%, 100% { border-color: #ff4d00; }
      20% { border-color: #ffcc00; }
      40% { border-color: #ff008c; }
      60% { border-color: #7c2cff; }
      80% { border-color: #00b7ff; }
    }
    @keyframes search-border-pulse {
      0%, 100% { border-color: #0057ff; }
      20% { border-color: #00a3ff; }
      40% { border-color: #00d084; }
      60% { border-color: #b6f500; }
      80% { border-color: #009a44; }
    }
    @keyframes ai-border-top-pulse {
      0%, 100% { border-top-color: #ff4d00; }
      20% { border-top-color: #ffcc00; }
      40% { border-top-color: #ff008c; }
      60% { border-top-color: #7c2cff; }
      80% { border-top-color: #00b7ff; }
    }
    @keyframes search-border-top-pulse {
      0%, 100% { border-top-color: #0057ff; }
      20% { border-top-color: #00a3ff; }
      40% { border-top-color: #00d084; }
      60% { border-top-color: #b6f500; }
      80% { border-top-color: #009a44; }
    }
    @keyframes model-progress-indeterminate {
      0% { left: -30%; }
      100% { left: 100%; }
    }
    .prompt {
      font-size: 15px;
      font-weight: 400;
      line-height: 24px;
      transform: none;
    }
    input,
    textarea {
      -webkit-appearance: none;
      appearance: none;
      display: block;
      width: 100%;
      min-width: 0;
      min-height: 24px;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: transparent;
      color: #111;
      font: inherit;
      font-size: 15px;
      font-weight: 400;
      line-height: 24px;
      outline: 0 !important;
      overflow: hidden;
      overflow-wrap: anywhere;
      padding: 0;
      resize: none !important;
      white-space: pre-wrap;
    }
    textarea::-webkit-resizer {
      display: none;
    }
    .input-shell {
      display: block;
      font: inherit;
      font-size: 15px;
      font-weight: 400;
      grid-column: 2;
      grid-row: 1;
      line-height: 24px;
      min-height: 24px;
      min-width: 0;
      position: relative;
      width: 100%;
    }
    .input-shell .entry-input {
      background: transparent;
      line-height: 24px;
      position: relative;
      z-index: 1;
    }
    .voice-button {
      appearance: none;
      background: transparent;
      border: 0;
      color: #777;
      cursor: pointer;
      display: block;
      font: inherit;
      font-size: 11px;
      grid-column: 3;
      grid-row: 1;
      height: 24px;
      line-height: 24px;
      margin: 0;
      padding: 0 2px;
      text-align: center;
      width: 16px;
    }
    .voice-button:hover,
    .voice-button.recording {
      color: #111;
    }
    .voice-button.recording {
      animation: ai-phase-pulse 620ms linear infinite;
    }
    .voice-button.transcribing {
      animation: search-phase-pulse 620ms linear infinite;
    }
    .voice-button.error {
      color: #b00020;
    }
    .voice-menu {
      background: #fff;
      border: 1px solid #111;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
      display: grid;
      gap: 0;
      min-width: 280px;
      padding: 4px;
      position: fixed;
      z-index: 30;
    }
    .voice-menu button {
      appearance: none;
      background: #fff;
      border: 0;
      color: #111;
      cursor: pointer;
      display: grid;
      font: inherit;
      font-size: 13px;
      gap: 2px;
      grid-template-columns: 70px minmax(0, 1fr);
      line-height: 1.25;
      padding: 7px 8px;
      text-align: left;
    }
    .voice-menu button:hover,
    .voice-menu button.active {
      background: #f2f2f2;
    }
    .voice-menu span + span {
      color: #555;
      font-size: 12px;
    }
    .entry-form:has(.slash-args:not([hidden])) .voice-button,
    #terminal-form:has(.slash-args:not([hidden])) .voice-button {
      grid-column: 5;
    }
    .entry-form:has(.slash-args:not([hidden])) .input-shell,
    #terminal-form:has(.slash-args:not([hidden])) .input-shell,
    .entry-form:has(.slash-args:not([hidden])) .entry-input,
    #terminal-form:has(.slash-args:not([hidden])) textarea[name="q"] {
      width: var(--slash-command-width, auto);
    }
    .inline-inference-highlight {
      color: #111;
      display: none;
      font: inherit;
      font-size: 15px;
      font-weight: 400;
      inset: 0;
      letter-spacing: 0;
      line-height: 24px;
      overflow: visible;
      overflow-wrap: anywhere;
      pointer-events: none;
      position: absolute;
      text-align: left;
      text-shadow: none;
      white-space: pre-wrap;
      width: 100%;
      z-index: 2;
    }
    .entry.command-highlight-active .entry-input,
    .current-command.command-highlight-active textarea {
      color: transparent;
      caret-color: #111;
      text-shadow: none;
    }
    .entry.command-highlight-active .inline-inference-highlight,
    .current-command.command-highlight-active .inline-inference-highlight {
      display: block;
    }
    .inline-inference-glow {
      animation: inline-inference-color 900ms linear infinite;
      font: inherit;
      font-size: inherit;
      font-weight: inherit;
      line-height: inherit;
      text-shadow: none;
    }
    .slash-command-ghost {
      color: #b8b8b8;
      font: inherit;
      font-size: inherit;
      font-weight: inherit;
      line-height: inherit;
      text-shadow: none;
    }
    .window-ref-pill {
      background: #f3f3f3;
      border: 0;
      box-shadow: inset 0 0 0 1px #bdbdbd;
      color: #111;
      display: inline;
      font: inherit;
      line-height: inherit;
      padding: 0;
      pointer-events: auto;
      vertical-align: baseline;
    }
    .typed-output-pill {
      background: #f8f8f8;
      border: 0;
      color: #111;
      display: inline;
      font: inherit;
      line-height: inherit;
      outline: 1px solid #111;
      outline-offset: 2px;
      padding: 0;
      vertical-align: baseline;
    }
    .entry.window-reference-target,
    .current-command.window-reference-target {
      border-color: #111;
      background: #f7f7f7;
      box-shadow: inset 0 0 0 1px #111;
    }
    @keyframes inline-inference-color {
      0%, 100% { color: #a64600; }
      25% { color: #006278; }
      50% { color: #6f3bb8; }
      75% { color: #2c6b00; }
    }
    input::placeholder,
    textarea::placeholder { color: #b8b8b8; }
    .slash-args {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      grid-column: 3;
      grid-row: 1;
      margin: 0;
    }
    .slash-args[hidden] {
      display: none;
    }
    .slash-arg {
      align-items: center;
      border: 1px solid #d8d8d8;
      display: inline-grid;
      gap: 6px;
      grid-template-columns: minmax(0, 1fr);
      min-height: 28px;
      padding: 1px 6px;
    }
    .slash-arg-text {
      border: 0;
      border-bottom: 1px solid #999;
      border-radius: 0;
      min-height: 26px;
      min-width: var(--slash-arg-width, 8ch);
      padding: 1px 0;
      width: var(--slash-arg-width, 8ch);
    }
    .slash-arg-text:focus-within {
      border-bottom-color: #111;
    }
    .slash-arg > span,
    .slash-arg-choice legend {
      color: #666;
      font-size: 12px;
      line-height: 16px;
    }
    .slash-arg input {
      font-size: 13px;
      line-height: 18px;
      min-height: 18px;
    }
    .slash-arg-text input {
      background: transparent;
      border: 0;
      font-size: 15px;
      line-height: 24px;
      outline: none;
      padding: 0;
      width: 100%;
    }
    .slash-arg-text input::placeholder {
      color: #777;
    }
    .slash-arg-checkbox {
      grid-template-columns: auto auto;
    }
    .slash-arg-checkbox input,
    .slash-arg-choice input {
      appearance: auto;
      width: auto;
    }
    .slash-arg-choice {
      border: 1px solid #d8d8d8;
      display: flex;
      gap: 8px;
      margin: 0;
      padding: 2px 6px;
    }
    .results {
      border-top: 1px solid #d8d8d8;
      margin: 12px -12px 0;
      padding: 10px 12px 0;
      width: auto;
      position: relative;
    }
    /* Each turn: an editable * message followed by its reply. */
    .ai-turn + .ai-turn {
      border-top: 1px solid #d8d8d8;
      margin-top: 10px;
      padding-top: 10px;
    }
    .ai-turn .thread-followup {
      margin: 0;
    }
    .ai-turn-body {
      margin-top: 8px;
    }
    .ai-turn-body:empty {
      margin-top: 0;
    }
    /* Once a conversation has started, the entry's own prompt row is replaced by
       the editable turn messages, so hide it to avoid showing the first message
       twice. */
    .entry.ai-conversation > .entry-form {
      display: none;
    }
    .entry.ai-conversation > .results {
      border-top: 0;
      margin-top: 0;
      padding-top: 0;
    }
    .debug-panel {
      border-top: 1px solid #d8d8d8;
      margin: 12px -12px 0;
      padding: 10px 12px 0;
      width: auto;
    }
    .debug-panel[hidden] {
      display: none;
    }
    .debug-panel pre {
      background: #f7f7f7;
      border: 1px solid #d8d8d8;
      color: #111;
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      max-height: 70vh;
      overflow: auto;
      padding: 8px;
      white-space: pre;
    }
    .entry.flipped .entry-form,
    .entry.flipped .results {
      display: none;
    }
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
    .typed-response {
      display: grid;
      gap: 10px;
    }
    .typed-bool {
      font-size: 15px;
      line-height: 19px;
    }
    .restaurant-list {
      display: grid;
      gap: 12px;
    }
    .restaurant-card {
      border: 1px solid #d8d8d8;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr) 132px;
      padding: 10px;
    }
    .restaurant-card h3 {
      font-size: 15px;
      font-weight: 400;
      line-height: 19px;
      margin: 0;
    }
    .restaurant-card p {
      margin: 4px 0 0;
    }
    .restaurant-meta,
    .restaurant-address {
      color: #666;
      font-size: 13px;
      line-height: 18px;
    }
    .restaurant-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .restaurant-actions a {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .restaurant-map {
      align-items: center;
      border: 1px solid #d8d8d8;
      color: #666;
      display: flex;
      font-size: 13px;
      justify-content: center;
      min-height: 92px;
      padding: 8px;
      text-align: center;
    }
    .restaurant-map:hover {
      border-color: #111;
      color: #111;
      text-decoration: none;
    }
    .typed-json {
      background: #f7f7f7;
      border: 1px solid #d8d8d8;
      color: #111;
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      overflow: auto;
      padding: 8px;
      white-space: pre;
    }
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
    .slash-json {
      background: #f7f7f7;
      border: 1px solid #d8d8d8;
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      overflow: auto;
      padding: 8px;
      white-space: pre;
    }
    .weather-card {
      display: grid;
      gap: 10px;
      font-size: 15px;
      line-height: 1.35;
    }
    .weather-location {
      color: #555;
      font-size: 13px;
    }
    .weather-current {
      align-items: baseline;
      display: flex;
      gap: 12px;
    }
    .weather-temp {
      font-size: 34px;
      line-height: 1;
    }
    .weather-summary {
      font-size: 16px;
    }
    .weather-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }
    .weather-metrics div {
      border: 1px solid #d8d8d8;
      padding: 5px 7px;
    }
    .weather-metrics dt {
      color: #666;
      font-size: 12px;
    }
    .weather-metrics dd {
      margin: 0;
    }
    .weather-days {
      display: grid;
      gap: 4px;
    }
    .weather-day {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr) 74px 42px;
      gap: 8px;
    }
    .weather-day-date,
    .weather-day-rain {
      color: #666;
    }
    .weather-day-summary {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .weather-source {
      color: #777;
      font-size: 12px;
    }
    .lanes-card {
      display: grid;
      gap: 8px;
      font-size: 15px;
      line-height: 1.35;
    }
    .lanes-heading {
      color: #555;
      font-size: 13px;
    }
    .lanes-empty {
      color: #777;
    }
    .lanes-list {
      display: grid;
      gap: 4px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .lanes-row {
      display: grid;
      grid-template-columns: minmax(96px, auto) minmax(120px, auto) auto 1fr;
      gap: 12px;
      margin: 0;
    }
    .lanes-day {
      color: #111;
    }
    .lanes-time {
      color: #111;
    }
    .lanes-lane {
      color: #333;
    }
    .lanes-who {
      color: #777;
      text-align: right;
    }
    .lanes-source {
      color: #777;
      font-size: 12px;
    }
    .cache-chip {
      position: absolute;
      top: 6px;
      right: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #999;
    }
    .cache-chip-stale .cache-age {
      color: #b26a00;
    }
    .cache-age {
      font-variant-numeric: tabular-nums;
      cursor: default;
    }
    .cache-refresh {
      appearance: none;
      background: transparent;
      border: 1px solid #d8d8d8;
      border-radius: 3px;
      color: #555;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      line-height: 1;
      padding: 2px 5px;
    }
    .cache-refresh:hover {
      background: #f3f3f3;
      color: #111;
    }
    .entry.run-active-search .cache-refresh {
      opacity: 0.5;
      pointer-events: none;
    }
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
      .slash-args {
        grid-column: 2;
        grid-row: auto;
        margin-top: 8px;
      }
      .weather-metrics,
      .weather-day,
      .restaurant-card {
        grid-template-columns: 1fr;
      }
    }
`;
