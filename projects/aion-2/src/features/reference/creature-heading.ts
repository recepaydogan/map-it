import type { ReferenceEntry } from "./reference-types";

export const isWorldBoss = (entry: ReferenceEntry) =>
  entry.category === "creatures" && entry.group === "Boss" && Boolean(entry.worldBoss?.length);

export const isQuestNpc = (entry: ReferenceEntry) =>
  entry.category === "creatures" && entry.group === "Citizen"
  && !entry.sections.some((section) => section.title === "reference.adventure.entranceDestinations")
  && entry.sections.some((section) =>
    section.title === "reference.adventure.relatedQuests" && section.links?.some((link) => link.category === "quests"));

export const creatureCategoryKey = (entry: ReferenceEntry) => {
  if (isWorldBoss(entry)) return "reference.categories.world-bosses";
  if (isQuestNpc(entry)) return "map.categories.quest-npc";
  switch (entry.group) {
    case "Boss": return "reference.creatureGroups.bosses";
    case "Monster": return "map.categories.enemy";
    case "Citizen": return "map.categories.npc";
    case "Summon": return "reference.creatureGroups.summons";
    case "Bot": return "reference.creatureGroups.bots";
    default: return "reference.creatureGroups.other";
  }
};

export const getCreatureLevel = (entry: ReferenceEntry) => {
  const factLevel = entry.facts.find((fact) => fact.label === "reference.labels.level")?.value;
  if (typeof factLevel === "number" && factLevel > 0) return factLevel;
  const bossLevel = entry.worldBoss?.find((record) => record.level !== undefined)?.level;
  return typeof bossLevel === "number" && bossLevel > 0 ? bossLevel : undefined;
};
