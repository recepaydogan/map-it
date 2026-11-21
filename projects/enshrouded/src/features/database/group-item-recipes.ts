import type { ReferenceEntry } from "../reference/reference-types";

const FACTION = "reference.labels.faction";

// Merge faction variants only when outputs, costs and all other conditions match.
export function groupItemRecipes(entries: ReferenceEntry[], allEntries = new Map(entries.map((entry) => [entry.id, entry]))): ReferenceEntry[] {
  const signature = (entry: ReferenceEntry, ancestors: string[] = []): string => {
    if (ancestors.includes(entry.id)) return entry.id;
    return JSON.stringify({
      name: entry.name,
      group: entry.group,
      description: entry.description,
      hasFaction: entry.facts.some((fact) => fact.label === FACTION),
      facts: entry.facts.filter((fact) => fact.label !== FACTION)
        .sort((a, b) => a.label.localeCompare(b.label)),
      sections: entry.sections.map((section) => ({ ...section, links: section.links?.map((link) => {
        const related = link.category === "recipes" ? allEntries.get(link.id) : undefined;
        return related ? { ...link, id: signature(related, [...ancestors, entry.id]) } : link;
      }) })),
      locations: entry.locations,
    });
  };
  const groups = new Map<string, ReferenceEntry>();
  for (const entry of entries) {
    const key = signature(entry);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...entry, facts: entry.facts.map((fact) => ({ ...fact })), sections: entry.sections.map((section) => ({ ...section, links: section.links?.slice() })) });
      continue;
    }
    const faction = existing.facts.find((fact) => fact.label === FACTION);
    const next = entry.facts.find((fact) => fact.label === FACTION);
    if (faction && next) {
      faction.value = [...new Set([...String(faction.value).split(" / "), String(next.value)])].join(" / ");
    }
    existing.sections.forEach((section, index) => {
      const related = entry.sections[index].links?.filter((link) => link.category === "recipes") ?? [];
      if (related.length) section.links = [...new Map([...(section.links ?? []), ...related].map((link) => [link.id, link])).values()];
    });
  }
  return [...groups.values()];
}
