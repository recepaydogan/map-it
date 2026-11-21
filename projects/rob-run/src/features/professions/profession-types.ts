export interface ProfessionItemLink {
  id: string;
  name: string;
  quantity: number;
  inItemCatalog: boolean;
}

export interface ProfessionRecipe {
  id: string;
  itemId?: string;
  inItemCatalog: boolean;
  name: string;
  icon?: string;
  skill: number;
  clientSkill?: number;
  estimatedSkill: boolean;
  skillThresholds?: number[];
  new: boolean;
  quantity?: number;
  reagents: ProfessionItemLink[];
  source: string;
  sourceItemId?: string;
  sourceItemAvailable?: boolean;
  favorPrice?: number;
  favorVendor?: string;
  favorCheckedDate?: string;
  campProfession?: string;
  classes?: string[];
}

export interface ProfessionFeature {
  itemId?: string;
  name: string;
  skill: number;
  estimatedSkill: boolean;
  materials?: string;
}

export interface ProfessionEntry {
  id: string;
  name: string;
  kind: "primary" | "secondary";
  subtitle: string;
  changes: string[];
  note?: string;
  icon?: string;
  recipeCount: number;
  newRecipeCount: number;
  skillSpan: string;
  fixtureCount?: number;
  featured: ProfessionFeature[];
  fixtures: ProfessionFeature[];
  camping?: { description: string; features: string[] };
  recipes: ProfessionRecipe[];
}

export interface ProfessionCatalog {
  version: 1;
  source: string;
  sourceBuild: string;
  professions: ProfessionEntry[];
}
