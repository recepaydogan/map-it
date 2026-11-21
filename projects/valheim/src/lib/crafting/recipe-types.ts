/**
 * Shared vocabulary for the crafting planner domain.
 *
 * Everything in `src/lib/crafting` is pure: it takes a catalog, a plan, and an
 * optional inventory snapshot and returns plain data. React components render
 * these results and never recompute recipe totals themselves.
 */

export type PlannerRecipeKind = 'item' | 'piece' | 'conversion'

export interface PlannerRecipeResource {
  prefabName: string
  /** Cost of the base craft (quality 1). */
  amount: number
  /** Valheim upgrade math: quality q > 1 costs `amountPerLevel * (q - 1)`. */
  amountPerLevel: number
  upgradeCostModel?: '1.0'
  upgraderResource?: boolean
}

export interface PlannerRecipe {
  id: string
  noCraftOnlyUpgrade?: boolean
  isUpgrader?: boolean
  kind: PlannerRecipeKind
  outputPrefab: string
  outputAmount: number
  /** Empty string means hand crafting. */
  stationPrefab: string
  /** Station used for upgrades when the recipe has no crafting station. */
  repairStationPrefab: string
  stationLevel: number
  requireOnlyOneIngredient: boolean
  qualityResultAmountMultiplier: number
  resources: PlannerRecipeResource[]
  /** Fuel or catalyst consumed per output by a conversion station. */
  fuelPrefab?: string
  fuelPerProduct?: number
}

export interface PlannerStation {
  prefabName: string
  name: string
}

export interface PlannerPieceItem {
  prefabName: string
  name: string
  icon?: string | null
  category: number
  isUpgrade: boolean
}

export type PlannerItemLocationKind = 'pickable' | 'destructible'

export interface PlannerItemLocation {
  locationPrefab: string
  kind: PlannerItemLocationKind
  count: number
  chance: number
}

export interface PlannerCreatureLocation {
  locationPrefab: string
  count: number
}

export interface PlannerResourceNodeItem {
  prefabName: string
  amountMin: number
  amountMax: number
  chance: number
}

/**
 * A harvestable world object (berry bush, ore deposit, tree, destructible)
 * together with what it yields and how picking affects its save ZDO. This is
 * the catalog half of the loot-state model; the save half comes from the
 * parsed world database.
 */
export interface PlannerResourceNode {
  prefabName: string
  kind: string
  respawnTimeMinutes: number
  hideWhenPicked: boolean
  /** Pickaxe/axe tier needed (0 = any tool); from Destructible/MineRock/TreeBase. */
  minToolTier: number
  items: PlannerResourceNodeItem[]
}

export interface PlannerCatalogFile {
  schemaVersion: number
  gameBuild: string
  recipes: PlannerRecipe[]
  pieceItems: Record<string, PlannerPieceItem>
  stations: Record<string, PlannerStation>
  itemLocations: Record<string, PlannerItemLocation[]>
  creatureLocations: Record<string, PlannerCreatureLocation[]>
  /** Keyed by lowercased node prefab name. */
  resourceNodes: Record<string, PlannerResourceNode>
  /** Item prefab (lowercased) to the node prefabs that yield it. */
  itemNodes: Record<string, string[]>
  unresolvedRecipes: Array<{ id: string; reason: string }>
}

/** Presentation record for anything a plan can reference. */
export interface PlannerItemRef {
  prefabName: string
  name: string
  icon: string | null
  type: string
  teleportable: boolean | null
  maxQuality: number
  maxStack: number | null
  weight: number | null
  isPiece: boolean
}

export interface RecipeGraph {
  /** Changes whenever the underlying game data changes. */
  version: string
  recipesById: Map<string, PlannerRecipe>
  /** Keyed by lowercased output prefab name. */
  recipesByOutput: Map<string, PlannerRecipe[]>
  /** Keyed by lowercased prefab name. */
  items: Map<string, PlannerItemRef>
  stations: Map<string, PlannerStation>
  itemLocations: Map<string, PlannerItemLocation[]>
  creatureLocations: Map<string, PlannerCreatureLocation[]>
  /** Keyed by lowercased node prefab name. */
  resourceNodes: Record<string, PlannerResourceNode>
  /** Item prefab (lowercased) to the node prefabs that yield it. */
  itemNodes: Record<string, string[]>
  unresolvedRecipes: Array<{ id: string; reason: string }>
}

export interface PlanTarget {
  id: string
  prefabName: string
  quantity: number
  /** 0 means "I do not own it yet, craft it first". */
  currentQuality: number
  targetQuality: number
  /** Explicit recipe choice; null falls back to the cheapest known recipe. */
  recipeId: string | null
  expandIntermediates: boolean
  note: string
  /** Manual completion, only honoured when live inventory is unavailable. */
  completed: boolean
}

