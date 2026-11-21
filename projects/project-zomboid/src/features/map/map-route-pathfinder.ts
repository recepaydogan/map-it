import {
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_EDGE_CLIMB,
  NAVIGATION_EDGE_DOOR,
  NAVIGATION_EDGE_OPEN,
  NAVIGATION_NORTH_SHIFT,
  NAVIGATION_SQUARE_BLOCKED,
  NAVIGATION_SQUARE_SLOW,
  NAVIGATION_WEST_SHIFT,
  getNavigationEdge,
} from "./map-navigation-format.ts";
import type { MapNavigationGrid } from "./map-navigation-grid.ts";
import type { MapCoordinate } from "./types.ts";

export interface MapRouteSearchBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CalculatedMapRoute {
  points: MapCoordinate[];
  distance: number;
}

interface HeapEntry {
  key: number;
  x: number;
  y: number;
  g: number;
  f: number;
  h: number;
}

export class RouteNotFoundError extends Error {}

class MinHeap {
  private readonly entries: HeapEntry[] = [];

  get size() {
    return this.entries.length;
  }

  push(entry: HeapEntry) {
    const entries = this.entries;
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.precedes(entries[index]!, entries[parent]!)) break;
      [entries[index], entries[parent]] = [entries[parent]!, entries[index]!];
      index = parent;
    }
  }

  pop() {
    const entries = this.entries;
    const root = entries[0];
    const tail = entries.pop();
    if (!root || !tail || entries.length === 0) return root;
    entries[0] = tail;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let next = index;
      if (left < entries.length && this.precedes(entries[left]!, entries[next]!)) next = left;
      if (right < entries.length && this.precedes(entries[right]!, entries[next]!)) next = right;
      if (next === index) return root;
      [entries[index], entries[next]] = [entries[next]!, entries[index]!];
      index = next;
    }
  }

  private precedes(left: HeapEntry, right: HeapEntry) {
    return left.f < right.f || (left.f === right.f && (left.h < right.h
      || (left.h === right.h && left.g > right.g)));
  }
}

const directions = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;

const COARSE_GUIDE_RADIUS = 32;
const COARSE_GUIDE_PENALTY = 30;
const ENDPOINT_SNAP_COST_MULTIPLIER = 10;

const heuristicWeightForDistance = (distance: number) => {
  if (distance >= 50_000) return 10;
  if (distance >= 20_000) return 5;
  if (distance >= 5_000) return 2.5;
  return 1;
};

const octileDistance = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = Math.abs(rightX - leftX);
  const dy = Math.abs(rightY - leftY);
  return Math.min(dx, dy) * 14 + Math.abs(dx - dy) * 10;
};

const isBlocked = (value: number | null) => value === null || (value & NAVIGATION_SQUARE_BLOCKED) !== 0;

const edgeBetween = (
  grid: MapNavigationGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) => {
  const from = grid.getSquare(fromX, fromY);
  const to = grid.getSquare(toX, toY);
  if (isBlocked(from) || isBlocked(to)) return NAVIGATION_EDGE_BLOCKED;
  if (toY < fromY) return getNavigationEdge(from!, NAVIGATION_NORTH_SHIFT);
  if (toY > fromY) return getNavigationEdge(to!, NAVIGATION_NORTH_SHIFT);
  if (toX < fromX) return getNavigationEdge(from!, NAVIGATION_WEST_SHIFT);
  return getNavigationEdge(to!, NAVIGATION_WEST_SHIFT);
};

const edgeCost = (edge: number, grid: MapNavigationGrid) => {
  if (edge === NAVIGATION_EDGE_DOOR) return grid.manifest.costs.door;
  if (edge === NAVIGATION_EDGE_CLIMB) return grid.manifest.costs.climb;
  return edge === NAVIGATION_EDGE_OPEN ? 0 : Number.POSITIVE_INFINITY;
};

const insideBounds = (x: number, y: number, bounds: MapRouteSearchBounds) =>
  x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY;

const getCoarseSquare = (grid: MapNavigationGrid, x: number, y: number) => {
  const { width, height } = grid.manifest.coarse;
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return grid.coarseNavigation[y * width + x] ?? null;
};

