export interface ItemStat {
  key: string;
  label: string;
  value: string;
  chancePercent?: number;
}

export interface ItemStatSection {
  key: string;
  stats: ItemStat[];
}

export interface ItemEnhancement {
  level: number;
  itemLevelBonus: number;
  stats: ItemStat[];
  source: string;
}

export interface DatabaseItem {
  id: string;
  duplicateOf?: string;
  hiddenFromList?: boolean;
  name: string;
  category: string;
  grade: string;
  slot?: string;
  forever?: boolean;
  previewReasons?: ("cap" | "sod")[];
  classicChanges?: {
    name?: { before: string; after: string };
    itemLevel?: { before: string; after: string };
    quality?: { before: string; after: string };
    stats?: { before: string; after: string };
    spells?: { before: { id: string; name: string }[]; after: { id: string; name: string }[] };
  };
  allowedClasses?: string[];
  siteEffects?: { kind: "use" | "equip" | "proc"; text: string }[];
  variant?: string;
  icon?: string;
  nameVerified: boolean;
  nameOrigin?: "set";
  description?: string;
  usageLevel?: number;
  itemLevel?: number;
  itemSets?: { id: string; name: string; memberItemIds: string[];
    members?: { id: string; name: string }[];
    bonuses?: { id: string; requiredPieces: number; spellName: string; spellId?: string }[] }[];
  spellLinks?: { id: string; name: string; trigger: "use" | "equipped" | "chance-on-hit" | "pickup" | "learn" | "looted" }[];
  clientDetails?: {
    stackSize?: number;
    bonding?: 1 | 2 | 3 | 4;
    sellPriceCopper?: number;
    buyPriceCopper?: number;
    itemDelayMs?: number;
    containerSlots?: number;
    inventoryType?: number;
  };
  hasReference?: boolean;
  sections: ItemStatSection[];
  enhancements: ItemEnhancement[];
  equipment?: {
    horizontalRangeMeters?: number;
    verticalRangeMeters?: number;
    soulstoneSlots?: number;
    theostoneSlots?: number;
    soulImprintSlots?: number;
  };
  source: string;
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

export interface DatabaseRecipe {
  id: string;
  outputItemId: string;
  outputQuantity: number;
  ingredients: RecipeIngredient[];
  profession?: string;
  masteryLevel?: number;
  visibleInGame?: boolean;
  comboOutputItemId?: string;
  comboProbability?: number;
  source: string;
}

export interface ItemCatalog {
  version: 2;
  items: DatabaseItem[];
  recipes: DatabaseRecipe[];
}

export interface ItemAcquisitionSource {
  kind: "boss-drop" | "enemy-drop" | "merchant" | "gather" | "random-shop" | "coin-shop" | "craft-station" | "pickup";
  name: string;
  region?: string;
  mapId?: string;
  markerId?: string;
  markerCount?: number;
  level?: number;
  price?: { amount: number; currency: string }[];
  bundle?: number;
  limit?: number;
  shop?: string;
  entityId?: string;
  entityIds?: string[];
  recipeId?: string;
  source: string;
}

export interface ItemAcquisition {
  drops: ItemAcquisitionSource[];
  merchants: ItemAcquisitionSource[];
  gathering: ItemAcquisitionSource[];
  shops: ItemAcquisitionSource[];
  crafting: ItemAcquisitionSource[];
  pickups: ItemAcquisitionSource[];
  coinShops: ItemAcquisitionSource[];
}
