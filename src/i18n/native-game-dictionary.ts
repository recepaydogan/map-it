import { createGameDictionary, type GameDictionary, type PackedSource, type PackedValues } from "./game-dictionary";

export const canonicalGameText = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
export interface NativeGameDictionary extends GameDictionary {
  byEnglishFolded: Map<string, string>;
  sourceEnglish: Map<string, string>;
}

export const createNativeGameDictionary = (source: PackedSource, translated: PackedValues): NativeGameDictionary => {
  const dictionary = createGameDictionary(source, translated);
  const sourceEnglish = new Map(source.keys.flatMap((key, i) => source.values[i] ? [[key, canonicalGameText(source.values[i]!)] as const] : []));
  for (const [alias, key] of Object.entries(source.aliases ?? {})) {
    const english = sourceEnglish.get(key), value = dictionary.byKey.get(key);
    if (english) sourceEnglish.set(alias, english);
    if (value) dictionary.byKey.set(alias, value);
  }
  for (const [alias, composite] of Object.entries(source.composites ?? {})) {
    sourceEnglish.set(alias, canonicalGameText(composite.english));
    const values = composite.keys.map(key => dictionary.byKey.get(key));
    if (values.every((value): value is string => Boolean(value))) dictionary.byKey.set(alias, values.join(composite.separator));
  }
  const byEnglishFolded = new Map<string, string>(), conflicts = new Set<string>();
  for (const [english, value] of dictionary.byEnglish) {
    const key = canonicalGameText(english), previous = byEnglishFolded.get(key);
    if (previous !== undefined && previous !== value) conflicts.add(key);
    else byEnglishFolded.set(key, value);
  }
  for (const key of conflicts) byEnglishFolded.delete(key);
  return { ...dictionary, sourceEnglish, byEnglishFolded };
};

export const nativeGameText = (dictionary: NativeGameDictionary, english: string, key?: string): string => {
  if (key && dictionary.sourceEnglish.has(key)) {
    // A known but untranslated source key must not pick a different context's translation.
    return dictionary.sourceEnglish.get(key) === canonicalGameText(english) ? dictionary.byKey.get(key) ?? english : english;
  }
  return dictionary.byEnglish.get(english) ?? dictionary.byEnglishFolded.get(canonicalGameText(english)) ?? english;
};
