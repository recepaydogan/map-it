import { useEffect, useMemo, useRef, useState } from "react";
import { getMapDataUrl } from "./map-data-url";
import type { CalculatedMapRoute } from "./map-route-pathfinder";
import type { MapMetadata, MapRouteWaypoint } from "./types";

export type MapRouteCalculationState =
  | { status: "idle"; route: CalculatedMapRoute }
  | { status: "calculating"; route: CalculatedMapRoute }
  | { status: "ready"; route: CalculatedMapRoute }
  | { status: "error"; route: CalculatedMapRoute; error: string };

interface RouteWorkerResult {
  type: "result";
  id: number;
  route: CalculatedMapRoute;
}

interface RouteWorkerError {
  type: "error";
  id: number;
  message: string;
}

interface CompletedRouteCalculation {
  key: string;
  state: Extract<MapRouteCalculationState, { status: "ready" | "error" }>;
}

const emptyRoute: CalculatedMapRoute = { points: [], distance: 0 };

export const useCalculatedMapRoute = (
  data: MapMetadata,
  points: MapRouteWaypoint[],
  resilient = false,
): MapRouteCalculationState => {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<{ id: number; key: string } | null>(null);
  const [completed, setCompleted] = useState<CompletedRouteCalculation | null>(null);
  const requestKey = useMemo(() => JSON.stringify({
    bounds: data.bounds,
    points: points.map(({ x, y }) => [x, y]),
    resilient,
    navigationOverlayBaseUrls: data.navigationBaseUrls ?? [],
  }), [data.bounds, data.navigationBaseUrls, points, resilient]);

  useEffect(() => {
    const worker = new Worker(new URL("./map-route-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const handleMessage = (event: MessageEvent<RouteWorkerResult | RouteWorkerError>) => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest || event.data.id !== activeRequest.id) return;
      if (event.data.type === "result") {
        setCompleted({ key: activeRequest.key, state: { status: "ready", route: event.data.route } });
        return;
      }
      console.error("Walkable map route calculation failed.", event.data.message);
      setCompleted({
        key: activeRequest.key,
        state: { status: "error", route: emptyRoute, error: event.data.message },
      });
    };
    worker.addEventListener("message", handleMessage);
    const handleWorkerFailure = (event: ErrorEvent | MessageEvent) => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest) return;
      const message = event instanceof ErrorEvent ? event.message : "Invalid route worker message.";
      console.error("Map route worker failed.", event);
      setCompleted({
        key: activeRequest.key,
        state: { status: "error", route: emptyRoute, error: message },
      });
    };
    worker.addEventListener("error", handleWorkerFailure);
    worker.addEventListener("messageerror", handleWorkerFailure);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerFailure);
      worker.removeEventListener("messageerror", handleWorkerFailure);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = { id: requestId, key: requestKey };
    if (points.length < 2) {
      worker.postMessage({ type: "cancel", id: requestId });
      return;
    }
    worker.postMessage({
      type: resilient ? "calculate-loot" : "calculate",
      id: requestId,
      navigationBaseUrl: getMapDataUrl("navigation"),
      navigationOverlayBaseUrls: data.navigationBaseUrls ?? [],
      points: points.map(({ x, y }) => ({ x, y })),
      bounds: data.bounds,
      originIncluded: false,
    });
  }, [data.bounds, data.navigationBaseUrls, points, requestKey, resilient]);

  if (points.length < 2) return { status: "idle", route: { points: [...points], distance: 0 } };
  return completed?.key === requestKey
    ? completed.state
    : { status: "calculating", route: emptyRoute };
};
