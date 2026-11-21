import raw from "./generated/er-mausoleums.json";
import type { Marker } from "./types";

/**
 * The Walking Mausoleums, extracted straight from the game's map MSBs (chr c4630
 * placements — data/src/build-er-mausoleums.mjs). Overworld ones use the same frozen
 * world→pixel transform as every other marker; the Deeproot Depths ones ride the
 * underground per-block calibration (underground-calib.json), exactly like the
 * summoning pools.
 *
 * They live OUTSIDE er-markers.json on purpose: that file is the frozen, hand-verified
 * marker set and nothing regenerates its coordinates. Merging here at import time
 * (see markers.ts → erAllMarkers) adds the pins without ever touching it.
 */
const data = raw as unknown as {
  patch: string;
  mausoleums: Marker[];
};

/** Every Walking Mausoleum, already Marker-shaped (category "walking-mausoleum"). */
export const erMausoleums: Marker[] = data.mausoleums;
