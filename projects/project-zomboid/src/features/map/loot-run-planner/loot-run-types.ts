import type { MapLocation, SavedLootRun } from "../types";

export interface LootRunItemOption {
  id: string;
  name: string;
  bestWeight: number;
  locationCount: number;
  profileIds: string[];
  lootable: boolean;
}

export interface LootRunTarget {
  location: MapLocation;
  weight: number;
  itemWeights: Record<string, number>;
  distance: number | null;
}

export type LootRunMatchLevel = "best" | "good" | "possible";

export interface LootRunPlannerModel {
  items: LootRunItemOption[];
  selectedItems: LootRunItemOption[];
  targets: LootRunTarget[];
  activeRun: SavedLootRun | null;
}
