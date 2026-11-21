export interface WorldRoutePoint {
  x: number;
  z: number;
}

export interface CalculatedWorldRoute {
  points: WorldRoutePoint[];
  distance: number;
  sampleScale: number | null;
  terrainAware: boolean;
}

export type WorldRouteEndpointSelection =
  | { kind: "player" }
  | { kind: "map"; point: WorldRoutePoint | null }
  | { kind: "pin"; pinId: string }
  | { kind: "nearest"; structureType: string };

export type WorldRoutePhase = "idle" | "resolving" | "calculating" | "ready" | "error";
export type WorldRouteError = "endpoint-unavailable" | "same-point" | "structure-unavailable" | "structure-not-found" | "calculation-failed";
