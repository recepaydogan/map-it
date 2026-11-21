import rawErMapData from "../../data/generated/er-map-params.json";
import type { RawErMapMarker } from "./types";

export const rawErMapMarkers = rawErMapData.markers as RawErMapMarker[];

export const legacyBlockWorlds = rawErMapData.legacyBlocks as Record<
  string, { surface: number; worldX: number; worldZ: number }
>;

// Per-block translations from an area-12 local frame to the area-60 world
// grid, derived by the builder from WorldMapLegacyConvParam alone.
export const area12BlockWorlds = rawErMapData.area12Blocks as Record<
  string,
  { worldX: number; worldZ: number }
>;
