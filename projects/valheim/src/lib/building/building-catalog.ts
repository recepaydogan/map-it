import type { MaterialClass, MaterialProperties } from './support-model.ts'
import type { SimBody, Vec3 } from './support-solver.ts'

/** `public/game-data/building-catalog.json` (scripts/build-building-catalog.mjs). */
export interface BuildingCatalogFile {
  schemaVersion: number
  materials: Record<MaterialClass, MaterialProperties>
  pieces: BuildingPiece[]
}

export interface BuildingPieceResource {
  prefabName: string
  name: string
  amount: number
}

export interface BuildingPiece {
  prefabName: string
  name: string
  icon: string | null
  category: number
  enabled: boolean
  material: MaterialClass
  health: number
  /** `WearNTear.m_supports` — whether other pieces may rest on it. */
  supports: boolean
  /** Takes rain/wet damage down to 50 % health when not under a roof. */
  noRoofWear: boolean
  noSupportWear: boolean
  ashDamageImmune: boolean
  ashDamageResist: boolean
  burnable: boolean
  forceCorrectCom: boolean
  comfort: number
  comfortGroup: string
  station: string | null
  resources: BuildingPieceResource[]
  /** `WearNTear.m_comOffset` in prefab space (x, y, z). */
  comOffset: [number, number, number]
  /** Union of the solid box colliders in prefab space. */
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
  /** The box is exact (axis-aligned boxes only, no mesh colliders). */
  boxy: boolean
  snapPoints: [number, number, number][]
}

export interface BuildingCatalog {
  materials: Record<MaterialClass, MaterialProperties>
  pieces: Map<string, BuildingPiece>
}

export const indexBuildingCatalog = (file: BuildingCatalogFile): BuildingCatalog => ({
  materials: file.materials,
  pieces: new Map(file.pieces.map((piece) => [piece.prefabName, piece])),
})

/** Yaw in quarter turns (0–3); the game rotates in 22.5° steps, the simulator in 90°. */
export type Yaw = 0 | 1 | 2 | 3

// `|| 0` folds -0 into 0 so rotated offsets compare cleanly.
const round = (value: number) => Math.round(value * 1000) / 1000 || 0

/** Rotate a prefab-space offset about Y by `yaw` quarter turns. */
export const rotateXZ = (x: number, z: number, yaw: Yaw): { x: number; z: number } => {
  switch (yaw) {
    case 1: return { x: z, z: -x }
    case 2: return { x: -x, z: -z }
    case 3: return { x: -z, z: x }
    default: return { x, z }
  }
}

const rotateVec = (vector: Vec3, yaw: Yaw): Vec3 => {
  const { x, z } = rotateXZ(vector.x, vector.z, yaw)
  return { x: round(x), y: round(vector.y), z: round(z) }
}

/** A piece's box, centre of mass, origin and snap points relative to its transform origin. */
export interface PieceFootprint {
  min: Vec3
  max: Vec3
  size: Vec3
  /** Centre of mass relative to the transform origin. */
  com: Vec3
  snapPoints: Vec3[]
}

export const pieceFootprint = (piece: BuildingPiece, yaw: Yaw = 0): PieceFootprint | null => {
  if (!piece.bounds) return null
  const [minX, minY, minZ] = piece.bounds.min
  const [maxX, maxY, maxZ] = piece.bounds.max
  const cornerA = rotateVec({ x: minX, y: minY, z: minZ }, yaw)
  const cornerB = rotateVec({ x: maxX, y: maxY, z: maxZ }, yaw)
  const min = { x: Math.min(cornerA.x, cornerB.x), y: minY, z: Math.min(cornerA.z, cornerB.z) }
  const max = { x: Math.max(cornerA.x, cornerB.x), y: maxY, z: Math.max(cornerA.z, cornerB.z) }
  const seen = new Set<string>()
  const snapPoints: Vec3[] = []
  for (const [x, y, z] of piece.snapPoints) {
    const rotated = rotateVec({ x, y, z }, yaw)
    const key = `${rotated.x}:${rotated.y}:${rotated.z}`
    if (seen.has(key)) continue
    seen.add(key)
    snapPoints.push(rotated)
  }
  return {
    min,
    max,
    size: { x: round(max.x - min.x), y: round(max.y - min.y), z: round(max.z - min.z) },
    com: rotateVec({ x: piece.comOffset[0], y: piece.comOffset[1], z: piece.comOffset[2] }, yaw),
    snapPoints,
  }
}

/** A placed object in the simulator scene. */
export interface PlacedPiece {
  id: string
  /** Catalog prefab, or `rock` for a terrain-like static block. */
  prefabName: string
  /** Transform origin (metres); for rocks the box centre. */
  x: number
  y: number
  z: number
  yaw: Yaw
  /** Only for `rock`: explicit size. */
  size?: Vec3
}

export const ROCK_PREFAB = 'rock'
export const DEFAULT_ROCK_SIZE: Vec3 = { x: 3, y: 2, z: 3 }

