export interface CraftingPart {
  name: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  output: CraftingPart;
  ingredients: CraftingPart[];
  stations: string[];
  craftTime: string | null;
  sourcePage: string;
  sourceRevision: number | null;
}

export interface CraftingItem {
  name: string;
  page: string;
  imagePath?: string | null;
  description: string | null;
  type: string | null;
  rarity: string | null;
  stackSize: number | null;
  level: number | null;
  biomes: string | null;
  obtaining: string | null;
  sourceRevision: number | null;
  group?: string;
}

export interface CraftingCatalog {
  schemaVersion: number;
  capturedAt: string;
  materials: CraftingItem[];
  stations: CraftingItem[];
  items: CraftingItem[];
  recipes: CraftingRecipe[];
}
