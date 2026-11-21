import type { MapPoint } from "./types";

export interface ProjectedMapPoint {
  point: MapPoint;
  left: number;
  top: number;
}

export interface MapPointCluster {
  key: string;
  categoryKey: string;
  items: ProjectedMapPoint[];
  left: number;
  top: number;
  x: number;
  y: number;
}

/**
 * Mirrors `MARKER_DETAIL_ZOOM`; kept local so this module stays free of runtime
 * imports for the node test runner. `test-map-clustering.mjs` asserts they match.
 */
export const CLUSTER_DETAIL_ZOOM = 0.45;
/** Normalised zoom at which clustering switches off completely. */
const CLUSTER_FREE_ZOOM = CLUSTER_DETAIL_ZOOM;
/** Closest clustered tier before individual markers take over. */
const CLUSTER_TIGHT_ZOOM = 0.34;
/** Every normalised zoom where the cluster cell shrinks, closest step last. */
export const CLUSTER_ZOOM_STEPS = [
  0.12,
  0.22,
  CLUSTER_TIGHT_ZOOM,
  CLUSTER_FREE_ZOOM,
];
/**
 * Nudge past a step boundary so the rounding of an isometric zoom round-trip
 * (`zoom / 24 * 24`) cannot land a hair below it and keep the coarser cell.
 */
export const CLUSTER_ZOOM_MARGIN = 1.001;
const CLUSTER_PROXIMITY_RATIO = 0.72;

const cellKey = (x: number, y: number, cellSize: number) =>
  `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

const nearbyKeys = (x: number, y: number, cellSize: number) => {
  const cellX = Math.floor(x / cellSize);
  const cellY = Math.floor(y / cellSize);
  const keys: string[] = [];
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      keys.push(`${cellX + offsetX}:${cellY + offsetY}`);
    }
  }
  return keys;
};

const getClusterWorldCellSize = (zoom: number) => {
  if (zoom >= CLUSTER_FREE_ZOOM) return 0;
  if (zoom >= CLUSTER_TIGHT_ZOOM) return 48;
  if (zoom >= 0.22) return 120;
  if (zoom >= 0.12) return 280;
  return 600;
};

export const getClusterProximity = (zoom: number) =>
  getClusterWorldCellSize(zoom) * CLUSTER_PROXIMITY_RATIO;

/** Tightest cell any zoom still clusters with; below it only the free zoom separates pins. */
const TIGHTEST_CLUSTER_PROXIMITY = getClusterProximity(CLUSTER_TIGHT_ZOOM);

const getClosestPairDistance = (items: ProjectedMapPoint[]) => {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < items.length; index += 1) {
    for (let other = index + 1; other < items.length; other += 1) {
      const left = items[index]!.point;
      const right = items[other]!.point;
      closest = Math.min(closest, Math.hypot(left.x - right.x, left.y - right.y));
      // Dense clusters can hold thousands of pins, so stop the quadratic scan
      // once the answer can no longer change.
      if (closest <= TIGHTEST_CLUSTER_PROXIMITY) return closest;
    }
  }
  return closest;
};

/**
 * The normalised zoom a cluster has to reach before every pin inside it stands
 * on its own. Clicking a cluster jumps straight here instead of nudging the
 * zoom by a fixed factor, so one click opens the group rather than handing back
 * a slightly smaller cluster to click again.
 */
export const getClusterDispersalZoom = (
  items: ProjectedMapPoint[],
  clusterMarkers: boolean,
) => {
  const closest = getClosestPairDistance(items);
  const step = CLUSTER_ZOOM_STEPS.find((candidate) =>
    // With clustering left on "automatic" the detail tier drops it entirely,
    // so pins there separate however tightly packed they are.
    (!clusterMarkers && candidate >= CLUSTER_DETAIL_ZOOM) ||
    getClusterProximity(candidate) < closest,
  );
  return (step ?? CLUSTER_FREE_ZOOM) * CLUSTER_ZOOM_MARGIN;
};

export const getClusterCategoryKey = (point: MapPoint) => {
  if (point.category === "pet-souls" && "iconPath" in point) return `${point.category}:${point.iconPath ?? point.name}`;
  if (point.category !== "custom" || !("group" in point)) return point.category;
  return `custom:${point.group ?? "general"}`;
};

export const createMapPointClusters = (
  projectedPoints: ProjectedMapPoint[],
  selectedId: string | null,
  zoom: number,
  categoryKeyForPoint: (point: MapPoint) => string = getClusterCategoryKey,
) => {
  const proximity = getClusterProximity(zoom);
  const pointsByCategory = new Map<string, ProjectedMapPoint[]>();
  for (const projection of projectedPoints) {
    if (projection.point.id === selectedId) continue;
    const categoryKey = categoryKeyForPoint(projection.point);
    const categoryPoints = pointsByCategory.get(categoryKey) ?? [];
    categoryPoints.push(projection);
    pointsByCategory.set(categoryKey, categoryPoints);
  }

  const clusters: MapPointCluster[] = [];
  for (const [categoryKey, categoryPoints] of pointsByCategory) {
    const sortedPoints = [...categoryPoints].sort((left, right) =>
      left.point.x - right.point.x || left.point.y - right.point.y || left.point.id.localeCompare(right.point.id),
    );
    const categoryClusters: MapPointCluster[] = [];
    const cells = new Map<string, Set<number>>();
    const addToCell = (index: number, cluster: MapPointCluster) => {
      const key = cellKey(cluster.x, cluster.y, proximity);
      const members = cells.get(key) ?? new Set<number>();
      members.add(index);
      cells.set(key, members);
    };
    for (const projection of sortedPoints) {
      let nearestCluster: MapPointCluster | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      let nearestIndex = Number.POSITIVE_INFINITY;
      if (proximity > 0) {
        for (const key of nearbyKeys(projection.point.x, projection.point.y, proximity)) {
          for (const index of cells.get(key) ?? []) {
            const cluster = categoryClusters[index]!;
            const distance = Math.hypot(projection.point.x - cluster.x, projection.point.y - cluster.y);
            if (distance <= proximity && (distance < nearestDistance || (distance === nearestDistance && index < nearestIndex))) {
              nearestCluster = cluster;
              nearestDistance = distance;
              nearestIndex = index;
            }
          }
        }
      }
      if (!nearestCluster) {
        categoryClusters.push({
          key: `${categoryKey}:${projection.point.id}`,
          categoryKey,
          items: [projection],
          left: projection.left,
          top: projection.top,
          x: projection.point.x,
          y: projection.point.y,
        });
        if (proximity > 0) addToCell(categoryClusters.length - 1, categoryClusters[categoryClusters.length - 1]!);
        continue;
      }
      const previousCell = cellKey(nearestCluster.x, nearestCluster.y, proximity);
      nearestCluster.items.push(projection);
      const count = nearestCluster.items.length;
      nearestCluster.left += (projection.left - nearestCluster.left) / count;
      nearestCluster.top += (projection.top - nearestCluster.top) / count;
      nearestCluster.x += (projection.point.x - nearestCluster.x) / count;
      nearestCluster.y += (projection.point.y - nearestCluster.y) / count;
      const nextCell = cellKey(nearestCluster.x, nearestCluster.y, proximity);
      if (nextCell !== previousCell) {
        cells.get(previousCell)?.delete(nearestIndex);
        addToCell(nearestIndex, nearestCluster);
      }
    }
    clusters.push(...categoryClusters);
  }

  return clusters;
};
