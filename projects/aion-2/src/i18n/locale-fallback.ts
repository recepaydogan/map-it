const placeholders = (value: string) => [
  ...value.matchAll(/{{\s*([^},\s]+).*?}}/g),
].map((match) => match[1]).sort();

/** Drop stale translations so i18next can use the English fallback safely. */
export function keepCompatibleTranslations(
  english: Record<string, unknown>,
  translated: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, original] of Object.entries(english)) {
    const candidate = translated[key];
    if (typeof original === "string" && typeof candidate === "string" && candidate.trim()
      && JSON.stringify(placeholders(original)) === JSON.stringify(placeholders(candidate))) {
      result[key] = candidate;
    } else if (original && typeof original === "object" && !Array.isArray(original)
      && candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = keepCompatibleTranslations(
        original as Record<string, unknown>, candidate as Record<string, unknown>);
      if (Object.keys(nested).length) result[key] = nested;
    }
  }
  // Some languages need plural forms that English does not use.
  for (const [key, candidate] of Object.entries(translated)) {
    if (key in english || typeof candidate !== "string" || !candidate.trim()) continue;
    const match = key.match(/^(.*)_(zero|two|few|many)$/);
    if (!match) continue;
    const source = english[`${match[1]}_other`];
    if (typeof source === "string" && JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(candidate))) {
      result[key] = candidate;
    }
  }
  return result;
}