export interface PlanStationRequirement {
  stationPrefab: string
  name: string
  level: number
}

export type PlanWarningCode =
  | 'unknown-item'
  | 'no-recipe'
  | 'recipe-unavailable'
  | 'cycle'
  | 'quality-clamped'
  | 'quantity-capped'
  | 'require-one-ingredient'
  | 'depth-limit'
  | 'nothing-to-do'

export interface PlanWarning {
  code: PlanWarningCode
  targetId?: string
  prefabName?: string
  detail?: string
}

export type PlanLeafReason = 'no-recipe' | 'cycle' | 'expansion-disabled' | 'depth-limit' | 'covered-by-stock'

export interface PlanRequirementNode {
  /** Stable within one calculation; safe as a React key. */
  key: string
  prefabName: string
  item: PlannerItemRef | null
  /** Units required before owned materials are applied. */
  gross: number
  /** Units covered by owned materials. */
  fromStock: number
  /** Units that still have to be crafted or collected. */
  net: number
  /** Crafting runs needed for `net`, when the node is expanded. */
  craftBatches: number
  /** Extra output produced because a recipe yields more than one item. */
  surplus: number
  recipe: PlannerRecipe | null
  station: PlanStationRequirement | null
  children: PlanRequirementNode[]
  expanded: boolean
  leafReason: PlanLeafReason | null
}

export type PlanStepKind = 'craft' | 'upgrade'

export interface PlanStep {
  kind: PlanStepKind
  quality: number
  station: PlanStationRequirement | null
  /** Cost for a single item at this step. */
  resources: Array<{ prefabName: string; amount: number }>
}

export interface PlanTargetResult {
  targetId: string
  prefabName: string
  item: PlannerItemRef | null
  quantity: number
  currentQuality: number
  targetQuality: number
  maxQuality: number
  recipe: PlannerRecipe | null
  alternateRecipeIds: string[]
  steps: PlanStep[]
  stations: PlanStationRequirement[]
  requirements: PlanRequirementNode[]
  warnings: PlanWarning[]
  /** True when the target contributes no requirements the app can resolve. */
  unresolved: boolean
  /** True when every leaf requirement is covered by owned materials. */
  ready: boolean
  requiredUnits: number
  missingUnits: number
  manuallyCompleted: boolean
  /** Copies of the target item already owned, so fewer have to be crafted. */
  ownedOutput: number
  /** Extra output produced because the recipe yields more than one item. */
  surplus: number
}

export interface PlanMaterialTargetShare {
  targetId: string
  gross: number
  net: number
}

export interface PlanMaterial {
  prefabName: string
  item: PlannerItemRef | null
  /** Units the plan needs in total, before owned materials. */
  required: number
  /** Units of owned stock this plan consumed. */
  applied: number
  /** Units still to collect. */
  missing: number
  /** Everything the enabled inventory sources reported for this prefab. */
  ownedTotal: number
  /** Applied to targets ordered ahead of the ones still short. */
  reserved: number
  completion: number
  craftable: boolean
  teleportable: boolean | null
  perTarget: PlanMaterialTargetShare[]
  /** More than one target competes for a limited amount of this material. */
  contended: boolean
}

export interface PlanTotals {
  targets: number
  requiredUnits: number
  missingUnits: number
  completion: number
  readyTargets: number
  distinctMissingMaterials: number
}

export interface PlanCalculation {
  version: string
  targets: PlanTargetResult[]
  /** Merged leaf materials the player still has to gather or already owns. */
  materials: PlanMaterial[]
  /** Merged craftable intermediates that were expanded into sub-requirements. */
  intermediates: PlanMaterial[]
  stations: PlanStationRequirement[]
  warnings: PlanWarning[]
  totals: PlanTotals
}

/** Owned material counts, keyed by lowercased prefab name. */
export type InventoryStock = Record<string, number>

export interface PlanCalculationInput {
  graph: RecipeGraph
  targets: PlanTarget[]
  /** Owned amounts contributed by every enabled source. */
  stock: InventoryStock
  /** Excludes owned material entirely; used when no source is trusted. */
  ignoreStock?: boolean
  /**
   * Manual "done" ticks are only authoritative while live inventory is off.
   * With live data the real counts decide, so the flag is ignored.
   */
  honorManualCompletion?: boolean
  /** Recipe preference for intermediates, keyed by lowercased prefab name. */
  recipeChoices?: Record<string, string>
  maxDepth?: number
}

export const MAX_TARGET_QUANTITY = 999
export const MAX_EXPANSION_DEPTH = 12
