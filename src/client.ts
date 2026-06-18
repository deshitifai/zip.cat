import { marked } from "marked";

type SearchResult = {
  title?: string;
  url: string;
};

type SearchResponse = {
  results: SearchResult[];
};

type Suggestion = {
  title: string;
  url: string;
  description?: string;
  fullDescription?: string;
  provider: string;
};

type SuggestResponse = {
  suggestions: Suggestion[];
};

type AiResponse = {
  text: string;
  model: string;
  provider: string;
};

type CommandMode = "search" | "ai";
type EffortLevel = 1 | 2 | 3 | 4 | 5;
type GeneratorDescriptor = {
  id: string;
  name: string;
  kind: "web-search" | "ai";
  provider: string;
  api: string;
  effort: EffortLevel;
  label: string;
  detail: string;
};
type EffortConfig = {
  search: {
    provider: string;
    api: string;
    levels: Record<string, GeneratorDescriptor>;
  };
  ai: {
    provider: string;
    api: string;
    levels: Record<string, GeneratorDescriptor>;
  };
};

const shortcutLabels = "123456789abcdefghijklmnopqrstuvwxyz".split("");
const allowedMarkdownTags = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DEL",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL"
]);

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

function renderRows(results: SearchResult[]) {
  if (results.length === 0) {
    return "";
  }

  return `<table><tbody>${results
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

function effortBarsMarkup(effort: EffortLevel, mode: CommandMode = "search") {
  return `<span class="effort-bars" data-effort="${effort}" aria-label="Effort ${effort} of 5" title="${escapeHtml(effortDescription(mode, effort))}">${[1, 2, 3, 4, 5]
    .map((level) => `<span class="effort-bar${level <= effort ? " active" : ""}" data-effort-level="${level}" title="${escapeHtml(effortDescription(mode, level as EffortLevel))}" aria-hidden="true"></span>`)
    .join("")}</span>`;
}

function renderEntry(query: string, content: string, mode: CommandMode = "search", effort: EffortLevel = 3) {
  const prompt = mode === "ai" ? "*" : "&gt;";
  return `<div class="query-row">
    <section class="entry" data-mode="${mode}" data-effort="${effort}">
      ${effortBarsMarkup(effort, mode)}
      <form class="entry-form" action="/" method="get" autocomplete="off">
        <span class="prompt" aria-hidden="true">${prompt}</span>
        <input class="entry-input" aria-label="Previous search" name="q" value="${escapeHtml(query)}">
      </form>
      <div class="results">${content}</div>
    </section>
    <aside class="query-suggestions live-suggestions" aria-live="polite"></aside>
  </div>`;
}

function scrollToPrompt() {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth"
    });
  });
}

const form = document.querySelector<HTMLFormElement>("#terminal-form");
const input = document.querySelector<HTMLInputElement>('#terminal-form input[name="q"]');
const transcript = document.querySelector<HTMLElement>("#transcript");
const commandPrompt = document.querySelector<HTMLElement>("#terminal-form .prompt");
const currentCommand = document.querySelector<HTMLElement>(".current-command");
let suggestAbort: AbortController | undefined;
let suggestTimer: number | undefined;
let commandMode: CommandMode = "search";
let effortLevel: EffortLevel = 3;
let effortConfig: EffortConfig | undefined;

function normalizeEffortLevel(level: number) {
  return Math.min(Math.max(Math.round(level), 1), 5) as EffortLevel;
}

function effortDescription(mode: CommandMode, effort: EffortLevel) {
  if (mode === "ai") {
    const generator = effortConfig?.ai.levels[String(effort)];
    return generator
      ? `Effort ${effort} of 5: ${generator.name}; ${generator.api} via ${generator.provider}, ${generator.detail}`
      : `Effort ${effort} of 5: AI model level ${effort}`;
  }

  const generator = effortConfig?.search.levels[String(effort)];
  return generator
    ? `Effort ${effort} of 5: ${generator.name}; ${generator.api}, ${generator.detail}`
    : `Effort ${effort} of 5: Exa search effort level ${effort}`;
}

function updateEffortBars(bars: HTMLElement, effort: EffortLevel, mode: CommandMode) {
  bars.dataset.effort = String(effort);
  bars.setAttribute("aria-label", `Effort ${effort} of 5`);
  bars.setAttribute("title", effortDescription(mode, effort));
  bars.innerHTML = [1, 2, 3, 4, 5]
    .map((level) => `<span class="effort-bar${level <= effort ? " active" : ""}" data-effort-level="${level}" title="${escapeHtml(effortDescription(mode, level as EffortLevel))}" aria-hidden="true"></span>`)
    .join("");
}

function modeForBars(bars: HTMLElement) {
  return bars.closest<HTMLElement>(".entry")?.dataset.mode === "ai" ? "ai" : commandMode;
}

function refreshEffortTitles() {
  document.querySelectorAll<HTMLElement>(".effort-bars").forEach((bars) => {
    const effort = normalizeEffortLevel(Number(bars.dataset.effort ?? 3));
    updateEffortBars(bars, effort, modeForBars(bars));
  });
}

function setEffortLevel(level: number) {
  effortLevel = normalizeEffortLevel(level);
  const bars = currentCommand?.querySelector<HTMLElement>(".effort-bars");
  if (bars) {
    updateEffortBars(bars, effortLevel, commandMode);
  }
}

function activeEffortContext() {
  const sourceInput = activeSearchInput();
  const entry = sourceInput?.closest<HTMLElement>(".entry");
  if (entry) {
    const bars = entry.querySelector<HTMLElement>(".effort-bars");
    const effort = normalizeEffortLevel(Number(entry.dataset.effort ?? bars?.dataset.effort ?? 3));
    const mode: CommandMode = entry.dataset.mode === "ai" ? "ai" : "search";
    return { bars, entry, effort, mode };
  }

  if (sourceInput === input) {
    const bars = currentCommand?.querySelector<HTMLElement>(".effort-bars");
    return { bars, entry: undefined, effort: effortLevel, mode: commandMode };
  }

  return undefined;
}

function adjustActiveEffort(delta: -1 | 1) {
  const context = activeEffortContext();
  if (!context?.bars) {
    return false;
  }

  const nextEffort = normalizeEffortLevel(context.effort + delta);
  if (context.entry) {
    context.entry.dataset.effort = String(nextEffort);
    updateEffortBars(context.bars, nextEffort, context.mode);
  } else {
    setEffortLevel(nextEffort);
  }

  return true;
}

function setCommandMode(mode: CommandMode) {
  commandMode = mode;
  const bars = currentCommand?.querySelector<HTMLElement>(".effort-bars");
  if (bars) {
    updateEffortBars(bars, effortLevel, commandMode);
  }
  if (commandPrompt) {
    commandPrompt.textContent = mode === "ai" ? "*" : ">";
  }
  if (input) {
    input.setAttribute("aria-label", mode === "ai" ? "AI prompt" : "Search");
  }
  if (mode === "ai" && input) {
    clearSuggestionsFor(input);
    suggestAbort?.abort();
  }
}

function activeSearchInput() {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.matches('#terminal-form input[name="q"], .entry-input')) {
    return active;
  }

  return undefined;
}

function shortcutFromCode(code: string) {
  if (/^Digit[1-9]$/.test(code)) {
    return code.replace("Digit", "");
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.replace("Key", "").toLowerCase();
  }

  return undefined;
}

function clearShortcutContext() {
  document.querySelectorAll<HTMLElement>(".live-suggestions.shortcuts-active").forEach((suggestions) => {
    suggestions.classList.remove("shortcuts-active");
  });
  document.querySelectorAll<HTMLElement>(".entry.shortcuts-active").forEach((entry) => {
    entry.classList.remove("shortcuts-active");
  });
}

function activeEntryContext() {
  return document.activeElement?.closest<HTMLElement>(".entry");
}

function latestEntryContext() {
  return Array.from(document.querySelectorAll<HTMLElement>(".entry")).at(-1);
}

function resultShortcutContext() {
  const activeEntry = activeEntryContext();
  if (activeEntry) {
    return activeEntry;
  }

  if (input && document.activeElement === input && input.value.trim().length === 0) {
    return latestEntryContext();
  }

  return undefined;
}

function shortcutRowContext() {
  const sourceInput = activeSearchInput();
  if (sourceInput && sourceInput.value.trim().length > 0) {
    return sourceInput.closest<HTMLElement>(".query-row");
  }

  return resultShortcutContext()?.closest<HTMLElement>(".query-row");
}

function suggestionContextFor(searchInput: HTMLInputElement) {
  return searchInput.closest<HTMLElement>(".query-row")?.querySelector<HTMLElement>(".query-suggestions");
}

function resultShortcutCountFor(searchInput: HTMLInputElement) {
  return searchInput
    .closest(".query-row")
    ?.querySelectorAll(".results a[data-shortcut]").length ?? 0;
}

function assignAiLinkShortcuts(results: HTMLElement, offset = 0) {
  results.querySelectorAll<HTMLAnchorElement>(".ai-response a[href]").forEach((link, index) => {
    const shortcut = shortcutLabels[index + offset] ?? "";
    link.dataset.shortcut = shortcut;
    link.querySelector(".ai-link-shortcut")?.remove();
    if (!shortcut) {
      return;
    }

    const label = document.createElement("span");
    label.className = "ai-link-shortcut";
    label.setAttribute("aria-hidden", "true");
    label.textContent = shortcut;
    link.append(label);
  });
}

function renumberSuggestionShortcuts(searchInput: HTMLInputElement) {
  const suggestionContext = suggestionContextFor(searchInput);
  if (!suggestionContext) {
    return;
  }

  const shortcutOffset = resultShortcutCountFor(searchInput);
  suggestionContext.querySelectorAll<HTMLAnchorElement>(".wiki-pill").forEach((pill, index) => {
    const shortcut = shortcutLabels[index + shortcutOffset] ?? "";
    pill.dataset.shortcut = shortcut;
    const label = pill.querySelector<HTMLElement>(".suggestion-shortcut");
    if (label) {
      label.textContent = shortcut;
    }
  });
}

function activeSuggestionContext() {
  const sourceInput = activeSearchInput();
  return sourceInput ? suggestionContextFor(sourceInput) : undefined;
}

function setShortcutsActive(active: boolean) {
  clearShortcutContext();

  if (!active) {
    return;
  }

  const sourceInput = activeSearchInput();
  if (sourceInput && sourceInput.value.trim().length > 0) {
    suggestionContextFor(sourceInput)?.classList.add("shortcuts-active");
  }

  const resultContext = resultShortcutContext();
  resultContext?.classList.add("shortcuts-active");
  resultContext
    ?.closest(".query-row")
    ?.querySelector(".query-suggestions")
    ?.classList.add("shortcuts-active");
}

function editableInputs() {
  return [
    ...Array.from(document.querySelectorAll<HTMLInputElement>(".entry-input")),
    ...(input ? [input] : [])
  ];
}

function scrollSearchInputIntoView(searchInput: HTMLInputElement) {
  const rect = searchInput.getBoundingClientRect();
  const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (isVisible) {
    return;
  }

  window.scrollTo({
    top: window.scrollY + rect.top,
    behavior: "smooth"
  });
}

function focusEditableSearch(offset: -1 | 1) {
  const inputs = editableInputs();
  const activeIndex = inputs.findIndex((candidate) => candidate === document.activeElement);
  if (activeIndex < 0) {
    return false;
  }

  const nextIndex = activeIndex + offset;
  if (nextIndex < 0 || nextIndex >= inputs.length) {
    return false;
  }

  inputs[nextIndex].focus();
  inputs[nextIndex].select();
  scrollSearchInputIntoView(inputs[nextIndex]);
  clearSuggestions();
  clearSuggestionSelection();
  return true;
}

function shouldToggleCommandMode(event: KeyboardEvent) {
  if (!input || document.activeElement !== input) {
    return false;
  }

  const cursorStart = input.selectionStart ?? 0;
  const cursorEnd = input.selectionEnd ?? 0;
  const atStart = cursorStart === 0 && cursorEnd === 0;
  const atEnd = cursorStart === input.value.length && cursorEnd === input.value.length;

  return (
    (event.key === "ArrowLeft" && atStart) ||
    (event.key === "ArrowRight" && atEnd)
  );
}

function toggleCommandMode() {
  setCommandMode(commandMode === "search" ? "ai" : "search");
}

function isEffortModifier(event: KeyboardEvent) {
  return event.altKey && !event.ctrlKey && !event.metaKey;
}

function clearSuggestionSelection() {
  document.querySelectorAll<HTMLAnchorElement>(".wiki-pill").forEach((pill) => {
    pill.classList.remove("selected");
    pill.removeAttribute("aria-selected");
  });
}

function sourceLabel(provider: string) {
  if (provider === "wiktionary.headword") {
    return "Wiktionary";
  }

  if (provider === "wikipedia.title") {
    return "Wikipedia";
  }

  return provider;
}

function renderSuggestionPill(suggestion: Suggestion, index: number) {
  const title = escapeHtml(suggestion.title);
  const url = escapeHtml(suggestion.url);
  const source = escapeHtml(sourceLabel(suggestion.provider));
  const favicon = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(suggestion.url)}&sz=16`;
  const shortcut = shortcutLabels[index];
  const description = suggestion.description
    ? `<span class="wiki-pill-description">${escapeHtml(suggestion.description)}</span>`
    : "";
  const fullDescription = suggestion.fullDescription ?? suggestion.description ?? "";
  const expandedDescription = suggestion.provider === "wiktionary.headword" && fullDescription
    ? `<span class="wiki-pill-expanded-description">${escapeHtml(fullDescription)}</span>`
    : "";
  const shortcutMarkup = shortcut
    ? `<span class="suggestion-shortcut" aria-hidden="true">${shortcut}</span>`
    : "";

  return `<a class="wiki-pill" data-shortcut="${shortcut ?? ""}" href="${url}" target="_blank" rel="noreferrer">
    <span class="wiki-pill-body">
      <img class="wiki-pill-favicon" alt="" src="${favicon}">
      <span class="wiki-pill-source">${source}</span>
      <span class="wiki-pill-title">${title}</span>
      ${description}
      ${expandedDescription}
    </span>
    ${shortcutMarkup}
  </a>`;
}

