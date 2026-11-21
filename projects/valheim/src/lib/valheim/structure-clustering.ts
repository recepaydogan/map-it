import type { SavedStructureCluster } from '../../types/world-save.ts'

export interface PlayerStructurePoint {
  x: number
  z: number
}

/**
 * Building pieces are densely connected but a world may contain many thousands
 * of them. A fixed-size spatial index keeps grouping close to O(n): each piece
 * only compares with pieces in its own or the eight neighbouring cells.
 */
export function clusterPlayerStructures(
  points: readonly PlayerStructurePoint[],
  joinRadius = 12,
): SavedStructureCluster[] {
  if (points.length === 0) return []
  const radius = Math.max(0.1, joinRadius)
  const radiusSquared = radius * radius
  const parents = points.map((_, index) => index)
  const sizes = points.map(() => 1)

  const rootOf = (start: number): number => {
    let index = start
    while (parents[index] !== index) index = parents[index]
    const root = index
    index = start
    while (parents[index] !== index) {
      const parent = parents[index]
      parents[index] = root
      index = parent
    }
    return root
  }
  const join = (first: number, second: number) => {
    let firstRoot = rootOf(first)
    let secondRoot = rootOf(second)
    if (firstRoot === secondRoot) return
    if (sizes[firstRoot] < sizes[secondRoot]) [firstRoot, secondRoot] = [secondRoot, firstRoot]
    parents[secondRoot] = firstRoot
    sizes[firstRoot] += sizes[secondRoot]
  }

  const cells = new Map<string, number[]>()
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const cellX = Math.floor(point.x / radius)
    const cellZ = Math.floor(point.z / radius)
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const neighbours = cells.get(`${cellX + offsetX}:${cellZ + offsetZ}`)
        if (!neighbours) continue
        for (const otherIndex of neighbours) {
          const other = points[otherIndex]
          const dx = point.x - other.x
          const dz = point.z - other.z
          if (dx * dx + dz * dz <= radiusSquared) join(index, otherIndex)
        }
      }
    }
    const key = `${cellX}:${cellZ}`
    const ownCell = cells.get(key)
    if (ownCell) ownCell.push(index)
    else cells.set(key, [index])
  }

  const aggregates = new Map<number, {
    sumX: number
    sumZ: number
    minX: number
    maxX: number
    minZ: number
    maxZ: number
    pieceCount: number
  }>()
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const root = rootOf(index)
    const aggregate = aggregates.get(root)
    if (aggregate) {
      aggregate.sumX += point.x
      aggregate.sumZ += point.z
      aggregate.minX = Math.min(aggregate.minX, point.x)
      aggregate.maxX = Math.max(aggregate.maxX, point.x)
      aggregate.minZ = Math.min(aggregate.minZ, point.z)
      aggregate.maxZ = Math.max(aggregate.maxZ, point.z)
      aggregate.pieceCount += 1
    } else {
      aggregates.set(root, {
        sumX: point.x,
        sumZ: point.z,
        minX: point.x,
        maxX: point.x,
        minZ: point.z,
        maxZ: point.z,
        pieceCount: 1,
      })
    }
  }

  return [...aggregates.values()]
    .map((aggregate) => {
      const x = aggregate.sumX / aggregate.pieceCount
      const z = aggregate.sumZ / aggregate.pieceCount
      return {
        id: `${x.toFixed(1)}:${z.toFixed(1)}:${aggregate.pieceCount}`,
        x,
        z,
        minX: aggregate.minX,
        maxX: aggregate.maxX,
        minZ: aggregate.minZ,
        maxZ: aggregate.maxZ,
        pieceCount: aggregate.pieceCount,
      }
    })
    .sort((first, second) => second.pieceCount - first.pieceCount || first.x - second.x || first.z - second.z)
}
