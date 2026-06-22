import { pageStyles } from "./render";

interface DemoBoxOptions {
  /** Pre-fill the input with this query. */
  query?: string;
  /** "search" (default) or "ai". Sets the prompt glyph and run behavior. */
  mode?: "search" | "ai";
  /** Effort level 1-5 shown in the effort bars. */
  effort?: number;
}

const shortcutPrompt = (mode: "search" | "ai") => (mode === "ai" ? "*" : "&gt;");

function effortBars(effort = 3) {
  const label = `Effort ${effort} of 5`;
  return `<span class="effort-bars" data-effort="${effort}" aria-label="${label}" title="${label}">${[1, 2, 3, 4, 5]
    .map((level) => {
      const classes = ["effort-bar", level <= effort ? "active" : ""].filter(Boolean).join(" ");
      return `<span class="${classes}" data-effort-level="${level}" title="Effort ${level} of 5" aria-hidden="true"></span>`;
    })
    .join("")}</span>`;
}

/**
 * A real, live zip.cat command box. It reuses the exact `.entry` markup the app
 * renders for transcript entries, so the bundled `/client.js` wires it up
 * automatically: suggestions, voice, effort, arrow-key mode switching, and
 * in-place search/AI submission all work without any docs-specific JavaScript.
 */
function demoBox(options: DemoBoxOptions = {}) {
  const mode = options.mode ?? "search";
  const effort = options.effort ?? 3;
  const query = options.query ?? "";
  const ariaLabel = mode === "ai" ? "AI prompt" : "Search";
  return `<div class="query-row">
    <section class="entry" data-mode="${mode}" data-effort="${effort}">
      <span class="status-label" aria-hidden="true">$0</span>
      <span class="run-status" aria-live="polite">
        <span class="run-status-mark" data-status-kind="ai" aria-label="AI idle">*</span>
        <span class="run-status-mark" data-status-kind="search" aria-label="Search idle">&gt;</span>
      </span>
      ${effortBars(effort)}
      <form class="entry-form" action="/" method="get" autocomplete="off">
        <span class="prompt" aria-hidden="true">${shortcutPrompt(mode)}</span>
        <span class="input-shell">
          <textarea class="entry-input" aria-label="${ariaLabel}" name="q" rows="1">${query}</textarea>
          <span class="inline-inference-highlight" aria-hidden="true"></span>
        </span>
        <button class="voice-button" type="button" aria-label="Voice input" title="Voice input with Moonshine">●</button>
        <div class="slash-args" hidden></div>
      </form>
      <div class="results"></div>
      <div class="debug-panel" hidden></div>
    </section>
    <aside class="query-suggestions live-suggestions" aria-live="polite"></aside>
  </div>`;
}

