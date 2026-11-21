import {
  DEFAULT_ROCK_SIZE,
  pieceFootprint,
  placedToSimBody,
  ROCK_PREFAB,
  snapPointsOf,
  type BuildingCatalog,
  type PlacedPiece,
  type Yaw,
} from './building-catalog.ts'
import type { SimBody, Vec3 } from './support-solver.ts'

/** `Player.FindClosestSnapPoints` searches within half a metre. */
export const SNAP_DISTANCE = 0.5
/** `Player.IsOverlappingOtherPiece` rejects an identical piece within 5 cm. */
const DUPLICATE_DISTANCE = 0.05

export interface RayHit {
  /** World point under the cursor. */
  point: Vec3
  /** Face normal at the hit (axis-aligned for boxes and the ground). */
  normal: Vec3
}

export interface GhostPlacement {
  /** Transform origin (rock: box centre). */
  origin: Vec3
  yaw: Yaw
  min: Vec3
  max: Vec3
  /** The ghost locked onto an existing snap point. */
  snapped: boolean
  valid: boolean
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * Where a piece would land for a cursor hit: rest the box flush against the
 * hit face (the hammer's ghost sits on whatever it points at), then snap the
 * ghost's snap points onto the closest existing one within 0.5 m — the game's
 * auto snapping — and reject an identical piece already at that spot.
 */
export const planPlacement = (
  prefabName: string,
  yaw: Yaw,
  hit: RayHit,
  scene: readonly PlacedPiece[],
  catalog: BuildingCatalog,
  rockSize: Vec3 = DEFAULT_ROCK_SIZE,
): GhostPlacement | null => {
  const isRock = prefabName === ROCK_PREFAB
  const piece = isRock ? null : catalog.pieces.get(prefabName)
  const footprint = piece ? pieceFootprint(piece, yaw) : null
  if (!isRock && !footprint) return null
  const min: Vec3 = isRock ? { x: -rockSize.x / 2, y: -rockSize.y / 2, z: -rockSize.z / 2 } : footprint!.min
  const max: Vec3 = isRock ? { x: rockSize.x / 2, y: rockSize.y / 2, z: rockSize.z / 2 } : footprint!.max
  const ghostSnaps: Vec3[] = isRock ? [] : footprint!.snapPoints

  // Flush against the face: move the origin so the box side facing the
  // surface touches the hit point along the dominant normal axis.
  const origin: Vec3 = { ...hit.point }
  const axis: 'x' | 'y' | 'z' = Math.abs(hit.normal.y) >= Math.abs(hit.normal.x) && Math.abs(hit.normal.y) >= Math.abs(hit.normal.z)
    ? 'y'
    : Math.abs(hit.normal.x) >= Math.abs(hit.normal.z) ? 'x' : 'z'
  const sign = Math.sign(hit.normal[axis]) || 1
  origin[axis] = hit.point[axis] - (sign > 0 ? min[axis] : max[axis])

  let snapped = false
  if (ghostSnaps.length > 0) {
    let best: { distance: number; origin: Vec3 } | null = null
    for (const placed of scene) {
      if (Math.abs(placed.x - origin.x) > 8 || Math.abs(placed.y - origin.y) > 8 || Math.abs(placed.z - origin.z) > 8) continue
      for (const target of snapPointsOf(placed, catalog)) {
        for (const ghost of ghostSnaps) {
          const candidate = { x: origin.x + ghost.x, y: origin.y + ghost.y, z: origin.z + ghost.z }
          const gap = distance(candidate, target)
          if (gap < SNAP_DISTANCE && (!best || gap < best.distance)) {
            best = { distance: gap, origin: { x: target.x - ghost.x, y: target.y - ghost.y, z: target.z - ghost.z } }
          }
        }
      }
    }
    if (best) {
      origin.x = best.origin.x
      origin.y = best.origin.y
      origin.z = best.origin.z
      snapped = true
    }
  }
  // Nothing goes under the ground.
  if (origin.y + min.y < 0) origin.y = -min.y

  const duplicate = scene.some((placed) =>
    placed.prefabName === prefabName
    && placed.yaw === yaw
    && distance({ x: placed.x, y: placed.y, z: placed.z }, origin) < DUPLICATE_DISTANCE)

  return {
    origin: { x: round(origin.x), y: round(origin.y), z: round(origin.z) },
    yaw,
    min: { x: origin.x + min.x, y: origin.y + min.y, z: origin.z + min.z },
    max: { x: origin.x + max.x, y: origin.y + max.y, z: origin.z + max.z },
    snapped,
    valid: !duplicate,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** Body for a ghost, for rendering the box at its planned spot. */
export const ghostBox = (ghost: GhostPlacement): Pick<SimBody, 'min' | 'max'> => ({ min: ghost.min, max: ghost.max })

/** The world-space bounds of a placed object, if it resolves. */
export const placedBounds = (placed: PlacedPiece, catalog: BuildingCatalog): Pick<SimBody, 'min' | 'max'> | null => {
  const body = placedToSimBody(placed, catalog)
  return body ? { min: body.min, max: body.max } : null
}