const coarseEdgeBetween = (
  grid: MapNavigationGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) => {
  const from = getCoarseSquare(grid, fromX, fromY);
  const to = getCoarseSquare(grid, toX, toY);
  if (isBlocked(from) || isBlocked(to)) return NAVIGATION_EDGE_BLOCKED;
  if (toY < fromY) return getNavigationEdge(from!, NAVIGATION_NORTH_SHIFT);
  if (toY > fromY) return getNavigationEdge(to!, NAVIGATION_NORTH_SHIFT);
  if (toX < fromX) return getNavigationEdge(from!, NAVIGATION_WEST_SHIFT);
  return getNavigationEdge(to!, NAVIGATION_WEST_SHIFT);
};

const findNearestCoarseWalkable = (grid: MapNavigationGrid, worldX: number, worldY: number) => {
  const { scale, minX, minY, width, height } = grid.manifest.coarse;
  const originX = Math.floor((worldX - minX) / scale);
  const originY = Math.floor((worldY - minY) / scale);
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (radius > 0 && Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;
        const x = originX + offsetX;
        const y = originY + offsetY;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (!isBlocked(getCoarseSquare(grid, x, y))) return { x, y };
      }
    }
  }
  return null;
};

const findCoarsePath = (
  grid: MapNavigationGrid,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  cancelled: () => boolean,
) => {
  const { width } = grid.manifest.coarse;
  const coarseStart = findNearestCoarseWalkable(grid, start.x, start.y);
  const coarseGoal = findNearestCoarseWalkable(grid, goal.x, goal.y);
  if (!coarseStart || !coarseGoal) return null;
  const keyOf = (x: number, y: number) => y * width + x;
  const startKey = keyOf(coarseStart.x, coarseStart.y);
  const goalKey = keyOf(coarseGoal.x, coarseGoal.y);
  const frontier = new MinHeap();
  const gScores = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  const startH = octileDistance(coarseStart.x, coarseStart.y, coarseGoal.x, coarseGoal.y);
  frontier.push({ key: startKey, ...coarseStart, g: 0, f: startH, h: startH });

  while (frontier.size > 0) {
    if (cancelled()) throw new Error("Route calculation was cancelled.");
    const current = frontier.pop()!;
    if (current.g !== gScores.get(current.key)) continue;
    if (current.key === goalKey) {
      const path = [goalKey];
      let key = goalKey;
      while (cameFrom.has(key)) {
        key = cameFrom.get(key)!;
        path.push(key);
      }
      return path.reverse();
    }

    for (const [dx, dy] of directions) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const target = getCoarseSquare(grid, nextX, nextY);
      if (isBlocked(target)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal) {
        const edges = [
          coarseEdgeBetween(grid, current.x, current.y, current.x + dx, current.y),
          coarseEdgeBetween(grid, current.x, current.y, current.x, current.y + dy),
          coarseEdgeBetween(grid, current.x, current.y + dy, nextX, nextY),
          coarseEdgeBetween(grid, current.x + dx, current.y, nextX, nextY),
        ];
        if (edges.some((edge) => edge === NAVIGATION_EDGE_BLOCKED)) continue;
      } else if (coarseEdgeBetween(grid, current.x, current.y, nextX, nextY) === NAVIGATION_EDGE_BLOCKED) {
        continue;
      }
      const nextKey = keyOf(nextX, nextY);
      const stepCost = diagonal ? 14 : 10;
      const slowCost = (target! & NAVIGATION_SQUARE_SLOW) !== 0 ? 4 : 0;
      const nextG = current.g + stepCost + slowCost;
      if (nextG >= (gScores.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      gScores.set(nextKey, nextG);
      cameFrom.set(nextKey, current.key);
      const h = octileDistance(nextX, nextY, coarseGoal.x, coarseGoal.y);
      frontier.push({ key: nextKey, x: nextX, y: nextY, g: nextG, f: nextG + h, h });
    }
  }
  return null;
};

const buildCoarseGuide = (grid: MapNavigationGrid, path: number[]) => {
  const { width, height } = grid.manifest.coarse;
  const distances = new Uint8Array(width * height);
  distances.fill(COARSE_GUIDE_RADIUS + 1);
  for (const key of path) {
    const x = key % width;
    const y = Math.floor(key / width);
    for (let offsetY = -COARSE_GUIDE_RADIUS; offsetY <= COARSE_GUIDE_RADIUS; offsetY += 1) {
      const nextY = y + offsetY;
      if (nextY < 0 || nextY >= height) continue;
      for (let offsetX = -COARSE_GUIDE_RADIUS; offsetX <= COARSE_GUIDE_RADIUS; offsetX += 1) {
        const nextX = x + offsetX;
        if (nextX < 0 || nextX >= width) continue;
        const distance = Math.max(Math.abs(offsetX), Math.abs(offsetY));
        const index = nextY * width + nextX;
        if (distance < distances[index]!) distances[index] = distance;
      }
    }
  }
  return distances;
};

const coarseGuidePenalty = (
  grid: MapNavigationGrid,
  guide: Uint8Array | null,
  worldX: number,
  worldY: number,
) => {
  if (!guide) return 0;
  const { scale, minX, minY, width, height } = grid.manifest.coarse;
  const x = Math.floor((worldX - minX) / scale);
  const y = Math.floor((worldY - minY) / scale);
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return (COARSE_GUIDE_RADIUS + 1) * COARSE_GUIDE_PENALTY;
  }
  return guide[y * width + x]! * COARSE_GUIDE_PENALTY;
};

