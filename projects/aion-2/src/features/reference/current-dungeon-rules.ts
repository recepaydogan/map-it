import { CURRENT_DUNGEON_RULES } from "../../game-config";
import type { ReferenceEntry, ReferenceSummary } from "./reference-types";

export function currentDungeonSummary(entry: ReferenceSummary): ReferenceSummary {
  if (!CURRENT_DUNGEON_RULES[entry.id] || !entry.adventure) return entry;
  return { ...entry, adventure: { ...entry.adventure, difficulty: "hard" } };
}

export function currentDungeonEntry(entry: ReferenceEntry): ReferenceEntry {
  const rules = CURRENT_DUNGEON_RULES[entry.id];
  if (!rules || !entry.adventure) return entry;
  return {
    ...entry,
    adventure: { ...entry.adventure, difficulty: "hard" },
    sections: entry.sections.map((section) => section.title === "reference.labels.entry-requirements"
      ? {
        ...section,
        facts: [
          ...(section.facts ?? []).filter((fact) => !["reference.labels.minimum-level", "reference.labels.maximum-level", "reference.labels.equipment-level"].includes(fact.label)),
          { label: "reference.labels.equipment-level", value: rules.requiredItemLevel },
        ],
      }
      : section),
  };
}
