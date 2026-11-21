export interface MarkerLayoutPoint {
  category: string
  id: string
  x: number
  y: number
}

export interface MarkerLayoutGroup<T extends MarkerLayoutPoint> {
  category: string
  members: T[]
  x: number
  y: number
}

interface WorkingGroup<T extends MarkerLayoutPoint> extends MarkerLayoutGroup<T> {
  anchorX: number
  anchorY: number
  sumX: number
  sumY: number
}

const bucketKey = (category: string, column: number, row: number) => (
  `${category}:${column}:${row}`
)

export function groupNearbyMarkers<T extends MarkerLayoutPoint>(
  markers: T[],
  radius: number,
  groupByCategory = true,
): MarkerLayoutGroup<T>[] {
  if (radius <= 0) {
    return markers.map((marker) => ({
      category: marker.category,
      members: [marker],
      x: marker.x,
      y: marker.y,
    }))
  }

  const groups: WorkingGroup<T>[] = []
  const buckets = new Map<string, number[]>()
  const sorted = [...markers].sort((first, second) => (
    (groupByCategory ? first.category.localeCompare(second.category) : 0) ||
    first.y - second.y ||
    first.x - second.x ||
    first.id.localeCompare(second.id)
  ))

  for (const marker of sorted) {
    const bucketCategory = groupByCategory ? marker.category : 'all'
    const column = Math.floor(marker.x / radius)
    const row = Math.floor(marker.y / radius)
    let closestGroup: WorkingGroup<T> | undefined
    let closestDistance = Number.POSITIVE_INFINITY

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const nearby = buckets.get(bucketKey(
          bucketCategory,
          column + offsetX,
          row + offsetY,
        )) ?? []
        for (const index of nearby) {
          const candidate = groups[index]
          const distance = Math.hypot(
            marker.x - candidate.anchorX,
            marker.y - candidate.anchorY,
          )
          if (distance <= radius && distance < closestDistance) {
            closestDistance = distance
            closestGroup = candidate
          }
        }
      }
    }

    if (closestGroup) {
      closestGroup.members.push(marker)
      closestGroup.sumX += marker.x
      closestGroup.sumY += marker.y
      closestGroup.x = closestGroup.sumX / closestGroup.members.length
      closestGroup.y = closestGroup.sumY / closestGroup.members.length
      continue
    }

    const group: WorkingGroup<T> = {
      anchorX: marker.x,
      anchorY: marker.y,
      category: marker.category,
      members: [marker],
      sumX: marker.x,
      sumY: marker.y,
      x: marker.x,
      y: marker.y,
    }
    const index = groups.push(group) - 1
    const key = bucketKey(bucketCategory, column, row)
    buckets.set(key, [...(buckets.get(key) ?? []), index])
  }

  return groups
}

const FAN_FOOT_SEPARATION = 44
const FAN_MINIMUM_RADIUS = 48

const ringRadius = (ring: number) => (
  FAN_MINIMUM_RADIUS + (ring - 1) * FAN_FOOT_SEPARATION
)

const ringCapacity = (ring: number) => Math.max(
  1,
  Math.floor((2 * Math.PI * ringRadius(ring)) / FAN_FOOT_SEPARATION),
)

export interface MarkerFanLayout {
  offsets: Array<{ x: number; y: number }>
  outerRadius: number
}

export function layoutMarkerFan(count: number): MarkerFanLayout {
  if (count <= 0) return { offsets: [], outerRadius: 0 }

  let ringCount = 1
  let capacity = ringCapacity(1)
  while (capacity < count) {
    ringCount += 1
    capacity += ringCapacity(ringCount)
  }

  const weights = Array.from({ length: ringCount }, (_, index) => ringCapacity(index + 1))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const membersPerRing = weights.map((weight) => Math.floor((count * weight) / totalWeight))
  let placed = membersPerRing.reduce((total, members) => total + members, 0)
  for (let index = 0; placed < count; index = (index + 1) % ringCount) {
    membersPerRing[index] += 1
    placed += 1
  }

  const offsets: Array<{ x: number; y: number }> = []
  membersPerRing.forEach((members, index) => {
    if (members === 0) return
    const ring = index + 1
    const radius = ringRadius(ring)
    const step = (2 * Math.PI) / members
    const start = -Math.PI / 2 + (ring % 2 === 0 ? step / 2 : 0)
    for (let member = 0; member < members; member += 1) {
      const angle = start + member * step
      offsets.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      })
    }
  })

  return { offsets, outerRadius: ringRadius(ringCount) }
}
