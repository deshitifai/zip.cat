export function normalizeLookupText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ");
}

export function isSuggestibleLookupQuery(query: string) {
  const normalized = normalizeLookupText(query);
  return /^[a-z0-9].{1,}$/.test(normalized);
}

export function isLookupPrefixMatch(query: string, title: string) {
  const normalizedQuery = normalizeLookupText(query);
  const normalizedTitle = normalizeLookupText(title);

  return Boolean(
    normalizedQuery &&
    normalizedTitle &&
    normalizedTitle.startsWith(normalizedQuery)
  );
}

export function isLookupExactMatch(query: string, title: string) {
  const normalizedQuery = normalizeLookupText(query);
  const normalizedTitle = normalizeLookupText(title);

  return Boolean(
    normalizedQuery &&
    normalizedTitle &&
    normalizedQuery === normalizedTitle
  );
}

// Accepts an exact title, or a redirect-resolved title that contains the
// typed query as whole words ("einstein" -> "Albert Einstein"). Fragments
// that stop mid-word ("new y" -> "New York City") stay rejected.
export function isLookupTitleMatch(query: string, title: string) {
  if (isLookupExactMatch(query, title)) {
    return true;
  }

  const normalizedQuery = normalizeLookupText(query);
  const normalizedTitle = normalizeLookupText(title);
  if (!normalizedQuery || !normalizedTitle) {
    return false;
  }

  const index = normalizedTitle.indexOf(normalizedQuery);
  if (index === -1) {
    return false;
  }

  const before = normalizedTitle[index - 1];
  const after = normalizedTitle[index + normalizedQuery.length];
  return (before === undefined || before === " ") && (after === undefined || after === " ");
}
