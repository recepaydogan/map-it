import type { PlanMaterial } from '../../lib/crafting/recipe-types.ts'
import type { AcquisitionKind } from '../../lib/crafting/resolve-acquisition-sources.ts'
import type {
  ChecklistFilter,
  ChecklistSort,
  ChecklistTeleportFilter,
} from '../../store/crafting-planner-store.ts'
import type { MaterialPresentation } from './planner-types.ts'

/** Gather order used by the recommended sort: closest to the player first. */
const sourceKindOrder: Record<AcquisitionKind | 'unknown', number> = {
  locationPickable: 0,
  locationDestructible: 1,
  creature: 2,
  boss: 3,
  trader: 4,
  fishing: 5,
  conversion: 6,
  craft: 7,
  build: 8,
  unknown: 9,
}

const displayName = (material: PlanMaterial) => material.item?.name ?? material.prefabName

export function decorateMaterials(
  materials: PlanMaterial[],
  sourceKindFor: (prefabName: string) => AcquisitionKind | 'unknown',
  manualOwned: Record<string, number>,
): MaterialPresentation[] {
  return materials.map((material) => ({
    ...material,
    sourceKind: sourceKindFor(material.prefabName),
    manuallyTracked: (manualOwned[material.prefabName.toLowerCase()] ?? 0) > 0,
  }))
}

export function filterMaterials(
  materials: MaterialPresentation[],
  filter: ChecklistFilter,
  teleport: ChecklistTeleportFilter,
): MaterialPresentation[] {
  return materials.filter((material) => {
    if (filter === 'missing' && material.missing <= 0) return false
    if (filter === 'completed' && material.missing > 0) return false
    if (filter === 'craftable' && !material.craftable) return false
    if (filter === 'raw' && material.craftable) return false
    if (filter === 'manual' && !material.manuallyTracked) return false
    if (teleport === 'teleportable' && material.teleportable === false) return false
    if (teleport === 'nonTeleportable' && material.teleportable !== false) return false
    return true
  })
}

export function sortMaterials(
  materials: MaterialPresentation[],
  sort: ChecklistSort,
): MaterialPresentation[] {
  const sorted = [...materials]
  switch (sort) {
    case 'mostMissing':
      sorted.sort((first, second) => second.missing - first.missing ||
        displayName(first).localeCompare(displayName(second)))
      break
    case 'closestToCompletion':
      sorted.sort((first, second) => {
        const firstOpen = first.missing > 0 ? 0 : 1
        const secondOpen = second.missing > 0 ? 0 : 1
        return firstOpen - secondOpen ||
          second.completion - first.completion ||
          displayName(first).localeCompare(displayName(second))
      })
      break
    case 'sourceType':
      sorted.sort((first, second) =>
        sourceKindOrder[first.sourceKind] - sourceKindOrder[second.sourceKind] ||
        second.missing - first.missing ||
        displayName(first).localeCompare(displayName(second)))
      break
    case 'alphabetical':
      sorted.sort((first, second) => displayName(first).localeCompare(displayName(second)))
      break
    case 'recommended':
    default:
      // Outstanding work first, raw materials before things that can be crafted
      // from what the player already has, then the biggest gaps.
      sorted.sort((first, second) => {
        const firstOpen = first.missing > 0 ? 0 : 1
        const secondOpen = second.missing > 0 ? 0 : 1
        return firstOpen - secondOpen ||
          Number(first.craftable) - Number(second.craftable) ||
          second.missing - first.missing ||
          displayName(first).localeCompare(displayName(second))
      })
      break
  }
  return sorted
}

export const percentLabel = (completion: number) => Math.round(Math.min(1, Math.max(0, completion)) * 100)

/** Compact "2 minutes ago" style age used by the live inventory chip. */
export function relativeAgeKey(ageMs: number): { key: string; value: number } {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds < 60) return { key: 'seconds', value: seconds }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return { key: 'minutes', value: minutes }
  return { key: 'hours', value: Math.round(minutes / 60) }
}
