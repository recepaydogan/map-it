export const normalizeContentSearch = (text: string): string => text.normalize("NFKD")
  .replace(/\p{M}/gu, "").toLocaleLowerCase("en").replaceAll("ı", "i").trim();

/** Search English and the displayed language while keeping source IDs intact. */
export function matchesContentSearch(query: string, values: readonly (string | null | undefined)[],
  translate: (text: string) => string): boolean {
  const needle = normalizeContentSearch(query);
  return !needle || values.some(value => value && (normalizeContentSearch(value).includes(needle)
    || normalizeContentSearch(translate(value)).includes(needle)));
}
