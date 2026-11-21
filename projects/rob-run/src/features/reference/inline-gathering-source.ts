import type { ReferenceEntry } from "./reference-types";

export const inlineGatheringSource = (entry: ReferenceEntry, relatedEntries: ReferenceEntry[]): ReferenceEntry => {
  const sourceLink = entry.sections
    .filter((section) => section.title === "reference.labels.related-content")
    .flatMap((section) => section.links ?? [])
    .find((link) => link.category === "gathering");
  const source = relatedEntries.find((related) => related.id === sourceLink?.id && related.category === "gathering");
  if (!source) return entry;

  const sections = entry.sections
    .map((section) => section.title === "reference.labels.related-content"
      ? { ...section, links: section.links?.filter((link) => link.id !== source.id) }
      : section)
    .filter((section) => section.title !== "reference.labels.related-content" || section.links?.length);

  return {
    ...entry,
    facts: [...entry.facts, ...source.facts],
    sections: [...sections, ...source.sections.filter((section) => section.title !== "reference.labels.gathering-results")],
  };
};
