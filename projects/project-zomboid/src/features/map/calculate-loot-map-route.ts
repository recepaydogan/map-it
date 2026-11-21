import { getMapDataUrl } from "./map-data-url";
import type { CalculatedMapRoute, MapRouteSearchBounds } from "./map-route-pathfinder";
import type { MapCoordinate } from "./types";

interface LootRouteWorkerResult {
  type: "result";
  id: number;
  route: CalculatedMapRoute;
  retainedPointIndexes: number[];
}

interface LootRouteWorkerError {
  type: "error";
  id: number;
  code: "route-not-found" | "calculation-error";
  message: string;
}

export const calculateLootMapRoute = (
  points: MapCoordinate[],
  bounds: MapRouteSearchBounds,
  originIncluded: boolean,
  navigationOverlayBaseUrls: string[],
) => new Promise<LootRouteWorkerResult>((resolve, reject) => {
  const worker = new Worker(new URL("./map-route-worker.ts", import.meta.url), { type: "module" });
  const requestId = Date.now();
  const finish = () => worker.terminate();
  worker.addEventListener("message", (
    event: MessageEvent<LootRouteWorkerResult | LootRouteWorkerError>,
  ) => {
    if (event.data.id !== requestId) return;
    finish();
    if (event.data.type === "result") {
      resolve(event.data);
      return;
    }
    reject(new Error(event.data.message));
  });
  worker.addEventListener("error", (event) => {
    finish();
    reject(event.error instanceof Error ? event.error : new Error(event.message));
  });
  worker.postMessage({
    type: "calculate-loot",
    id: requestId,
    navigationBaseUrl: getMapDataUrl("navigation"),
    navigationOverlayBaseUrls,
    points,
    bounds,
    originIncluded,
  });
});
