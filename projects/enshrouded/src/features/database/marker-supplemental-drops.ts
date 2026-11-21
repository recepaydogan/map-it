import type { ReferenceLink, ReferenceSection } from "../reference/reference-types";
import type { MarkerItemSummary, MarkerRewardGroup } from "./use-marker-items";

/** Preserve preview-only drops without repeating resolved rewards or companion souls. */
export function markerSupplementalDrops(
  items: MarkerItemSummary[], groups: MarkerRewardGroup[], sections: ReferenceSection[], excludedIds: string[] = [],
): ReferenceLink[] {
  const covered = new Set([...excludedIds, ...groups.flatMap((group) => [
    ...group.items, ...group.packages.flatMap((pack) => pack.items),
  ].map((item) => item.id))]);
  const drops = new Map<string, ReferenceLink>();
  for (const item of items) {
    if (item.sourceScope && !covered.has(item.id)) drops.set(item.id, { ...item, category: "items" });
  }
  for (const section of sections) {
    if (!["reference.labels.possible-drops", "reference.labels.guaranteed-drops"].includes(section.title)) continue;
    for (const link of [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]) {
      if (link.category === "items" && !covered.has(link.id)) {
        const previous = drops.get(link.id);
        drops.set(link.id, { ...previous, ...link, rewardRates: link.rewardRates?.length ? link.rewardRates : previous?.rewardRates });
      }
    }
  }
  return [...drops.values()];
}
