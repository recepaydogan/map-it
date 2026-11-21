import type { ReferenceLink, ReferenceSection } from "../reference/reference-types";

const additionalSources = "reference.labels.additional-acquisition-sources";
const boxesTitle = "reference.labels.available-from-boxes";
const linkKey = (link: ReferenceLink) => `${link.category}:${link.id}`;

/** Prefer physical container items over duplicate reward-table links, using exact IDs. */
export function getItemSourceSections(sections: ReferenceSection[], containers: Record<string, ReferenceSection[]>) {
  const representedBoxes = new Set(sections.filter((section) => section.title === boxesTitle)
    .flatMap((section) => section.links ?? []).flatMap((item) => (containers[item.id] ?? [])
      .filter((section) => section.title === "reference.labels.box-contents")
      .flatMap((section) => section.links ?? []).filter((link) => link.category === "boxes").map(linkKey)));
  const result: ReferenceSection[] = [];
  for (const section of sections) {
    if (section.title !== additionalSources) {
      result.push({ ...section });
      continue;
    }
    for (const link of section.links ?? []) {
      if (representedBoxes.has(linkKey(link))) continue;
      const title = link.category === "boxes" ? boxesTitle : `reference.categories.${link.category}`;
      let group = result.find((entry) => entry.title === title);
      if (!group) { group = { title, links: [] }; result.push(group); }
      group.links = [...(group.links ?? []), link];
    }
    if (section.text || section.facts?.length || section.rows?.length) {
      result.push({ ...section, title: "database.acquisition.sources", links: undefined });
    }
  }
  // Merge typed groups with existing sections, preserving different item variants.
  const merged = new Map<string, ReferenceSection>();
  for (const section of result) {
    const previous = merged.get(section.title);
    if (!previous) merged.set(section.title, { ...section });
    else merged.set(section.title, { ...previous,
      text: [previous.text, section.text].filter(Boolean).join("\n\n") || undefined,
      facts: [...(previous.facts ?? []), ...(section.facts ?? [])],
      rows: [...(previous.rows ?? []), ...(section.rows ?? [])],
      links: [...new Map([...(previous.links ?? []), ...(section.links ?? [])].map((link) => [linkKey(link), link])).values()],
    });
  }
  return [...merged.values()];
}