function isSafeLink(value: string) {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeMarkdownHtml(markdownHtml: string) {
  const documentFragment = new DOMParser().parseFromString(markdownHtml, "text/html").body;

  function sanitizeNode(node: Node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = child as HTMLElement;
      if (!allowedMarkdownTags.has(element.tagName)) {
        sanitizeNode(element);
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      const href = element instanceof HTMLAnchorElement
        ? element.getAttribute("href") ?? ""
        : "";
      Array.from(element.attributes).forEach((attribute) => {
        element.removeAttribute(attribute.name);
      });

      if (element instanceof HTMLAnchorElement) {
        if (href && isSafeLink(href)) {
          element.href = href;
          element.target = "_blank";
          element.rel = "noreferrer";
        }
      }

      sanitizeNode(element);
    });
  }

  sanitizeNode(documentFragment);
  return documentFragment.innerHTML;
}

function renderAiText(text: string) {
  const html = marked.parse(text, {
    async: false,
    breaks: true,
    gfm: true
  }) as string;

  return `<div class="ai-response">${sanitizeMarkdownHtml(html)}</div>`;
}

function clearSuggestions() {
  activeSuggestionContext()?.replaceChildren();
}

function clearSuggestionsFor(searchInput: HTMLInputElement) {
  suggestionContextFor(searchInput)?.replaceChildren();
}

