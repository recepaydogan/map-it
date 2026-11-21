import type { MapForagingZoneKind } from "./types";

interface MapForagingZoneAppearance {
  fill: string;
  stroke: string;
}

export const FORAGING_ZONE_DRAW_ORDER: MapForagingZoneKind[] = [
  "Nav",
  "TownZone",
  "TrailerPark",
  "FarmLand",
  "Farm",
  "Vegitation",
  "Forest",
  "DeepForest",
];

export const FORAGING_ZONE_APPEARANCE: Record<MapForagingZoneKind, MapForagingZoneAppearance> = {
  Nav: { fill: "rgba(130, 143, 139, 0.12)", stroke: "rgba(186, 199, 194, 0.26)" },
  TownZone: { fill: "rgba(143, 113, 102, 0.14)", stroke: "rgba(206, 166, 148, 0.3)" },
  TrailerPark: { fill: "rgba(183, 126, 76, 0.16)", stroke: "rgba(224, 168, 112, 0.34)" },
  FarmLand: { fill: "rgba(178, 151, 73, 0.16)", stroke: "rgba(221, 193, 104, 0.34)" },
  Farm: { fill: "rgba(148, 122, 58, 0.18)", stroke: "rgba(218, 184, 93, 0.36)" },
  Vegitation: { fill: "rgba(119, 151, 79, 0.16)", stroke: "rgba(166, 198, 119, 0.32)" },
  Forest: { fill: "rgba(69, 124, 68, 0.18)", stroke: "rgba(119, 172, 105, 0.34)" },
  DeepForest: { fill: "rgba(34, 91, 55, 0.22)", stroke: "rgba(82, 145, 89, 0.4)" },
};
