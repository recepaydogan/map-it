export interface ItemIconDefinition {
  id: string;
  atlas?: string;
  u1?: number;
  u2?: number;
  v1?: number;
  v2?: number;
}

export interface ItemGameplayData {
  slot?: string;
  armorClass?: string;
  armorType?: string;
  weaponType?: string;
  damage?: string;
  damageType?: string;
  proficiency?: string;
  weight?: string;
  value?: string;
  versatileDamage?: string;
  rangeMeters?: number;
  level?: string;
  minimumLevel?: string;
  weaponProperties: string[];
  enchantment: number;
  magical: boolean;
  effects: ItemEffect[];
  boosts: string[];
  passives: string[];
  requirements: string[];
}

export interface ItemEffect {
  id: string;
  kind: "action" | "passive";
  name: string;
  localizedNames: Record<string, string>;
  description?: string;
  localizedDescriptions: Record<string, string>;
}

export interface ItemCraftingMaterial {
  kind: "item" | "category";
  sourceId: string;
  amount: number;
  options: string[];
}

export interface ItemCraftingRecipe {
  id: string;
  source: "item-combination" | "adamantine-forge";
  sourceNames?: Record<string, string>;
  resultAmount: number;
  materials: ItemCraftingMaterial[];
}

export interface ItemCraftingUsage {
  recipeId: string;
  source: "item-combination" | "adamantine-forge";
  sourceNames?: Record<string, string>;
  resultAmount: number;
  resultItemId: string;
}

export interface ItemCraftingData {
  recipeIds: string[];
  usedIn: ItemCraftingUsage[];
}

export type ItemAcquisitionKind =
  | "world"
  | "drop"
  | "pickpocket"
  | "vendor"
  | "container"
  | "random-loot"
  | "reward"
  | "crafted"
  | "carried";

export interface ItemAcquisition {
  id: string;
  sourceId?: string;
  kind: ItemAcquisitionKind;
  certainty: "guaranteed" | "stock" | "random" | "scripted" | "story";
  /** Source alternatives are not simultaneous copies or numerical odds. */
  inventoryVariants?: Array<import("../../lib/inventory-quantity.mjs").InventoryQuantityEntry>;
  source: string;
  localizedSources: Record<string, string>;
  detail?: string;
  localizedDetails?: Record<string, string>;
  locationDetail?: string;
  localizedLocationDetails?: Record<string, string>;
  mapId?: string;
  mapName?: string;
  locationId?: string;
  region?: string;
  amount?: number;
}

export interface ItemDatabaseEntry {
  id: string;
  statsId: string;
  templateIds: string[];
  generation?: {
    rootTemplateId: string;
    templateStatsId?: string;
    origin: "stat-root" | "placed-override" | "equipment-entry" | "placed-identity";
    sourceLine?: number;
    sourcePath?: string;
    sourceObjectId?: string;
  };
  name: string;
  localizedNames: Record<string, string>;
  description?: string;
  localizedDescriptions: Record<string, string>;
  category: string;
  subtype: string;
  type: "Weapon" | "Armor" | "Object";
  rarity: string;
  unique: boolean;
  icon?: ItemIconDefinition;
  gameplay: ItemGameplayData;
  acquisitions: ItemAcquisition[];
  crafting?: ItemCraftingData;
  properties: Record<string, string>;
  provenance: {
    stats: string;
    templateModule: string;
    sourceBuild: string;
  };
}

export interface ItemDatabaseCatalog {
  schemaVersion: number;
  sourceBuild: string;
  generatedAt: string;
  stats: {
    rawTemplates: number;
    localizedCandidates: number;
    items: number;
    iconsResolved: number;
    acquisitionRecords: number;
    recipeDefinitions: number;
    attachedRecipes: number;
    relationRecords: number;
  };
  categories: Array<{ id: string; count: number }>;
  recipes: ItemCraftingRecipe[];
  items: ItemDatabaseEntry[];
}
