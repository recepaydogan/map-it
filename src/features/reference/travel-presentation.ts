import type { ReferenceSummary } from "./reference-types";

export interface TravelFilterValue { region: string; faction: string }

export const matchesTravelFilters = (entry: ReferenceSummary, filters: TravelFilterValue) =>
  (!filters.region || entry.travel?.regions.includes(filters.region))
  && (!filters.faction || entry.travel?.faction === filters.faction || (filters.faction !== "unknown" && entry.travel?.faction === "All"));

export const travelGroupKey = (group: string) => ({
  "Teleport Artifact": "reference.travel.types.teleport",
  "Npc Teleport": "reference.travel.types.npc",
  "Rift Data": "reference.travel.types.rift",
  Portal: "reference.travel.types.portal",
})[group];

export const travelValueKey = (value: string) => ({
  All: "reference.travel.factions.All",
  Light: "reference.travel.factions.Light",
  Dark: "reference.travel.factions.Dark",
  unknown: "reference.travel.factions.unknown",
  Interaction: "reference.travel.unlock.Interaction",
  Default: "reference.travel.unlock.Default",
})[value];
