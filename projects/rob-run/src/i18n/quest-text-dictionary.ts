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

export type QuestTextField = "description" | "objective" | "progressText" | "completionText";

export function hasConflictingQuestObjectiveNumbers(english: string, localized: string) {
  const numbers = (value: string) => new Set((value.normalize("NFKC")
    .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
  const source = numbers(english);
  const translated = numbers(localized);
  return [...source].some((number) => !translated.has(number)) &&
    [...translated].some((number) => !source.has(number));
}

export interface WowheadQuestProsePack {
  version: number;
  quests: Record<string, {
    reusedFromQuestId?: string;
    regionalFallbackFields?: Partial<Record<QuestTextField, {
      locale: "esES";
      localeUrl: string;
    }>>;
    reusedFieldSources?: Partial<Record<QuestTextField, {
      questId: string;
      localeUrl: string;
    }>>;
    sourceUrl: string;
    localeUrls: Record<string, string>;
    english: Partial<Record<QuestTextField, string>>;
    locales: Record<string, Partial<Record<QuestTextField, string>>>;
  }>;
}

export function createQuestTextDictionary(
  source: QuestTextSource,
  pack: QuestTextPack,
  fallbacks: Record<string, string> = {},
) {
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
    const fallback = fallbacks[key];
    if (fallback !== undefined &&
      (typeof fallback !== "string" || !fallback.trim() || fallback === english || localized)) {
      throw new Error(`Invalid quest text fallback: ${key}`);
    }
    const value = localized && key.endsWith(":objective") &&
      hasConflictingQuestObjectiveNumbers(english, localized)
      ? undefined : localized || fallback;
    if (value) {
      if (/\$[A-Za-z]/.test(value)) throw new Error(`Unresolved quest text token: ${key}`);
      result.set(key, { english, localized: value });
    }
  }
  for (const key of Object.keys(fallbacks)) {
    if (!seen.has(key)) throw new Error(`Unknown quest text fallback: ${key}`);
  }
  return result;
}

export function getQuestText(
  dictionary: Map<string, QuestTextEntry> | undefined,
  id: string | undefined,
  field: QuestTextField,
  english: string | undefined,
) {
  if (!id || !english) return english;
  const entry = dictionary?.get(`${id}:${field}`);
  return entry && (entry.english === english
    || (field === "objective" && entry.english.replace(/\s+/g, " ").trim() === english.replace(/\s+/g, " ").trim()))
    ? entry.localized : english;
}

export function mergeWowheadQuestProse(
  dictionary: Map<string, QuestTextEntry>,
  pack: WowheadQuestProsePack,
  locale: string,
) {
  if (pack.version !== 1 || !pack.quests) throw new Error("Invalid Wowhead quest prose pack");
  for (const [id, quest] of Object.entries(pack.quests)) {
    const localeSourceId = quest.reusedFromQuestId ?? id;
    if (!/^\d+$/.test(id) || !/^\d+$/.test(localeSourceId) ||
      !quest.sourceUrl?.startsWith(`https://www.wowhead.com/forever/`) ||
      !quest.sourceUrl.includes(`quest=${id}`) || !quest.english || !quest.locales ||
      Object.keys(quest.locales).some((language) =>
        !quest.localeUrls?.[language]?.startsWith(`https://www.wowhead.com/forever/`) ||
        !quest.localeUrls[language].includes(`quest=${localeSourceId}`)) ||
      Object.entries(quest.regionalFallbackFields ?? {}).some(([field, source]) =>
        locale !== "esMX" || !/^(?:description|objective|progressText|completionText)$/.test(field) ||
        source?.locale !== "esES" ||
        source.localeUrl !== `https://www.wowhead.com/forever/es/quest=${id}` ||
        !quest.english[field as QuestTextField] ||
        !quest.locales.esMX?.[field as QuestTextField]) ||
      Object.entries(quest.reusedFieldSources ?? {}).some(([field, source]) =>
        Boolean(quest.reusedFromQuestId) ||
        !/^(?:description|progressText|completionText)$/.test(field) ||
        !source || !/^\d+$/.test(source.questId) || source.questId === id ||
        !source.localeUrl?.startsWith(`https://www.wowhead.com/forever/`) ||
        !source.localeUrl.includes(`quest=${source.questId}`) ||
        !quest.english[field as QuestTextField] ||
        !Object.values(quest.locales).some((fields) =>
          fields?.[field as QuestTextField]))) {
      throw new Error(`Invalid Wowhead quest prose identity: ${id}`);
    }
    for (const [field, localized] of Object.entries(quest.locales[locale] ?? {})) {
      const english = quest.english[field as QuestTextField];
      if (!/^(?:description|objective|progressText|completionText)$/.test(field) ||
        !english?.trim() || typeof localized !== "string" || !localized.trim() ||
        localized === english || /\$[A-Za-z]/.test(localized)) {
        throw new Error(`Invalid Wowhead quest prose: ${id}:${field}/${locale}`);
      }
      const key = `${id}:${field}`;
      const existing = dictionary.get(key);
      if (existing && existing.english !== english) {
        throw new Error(`Changed Wowhead quest prose source: ${key}`);
      }
      dictionary.set(key, { english, localized });
    }
  }
  return dictionary;
}
