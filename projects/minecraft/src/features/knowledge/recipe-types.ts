export type RecipeMethod = "shaped" | "shapeless" | "cooking" | "cutting" | "brewing" | "smithing";
export interface RecipeSourceConfig {
  edition: string; version: string; repository: string; revision: string;
  sourceUrl?: string;
  recipePrefix: string; tagPrefix: string | null; defaultNamespace: string; dialect: "flat" | "wrapped";
  recipeTypes: Readonly<Record<string, string>>; stations: Readonly<Record<string, readonly string[]>>;
  stationMethodOverrides?: Readonly<Record<string, RecipeMethod>>;
  inactiveTags?: readonly string[];
}
export interface RecipeProvenance { edition: string; version: string; revision: string; path: string; sha256: string; url: string }
export interface IngredientChoice { kind: "item" | "tag"; id: string; data?: number }
export interface RecipeIngredient { choices: IngredientChoice[]; count: number }
export interface RecipeOutput { id: string; count: number; data?: number; components?: Record<string, unknown> }
export interface CatalogRecipe {
  id: string; method: RecipeMethod; sourceType: string; source: RecipeProvenance;
  /** Source-declared/configured stations, not an exhaustive claim about portable crafting. */
  stations: string[]; stationTags: string[];
  ingredients: RecipeIngredient[]; outputs: RecipeOutput[];
  /** A trim's result depends on the selected armor and material, so it has no fixed output. */
  smithingTrim?: { pattern?: string };
  /** Versions before smithing templates use only base and addition slots. */
  legacySmithing?: true;
  /** Row-major ingredient indices. null retains an intentionally empty slot. */
  grid?: { width: number; height: number; slots: (number | null)[] };
  cooking?: { ticks: number | null; experience: number | null };
  unlock?: unknown;
  sourceMetadata: { formatVersion?: string; priority?: number; assumeSymmetry?: boolean };
}
/** Fields needed to render a crafting pattern without claiming catalog provenance. */
export type RecipeVisual = Pick<CatalogRecipe, "id" | "method" | "ingredients" | "outputs" | "grid" | "legacySmithing" | "smithingTrim"> &
  { stations?: readonly string[] };
export interface RecipeIssue { code: "unsupported" | "invalid" | "unresolved-tag" | "inactive" | "ambiguous-source"; path: string; message: string }
export interface RecipeFile { path: string; data: unknown; sha256: string }
