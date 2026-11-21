/** Keep regional Wowhead quest prose fallbacks traceable to their source locale. */
import { hasConflictingQuestObjectiveNumbers } from "./quest-objective-numbers.mjs";
import { isRejectedNumericProse } from "./rejected-numeric-prose.mjs";
import { isRejectedSemanticProse } from "./rejected-semantic-prose.mjs";
import { isEnglishQuestProseFallback } from "./wowhead-quest-prose-page.mjs";

const fields = ["description", "objective", "progressText", "completionText"];
const numberSet = (value) => new Set((value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
const objectiveNumbersMatch = (english, localized) =>
  !hasConflictingQuestObjectiveNumbers(english, localized) &&
  [...numberSet(english)].every((number) => numberSet(localized).has(number));

export const regionalSpanishQuestUrl = (id) =>
  `https://www.wowhead.com/forever/es/quest=${id}`;

export function directSpanishWowheadQuestField(donors, id, field, english) {
  if (!fields.includes(field) || typeof english !== "string" || !english.trim()) {
    return undefined;
  }
  const localeUrl = regionalSpanishQuestUrl(id);
  const values = donors.flatMap((pack) => {
    const entry = pack.quests[id];
    if (!entry) return [];
    const value = entry?.locales?.esES?.[field];
    if (entry?.english?.[field] !== english ||
      entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${id}` ||
      entry.localeUrls?.esES !== localeUrl || entry.reusedFromQuestId ||
      entry.reusedFieldSources?.[field] || entry.derivedFromItemId ||
      typeof value !== "string" || !value.trim() || value.length > 30_000 ||
      /\$[A-Za-z]/.test(value) || isEnglishQuestProseFallback(value, english) ||
      isRejectedSemanticProse(id, "esES", field, english, value) ||
      isRejectedNumericProse(id, "esES", field, english, value) ||
      (field === "objective" && !objectiveNumbersMatch(english, value))) return [];
    return [value];
  });
  return values.length && new Set(values).size === 1 ? values[0] : undefined;
}

export function applySpanishRegionalQuestFallbacks({ packs, objectivePacks, manual,
  catalog, clientPacks, appFallbacks, questTextIndex, questTextSource }) {
  const pack = packs.esMX;
  const donors = [packs.esES, objectivePacks.esES, manual];
  let added = 0;
  for (const [id, quest] of Object.entries(catalog)) {
    for (const field of fields) {
      const english = quest[field];
      if (!english || manual.quests[id]?.locales?.esMX?.[field] ||
        pack.quests[id]?.locales?.esMX?.[field] ||
        objectivePacks.esMX.quests[id]?.locales?.esMX?.[field]) continue;
      const index = questTextIndex.get(`${id}:${field}`);
      if (index !== undefined && questTextSource.values[index] === english) {
        const localized = clientPacks.esMX.values[index] ||
          appFallbacks.esMX?.[`${id}:${field}`];
        if (localized && !isEnglishQuestProseFallback(localized, english) &&
          (field !== "objective" || objectiveNumbersMatch(english, localized))) continue;
      }
      const value = directSpanishWowheadQuestField(donors, id, field, english);
      if (!value) continue;
      const entry = pack.quests[id] ?? {
        sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
        localeUrls: { esMX: regionalSpanishQuestUrl(id) },
        english: {}, locales: { esMX: {} },
      };
      if (entry.reusedFromQuestId) continue;
      entry.english[field] = english;
      entry.locales.esMX[field] = value;
      (entry.regionalFallbackFields ??= {})[field] = {
        locale: "esES", localeUrl: regionalSpanishQuestUrl(id),
      };
      pack.quests[id] = entry;
      added++;
    }
  }
  return added;
}
