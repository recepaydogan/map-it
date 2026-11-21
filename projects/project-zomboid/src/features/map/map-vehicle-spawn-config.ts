import { getMapDataUrl } from "./map-data-url";
import type { MapVehicleSpawnCategory } from "./types";

export interface MapVehicleSpawnAppearance {
  fill: string;
  stroke: string;
  /** Solid tint for the marker-sized dot drawn when a zone is too small to trace. */
  dot: string;
}

export const VEHICLE_SPAWN_CATEGORIES: MapVehicleSpawnCategory[] = [
  "standard",
  "performance",
  "emergency",
  "service",
  "rural",
  "wreck",
  "traffic",
];

export const VEHICLE_SPAWN_APPEARANCE: Record<MapVehicleSpawnCategory, MapVehicleSpawnAppearance> = {
  standard: { fill: "rgba(115, 137, 151, 0.38)", stroke: "rgba(171, 194, 207, 0.82)", dot: "rgba(150, 175, 191, 0.95)" },
  performance: { fill: "rgba(194, 153, 71, 0.44)", stroke: "rgba(239, 202, 116, 0.9)", dot: "rgba(226, 189, 110, 0.95)" },
  emergency: { fill: "rgba(176, 72, 69, 0.44)", stroke: "rgba(238, 137, 127, 0.9)", dot: "rgba(219, 118, 111, 0.95)" },
  service: { fill: "rgba(76, 142, 146, 0.42)", stroke: "rgba(139, 207, 204, 0.88)", dot: "rgba(126, 191, 189, 0.95)" },
  rural: { fill: "rgba(139, 118, 69, 0.42)", stroke: "rgba(201, 179, 111, 0.88)", dot: "rgba(190, 168, 105, 0.95)" },
  wreck: { fill: "rgba(116, 74, 58, 0.5)", stroke: "rgba(190, 126, 94, 0.9)", dot: "rgba(180, 120, 91, 0.95)" },
  traffic: { fill: "rgba(191, 111, 50, 0.42)", stroke: "rgba(236, 162, 94, 0.9)", dot: "rgba(220, 152, 89, 0.95)" },
};

/**
 * The overlay's own pin glyph, imported from the game's map symbol set. A tire
 * rather than the steering wheel, which already marks garage locations.
 */
export const VEHICLE_SPAWN_ICON = getMapDataUrl("icons/vehicle-spawn.png");
