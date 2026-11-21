import type { BiomeTileSource } from "../generation/biome-tile-source.ts";
import type { TerrainScope } from "../terrain/terrain-scope.ts";
import type { CalculatedWorldRoute, WorldRoutePoint } from "./world-route-types.ts";

export interface WorldRouteProfile {
  defaultCost: number;
  biomeCosts: Readonly<Record<number, number>>;
}

const ROUTE_SCALES = [4, 16, 64, 256] as const;
const MAX_GRID_SIDE = 240;
const MAX_GRID_CELLS = 48_000;
const WORLD_LIMIT = 30_000_000;

interface GridBounds {
  scale: typeof ROUTE_SCALES[number];
  cellX: number;
  cellZ: number;
  width: number;
  height: number;
}

interface HeapEntry { key: number; score: number }

class MinHeap {
  private entries: HeapEntry[] = [];
  get size() { return this.entries.length; }
  push(entry: HeapEntry) {
    let index = this.entries.push(entry) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent]!.score <= entry.score) break;
      this.entries[index] = this.entries[parent]!; index = parent;
    }
    this.entries[index] = entry;
  }
  pop() {
    const first = this.entries[0]!;
    const last = this.entries.pop()!;
    if (this.entries.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        if (left >= this.entries.length) break;
        const child = right < this.entries.length && this.entries[right]!.score < this.entries[left]!.score ? right : left;
        if (this.entries[child]!.score >= last.score) break;
        this.entries[index] = this.entries[child]!; index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
}

const routeDistance = (points: readonly WorldRoutePoint[]) => points.slice(1).reduce((total, point, index) => {
  const previous = points[index]!;
  return total + Math.hypot(point.x - previous.x, point.z - previous.z);
}, 0);

const directRoute = (start: WorldRoutePoint, destination: WorldRoutePoint): CalculatedWorldRoute => ({
  points: [{ ...start }, { ...destination }],
  distance: Math.hypot(destination.x - start.x, destination.z - start.z),
  sampleScale: null,
  terrainAware: false,
});

const planGrid = (start: WorldRoutePoint, destination: WorldRoutePoint): GridBounds | null => {
  const distance = Math.hypot(destination.x - start.x, destination.z - start.z);
  for (const scale of ROUTE_SCALES) {
    const padding = Math.max(scale * 6, Math.min(4_096, distance * 0.22));
    const minX = Math.max(-WORLD_LIMIT, Math.min(start.x, destination.x) - padding);
    const maxX = Math.min(WORLD_LIMIT, Math.max(start.x, destination.x) + padding);
    const minZ = Math.max(-WORLD_LIMIT, Math.min(start.z, destination.z) - padding);
    const maxZ = Math.min(WORLD_LIMIT, Math.max(start.z, destination.z) + padding);
    const cellX = Math.floor(minX / scale), cellZ = Math.floor(minZ / scale);
    const width = Math.floor(maxX / scale) - cellX + 1;
    const height = Math.floor(maxZ / scale) - cellZ + 1;
    if (width <= MAX_GRID_SIDE && height <= MAX_GRID_SIDE && width * height <= MAX_GRID_CELLS) {
      return { scale, cellX, cellZ, width, height };
    }
  }
  return null;
};

const simplify = (points: WorldRoutePoint[], tolerance: number): WorldRoutePoint[] => {
  if (points.length <= 2) return points;
  const first = points[0]!, last = points.at(-1)!;
  const dx = last.x - first.x, dz = last.z - first.z;
  const denominator = dx * dx + dz * dz;
  let furthest = 0, index = 0;
  for (let current = 1; current < points.length - 1; current += 1) {
    const point = points[current]!;
    const amount = denominator === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - first.x) * dx + (point.z - first.z) * dz) / denominator));
    const distance = Math.hypot(point.x - (first.x + dx * amount), point.z - (first.z + dz * amount));
    if (distance > furthest) { furthest = distance; index = current; }
  }
  if (furthest <= tolerance) return [first, last];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
};

export const calculateWorldRoute = async (
  source: Pick<BiomeTileSource, "generate">,
  scope: TerrainScope,
  start: WorldRoutePoint,
  destination: WorldRoutePoint,
  profile: WorldRouteProfile,
  signal?: AbortSignal,
): Promise<CalculatedWorldRoute> => {
  if (![start.x, start.z, destination.x, destination.z, profile.defaultCost].every(Number.isFinite)
    || profile.defaultCost < 1) throw new Error("Invalid world route request");
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const grid = planGrid(start, destination);
  if (!grid) return directRoute(start, destination);
  const [tile] = await source.generate(scope, [{ ...grid, blockY: 64 }], signal);
  if (!tile || tile.biomes.length !== grid.width * grid.height) throw new Error("Route biome grid is incomplete");
  const startColumn = Math.max(0, Math.min(grid.width - 1, Math.floor(start.x / grid.scale) - grid.cellX));
  const startRow = Math.max(0, Math.min(grid.height - 1, Math.floor(start.z / grid.scale) - grid.cellZ));
  const goalColumn = Math.max(0, Math.min(grid.width - 1, Math.floor(destination.x / grid.scale) - grid.cellX));
  const goalRow = Math.max(0, Math.min(grid.height - 1, Math.floor(destination.z / grid.scale) - grid.cellZ));
  const startKey = startRow * grid.width + startColumn, goalKey = goalRow * grid.width + goalColumn;
  if (startKey === goalKey) return directRoute(start, destination);

  const scores = new Float64Array(tile.biomes.length); scores.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(tile.biomes.length); previous.fill(-1);
  const frontier = new MinHeap();
  scores[startKey] = 0;
  frontier.push({ key: startKey, score: 0 });
  const directions = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
  let expanded = 0;
  while (frontier.size) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const current = frontier.pop();
    const currentCost = scores[current.key]!;
    const row = Math.floor(current.key / grid.width), column = current.key % grid.width;
    const heuristic = Math.hypot(goalColumn - column, goalRow - row) * profile.defaultCost;
    if (current.score > currentCost + heuristic + 0.0001) continue;
    if (current.key === goalKey) break;
    for (const [moveX, moveZ] of directions) {
      const nextColumn = column + moveX, nextRow = row + moveZ;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.width || nextRow >= grid.height) continue;
      const nextKey = nextRow * grid.width + nextColumn;
      const biomeCost = profile.biomeCosts[tile.biomes[nextKey]!] ?? profile.defaultCost;
      const nextCost = currentCost + biomeCost * (moveX && moveZ ? Math.SQRT2 : 1);
      if (nextCost >= scores[nextKey]!) continue;
      scores[nextKey] = nextCost; previous[nextKey] = current.key;
      frontier.push({ key: nextKey, score: nextCost
        + Math.hypot(goalColumn - nextColumn, goalRow - nextRow) * profile.defaultCost });
    }
    expanded += 1;
    if (expanded % 4_000 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (previous[goalKey] === -1) return directRoute(start, destination);
  const cells: number[] = [goalKey];
  while (cells.at(-1) !== startKey) cells.push(previous[cells.at(-1)!]!);
  cells.reverse();
  const points = cells.map(key => ({
    x: (grid.cellX + key % grid.width + 0.5) * grid.scale,
    z: (grid.cellZ + Math.floor(key / grid.width) + 0.5) * grid.scale,
  }));
  points[0] = { ...start }; points[points.length - 1] = { ...destination };
  const simplified = simplify(points, grid.scale * 0.42);
  return { points: simplified, distance: routeDistance(simplified), sampleScale: grid.scale, terrainAware: true };
};
