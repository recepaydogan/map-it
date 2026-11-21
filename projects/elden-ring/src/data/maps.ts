import type { Game, MapImage, MapLayer } from "./types";

/**
 * Map image descriptors for the Leaflet CRS.Simple view.
 *
 * These are the real in-game maps (clean base terrain, no baked-in POI icons)
 * so our own markers own the surface:
 *  - Elden Ring overworld / underground: extracted menu maps.
 *  - Nightreign Limveld: stitched from the MIT NikVince tile set.
 *
 * The renderer only consumes { src, width, height }, so swapping a single
 * image for a full tile pyramid later (spec Section 10) changes nothing here.
 */
export const mapImages: Record<Game, Partial<Record<MapLayer, MapImage>>> = {
  "elden-ring": {
    overworld: { src: "/maps/er-overworld.webp", width: 6016, height: 6016 },
    underground: { src: "/maps/er-underground.webp", width: 6400, height: 6912 },
    "dlc-realm-of-shadow": { src: "/maps/er-dlc.webp", width: 5120, height: 6144 },
  },
  nightreign: {
    limveld: { src: "/maps/nr-limveld.png", width: 1536, height: 1536 },
  },
};

/**
 * Nightreign Shifting Earth changes the terrain, so the map image swaps with it.
 * Every variant has its own real in-game map: Default/Noklateo from NikVince's
 * stitched tiles, and Crater/Mountaintop/Rotted Woods stitched from the game's
 * own `menu/71_maptile_m0X` tiles (m01=Mountaintop, m02=Crater, m03=Rotted Woods,
 * m05=Noklateo) re-projected into NikVince's coordinate frame — the empirically
 * derived tile remap (game [RR,CC] → frame [N-1-CC, RR]) keeps marker calibration
 * exact. Great Hollow (Forsaken Hollows DLC) is out of scope (no POI source).
 */
const NR_MAPS: Record<string, MapImage> = {
  Default: { src: "/maps/nr-limveld.png", width: 1536, height: 1536 },
  Noklateo: { src: "/maps/nr-noklateo.png", width: 1536, height: 1536 },
  Crater: { src: "/maps/nr-crater.png", width: 1536, height: 1536 },
  Mountaintop: { src: "/maps/nr-mountaintop.png", width: 1536, height: 1536 },
  "Rotted Woods": { src: "/maps/nr-rotted-woods.png", width: 1536, height: 1536 },
};
export const nrMapFor = (shiftingEarth?: string): MapImage =>
  NR_MAPS[shiftingEarth ?? "Default"] ?? NR_MAPS.Default;

/**
 * All marker pixel coordinates are authored in a single NOMINAL square space;
 * the renderer scales them to whatever the real image dimensions are. This is
 * the spec's "rescale to target image size" step, done once at the edge.
 */
export const NOMINAL_SIZE = 2048;

/** Selectable layers per game, in display order. */
export const layersByGame: Record<Game, { key: MapLayer; label: string }[]> = {
  "elden-ring": [
    { key: "overworld", label: "The Lands Between" },
    { key: "underground", label: "Underground" },
    { key: "dlc-realm-of-shadow", label: "Realm of Shadow (DLC)" },
  ],
  nightreign: [{ key: "limveld", label: "Limveld" }],
};

/** Display name per game, used by the top-left game switch. */
export const gameLabels: Record<Game, string> = {
  "elden-ring": "Elden Ring",
  nightreign: "Nightreign",
};

/** Tile size of the generated map pyramids (scripts/build-map-tiles.mjs). */
export const TILE_SIZE = 256;

/**
 * Native Leaflet zoom range of a map's tile pyramid. zoom 0 = the image at full
 * resolution (the user's "100%"); the coarsest level is where the whole image
 * first fits one tile. Above 0 the renderer upscales the native tiles. MUST match
 * `minNativeZoom` in scripts/build-map-tiles.mjs or tiles 404. */
export const tileZoomRange = (width: number, height: number) => ({
  maxNativeZoom: 0,
  minNativeZoom: Math.floor(Math.log2(TILE_SIZE / Math.max(width, height))),
});

/** "/maps/er-overworld.webp" → "er-overworld" (the tile-pyramid folder name). */
export const tileBaseName = (src: string) =>
  src.replace(/^\/maps\//, "").replace(/\.\w+$/, "");
