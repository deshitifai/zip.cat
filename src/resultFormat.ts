import type { TypedOutputDescriptor } from "./models";

export type CommandModeForFormat = "search" | "ai";
export type ResultFormatKind =
  | "search-list"
  | "string"
  | "boolean"
  | "url"
  | "restaurant-card"
  | "restaurant-list"
  | "json";

export type ResultFormat = {
  kind: ResultFormatKind;
  label: string;
  schemaName?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
    if (descriptor) {
      refs.push(descriptor);
    }
  }
  return refs;
}

export function resultFormatForTypedOutput(descriptor: TypedOutputDescriptor): ResultFormat {
  switch (descriptor.renderer) {
    case "boolean":
      return { kind: "boolean", label: descriptor.label, schemaName: descriptor.name };
    case "url":
      return { kind: "url", label: descriptor.label, schemaName: descriptor.name };
    case "restaurant-card":
      return { kind: "restaurant-card", label: descriptor.label, schemaName: descriptor.name };
    case "restaurant-list":
      return { kind: "restaurant-list", label: descriptor.label, schemaName: descriptor.name };
    case "markdown":
      return { kind: "string", label: descriptor.label, schemaName: descriptor.name };
    case "json":
    default:
      return { kind: "json", label: descriptor.label, schemaName: descriptor.name };
  }
}

export function defaultResultFormat(mode: CommandModeForFormat): ResultFormat {
  return mode === "search"
    ? { kind: "search-list", label: "Search results list" }
    : { kind: "string", label: "Plain text string" };
}

export function resultFormatForQuery(
  query: string,
  mode: CommandModeForFormat,
  descriptors: TypedOutputDescriptor[]
): ResultFormat {
  const typedOutput = typedOutputReferencesForFormat(query, descriptors)[0];
  return typedOutput ? resultFormatForTypedOutput(typedOutput) : defaultResultFormat(mode);
}

export function resultFormatIconMarkup(kind: ResultFormatKind) {
  switch (kind) {
    case "search-list":
      return `<span class="format-icon format-icon-list" aria-hidden="true"><span></span><span></span><span></span></span>`;
    case "string":
      return `<span class="format-icon format-icon-string" aria-hidden="true"><span></span></span>`;
    case "boolean":
      return `<span class="format-icon format-icon-boolean" aria-hidden="true"></span>`;
    case "url":
      return `<span class="format-icon format-icon-url" aria-hidden="true"></span>`;
    case "restaurant-card":
      return `<span class="format-icon format-icon-restaurant" aria-hidden="true"></span>`;
    case "restaurant-list":
      return `<span class="format-icon format-icon-restaurant-list" aria-hidden="true"><span></span><span></span><span></span></span>`;
    case "json":
    default:
      return `<span class="format-icon format-icon-json" aria-hidden="true">{}</span>`;
  }
}

export function resultFormatIndicatorMarkup(format: ResultFormat) {
  const label = `Result format: ${format.schemaName ?? format.label} (click to change)`;
  return `<span class="format-indicator" role="button" tabindex="0" data-format="${escapeHtml(format.kind)}" aria-label="${escapeHtml(label)}" aria-haspopup="listbox" title="${escapeHtml(label)}">${resultFormatIconMarkup(format.kind)}</span>`;
}
