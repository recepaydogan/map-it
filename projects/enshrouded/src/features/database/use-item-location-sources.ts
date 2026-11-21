import type { ReferenceSection } from "../reference/reference-types";
import { useReferenceEntries, useReferenceIndex } from "../reference/use-reference-data";

export function useItemLocationSources(itemId: string, sections: ReferenceSection[]) {
  const links = sections.flatMap((section) => section.links ?? []);
  const ids = new Set(links.filter((link) => link.category === "dungeons").map((link) => link.id));
  const index = useReferenceIndex(ids.size > 0);
  const entries = useReferenceEntries(index.status === "ready" ? index.data.entries.filter((entry) => ids.has(entry.id)) : []);
  const sources = entries.status === "ready" ? entries.data.filter((entry) => entry.locations.length > 0) : [];
  const quantities = sources.flatMap((entry) => entry.sections.flatMap((section) => [
    ...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? []),
  ]).filter((link) => link.category === "items" && link.id === itemId)
    .map((link) => link.rewardRates?.some((rate) => rate.kind !== "direct" || rate.quantityMin !== rate.quantityMax) ? undefined : link.quantity));
  const quantity = quantities.length > 0 && quantities.every((value) => value === quantities[0]) ? quantities[0] : undefined;
  return { sources, quantity, error: ids.size > 0 && (index.status === "error" || entries.status === "error") };
}