const preloadSearchCells = async (
  grid: MapNavigationGrid,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  coarsePath: number[] | null,
) => {
  const requests: Promise<void>[] = [];
  const requestedCells = new Set<string>();
  const requestCell = (cellX: number, cellY: number) => {
    const key = `${cellX},${cellY}`;
    if (requestedCells.has(key)) return;
    requestedCells.add(key);
    const size = grid.manifest.cellSize;
    const request = grid.ensureNeighborhood(cellX * size + Math.floor(size / 2), cellY * size + Math.floor(size / 2));
    if (request) requests.push(request);
  };
  const size = grid.manifest.cellSize;
  const minimumCellX = Math.floor(Math.min(start.x, goal.x) / size);
  const maximumCellX = Math.floor(Math.max(start.x, goal.x) / size);
  const minimumCellY = Math.floor(Math.min(start.y, goal.y) / size);
  const maximumCellY = Math.floor(Math.max(start.y, goal.y) / size);
  const rectangleCells = (maximumCellX - minimumCellX + 1) * (maximumCellY - minimumCellY + 1);
  if (rectangleCells <= 36) {
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) requestCell(cellX, cellY);
    }
  } else if (coarsePath) {
    const { width, scale, minX, minY } = grid.manifest.coarse;
    for (const key of coarsePath) {
      const worldX = minX + (key % width + 0.5) * scale;
      const worldY = minY + (Math.floor(key / width) + 0.5) * scale;
      requestCell(Math.floor(worldX / size), Math.floor(worldY / size));
    }
  }
  await Promise.all(requests);
};

interface WalkableRouteEndpoint {
  x: number;
  y: number;
  snapCost: number;
}

const findWalkableEndpoints = async (
  grid: MapNavigationGrid,
  coordinate: MapCoordinate,
  bounds: MapRouteSearchBounds,
) => {
  const originX = Math.floor(coordinate.x);
  const originY = Math.floor(coordinate.y);
  const radiusLimit = 24;
  const cellSize = grid.manifest.cellSize;
  const loadRequests: Promise<void>[] = [];
  for (let cellY = Math.floor((originY - radiusLimit) / cellSize);
    cellY <= Math.floor((originY + radiusLimit) / cellSize);
    cellY += 1) {
    for (let cellX = Math.floor((originX - radiusLimit) / cellSize);
      cellX <= Math.floor((originX + radiusLimit) / cellSize);
      cellX += 1) {
      const request = grid.ensureNeighborhood(
        cellX * cellSize + Math.floor(cellSize / 2),
        cellY * cellSize + Math.floor(cellSize / 2),
      );
      if (request) loadRequests.push(request);
    }
  }
  await Promise.all(loadRequests);
  const endpoints: WalkableRouteEndpoint[] = [];
  for (let radius = 0; radius <= radiusLimit; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (radius > 0 && Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;
        const x = originX + offsetX;
        const y = originY + offsetY;
        if (!insideBounds(x, y, bounds)) continue;
        if (isBlocked(grid.getSquare(x, y))) continue;
        endpoints.push({
          x,
          y,
          snapCost: octileDistance(originX, originY, x, y),
        });
      }
    }
  }
  if (endpoints.length > 0) {
    return endpoints.sort((left, right) => left.snapCost - right.snapCost);
  }
  throw new RouteNotFoundError("No walkable map square was found near a route stop.");
};

