import { hasMatchingFixedProgression } from "./item-progression.mjs";

// A shared Stats name does not make every root template a generated item.
// Cinematic and scene-specific copies can intentionally reuse the same stats.
export const createTreasureItemResolver = ({ stats, byStatsId, byTemplateId, progression = new Map() }) => {
  const records = new Map();
  const resolved = new Map();
  const resolveStats = (statsId) => {
    if (resolved.has(statsId)) return resolved.get(statsId);
    const stat = stats.get(statsId);
    const candidates = byStatsId.get(statsId) ?? [];
    const rootTemplateId = stat?.data.RootTemplate?.toLocaleLowerCase("en-US");
    const itemGroup = stat?.data.ItemGroup || undefined;
    const exact = (byTemplateId.get(rootTemplateId) ?? []).filter((item) => item.statsId === statsId);
    const group = progression.get(itemGroup);
    // Accept progression only when both independent native routes select the
    // same root at every level and rarity, without color/icon/affix variation.
    const fixedProgression = itemGroup && hasMatchingFixedProgression(group, rootTemplateId);
    const useExact = (!itemGroup || fixedProgression) && exact.length > 0;
    // Even without proving precedence between conflicting routes, neither can
    // produce an unrelated sibling root. Keep the precedence review open while
    // removing candidates outside the complete authored root set.
    const candidateRootTemplateIds = group && rootTemplateId
      ? [...new Set([rootTemplateId, ...group.levels.flatMap((level) => level.roots.map((root) => root.rootTemplateId))])]
      : undefined;
    const items = useExact ? exact : candidateRootTemplateIds
      ? candidates.filter((item) => item.templateIds.some((id) => candidateRootTemplateIds.includes(id)))
      : candidates;
    const mode = useExact ? fixedProgression ? "matching-progression-root" : "explicit-root" : itemGroup ? "requires-progression-review"
      : candidates.length ? "requires-root-review" : "unresolved-source-reference";
    records.set(statsId, { statsId, rootTemplateId, itemGroup, mode,
      ...(group ? { progression: group } : {}),
      ...(candidateRootTemplateIds ? { candidateRootTemplateIds } : {}),
      acceptedItemIds: items.map(({ id }) => id),
      rejectedSiblingItemIds: candidates.filter((item) => !items.includes(item)).map(({ id }) => id),
      sourcePath: stat?.provenance });
    resolved.set(statsId, items);
    return items;
  };
  return { resolve: (reference) => resolveStats(reference.replace(/^I_/, "")), resolveStats, records };
};
