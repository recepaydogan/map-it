export interface CraftServiceRecipe {
  id: string;
  name: string;
  icon: string;
  mastery: number;
  craftType: string;
  comboChance: number;
  comboResult?: "higher-level" | "extra-items" | "alternate" | "same-item" | "unlisted";
}

export interface CraftService {
  unlockLevel: number;
  listedCount: number;
  groups: { tab: string; recipes: CraftServiceRecipe[] }[];
}

export interface CraftServicesData {
  version: 1;
  stations: Record<string, CraftService>;
}
