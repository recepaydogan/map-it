export interface QuestTextSource {
  version: number;
  keys: string[];
  values: string[];
}

export interface QuestTextPack {
  version: number;
  values: (string | null)[];
}

export interface QuestTextEntry {
  english: string;
  localized: string;
}

export function createQuestTextDictionary(source: QuestTextSource, pack: QuestTextPack) {
  if (source.version !== 1 || pack.version !== 1 || !Array.isArray(source.keys)
    || !Array.isArray(source.values) || !Array.isArray(pack.values)
    || source.keys.length !== source.values.length
    || source.keys.length !== pack.values.length) {
    throw new Error("Invalid quest text pack");
  }
  const result = new Map<string, QuestTextEntry>();
  const seen = new Set<string>();
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    const english = source.values[index];
    const localized = pack.values[index];
    if (!/^\d+:(?:description|objective)$/.test(key) || !english || seen.has(key)) {
      throw new Error(`Invalid quest text key: ${key}`);
    }
    seen.add(key);
    if (localized) {
      if (/\$[A-Za-z]/.test(localized)) throw new Error(`Unresolved quest text token: ${key}`);
      result.set(key, { english, localized });
    }
  }
  return result;
}

export function getQuestText(
  dictionary: Map<string, QuestTextEntry> | undefined,
  id: string | undefined,
  field: "description" | "objective",
  english: string | undefined,
) {
  if (!id || !english) return english;
  const entry = dictionary?.get(`${id}:${field}`);
  return entry?.english === english ? entry.localized : english;
}
