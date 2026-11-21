import type { AcquisitionKind } from '../../lib/crafting/resolve-acquisition-sources.ts'
import type { PlanMaterial } from '../../lib/crafting/recipe-types.ts'
import type {
  ChecklistFilter,
  ChecklistSort,
  ChecklistTeleportFilter,
} from '../../store/crafting-planner-store.ts'

export interface MaterialPresentation extends PlanMaterial {
  /** Primary acquisition method, used for grouping and sorting. */
  sourceKind: AcquisitionKind | 'unknown'
  /** True when the player typed an owned amount for this material. */
  manuallyTracked: boolean
}

export interface ChecklistViewOptions {
  sort: ChecklistSort
  filter: ChecklistFilter
  teleport: ChecklistTeleportFilter
}

export const CHECKLIST_SORTS: ChecklistSort[] = [
  'recommended',
  'mostMissing',
  'closestToCompletion',
  'sourceType',
  'alphabetical',
]

export const CHECKLIST_FILTERS: ChecklistFilter[] = [
  'missing',
  'all',
  'completed',
  'craftable',
  'raw',
  'manual',
]

export const CHECKLIST_TELEPORT_FILTERS: ChecklistTeleportFilter[] = [
  'any',
  'teleportable',
  'nonTeleportable',
]
