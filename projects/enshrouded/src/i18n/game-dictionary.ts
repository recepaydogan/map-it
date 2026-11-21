export interface PackedValues {
  version: number;
  sourceSha256?: string;
  values: (string | null)[];
  /** Reviewed repairs to defects in the game's original localized text. */
  nativeDisplayOverrides?: string[];
}

export interface PackedSource extends PackedValues {
  keys: string[];
}

export interface GameDictionary {
  sourceByKey: Map<string, string>;
  byKey: Map<string, string>;
  byEnglish: Map<string, string>;
  byNormalizedEnglish: Map<string, string>;
  nativeDisplayOverrides: Set<string>;
}

/** Render game formatting as text; never inject game-supplied HTML. */
export function plainGameText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

/** Typography-only aliases never remove numbers or game-name suffixes. */
export function normalizeGameText(value: string): string {
  return plainGameText(value).normalize("NFKC")
    .replace(/'{2,3}/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

export function createGameDictionary(source: PackedSource, translated: PackedValues): GameDictionary {
  if (source.version !== 1 || !Array.isArray(source.keys) || !Array.isArray(source.values)
    || source.keys.length !== source.values.length || new Set(source.keys).size !== source.keys.length
    || source.keys.some(key => typeof key !== "string")
    || translated.version !== 1 || !Array.isArray(translated.values)
    || translated.values.length !== source.keys.length
    || (source.sourceSha256 !== undefined && translated.sourceSha256 !== source.sourceSha256)
    || [...source.values, ...translated.values].some(value => value !== null && typeof value !== "string")
    || (translated.nativeDisplayOverrides !== undefined && (!Array.isArray(translated.nativeDisplayOverrides)
      || translated.nativeDisplayOverrides.some(value => typeof value !== "string")))) {
    throw new Error("Invalid game locale dictionary");
  }
  const sourceByKey = new Map<string, string>();
  const byKey = new Map<string, string>();
  const byEnglish = new Map<string, string>();
  const byNormalizedEnglish = new Map<string, string>();
  const exactConflicts = new Set<string>();
  const normalizedConflicts = new Set<string>();
  const add = (map: Map<string, string>, conflicts: Set<string>, english: string, value: string) => {
    if (!english || conflicts.has(english)) return;
    const existing = map.get(english);
    if (existing !== undefined && existing !== value) {
      map.delete(english);
      conflicts.add(english);
    } else map.set(english, value);
  };
  for (let index = 0; index < source.keys.length; index += 1) {
    const english = source.values[index];
    const rawValue = translated.values[index];
    if (english) sourceByKey.set(source.keys[index], english);
    if (!rawValue) continue;
    const value = plainGameText(rawValue);
    if (!value) continue;
    byKey.set(source.keys[index], value);
    if (!english) continue;
    add(byEnglish, exactConflicts, english, value);
    add(byNormalizedEnglish, normalizedConflicts, normalizeGameText(english), value);
  }
  return { sourceByKey, byKey, byEnglish, byNormalizedEnglish,
    nativeDisplayOverrides: new Set((translated.nativeDisplayOverrides ?? []).map(normalizeGameText)) };
}

export function lookupDictionaryText(dictionary: GameDictionary | undefined, english: string, key?: string): string | undefined {
  if (!dictionary || !english) return undefined;
  const source = key ? dictionary.sourceByKey.get(key) : undefined;
  // A stale content-to-game key must never silently translate a different item.
  if (key && source && normalizeGameText(source) === normalizeGameText(english)) {
    const keyed = dictionary.byKey.get(key);
    if (keyed) return keyed;
  }
  return dictionary.byEnglish.get(english)
    ?? dictionary.byNormalizedEnglish.get(normalizeGameText(english));
}

export function getDictionaryText(dictionary: GameDictionary | undefined, english: string, key?: string): string {
  return lookupDictionaryText(dictionary, english, key) ?? english;
}

/** Translate display primitives without changing objects or navigation inputs. */
export function translateDisplayValue<T>(value: T, dictionary?: GameDictionary,
  content?: GameDictionary, key?: string): T {
  if (typeof value !== "string") return value;
  if (content?.nativeDisplayOverrides.has(normalizeGameText(value))) {
    const reviewed = lookupDictionaryText(content, value);
    if (reviewed !== undefined) return reviewed as T;
  }
  if (key) {
    const keyed = lookupDictionaryText(dictionary, value, key);
    if (keyed !== undefined && keyed !== value) return keyed as T;
  }
  const translated = lookupDictionaryText(content, value) ?? lookupDictionaryText(dictionary, value);
  if (translated !== undefined) return translated as T;
  if (value.includes(" · ")) {
    return value.split(" · ").map(part => lookupDictionaryText(content, part)
      ?? lookupDictionaryText(dictionary, part) ?? part).join(" · ") as T;
  }
  // A truncated source rarity is retained in the catalog for identity, but its
  // English display spelling should still be the complete rarity label.
  return (value === "Commo" ? "Common" : value) as T;
}
