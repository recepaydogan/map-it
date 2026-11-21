/** Combine complementary locale evidence for the same reviewed NPC identity. */
export const mergeReviewedEntityNames = (...catalogs) => {
  const merged = {};
  const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
  for (const catalog of catalogs) {
    for (const [name, record] of Object.entries(catalog)) {
      const previous = merged[name];
      if (!previous) {
        merged[name] = record;
        continue;
      }
      const ids = (entry) => [...(entry.npcIds ?? [])].sort((a, b) => a - b).join(",");
      if (ids(previous) !== ids(record)) {
        throw new Error(`${name}: reviewed NPC IDs conflict`);
      }
      for (const language of languages) {
        if (previous[language] && record[language] && previous[language] !== record[language]) {
          throw new Error(`${name}/${language}: reviewed NPC names conflict`);
        }
      }
      merged[name] = {
        ...previous,
        ...record,
        evidence: { ...previous.evidence, ...record.evidence },
      };
    }
  }
  return merged;
};
