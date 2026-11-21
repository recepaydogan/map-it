import type { SavedStructureGeometry } from '../../types/world-save.ts'
import {
  STRUCTURE_KIND_DETAIL,
  STRUCTURE_KIND_ROOF,
  STRUCTURE_MATERIAL_COUNT,
  STRUCTURE_MATERIAL_OTHER,
} from './structure-geometry.ts'

const coordinate = (value: number) => Math.round(value * 20) / 20

const piecePath = (
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  yaw: number,
): string => {
  const radians = yaw * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const corners: Array<[number, number]> = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ]
  const transformed = corners.map(([localX, localZ]) => {
    const x = centerX + localX * cosine + localZ * sine
    const z = centerZ - localX * sine + localZ * cosine
    return `${coordinate(x)},${coordinate(-z)}`
  })
  return `M${transformed[0]}L${transformed[1]}L${transformed[2]}L${transformed[3]}Z`
}

/** Heavy string generation runs in the save worker, never during map interaction. */
export const buildStructureMapPaths = (geometry: SavedStructureGeometry): string[] => {
  const groups = Array.from({ length: 4 * STRUCTURE_MATERIAL_COUNT }, () => [] as string[])
  for (let index = 0; index < geometry.count; index += 1) {
    const kind = Math.min(STRUCTURE_KIND_ROOF, geometry.kind[index] ?? STRUCTURE_KIND_DETAIL)
    const material = Math.min(STRUCTURE_MATERIAL_OTHER, geometry.material[index] ?? STRUCTURE_MATERIAL_OTHER)
    groups[kind * STRUCTURE_MATERIAL_COUNT + material].push(piecePath(
      geometry.x[index],
      geometry.z[index],
      geometry.width[index],
      geometry.depth[index],
      geometry.yaw[index],
    ))
  }
  return groups.map((parts) => parts.join(''))
}