const reconstructPath = (
  cameFrom: Map<number, number>,
  goalKey: number,
  width: number,
  bounds: MapRouteSearchBounds,
) => {
  const keys = [goalKey];
  let current = goalKey;
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    keys.push(current);
  }
  keys.reverse();
  const points = keys.map((key) => ({
    x: bounds.minX + key % width + 0.5,
    y: bounds.minY + Math.floor(key / width) + 0.5,
  }));
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1]!;
    const next = points[index + 1]!;
    return Math.sign(point.x - previous.x) !== Math.sign(next.x - point.x)
      || Math.sign(point.y - previous.y) !== Math.sign(next.y - point.y);
  });
};

const searchLeg = async (
  grid: MapNavigationGrid,
  from: MapCoordinate,
  to: MapCoordinate,
  bounds: MapRouteSearchBounds,
  cancelled: () => boolean,
  expansionLimit = 2_000_000,
  allowLongRouteSegments = true,
) => {
  const starts = await findWalkableEndpoints(grid, from, bounds);
  const goals = await findWalkableEndpoints(grid, to, bounds);
  const start = starts[0]!;
  const goal = goals[0]!;
  const width = bounds.maxX - bounds.minX;
  const keyOf = (x: number, y: number) => (y - bounds.minY) * width + x - bounds.minX;
  const startH = octileDistance(from.x, from.y, to.x, to.y);
  const heuristicWeight = heuristicWeightForDistance(startH);
  const coarsePath = startH >= 20_000 ? findCoarsePath(grid, start, goal, cancelled) : null;
  const coarseGuide = coarsePath ? buildCoarseGuide(grid, coarsePath) : null;
  await preloadSearchCells(grid, start, goal, coarsePath);

  if (allowLongRouteSegments && startH >= 50_000 && coarsePath) {
    const { width: coarseWidth, scale, minX, minY } = grid.manifest.coarse;
    const route: MapCoordinate[] = [];
    let pathIndex = 0;
    while (pathIndex < coarsePath.length - 1) {
      const desiredIndex = Math.min(pathIndex + 128, coarsePath.length - 1);
      let segment: MapCoordinate[] | null = null;
      let reachedIndex = desiredIndex;
      for (; reachedIndex > pathIndex; reachedIndex -= 32) {
        const key = coarsePath[reachedIndex]!;
        const target = reachedIndex === coarsePath.length - 1
          ? to
          : {
              x: minX + (key % coarseWidth + 0.5) * scale,
              y: minY + (Math.floor(key / coarseWidth) + 0.5) * scale,
            };
        try {
          segment = await searchLeg(
            grid,
            route.length > 0 ? route.at(-1)! : from,
            target,
            bounds,
            cancelled,
            80_000,
            false,
          );
          break;
        } catch (error) {
          if (!(error instanceof RouteNotFoundError)) throw error;
        }
      }
      if (!segment || reachedIndex <= pathIndex) throw new RouteNotFoundError("No walkable route connects these stops.");
      route.push(...(route.length > 0 ? segment.slice(1) : segment));
      pathIndex = reachedIndex;
    }
    return route;
  }

  const runFineSearch = async (
    startEndpoints: WalkableRouteEndpoint[],
    goalEndpoints: WalkableRouteEndpoint[],
    heuristicTarget: MapCoordinate,
    searchExpansionLimit: number,
  ) => {
    const frontier = new MinHeap();
    const gScores = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const goalKeys = new Set(goalEndpoints.map(({ x, y }) => keyOf(x, y)));
    for (const endpoint of startEndpoints) {
      const key = keyOf(endpoint.x, endpoint.y);
      const currentScore = gScores.get(key);
      const snapCost = endpoint.snapCost * ENDPOINT_SNAP_COST_MULTIPLIER;
      if (currentScore !== undefined && currentScore <= snapCost) continue;
      gScores.set(key, snapCost);
      const h = octileDistance(endpoint.x, endpoint.y, heuristicTarget.x, heuristicTarget.y);
      frontier.push({
        key,
        x: endpoint.x,
        y: endpoint.y,
        g: snapCost,
        f: snapCost + h * heuristicWeight
          + coarseGuidePenalty(grid, coarseGuide, endpoint.x, endpoint.y),
        h,
      });
    }
    let expanded = 0;

    while (frontier.size > 0) {
      if (cancelled()) throw new Error("Route calculation was cancelled.");
      const current = frontier.pop()!;
      if (current.g !== gScores.get(current.key)) continue;
      if (goalKeys.has(current.key)) return reconstructPath(cameFrom, current.key, width, bounds);
      expanded += 1;
      if (expanded > searchExpansionLimit) return null;
      if (expanded % 5_000 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const loadRequest = grid.ensureNeighborhood(current.x, current.y);
      if (loadRequest) await loadRequest;
      for (const [dx, dy] of directions) {
        const nextX = current.x + dx;
        const nextY = current.y + dy;
        if (!insideBounds(nextX, nextY, bounds)) continue;
        const nextLoadRequest = grid.ensureNeighborhood(nextX, nextY);
        if (nextLoadRequest) await nextLoadRequest;
        const target = grid.getSquare(nextX, nextY);
        if (isBlocked(target)) continue;

        const diagonal = dx !== 0 && dy !== 0;
        let transitionCost: number;
        if (diagonal) {
          const horizontal = edgeBetween(grid, current.x, current.y, current.x + dx, current.y);
          const vertical = edgeBetween(grid, current.x, current.y, current.x, current.y + dy);
          const horizontalFinish = edgeBetween(grid, current.x, current.y + dy, nextX, nextY);
          const verticalFinish = edgeBetween(grid, current.x + dx, current.y, nextX, nextY);
          if ([horizontal, vertical, horizontalFinish, verticalFinish]
            .some((edge) => edge !== NAVIGATION_EDGE_OPEN)) continue;
          transitionCost = grid.manifest.costs.diagonal;
        } else {
          const edge = edgeBetween(grid, current.x, current.y, nextX, nextY);
          const specialCost = edgeCost(edge, grid);
          if (!Number.isFinite(specialCost)) continue;
          transitionCost = grid.manifest.costs.cardinal + specialCost;
        }
        if ((target! & NAVIGATION_SQUARE_SLOW) !== 0) {
          transitionCost += grid.manifest.costs.slowTerrain;
        }

        const nextKey = keyOf(nextX, nextY);
        const nextG = current.g + transitionCost;
        if (nextG >= (gScores.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        gScores.set(nextKey, nextG);
        cameFrom.set(nextKey, current.key);
        const h = octileDistance(nextX, nextY, heuristicTarget.x, heuristicTarget.y);
        frontier.push({
          key: nextKey,
          x: nextX,
          y: nextY,
          g: nextG,
          f: nextG + h * heuristicWeight
            + coarseGuidePenalty(grid, coarseGuide, nextX, nextY),
          h,
        });
      }
    }
    return null;
  };

  // Search backwards from the destination candidates so their snap distance
  // participates in the route cost. This keeps a loot route attached to the
  // closest reachable entrance instead of ending early in a nearby street or
  // parking lot merely because that produces a shorter walking path.
  const anchoredRoute = await runFineSearch(goals, [{ ...start, snapCost: 0 }], from, expansionLimit);
  if (anchoredRoute) return anchoredRoute.reverse();
  const route = await runFineSearch(goals, starts, from, expansionLimit);
  if (route) return route.reverse();
  throw new RouteNotFoundError("No walkable route connects these stops.");
};

const pathDistance = (points: MapCoordinate[]) => points.slice(1).reduce((total, point, index) => {
  const previous = points[index]!;
  return total + Math.hypot(point.x - previous.x, point.y - previous.y);
}, 0);

export const calculateMapRoute = async (
  grid: MapNavigationGrid,
  stops: MapCoordinate[],
  bounds: MapRouteSearchBounds,
  cancelled: () => boolean = () => false,
): Promise<CalculatedMapRoute> => {
  if (stops.length < 2) return { points: [...stops], distance: 0 };
  const points: MapCoordinate[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const leg = await searchLeg(grid, stops[index - 1]!, stops[index]!, bounds, cancelled);
    points.push(...(points.length > 0 ? leg.slice(1) : leg));
  }
  return { points, distance: pathDistance(points) };
};
