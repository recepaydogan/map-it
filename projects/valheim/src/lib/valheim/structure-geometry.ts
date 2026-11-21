import type { SavedStructureGeometry } from '../../types/world-save.ts'

export const STRUCTURE_KIND_FLOOR = 0
export const STRUCTURE_KIND_DETAIL = 1
export const STRUCTURE_KIND_WALL = 2
export const STRUCTURE_KIND_ROOF = 3

export const STRUCTURE_MATERIAL_WOOD = 0
export const STRUCTURE_MATERIAL_STONE = 1
export const STRUCTURE_MATERIAL_METAL = 2
export const STRUCTURE_MATERIAL_MARBLE = 3
export const STRUCTURE_MATERIAL_ASH = 4
export const STRUCTURE_MATERIAL_OTHER = 5
export const STRUCTURE_MATERIAL_COUNT = 6

export interface StructurePieceSource {
  prefabName: string
  material?: string
  bounds?: { min: [number, number, number]; max: [number, number, number] } | null
  x: number
  z: number
  yaw: number
}

const pieceKind = (prefabName: string): number => {
  const name = prefabName.toLowerCase()
  if (name.includes('roof') || name.includes('thatch')) return STRUCTURE_KIND_ROOF
  if (name.includes('floor') || name.includes('deck') || name.includes('stair') || name.includes('ladder')) {
    return STRUCTURE_KIND_FLOOR
  }
  if (
    name.includes('wall') || name.includes('beam') || name.includes('pole') ||
    name.includes('fence') || name.includes('gate') || name.includes('door') ||
    name.includes('arch') || name.includes('railing') || name.includes('pillar')
  ) return STRUCTURE_KIND_WALL
  return STRUCTURE_KIND_DETAIL
}

const materialKind = (material = ''): number => {
  const name = material.toLowerCase()
  if (name.includes('ash')) return STRUCTURE_MATERIAL_ASH
  if (name.includes('marble')) return STRUCTURE_MATERIAL_MARBLE
  if (name.includes('iron') || name.includes('metal')) return STRUCTURE_MATERIAL_METAL
  if (name.includes('stone')) return STRUCTURE_MATERIAL_STONE
  if (name.includes('wood') || name.includes('ancient')) return STRUCTURE_MATERIAL_WOOD
  return STRUCTURE_MATERIAL_OTHER
}

const fallbackSize = (prefabName: string, kind: number): { width: number; depth: number } => {
  const name = prefabName.toLowerCase()
  if (name.includes('ship')) return { width: 9, depth: 20 }
  if (name.includes('gate')) return { width: 4, depth: 0.5 }
  if (kind === STRUCTURE_KIND_ROOF || kind === STRUCTURE_KIND_FLOOR) return { width: 2, depth: 2 }
  if (kind === STRUCTURE_KIND_WALL) return { width: 2, depth: 0.35 }
  return { width: 0.8, depth: 0.8 }
}

/** Builds map-ready geometry without retaining prefab strings per placed piece. */
export class StructureGeometryBuilder {
  private readonly x: number[] = []
  private readonly z: number[] = []
  private readonly width: number[] = []
  private readonly depth: number[] = []
  private readonly yaw: number[] = []
  private readonly kind: number[] = []
  private readonly material: number[] = []

  push(piece: StructurePieceSource): void {
    const kind = pieceKind(piece.prefabName)
    const bounds = piece.bounds
    const size = bounds
      ? {
          width: Math.max(0.12, bounds.max[0] - bounds.min[0]),
          depth: Math.max(0.12, bounds.max[2] - bounds.min[2]),
        }
      : fallbackSize(piece.prefabName, kind)
    const localCenterX = bounds ? (bounds.min[0] + bounds.max[0]) / 2 : 0
    const localCenterZ = bounds ? (bounds.min[2] + bounds.max[2]) / 2 : 0
    const radians = piece.yaw * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)

    this.x.push(piece.x + localCenterX * cosine + localCenterZ * sine)
    this.z.push(piece.z - localCenterX * sine + localCenterZ * cosine)
    this.width.push(size.width)
    this.depth.push(size.depth)
    this.yaw.push(piece.yaw)
    this.kind.push(kind)
    this.material.push(materialKind(piece.material))
  }

  build(): SavedStructureGeometry {
    return {
      count: this.x.length,
      x: Float32Array.from(this.x),
      z: Float32Array.from(this.z),
      width: Float32Array.from(this.width),
      depth: Float32Array.from(this.depth),
      yaw: Float32Array.from(this.yaw),
      kind: Uint8Array.from(this.kind),
      material: Uint8Array.from(this.material),
    }
  }
}

export const EMPTY_STRUCTURE_GEOMETRY: SavedStructureGeometry = {
  count: 0,
  x: new Float32Array(),
  z: new Float32Array(),
  width: new Float32Array(),
  depth: new Float32Array(),
  yaw: new Float32Array(),
  kind: new Uint8Array(),
  material: new Uint8Array(),
}
