import {
  CompositeMapNavigationGrid,
  HostedMapNavigationGrid,
  type MapNavigationGrid,
} from "./map-navigation-grid.ts";
import {
  calculateMapRoute,
  RouteNotFoundError,
  type MapRouteSearchBounds,
} from "./map-route-pathfinder.ts";
import type { MapCoordinate } from "./types.ts";

interface RouteWorkerCalculationRequest {
  type: "calculate";
  id: number;
  navigationBaseUrl: string;
  navigationOverlayBaseUrls?: string[];
  points: MapCoordinate[];
  bounds: MapRouteSearchBounds;
}

interface RouteWorkerCancelRequest {
  type: "cancel";
  id: number;
}

interface LootRouteWorkerCalculationRequest {
  type: "calculate-loot";
  id: number;
  navigationBaseUrl: string;
  navigationOverlayBaseUrls?: string[];
  points: MapCoordinate[];
  bounds: MapRouteSearchBounds;
  originIncluded: boolean;
}

type RouteWorkerRequest = RouteWorkerCalculationRequest
  | LootRouteWorkerCalculationRequest
  | RouteWorkerCancelRequest;

interface RouteWorkerScope {
  onmessage: ((event: MessageEvent<RouteWorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const workerScope = globalThis as unknown as RouteWorkerScope;
const grids = new Map<string, Promise<MapNavigationGrid>>();
let latestRequestId = 0;

const loadGrid = (baseUrl: string, overlayBaseUrls: string[] = []) => {
  const key = JSON.stringify([baseUrl, ...overlayBaseUrls]);
  const cached = grids.get(key);
  if (cached) return cached;
  const request: Promise<MapNavigationGrid> = HostedMapNavigationGrid.load(baseUrl)
    .then(async (base) => {
      const overlayResults = await Promise.allSettled(
        overlayBaseUrls.map((url) => HostedMapNavigationGrid.load(url)),
      );
      const overlays = overlayResults.flatMap((result, index) => {
        if (result.status === "fulfilled") return [result.value];
        console.warn(`Optional map navigation overlay could not be loaded: ${overlayBaseUrls[index]}`, result.reason);
        return [];
      });
      return overlays.length > 0 ? new CompositeMapNavigationGrid(base, overlays) : base;
    }).catch((error: unknown) => {
      if (grids.get(key) === request) grids.delete(key);
      throw error;
    });
  grids.set(key, request);
  return request;
};

const removablePointIndex = (points: MapCoordinate[]) => {
  let result = 1;
  let largestDetour = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const next = points[index + 1];
    const detour = next
      ? Math.hypot(point.x - previous.x, point.y - previous.y)
        + Math.hypot(next.x - point.x, next.y - point.y)
        - Math.hypot(next.x - previous.x, next.y - previous.y)
      : Math.hypot(point.x - previous.x, point.y - previous.y);
    if (detour <= largestDetour) continue;
    largestDetour = detour;
    result = index;
  }
  return result;
};

const calculateResilientLootRoute = async (
  grid: MapNavigationGrid,
  points: MapCoordinate[],
  bounds: MapRouteSearchBounds,
  originIncluded: boolean,
  cancelled: () => boolean,
) => {
  const retainedPoints = points.map((point, index) => ({ point, index }));
  while (retainedPoints.length >= 2) {
    try {
      const route = await calculateMapRoute(
        grid,
        retainedPoints.map(({ point }) => point),
        bounds,
        cancelled,
      );
      return { route, retainedPointIndexes: retainedPoints.map(({ index }) => index) };
    } catch (error) {
      if (!(error instanceof RouteNotFoundError)) throw error;
      if (retainedPoints.length === 2) {
        const fallback = retainedPoints[originIncluded ? 1 : 0]!;
        return {
          route: { points: [fallback.point], distance: 0 },
          retainedPointIndexes: [fallback.index],
        };
      }
      retainedPoints.splice(removablePointIndex(retainedPoints.map(({ point }) => point)), 1);
    }
  }
  throw new RouteNotFoundError("No walkable route connects the selected loot stops.");
};

workerScope.onmessage = (event) => {
  const request = event.data;
  latestRequestId = request.id;
  if (request.type === "cancel") return;
  void loadGrid(request.navigationBaseUrl, request.navigationOverlayBaseUrls)
    .then((grid) => request.type === "calculate-loot"
      ? calculateResilientLootRoute(
        grid,
        request.points,
        request.bounds,
        request.originIncluded,
        () => latestRequestId !== request.id,
      )
      : calculateMapRoute(
        grid,
        request.points,
        request.bounds,
        () => latestRequestId !== request.id,
      ).then((route) => ({ route })))
    .then((result) => {
      if (latestRequestId === request.id) {
        workerScope.postMessage({ type: "result", id: request.id, ...result });
      }
    })
    .catch((error: unknown) => {
      if (latestRequestId !== request.id) return;
      workerScope.postMessage({
        type: "error",
        id: request.id,
        code: error instanceof RouteNotFoundError ? "route-not-found" : "calculation-error",
        message: error instanceof Error ? error.message : "Map route calculation failed.",
      });
    });
};
