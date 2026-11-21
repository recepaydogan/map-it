import raw from "./generated/er-regions.json";

/**
 * The official region overlay for the Elden Ring OVERWORLD — a pixel-precise, semi-
 * transparent colour wash of each named region's extent + borders, straight from the
 * game's own region-name mask textures (data/src/build-er-region-masks.mjs):
 * `mapinfotex/m60_<col>_<row>_02`, 48 tiles, nearest-classified to the region a marker
 * of that region actually sits in, then recoloured to a clean palette.
 *
 * Rendered as ONE image overlay in the same NOMINAL 2048² space every marker uses, so it
 * lines up with the map without any per-view maths. Coarse by nature (256px/tile) — it's
 * context under the pins, not a survey. Overworld-only: the DLC mask tiles use a different
 * palette that isn't in MapNameTexParam, and the underground has no such masks.
 */

/** One region in the legend: its name, the FMG key for localising it later, and the flat
 *  display colour used in the overlay wash. */
export interface ErRegion {
  name: string;
  /** MapNameTexParam.mapNameId (abs value) → PlaceName FMG, for localisation later. */
  mapNameId: number;
  /** Flat RGB the overlay paints this region with. */
  color: [number, number, number];
}

/** The overlay image descriptor: authored in NOMINAL space, drawn over the full map bounds. */
export interface ErRegionsImage {
  src: string;
  width: number;
  height: number;
}

const data = raw as unknown as {
  patch: string;
  image: ErRegionsImage;
  regions: ErRegion[];
  calibration: Record<string, unknown>;
};

/** The region overlay image (NOMINAL 2048², one flat colour per region). */
export const erRegionsImage: ErRegionsImage = data.image;

/** The legend: every region the overlay distinguishes, with its colour + FMG key. */
export const erRegions: ErRegion[] = data.regions;
