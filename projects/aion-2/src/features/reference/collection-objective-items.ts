import type { ReferenceEntry, ReferenceSection } from "./reference-types";

/** Show the objective's required quantity on every accepted item variant. */
export function collectionObjectiveSections(entry: ReferenceEntry): ReferenceSection[] {
  if (entry.category !== "collections" || !entry.id.startsWith("PeriodItemCollectionList:")) return entry.sections;
  const count = entry.facts.find(fact => fact.label === "reference.labels.required-count")?.value;
  return entry.sections.map(section => {
    if (section.title !== "reference.labels.required-items" || !section.links?.length) return section;
    return { ...section, links: section.links.map(link => {
      if (link.quantity !== 0) return link;
      const withoutQuantity = { ...link, quantity: undefined };
      return typeof count === "number" && count > 0
        ? { ...withoutQuantity, quantity: count }
        : withoutQuantity;
    }) };
  });
}