function scheduleSuggest(source?: HTMLInputElement) {
  const sourceInput = source ?? activeSearchInput();
  const suggestionContext = sourceInput ? suggestionContextFor(sourceInput) : undefined;
  if (!sourceInput || !suggestionContext) {
    return;
  }

  if (
    (sourceInput === input && commandMode === "ai") ||
    sourceInput.closest<HTMLElement>(".entry")?.dataset.mode === "ai"
  ) {
    clearSuggestionsFor(sourceInput);
    return;
  }

  const query = sourceInput.value.trim();
  if (suggestTimer) {
    window.clearTimeout(suggestTimer);
  }
  suggestAbort?.abort();

  if (query.length < 2) {
    clearSuggestionsFor(sourceInput);
    return;
  }

  suggestTimer = window.setTimeout(async () => {
    suggestAbort = new AbortController();

    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query,
          trigger: {
            type: "input-change",
            source: "search-box"
          }
        }),
        signal: suggestAbort.signal
      });
      const payload = await response.json() as SuggestResponse & { error?: string };

      if (!response.ok || activeSearchInput() !== sourceInput || sourceInput.value.trim() !== query) {
        return;
      }

      const shortcutOffset = resultShortcutCountFor(sourceInput);
      suggestionContext.innerHTML = payload.suggestions
        .map((suggestion, index) => renderSuggestionPill(suggestion, index + shortcutOffset))
        .join("");
      clearSuggestionSelection();
      if (sourceInput === input) {
        scrollToPrompt();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      clearSuggestionsFor(sourceInput);
    }
  }, 120);
}

