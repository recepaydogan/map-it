import type { MarkerItemIntel } from '../../types/marker-intelligence.ts'
import type {
  PlannerCatalogFile,
  PlannerItemRef,
  PlannerRecipe,
  RecipeGraph,
} from './recipe-types.ts'

export const prefabKey = (prefabName: string) => prefabName.toLowerCase()

const itemRefFromIntel = (item: MarkerItemIntel): PlannerItemRef => ({
  prefabName: item.prefabName,
  name: item.name || item.prefabName,
  icon: item.icon ?? null,
  type: item.type ?? 'unknown',
  teleportable: item.teleportable ?? null,
  maxQuality: Math.max(1, Math.round(item.maxQuality ?? 1)),
  maxStack: item.maxStack ?? null,
  weight: item.weight ?? null,
  isPiece: false,
})

/**
 * Total ingredient units spent per produced item. Lower is cheaper, which makes
 * the default recipe choice deterministic instead of depending on catalog order.
 */
export const recipeCostRatio = (recipe: PlannerRecipe) => {
  const total = recipe.resources.reduce((sum, resource) => sum + resource.amount, 0)
  return total / Math.max(1, recipe.outputAmount)
}

const recipeKindRank: Record<PlannerRecipe['kind'], number> = {
  item: 0,
  conversion: 1,
  piece: 2,
}

/**
 * Several recipes convert different inputs into the same output at the same
 * rate: Coal burns from Wood, Fine Wood, or Round Log, and Copper smelts from
 * ore or scrap. Valheim names derived materials by compounding the base name,
 * so the shorter ingredient name is the base material often enough to make a
 * better default than alphabetical order. It is only a default: every material
 * row lets the player pick another recipe, and the choice is saved per plan.
 */
const ingredientNameLength = (recipe: PlannerRecipe) =>
  recipe.resources.reduce((total, resource) => total + resource.prefabName.length, 0)

export const compareRecipePreference = (first: PlannerRecipe, second: PlannerRecipe) =>
  Number(Boolean(first.isUpgrader)) - Number(Boolean(second.isUpgrader)) ||
  recipeKindRank[first.kind] - recipeKindRank[second.kind] ||
  recipeCostRatio(first) - recipeCostRatio(second) ||
  first.resources.length - second.resources.length ||
  ingredientNameLength(first) - ingredientNameLength(second) ||
  first.outputAmount - second.outputAmount ||
  first.id.localeCompare(second.id)

/**
 * Builds the indexes every planner calculation reads. Called once per catalog
 * load; the result is immutable and safe to memoize by `version`.
 */
export function buildRecipeGraph(
  catalog: PlannerCatalogFile,
  items: Record<string, MarkerItemIntel>,
): RecipeGraph {
  const itemRefs = new Map<string, PlannerItemRef>()
  for (const [key, item] of Object.entries(items)) {
    if (!item?.prefabName) continue
    itemRefs.set(key, itemRefFromIntel(item))
  }
  for (const [key, piece] of Object.entries(catalog.pieceItems ?? {})) {
    if (itemRefs.has(key)) continue
    itemRefs.set(key, {
      prefabName: piece.prefabName,
      name: piece.name || piece.prefabName,
      icon: piece.icon ?? null,
      type: 'buildPiece',
      teleportable: null,
      maxQuality: 1,
      maxStack: null,
      weight: null,
      isPiece: true,
    })
  }

  const recipesById = new Map<string, PlannerRecipe>()
  const recipesByOutput = new Map<string, PlannerRecipe[]>()
  for (const recipe of catalog.recipes ?? []) {
    if (recipesById.has(recipe.id)) continue
    if (recipe.outputAmount < 1 || recipe.resources.length === 0) continue
    recipesById.set(recipe.id, recipe)
    const key = prefabKey(recipe.outputPrefab)
    recipesByOutput.set(key, [...(recipesByOutput.get(key) ?? []), recipe])
  }
  for (const recipes of recipesByOutput.values()) recipes.sort(compareRecipePreference)

  return {
    version: `${catalog.schemaVersion}:${catalog.gameBuild}`,
    recipesById,
    recipesByOutput,
    items: itemRefs,
    stations: new Map(Object.entries(catalog.stations ?? {})),
    itemLocations: new Map(Object.entries(catalog.itemLocations ?? {})),
    creatureLocations: new Map(Object.entries(catalog.creatureLocations ?? {})),
    resourceNodes: catalog.resourceNodes ?? {},
    itemNodes: catalog.itemNodes ?? {},
    unresolvedRecipes: catalog.unresolvedRecipes ?? [],
  }
}

export const findItem = (graph: RecipeGraph, prefabName: string): PlannerItemRef | null =>
  graph.items.get(prefabKey(prefabName)) ?? null

export const recipesFor = (graph: RecipeGraph, prefabName: string): PlannerRecipe[] =>
  graph.recipesByOutput.get(prefabKey(prefabName)) ?? []

/** The recipe used when a target has no explicit preference. */
export const defaultRecipeFor = (graph: RecipeGraph, prefabName: string): PlannerRecipe | null =>
  recipesFor(graph, prefabName).find((recipe) => !recipe.noCraftOnlyUpgrade) ?? null

/**
 * Resolves a saved recipe choice. Returns the fallback when the saved identity
 * disappeared from the catalog so plans survive game updates.
 */
export function resolveRecipeChoice(
  graph: RecipeGraph,
  prefabName: string,
  recipeId: string | null,
  forUpgrade = false,
): { recipe: PlannerRecipe | null; choiceMissing: boolean } {
  const all = recipesFor(graph, prefabName)
  const candidates = forUpgrade
    ? all.filter((recipe) => recipe.kind === 'item')
    : all.filter((recipe) => !recipe.noCraftOnlyUpgrade)
  if (!recipeId) return { recipe: candidates[0] ?? null, choiceMissing: false }
  const chosen = candidates.find((recipe) => recipe.id === recipeId)
  if (chosen) return { recipe: chosen, choiceMissing: false }
  return { recipe: candidates[0] ?? null, choiceMissing: true }
}

export const stationName = (graph: RecipeGraph, stationPrefab: string): string =>
  graph.stations.get(prefabKey(stationPrefab))?.name ?? stationPrefab
