import type { MapLibraryEntry } from "./community-map-types";
import { BUILTIN_MAP_ENTRY, BUILTIN_MAP_ID } from "./map-library-config";
import { MAP_DATA_BASE_URL } from "./map-data-url";
import type { MapMetadata } from "./types";

export const createMapBootstrapData = (selectedMap: MapLibraryEntry): MapMetadata => ({
  id: BUILTIN_MAP_ID,
  displayName: selectedMap.displayName,
  description: selectedMap.description ?? BUILTIN_MAP_ENTRY.description,
  schemaVersion: 2,
  gameBuild: selectedMap.gameBuild,
  generatedAt: new Date(0).toISOString(),
  source: "Hosted Project Zomboid map data",
  bounds: {
    minX: 0,
    minY: 0,
    maxX: 19_968,
    maxY: 16_128,
  },
  tileSize: 256,
  detailLevels: [0, 1, 2, 3, 4],
  towns: [],
  locations: [],
  statistics: {
    towns: 0,
    searchableLocations: 0,
  },
  attribution: selectedMap.attribution ?? BUILTIN_MAP_ENTRY.attribution,
  creator: selectedMap.creator || BUILTIN_MAP_ENTRY.creator,
  tileSource: {
    kind: "static",
    basePath: MAP_DATA_BASE_URL,
    tilePattern: "tiles/{level}/tile{x}x{y}.png",
  },
});