function bindSuggestionInput(searchInput: HTMLInputElement) {
  searchInput.addEventListener("input", () => {
    scheduleSuggest(searchInput);
    clearSuggestionSelection();
  });
  searchInput.addEventListener("focus", () => scheduleSuggest(searchInput));
  searchInput.addEventListener("click", () => scheduleSuggest(searchInput));
}

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (transcript) {
      transcript.innerHTML = "";
    }
    if (input) {
      input.focus();
    }
    history.replaceState(null, "", "/");
    return;
  }

  if (isEffortModifier(event) && event.key === "ArrowUp") {
    if (adjustActiveEffort(1)) {
      event.preventDefault();
      return;
    }
  }

  if (isEffortModifier(event) && event.key === "ArrowDown") {
    if (adjustActiveEffort(-1)) {
      event.preventDefault();
      return;
    }
  }

  if (event.key === "ArrowUp") {
    if (focusEditableSearch(-1)) {
      event.preventDefault();
    }
    return;
  }

  if (event.key === "ArrowDown") {
    if (focusEditableSearch(1)) {
      event.preventDefault();
    }
    return;
  }

  if (shouldToggleCommandMode(event)) {
    event.preventDefault();
    toggleCommandMode();
    return;
  }

  if (!event.altKey) {
    return;
  }

  setShortcutsActive(true);

  const shortcut = shortcutFromCode(event.code);
  if (!shortcut) {
    return;
  }

  const shortcutRow = shortcutRowContext();
  if (shortcutRow) {
    event.preventDefault();
  }

  const liveLink = shortcutRow?.querySelector<HTMLAnchorElement>(`.wiki-pill[data-shortcut="${shortcut}"]`);
  if (liveLink) {
    const opened = window.open(liveLink.href, "_blank");
    if (opened) {
      opened.opener = null;
    }
    return;
  }

  const link = shortcutRow?.querySelector<HTMLAnchorElement>(`.results a[data-shortcut="${shortcut}"], .ai-response a[data-shortcut="${shortcut}"]`);
  if (!link) {
    return;
  }

  const opened = window.open(link.href, "_blank");
  if (opened) {
    opened.opener = null;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "Alt" || !event.altKey) {
    setShortcutsActive(false);
  }
});

