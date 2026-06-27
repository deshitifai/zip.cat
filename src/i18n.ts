// Single source of truth for UI translations, shared by the server-rendered
// markup (render.ts) and the client bundle (client.ts). Keys are stable ids;
// values may contain {placeholders} filled by translate()'s params argument.
//
// To add a locale: add a `Locale` to LOCALES and a full entry to MESSAGES.
// English ("en") is the fallback for any missing key.

export type Locale = "en" | "ca";

export const LOCALES: Locale[] = ["en", "ca"];
export const DEFAULT_LOCALE: Locale = "en";

export type MessageKey =
  | "languageLabel"
  | "search"
  | "searchAria"
  | "previousSearch"
  | "aiPrompt"
  | "voiceInput"
  | "voiceInputTitle"
  | "voiceMenuBrowser"
  | "voiceMenuServer"
  | "refresh"
  | "refreshNow"
  | "cacheUpdatedNow"
  | "cacheUpdatedAgo"
  | "cacheStaleSuffix"
  | "cacheClickRefresh"
  | "searchIdle"
  | "searchRunning"
  | "aiIdle"
  | "statusActive"
  | "statusDone"
  | "statusError"
  | "statusIdle"
  | "effortAriaGenerator"
  | "effortAriaLevel"
  | "effortLevelPrefix"
  | "effortDdgInstant"
  | "effortLevelUnconfigured"
  | "aiLabel"
  | "searchLabel"
  | "localGemmaDescription"
  | "suggestionOpen"
  | "searchDuckDuckGo"
  | "clearTranscript"
  | "newConversation"
  | "switchMode"
  // agent / system prompts
  | "aiSystemPrompt"
  | "aiSearchShapePrompt";

type Messages = Record<MessageKey, string>;

const en: Messages = {
  languageLabel: "Language",
  search: "Search",
  searchAria: "Search",
  previousSearch: "Previous search",
  aiPrompt: "AI prompt",
  voiceInput: "Voice input",
  voiceInputTitle: "Voice input with Moonshine",
  voiceMenuBrowser: "In-browser (Moonshine)",
  voiceMenuServer: "Server",
  refresh: "Refresh",
  refreshNow: "Refresh now",
  cacheUpdatedNow: "Updated just now",
  cacheUpdatedAgo: "Updated {age} ago",
  cacheStaleSuffix: " · stale",
  cacheClickRefresh: "Click refresh to update.",
  searchIdle: "Search idle",
  searchRunning: "Search running",
  aiIdle: "AI idle",
  statusActive: "active",
  statusDone: "done",
  statusError: "error",
  statusIdle: "idle",
  effortAriaGenerator: "{mode} generator {level}",
  effortAriaLevel: "Effort {level} of 5",
  effortLevelPrefix: "Effort {level} of 5",
  effortDdgInstant: "DuckDuckGo Instant Answer",
  effortLevelUnconfigured: "Level {level} is not configured",
  aiLabel: "AI",
  searchLabel: "Search",
  localGemmaDescription:
    "Local Gemma 4 WebGPU; runs 100% in this browser; downloads the model on first selection and caches it in site storage; $0 API cost",
  suggestionOpen: "Open",
  searchDuckDuckGo: "Search DuckDuckGo for {query}",
  clearTranscript: "Clear",
  newConversation: "New conversation",
  switchMode: "Switch mode",
  aiSystemPrompt:
    "You are a concise, accurate assistant embedded in a terminal-style search app. Answer in clear, plain language. Respond in English.",
  aiSearchShapePrompt:
    "Summarize and structure the following search results to directly answer the user's query. Respond in English."
};

const ca: Messages = {
  languageLabel: "Idioma",
  search: "Cerca",
  searchAria: "Cerca",
  previousSearch: "Cerca anterior",
  aiPrompt: "Indicació d'IA",
  voiceInput: "Entrada de veu",
  voiceInputTitle: "Entrada de veu amb Moonshine",
  voiceMenuBrowser: "Al navegador (Moonshine)",
  voiceMenuServer: "Servidor",
  refresh: "Actualitza",
  refreshNow: "Actualitza ara",
  cacheUpdatedNow: "Actualitzat ara mateix",
  cacheUpdatedAgo: "Actualitzat fa {age}",
  cacheStaleSuffix: " · obsolet",
  cacheClickRefresh: "Fes clic a actualitzar per posar-ho al dia.",
  searchIdle: "Cerca inactiva",
  searchRunning: "Cerca en curs",
  aiIdle: "IA inactiva",
  statusActive: "actiu",
  statusDone: "fet",
  statusError: "error",
  statusIdle: "inactiu",
  effortAriaGenerator: "Generador {mode} {level}",
  effortAriaLevel: "Esforç {level} de 5",
  effortLevelPrefix: "Esforç {level} de 5",
  effortDdgInstant: "Resposta instantània de DuckDuckGo",
  effortLevelUnconfigured: "El nivell {level} no està configurat",
  aiLabel: "IA",
  searchLabel: "Cerca",
  localGemmaDescription:
    "Gemma 4 local amb WebGPU; s'executa 100% en aquest navegador; descarrega el model en seleccionar-lo per primer cop i el desa a l'emmagatzematge del lloc; cost d'API de 0 $",
  suggestionOpen: "Obre",
  searchDuckDuckGo: "Cerca {query} a DuckDuckGo",
  clearTranscript: "Esborra",
  newConversation: "Conversa nova",
  switchMode: "Canvia de mode",
  aiSystemPrompt:
    "Ets un assistent concís i precís integrat en una aplicació de cerca amb estil de terminal. Respon amb un llenguatge clar i senzill. Respon en català.",
  aiSearchShapePrompt:
    "Resumeix i estructura els resultats de cerca següents per respondre directament la consulta de l'usuari. Respon en català."
};

export const MESSAGES: Record<Locale, Messages> = { en, ca };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "ca";
}

// Translate a key for a locale, interpolating {placeholders} from params.
// Falls back to English, then to the raw key, so a missing translation never
// throws or renders blank.
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  let text = table[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}
