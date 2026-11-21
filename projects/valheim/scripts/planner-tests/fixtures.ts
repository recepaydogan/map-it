import fs from 'node:fs'
import path from 'node:path'
import { buildRecipeGraph } from '../../src/lib/crafting/build-recipe-graph.ts'
import type { PlanTarget, PlannerCatalogFile, RecipeGraph } from '../../src/lib/crafting/recipe-types.ts'
import type { MarkerIntelligence } from '../../src/types/marker-intelligence.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const gameDataDirectory = path.join(projectRoot, 'public', 'game-data')

const readGameData = <Value>(filename: string): Value =>
  JSON.parse(fs.readFileSync(path.join(gameDataDirectory, filename), 'utf8')) as Value

export const catalog = readGameData<PlannerCatalogFile>('planner-catalog.json')
export const intelligence = readGameData<MarkerIntelligence>('marker-intelligence.json')
export const graph: RecipeGraph = buildRecipeGraph(catalog, intelligence.items)

let targetCounter = 0

export const makeTarget = (overrides: Partial<PlanTarget> & { prefabName: string }): PlanTarget => {
  targetCounter += 1
  return {
    id: `target-${targetCounter}`,
    quantity: 1,
    currentQuality: 0,
    targetQuality: 1,
    recipeId: null,
    expandIntermediates: true,
    note: '',
    completed: false,
    ...overrides,
  }
}

export const materialAmount = (
  materials: Array<{ prefabName: string; missing: number }>,
  prefabName: string,
) => materials.find((material) => material.prefabName.toLowerCase() === prefabName.toLowerCase())?.missing ?? 0

export const requiredAmount = (
  materials: Array<{ prefabName: string; required: number }>,
  prefabName: string,
) => materials.find((material) => material.prefabName.toLowerCase() === prefabName.toLowerCase())?.required ?? 0