window.addEventListener("blur", () => setShortcutsActive(false));

document.querySelectorAll<HTMLInputElement>('#terminal-form input[name="q"], .entry-input')
  .forEach(bindSuggestionInput);

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const bar = target.closest<HTMLElement>(".effort-bar");
  const bars = bar?.closest<HTMLElement>(".effort-bars");
  if (!bar || !bars) {
    return;
  }

  event.preventDefault();
  const nextEffort = normalizeEffortLevel(Number(bar.dataset.effortLevel ?? 3));
  const entry = bars.closest<HTMLElement>(".entry");
  if (entry) {
    entry.dataset.effort = String(nextEffort);
    updateEffortBars(bars, nextEffort, entry.dataset.mode === "ai" ? "ai" : "search");
    return;
  }

  setEffortLevel(nextEffort);
});

void fetch("/api/effort")
  .then(async (response) => {
    if (!response.ok) {
      return;
    }
    effortConfig = await response.json() as EffortConfig;
    refreshEffortTitles();
  })
  .catch(() => undefined);

async function runSearch(query: string, results: HTMLElement, effort: EffortLevel) {
  results.innerHTML = '<div class="meta">searching...</div>';

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        query,
        effort,
        trigger: {
          type: "keyboard",
          key: "Enter",
          source: "search-box"
        }
      })
    });
    const payload = await response.json() as SearchResponse & { error?: string };

    if (!response.ok) {
      results.innerHTML = `<div class="status">${escapeHtml(payload.error ?? "Search failed.")}</div>`;
      return;
    }

    results.innerHTML = renderRows(payload.results ?? []);
  } catch (error) {
    results.innerHTML = `<div class="status">${escapeHtml(error instanceof Error ? error.message : "Search failed.")}</div>`;
  }
}

