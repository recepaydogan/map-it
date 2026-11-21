import raw from "./generated/er-spiritsprings.json";
import type { Marker } from "./types";

/**
 * Two overworld marker categories the app never had, both extracted straight from the
 * game's map MSBs (data/src/build-er-spiritsprings.mjs):
 *
 *  • **Spiritsprings** — the wind-updraft geysers you jump into for a boosted leap
 *    (asset models AEG099_500..504, the in-game "SpiritSpring" event band).
 *  • **Waygates** — the "Sending Gate" teleporter portals (asset model AEG099_510).
 *
 * Real world-grid coordinates in the same 2048² space every other marker uses, so they're
 * just Markers. They live OUTSIDE er-markers.json on purpose: that file is the frozen,
 * hand-verified marker set and nothing regenerates its coordinates. Merging here at import
 * time (see markers.ts → erAllMarkers) adds the pins without ever touching it.
 *
 * NOTE: waygate markers also carry a `pair` field (the linked gate's id, or null — the
 * link lives in the EMEVD, not the MSB, so it is null here). It rides along as extra data.
 */
const data = raw as unknown as {
  patch: string;
  spiritsprings: Marker[];
  waygates: Marker[];
};

/** Every spiritspring updraft, already Marker-shaped (category "spiritspring"). */
export const erSpiritsprings: Marker[] = data.spiritsprings;

/** Every waygate / Sending Gate, already Marker-shaped (category "waygate"). */
export const erWaygates: Marker[] = data.waygates;
