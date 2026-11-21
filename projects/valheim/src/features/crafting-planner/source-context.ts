import type { RecipeGraph, PlannerResourceNode } from '../../lib/crafting/recipe-types.ts'
import type { AcquisitionSource } from '../../lib/crafting/resolve-acquisition-sources.ts'
import type { ResourceNodePoint, ResourceStateIndex } from '../../lib/valheim/resource-state.ts'
import type {
  PlannerMapSourceAction,
  PlannerMapSourceContext,
  PlannerMapSourcePoint,
} from '../../store/planner-map-source-store.ts'
import type { MaterialHint } from './resource-hints.ts'

/** How many confirmed spots ride along to the map for one material. */
export const MAX_MAP_POINTS = 50

export const actionForNodeKind = (kind: string): PlannerMapSourceAction => {
  switch (kind) {
    case 'pickable':
    case 'pickable-item':
      return 'pick'
    case 'mine-rock':
      return 'mine'
    case 'tree':
    case 'tree-log':
      return 'chop'
    case 'container':
      return 'loot'
    default:
      return 'break'
  }
}

/** Human-readable node name derived from the prefab (no localization exists for props). */
export const nodeDisplayName = (prefabName: string): string => prefabName
  .replace(/^(Pickable_|MineRock_|rock\d*_|Pickable)/i, '')
  .replace(/_frac$|_big$|_small\d*$|\d+$/i, '')
  .replace(/[_-]+/g, ' ')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .trim()
  .toLowerCase()
  .replace(/^./, (character) => character.toUpperCase())

/**
 * Standing nodes for one material, nearest first, shaped for the map layer.
 * Also returns the dominant node kind so the banner can describe the action.
 */
export function collectConfirmedPoints(
  resourceIndex: ResourceStateIndex,
  prefabName: string,
  origin: { x: number; z: number },
): { points: PlannerMapSourcePoint[]; total: number; dominant: ResourceNodePoint | null } {
  const standing = resourceIndex.nodesForItem(prefabName)
    .filter((point) => point.status === 'present' || point.status === 'partial')
  const sorted = standing
    .map((point) => ({ point, distance: Math.hypot(point.x - origin.x, point.z - origin.z) }))
    .sort((first, second) => first.distance - second.distance)
  const points = sorted.slice(0, MAX_MAP_POINTS).map(({ point }) => ({
    x: point.x,
    z: point.z,
    nodePrefab: point.nodePrefab,
    status: point.status as PlannerMapSourcePoint['status'],
  }))
  return { points, total: standing.length, dominant: sorted[0]?.point ?? null }
}

/**
 * Builds the "what do I do there" banner data for a material. Prefers a
 * save-confirmed node (with its real yield and tool tier); otherwise describes
 * the best catalog source the hint resolved to.
 */
export function buildSourceContext(
  graph: RecipeGraph,
  prefabName: string,
  hint: MaterialHint,
  sources: AcquisitionSource[],
  dominantNode: ResourceNodePoint | null,
  confirmedCount: number,
): PlannerMapSourceContext | null {
  const itemName = graph.items.get(prefabName.toLowerCase())?.name ?? prefabName

  if (dominantNode) {
    const node: PlannerResourceNode | undefined = graph.resourceNodes[dominantNode.nodePrefab.toLowerCase()]
    const yieldEntry = node?.items.find((entry) => entry.prefabName.toLowerCase() === prefabName.toLowerCase())
    return {
      action: actionForNodeKind(node?.kind ?? 'drop-on-destroyed'),
      subject: nodeDisplayName(dominantNode.nodePrefab),
      itemName,
      amountMin: yieldEntry?.amountMin,
      amountMax: yieldEntry?.amountMax,
      chance: yieldEntry?.chance,
      minToolTier: node?.minToolTier ?? 0,
      confirmedCount,
    }
  }

  switch (hint.kind) {
    case 'creature':
    case 'boss': {
      const source = sources.find((entry) => (entry.kind === 'creature' || entry.kind === 'boss') && entry.name === hint.name)
      return {
        action: hint.kind === 'boss' ? 'defeat' : 'hunt',
        subject: hint.name,
        itemName,
        amountMin: source?.amountMin,
        amountMax: source?.amountMax,
        chance: source?.chance,
      }
    }
    case 'trader':
      return { action: 'buy', subject: hint.name, itemName }
    case 'location': {
      const source = sources.find((entry) => entry.prefabName === hint.locationPrefab)
      return {
        action: 'loot',
        subject: hint.name,
        itemName,
        chance: source?.chance,
        confirmedCount: source?.count,
      }
    }
    case 'fishing':
      return { action: 'fish', subject: '', itemName }
    default:
      return null
  }
}

/** Also used by the hero hint line so the player sees the action before "Go". */
export const actionLabelKey = (action: PlannerMapSourceAction) => `planner.mapMode.action.${action}`