async function runAiPrompt(prompt: string, results: HTMLElement, effort: EffortLevel) {
  results.innerHTML = '<div class="meta">thinking...</div>';

  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        effort,
        trigger: {
          type: "keyboard",
          key: "Enter",
          source: "search-box"
        }
      })
    });
    const payload = await response.json() as AiResponse & { error?: string };

    if (!response.ok) {
      results.innerHTML = `<div class="status">${escapeHtml(payload.error ?? "AI request failed.")}</div>`;
      return;
    }

    results.innerHTML = renderAiText(payload.text);
    assignAiLinkShortcuts(results);
  } catch (error) {
    results.innerHTML = `<div class="status">${escapeHtml(error instanceof Error ? error.message : "AI request failed.")}</div>`;
  }
}

document.addEventListener("submit", async (event) => {
  const submittedForm = event.target;
  if (!(submittedForm instanceof HTMLFormElement)) {
    return;
  }

  if (!submittedForm.matches("#terminal-form, .entry-form")) {
    return;
  }

  event.preventDefault();

  const searchInput = submittedForm.querySelector<HTMLInputElement>('input[name="q"]');
  const query = searchInput?.value.trim() ?? "";
  if (!query || !searchInput || !transcript) {
    return;
  }

  if (submittedForm.matches(".entry-form")) {
    const entry = submittedForm.closest<HTMLElement>(".entry");
    const results = entry?.querySelector<HTMLElement>(".results");
    const entryEffort = Math.min(Math.max(Number(entry?.dataset.effort ?? 3), 1), 5) as EffortLevel;
    if (results) {
      if (entry?.dataset.mode === "ai") {
        await runAiPrompt(query, results, entryEffort);
      } else {
        await runSearch(query, results, entryEffort);
        renumberSuggestionShortcuts(searchInput);
      }
    }
    return;
  }

  const submittedMode = commandMode;
  const submittedEffort = effortLevel;
  const entry = document.createElement("div");
  entry.innerHTML = renderEntry(query, `<div class="meta">${submittedMode === "ai" ? "thinking..." : "searching..."}</div>`, submittedMode, submittedEffort);
  const node = entry.firstElementChild;
  if (!node) {
    return;
  }

  const currentSuggestionHtml = submittedMode === "search"
    ? suggestionContextFor(searchInput)?.innerHTML ?? ""
    : "";
  transcript.append(node);
  node.querySelectorAll<HTMLInputElement>(".entry-input").forEach(bindSuggestionInput);
  const persistedSuggestions = node.querySelector<HTMLElement>(".query-suggestions");
  if (persistedSuggestions) {
    persistedSuggestions.innerHTML = currentSuggestionHtml;
  }
  searchInput.value = "";
  clearSuggestionsFor(searchInput);
  suggestAbort?.abort();
  setCommandMode(submittedMode);
  searchInput.focus();
  scrollToPrompt();

  const results = node.querySelector<HTMLElement>(".results");
  if (results) {
    if (submittedMode === "ai") {
      await runAiPrompt(query, results, submittedEffort);
    } else {
      await runSearch(query, results, submittedEffort);
      const persistedInput = node.querySelector<HTMLInputElement>(".entry-input");
      if (persistedInput) {
        renumberSuggestionShortcuts(persistedInput);
      }
    }
  }
  scrollToPrompt();
});

scrollToPrompt();