export const placedToSimBody = (placed: PlacedPiece, catalog: BuildingCatalog): SimBody | null => {
  if (placed.prefabName === ROCK_PREFAB) {
    const size = placed.size ?? DEFAULT_ROCK_SIZE
    return {
      id: placed.id,
      min: { x: placed.x - size.x / 2, y: placed.y - size.y / 2, z: placed.z - size.z / 2 },
      max: { x: placed.x + size.x / 2, y: placed.y + size.y / 2, z: placed.z + size.z / 2 },
      kind: 'static',
      material: 'Stone',
      supports: true,
    }
  }
  const piece = catalog.pieces.get(placed.prefabName)
  if (!piece) return null
  const footprint = pieceFootprint(piece, placed.yaw)
  if (!footprint) return null
  const centre = {
    x: (footprint.min.x + footprint.max.x) / 2,
    y: (footprint.min.y + footprint.max.y) / 2,
    z: (footprint.min.z + footprint.max.z) / 2,
  }
  return {
    id: placed.id,
    min: { x: placed.x + footprint.min.x, y: placed.y + footprint.min.y, z: placed.z + footprint.min.z },
    max: { x: placed.x + footprint.max.x, y: placed.y + footprint.max.y, z: placed.z + footprint.max.z },
    kind: 'piece',
    material: piece.material,
    supports: piece.supports,
    comOffset: { x: round(footprint.com.x - centre.x), y: round(footprint.com.y - centre.y), z: round(footprint.com.z - centre.z) },
    originOffset: { x: round(-centre.x), y: round(-centre.y), z: round(-centre.z) },
    forceCorrectCom: piece.forceCorrectCom,
  }
}

/** Absolute snap points of a placed object. */
export const snapPointsOf = (placed: PlacedPiece, catalog: BuildingCatalog): Vec3[] => {
  if (placed.prefabName === ROCK_PREFAB) {
    const size = placed.size ?? DEFAULT_ROCK_SIZE
    const points: Vec3[] = []
    for (const dx of [-size.x / 2, 0, size.x / 2]) {
      for (const dz of [-size.z / 2, 0, size.z / 2]) {
        points.push({ x: placed.x + dx, y: placed.y + size.y / 2, z: placed.z + dz })
      }
    }
    return points
  }
  const piece = catalog.pieces.get(placed.prefabName)
  const footprint = piece ? pieceFootprint(piece, placed.yaw) : null
  if (!footprint) return []
  return footprint.snapPoints.map((point) => ({ x: placed.x + point.x, y: placed.y + point.y, z: placed.z + point.z }))
}

/**
 * The simulator's palette: one slot per piece kind, with the size variants
 * the material offers. Only pieces whose collider is an exact box are listed.
 */
export type PieceKind = 'pole' | 'beam' | 'wall' | 'floor' | 'block' | 'stair' | 'arch' | 'door'

export const PIECE_KINDS: readonly PieceKind[] = ['pole', 'beam', 'wall', 'floor', 'stair', 'arch', 'door', 'block']

export const PALETTE: Record<MaterialClass, Partial<Record<PieceKind, string[]>>> = {
  Wood: {
    pole: ['wood_pole2', 'wood_pole', 'darkwood_pole4', 'darkwood_pole'],
    beam: ['wood_beam', 'wood_beam_1', 'darkwood_beam4x4', 'darkwood_beam'],
    wall: ['woodwall', 'wood_wall_half', 'wood_wall_quarter', 'darkwood_decowall'],
    floor: ['wood_floor', 'wood_floor_1x1'],
    stair: ['wood_stair', 'wood_stepladder'],
    arch: ['darkwood_arch', 'ashwood_arch_big'],
    door: ['wood_door'],
  },
  HardWood: {
    pole: ['wood_pole_log_4', 'wood_pole_log'],
    beam: ['wood_wall_log_4x0.5', 'wood_wall_log'],
  },
  Iron: {
    pole: ['woodiron_pole'],
    beam: ['woodiron_beam'],
    wall: ['iron_wall_2x2'],
    floor: ['iron_floor_2x2'],
  },
  Stone: {
    pole: ['stone_pillar'],
    wall: ['stone_wall_2x1', 'stone_wall_1x1', 'stone_wall_4x2'],
    floor: ['stone_floor_2x2'],
    stair: ['stone_stair'],
    arch: ['stone_arch'],
  },
  Marble: {
    pole: ['blackmarble_column_1', 'blackmarble_column_2'],
    floor: ['blackmarble_floor', 'blackmarble_floor_triangle'],
    block: ['blackmarble_1x1', 'blackmarble_2x1x1', 'blackmarble_2x2x2'],
    wall: ['blackmarble_base_1', 'blackmarble_out_1'],
    arch: ['blackmarble_arch'],
    stair: ['blackmarble_stair'],
  },
  Ashstone: {
    pole: ['Piece_grausten_pillarbase_medium', 'Piece_grausten_pillarbase_small', 'ashwood_pole_2m', 'ashwood_pole_1m'],
    beam: ['Piece_grausten_pillarbeam_medium', 'Piece_grausten_pillarbeam_small', 'ashwood_beam_2m', 'ashwood_beam_1m'],
    wall: ['Piece_grausten_wall_2x2', 'Piece_grausten_wall_1x2', 'Piece_grausten_wall_4x2', 'ashwood_wall_2x2', 'ashwood_halfwall_1x2', 'ashwood_quarterwall_1x1'],
    floor: ['Piece_grausten_floor_2x2', 'Piece_grausten_floor_1x1', 'ashwood_floor_2x2', 'ashwood_floor_1x1'],
  },
  Ancient: {},
}

/** Rock sizes offered as static (terrain-like) blocks. */
export const ROCK_SIZES: readonly Vec3[] = [
  { x: 3, y: 2, z: 3 },
  { x: 6, y: 3, z: 6 },
  { x: 2, y: 5, z: 2 },
  { x: 8, y: 2, z: 8 },
  { x: 4, y: 8, z: 4 },
]
