export interface ClusterableMapPoint {
  id: string
  x: number
  z: number
}

export interface MapPointCluster<T extends ClusterableMapPoint> {
  key: string
  x: number
  z: number
  members: T[]
}

/**
 * Groups points whose map markers touch, including transitively connected
 * points. Using connected components is important for dense bases: a greedy
 * centroid can drift away from the next chest and split one visually
 * continuous group into several overlapping badges.
 */
export function clusterMapPoints<T extends ClusterableMapPoint>(
  points: readonly T[],
  radiusWorld: number,
): MapPointCluster<T>[] {
  const parents = points.map((_, index) => index)

  const rootOf = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root]
    while (parents[index] !== index) {
      const parent = parents[index]
      parents[index] = root
      index = parent
    }
    return root
  }

  const join = (first: number, second: number) => {
    const firstRoot = rootOf(first)
    const secondRoot = rootOf(second)
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot
  }

  const radiusSquared = Math.max(0, radiusWorld) ** 2
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const dx = points[first].x - points[second].x
      const dz = points[first].z - points[second].z
      if (dx * dx + dz * dz <= radiusSquared) join(first, second)
    }
  }

  const membersByRoot = new Map<number, T[]>()
  for (let index = 0; index < points.length; index += 1) {
    const root = rootOf(index)
    const members = membersByRoot.get(root)
    if (members) members.push(points[index])
    else membersByRoot.set(root, [points[index]])
  }

  return [...membersByRoot.values()].map((members) => ({
    key: members[0].id,
    x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
    z: members.reduce((sum, member) => sum + member.z, 0) / members.length,
    members,
  }))
}
