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
  preserveInList?: boolean;
  name: string;
  category: string;
  grade: string;
  variant?: string;
  icon?: string;
  nameVerified: boolean;
  nameOrigin?: "set";
  description?: string;
  binding?: string;
  canDismantle?: boolean;
  usageLevel?: number;
  itemLevel?: number;
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
  kind: "boss-drop" | "enemy-drop" | "merchant" | "gather" | "random-shop" | "cash-shop" | "coin-shop" | "craft-station" | "pickup";
  name: string;
  region?: string;
  mapId?: string;
  markerId?: string;
  markerIds?: string[];
  markerCount?: number;
  itemId?: string;
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