/** A simple bulleted list of usage instructions, shown after the info text. */
function steps(items: string[]) {
  return `<ul class="docs-steps">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

const openResultStep =
  "Press <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac), then press a number or letter to open a result in a new tab";

interface DocSection {
  id: string;
  title: string;
  body: string;
  children?: DocSection[];
}

const sections: DocSection[] = [
  {
    id: "search",
    title: "Search",
    body: `
      <p class="docs-lead">zip.cat is a keyboard-first command line for the web. Type a query and submit to run a web search; results come back as a ranked list of links you can open with <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) + the shortcut shown on each row.</p>
      ${steps([
        "Enter a query and submit to search",
        openResultStep
      ])}
      ${demoBox()}
    `
  },
  {
    id: "ai",
    title: "AI",
    body: `
      <p class="docs-lead">The same command line doubles as an AI prompt. Switch a box into AI mode and your query is answered by a model instead of being sent to a search engine. The prompt glyph changes from <code>&gt;</code> to <code>*</code> when AI mode is active.</p>
      ${steps([
        "Press the left arrow key when at the left-most side of the input, or the right arrow key when at the right-most side of the input, to change to AI mode",
        "The prompt glyph changes from <code>&gt;</code> to <code>*</code> when AI mode is active",
        "Enter a query and submit to get back an AI response",
        openResultStep + " from within an AI response"
      ])}
      ${demoBox()}
    `
  },
  {
    id: "threads",
    title: "Chained conversations",
    body: `
      <p class="docs-lead">AI answers are conversational. Each turn is an editable <code>*</code> message followed by its reply, stacked in the same box. After a reply, a new empty input appears at the bottom and the cursor moves to it — just keep typing to continue. Every turn is sent with the earlier turns as context. No modifier keys.</p>
      <p class="docs-lead">Every message stays editable. Go back and change an earlier message, press Enter, and the conversation restarts from there — everything below that message is replaced.</p>
      ${steps([
        "Submit an AI query; the reply appears and the cursor drops into a new empty message below it",
        "Type the next message and press Enter to continue — earlier turns are sent as context",
        "Edit any earlier <code>*</code> message and press Enter to restart from that point (later turns are discarded)",
        "Press <kbd>Tab</kbd> to move between messages",
        "To start a fresh, unrelated conversation, use a new box (the main prompt)"
      ])}
      ${demoBox({ mode: "ai" })}
    `
  },
  {
    id: "voice",
    title: "Voice",
    body: `
      <p class="docs-lead">Click the <span class="docs-dot">●</span> on the right of any box (or press <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) + <kbd>Space</kbd>) to dictate your query. Transcription runs through Moonshine — in the browser with WebGPU, or on the server.</p>
      ${steps([
        "Click the <span class=\"docs-dot\">●</span> on the right of the box, or press <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) + <kbd>Space</kbd>, to start recording",
        "Start speaking; your words stream into the input as you talk",
        "Submit to run the transcribed query"
      ])}
      ${demoBox()}
    `
  },
  {
    id: "typed-outputs",
    title: "Typed outputs",
    body: `
      <p class="docs-lead">Append a type marker to an AI query to get a structured answer rendered as a card, a list, a boolean, or JSON instead of plain prose.</p>
      ${steps([
        "Switch the box to AI mode (left/right arrow at the edge of the input)",
        "Type a question and append a marker like <code>#bool</code> or <code>#Restaurant</code>",
        "Submit to get a structured result instead of plain prose"
      ])}
      ${demoBox({ mode: "ai" })}
    `,
    children: [
      {
        id: "typed-outputs-bool",
        title: "Boolean",
        body: `
          <p class="docs-lead">The <code>#bool</code> marker forces a yes/no answer rendered as a single boolean.</p>
          ${steps([
            "In AI mode, ask a yes/no question ending with <code>#bool</code>",
            "Submit to get a single true / false result"
          ])}
          ${demoBox({ mode: "ai" })}
        `
      },
      {
        id: "typed-outputs-cards",
        title: "Cards & lists",
        body: `
          <p class="docs-lead"><code>#Restaurant</code> returns a single card; <code>#Restaurant[]</code> returns a list of cards.</p>
          ${steps([
            "In AI mode, end your query with <code>#Restaurant</code> for one card",
            "Use <code>#Restaurant[]</code> to get a list of cards instead",
            "Submit to render the structured result"
          ])}
          ${demoBox({ mode: "ai" })}
        `
      }
    ]
  },
  {
    id: "plugins",
    title: "Plugins",
    body: `
      <p class="docs-lead">Search runs through a plugin registry. Suggestion plugins surface inline pills as you type; result plugins fetch and rank links; filter plugins dedupe and trim the final list.</p>
      ${steps([
        "Start typing — Wikipedia and Wiktionary suggestion pills appear beside the box",
        "Submit to run a web search through the result plugins",
        openResultStep
      ])}
      ${demoBox()}
    `,
    children: [
      {
        id: "plugins-web-search",
        title: "Web search",
        body: `
          <p class="docs-lead">The web-search result plugin queries the configured provider (Exa or SerpApi) at the selected effort level.</p>
          ${steps([
            "Enter a query and submit to run a web search",
            "Adjust effort with <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) + <kbd>↑</kbd> / <kbd>↓</kbd>, or click the bars in the top-right of the box",
            openResultStep
          ])}
          ${demoBox()}
        `
      },
      {
        id: "plugins-suggestions",
        title: "Suggestions",
        body: `
          <p class="docs-lead">Wikipedia titles and Wiktionary headwords appear as live suggestion pills in the column beside the input.</p>
          ${steps([
            "Start typing (at least two characters) to see suggestion pills appear beside the box",
            "Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) to reveal each pill's shortcut, then press it to open the suggestion"
          ])}
          ${demoBox()}
        `
      }
    ]
  },
  {
    id: "slash-commands",
    title: "Slash commands",
    body: `
      <p class="docs-lead">Begin a query with <code>/</code> to run a structured command. Arguments appear as inline fields and the result renders with a command-specific layout.</p>
      ${steps([
        "Type <code>/weather</code> to reveal the command's inline argument fields",
        "Fill in a location and submit",
        "The result renders with the command's own layout"
      ])}
      ${demoBox()}
    `
  },
  {
    id: "static-mode",
    title: "Static mode",
    body: `
      <p class="docs-lead">zip.cat can run with no backend. In static mode, search falls back to local Wikipedia / Wiktionary lookups and AI runs entirely in the browser via WebGPU.</p>
      ${steps([
        "Static mode is selected at build time, not toggled at runtime",
        "Search falls back to local Wikipedia / Wiktionary lookups",
        "AI runs entirely in the browser via WebGPU",
        "This page runs against the live server, so the boxes use the full backend"
      ])}
    `
  },
  {
    id: "local-ai",
    title: "Local AI",
    body: `
      <p class="docs-lead">When no AI provider is configured (or in static mode), AI answers are generated locally in a Web Worker using a Gemma model, and voice uses Moonshine — both on-device via WebGPU.</p>
      ${steps([
        "Switch the box to AI mode and submit a query",
        "On first use the model downloads; a progress bar appears above the box while it loads",
        "Once loaded, answers are generated on-device with no server round-trip"
      ])}
      ${demoBox({ mode: "ai" })}
    `
  }
];

function navItem(section: DocSection, nested = false): string {
  const children = section.children?.length
    ? `<ul class="docs-nav-sublist">${section.children
        .map((child) => navItem(child, true))
        .join("")}</ul>`
    : "";
  return `<li>
    <a class="docs-nav-link${nested ? " docs-nav-link-nested" : ""}" href="#${section.id}" data-target="${section.id}">${section.title}</a>
    ${children}
  </li>`;
}

function sectionMarkup(section: DocSection, level: 2 | 3 = 2): string {
  const heading = level === 2 ? "h2" : "h3";
  const children = section.children
    ?.map((child) => sectionMarkup(child, 3))
    .join("") ?? "";
  return `<section class="docs-section" id="${section.id}">
    <${heading} class="docs-section-title">${section.title}</${heading}>
    <div class="docs-section-body">${section.body}</div>
    ${children}
  </section>`;
}

const docsStyles = `    .docs-layout {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 40px;
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 96px;
      align-items: start;
    }
    .docs-nav {
      position: sticky;
      top: 28px;
      align-self: start;
    }
    .docs-nav-title {
      font-size: 15px;
      font-weight: 400;
      margin: 0 0 14px;
    }
    .docs-nav-title a { color: #111; text-decoration: none; }
    .docs-nav-list,
    .docs-nav-sublist {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .docs-nav-sublist {
      margin: 2px 0 6px 12px;
      border-left: 1px solid #d8d8d8;
    }
    .docs-nav-link {
      color: #555;
      display: block;
      font-size: 13px;
      line-height: 1.35;
      padding: 5px 8px;
      text-decoration: none;
    }
    .docs-nav-link:hover { color: #111; background: #f2f2f2; }
    .docs-nav-link.active { color: #111; background: #f2f2f2; }
    .docs-nav-link-nested { font-size: 12px; color: #666; padding-left: 10px; }
    .docs-section {
      margin: 0 0 56px;
      scroll-margin-top: 24px;
    }
    .docs-section-title {
      font-size: 15px;
      font-weight: 400;
      letter-spacing: 0.02em;
      margin: 0 0 14px;
      padding-bottom: 8px;
      border-bottom: 1px solid #d8d8d8;
    }
    .docs-section h3.docs-section-title {
      border-bottom: 0;
      color: #444;
      margin-top: 28px;
    }
    .docs-section-body { margin: 0; }
    .docs-lead {
      color: #333;
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 12px;
      max-width: 640px;
    }
    .docs-lead code,
    .docs-steps code,
    .docs-section kbd {
      background: #f5f5f5;
      font-size: 12px;
      padding: 0 3px;
    }
    .docs-section kbd { border: 1px solid #d8d8d8; }
    .docs-steps {
      color: #111;
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 16px;
      max-width: 640px;
      border-left: 2px solid #111;
      padding: 0 0 0 26px;
      list-style: none;
    }
    .docs-steps li {
      position: relative;
      margin: 0 0 4px;
    }
    .docs-steps li:last-child { margin-bottom: 0; }
    .docs-steps li::before {
      content: "*";
      position: absolute;
      left: -14px;
      color: #111;
    }
    .docs-dot { color: #111; }
    .docs-header {
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 0;
    }
    .docs-header h1 {
      font-size: 15px;
      font-weight: 400;
      margin: 0;
    }
    .docs-header h1 a { color: #111; text-decoration: none; }
    .docs-header p {
      color: #666;
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0 0;
      max-width: 640px;
    }
    @media (max-width: 860px) {
      .docs-layout {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .docs-nav { position: static; }
    }
`;

export function renderDocsPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zip.cat — features</title>
  <style>
${pageStyles}${docsStyles}  </style>
</head>
<body>
  <header class="docs-header">
    <h1><a href="/">zip.cat</a> / features</h1>
    <p>A live tour of every zip.cat search feature. The boxes below are real — type into one and submit to see the behavior.</p>
  </header>
  <div class="docs-layout">
    <nav class="docs-nav" aria-label="Features">
      <p class="docs-nav-title">Features</p>
      <ul class="docs-nav-list">
        ${sections.map((section) => navItem(section)).join("\n        ")}
      </ul>
    </nav>
    <main class="docs-main">
      ${sections.map((section) => sectionMarkup(section)).join("\n      ")}
    </main>
  </div>
  <div id="transcript" hidden></div>
  <script>
    (function () {
      // The shared client.js scrolls to the bottom prompt on load (correct for
      // the single-prompt app, wrong here). Pin the page where it belongs on
      // load — the top, or the targeted anchor — until that scroll would have
      // settled, bailing the moment the user scrolls themselves.
      if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
      }
      var userScrolled = false;
      var onUser = function () { userScrolled = true; };
      window.addEventListener("wheel", onUser, { passive: true });
      window.addEventListener("touchmove", onUser, { passive: true });
      window.addEventListener("keydown", function (e) {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].indexOf(e.key) !== -1) {
          userScrolled = true;
        }
      });
      function targetTop() {
        if (location.hash) {
          var el = document.getElementById(location.hash.slice(1));
          if (el) {
            return window.scrollY + el.getBoundingClientRect().top;
          }
        }
        return 0;
      }
      var pin = function () {
        if (!userScrolled) { window.scrollTo(0, targetTop()); }
      };
      pin();
      var elapsed = 0;
      var timer = setInterval(function () {
        pin();
        elapsed += 50;
        if (userScrolled || elapsed >= 1200) { clearInterval(timer); }
      }, 50);
    })();
    (function () {
      var links = Array.prototype.slice.call(document.querySelectorAll(".docs-nav-link"));
      var sections = links
        .map(function (link) { return document.getElementById(link.dataset.target); })
        .filter(Boolean);
      function setActive(id) {
        links.forEach(function (link) {
          link.classList.toggle("active", link.dataset.target === id);
        });
      }
      function syncActive() {
        var current = sections[0];
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].getBoundingClientRect().top <= 80) {
            current = sections[i];
          }
        }
        if (current) { setActive(current.id); }
      }
      if (sections.length) {
        syncActive();
        window.addEventListener("scroll", syncActive, { passive: true });
        links.forEach(function (link) {
          link.addEventListener("click", function () { setActive(link.dataset.target); });
        });
      }
    })();
  </script>
  <script type="module" src="/client.js"></script>
</body>
</html>`;
}
