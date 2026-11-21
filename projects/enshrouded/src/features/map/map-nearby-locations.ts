import type { MapLocation, MapPoint } from "./types";

interface NearbyGroup {
  point: MapLocation;
  firstIndex: number;
  count: number;
  centerX: number;
  centerY: number;
  cell: string;
}

const cellKey = (x: number, y: number, distance: number) =>
  `${Math.floor(x / distance)}:${Math.floor(y / distance)}`;

/** Collapse nearby repeats without merging different source identities. */
export const groupNearbySameNameLocations = (
  points: MapPoint[],
  category: string,
  distance: number,
  protectedIds: ReadonlySet<string> = new Set(),
): MapPoint[] => {
  if (distance <= 0) return points;

  const indexed = points.map((point, index) => ({ point, index }));
  const candidates = indexed
    .filter(({ point }) => point.category === category && point.category !== "custom" && !protectedIds.has(point.id))
    .sort((left, right) => left.point.name.localeCompare(right.point.name)
      || left.point.x - right.point.x || left.point.y - right.point.y
      || left.point.id.localeCompare(right.point.id));
  const cellsByName = new Map<string, Map<string, Set<NearbyGroup>>>();
  const groups: NearbyGroup[] = [];
  const distanceSquared = distance * distance;

  for (const { point, index } of candidates) {
    const location = point as MapLocation;
    const identity = JSON.stringify([location.name, location.reference?.category, location.reference?.id ?? location.entityId, location.itemId]);
    const cells = cellsByName.get(identity) ?? new Map<string, Set<NearbyGroup>>();
    cellsByName.set(identity, cells);
    const cellX = Math.floor(location.x / distance);
    const cellY = Math.floor(location.y / distance);
    let nearest: NearbyGroup | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (const group of cells.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? []) {
          const deltaX = location.x - group.centerX;
          const deltaY = location.y - group.centerY;
          const candidateDistance = deltaX * deltaX + deltaY * deltaY;
          if (candidateDistance <= distanceSquared && candidateDistance < nearestDistance) {
            nearest = group;
            nearestDistance = candidateDistance;
          }
        }
      }
    }

    const occurrences = location.occurrences ?? 1;
    if (!nearest) {
      const group: NearbyGroup = {
        point: location,
        firstIndex: index,
        count: occurrences,
        centerX: location.x,
        centerY: location.y,
        cell: cellKey(location.x, location.y, distance),
      };
      groups.push(group);
      const members = cells.get(group.cell) ?? new Set<NearbyGroup>();
      members.add(group);
      cells.set(group.cell, members);
      continue;
    }

    const oldCell = nearest.cell;
    const total = nearest.count + occurrences;
    nearest.centerX = (nearest.centerX * nearest.count + location.x * occurrences) / total;
    nearest.centerY = (nearest.centerY * nearest.count + location.y * occurrences) / total;
    nearest.count = total;
    nearest.firstIndex = Math.min(nearest.firstIndex, index);
    nearest.cell = cellKey(nearest.centerX, nearest.centerY, distance);
    if (nearest.cell !== oldCell) {
      cells.get(oldCell)?.delete(nearest);
      const members = cells.get(nearest.cell) ?? new Set<NearbyGroup>();
      members.add(nearest);
      cells.set(nearest.cell, members);
    }
  }

  const untouched = indexed
    .filter(({ point }) => point.category !== category || point.category === "custom" || protectedIds.has(point.id));
  const collapsed = groups.map(({ point, firstIndex, count, centerX, centerY }) => ({
    index: firstIndex,
    point: count === 1 ? point : {
      ...point,
      x: Math.round(centerX),
      y: Math.round(centerY),
      occurrences: count,
      referenceCoordinates: undefined,
    },
  }));
  return [...untouched, ...collapsed]
    .sort((left, right) => left.index - right.index)
    .map(({ point }) => point);
};
