import raw from "./generated/er-acquisition-sources.json";
import type { MapLayer } from "./types";

export type DirectAcquisitionKind =
  | "pickup"
  | "merchant"
  | "enemy-drop"
  | "boss-drop";

export interface DirectAcquisitionSource {
  kind: DirectAcquisitionKind;
  markerId: string;
  layer: MapLayer;
  name: string;
  category: string;
  region?: string;
  note?: string;
}

const sourcesByItemKey = raw as Record<string, DirectAcquisitionSource[]>;
const sourceRegionByMarkerId = new Map<string, string>();

for (const sources of Object.values(sourcesByItemKey)) {
  for (const source of sources) {
    if (source.region && !sourceRegionByMarkerId.has(source.markerId)) {
      sourceRegionByMarkerId.set(source.markerId, source.region);
    }
  }
}

/**
 * Routes proven by game-data joins: an MSB treasure, a talk-script shop, or an
 * ItemLot drop. Area hints, inferred quest rewards, and conditional resellers
 * never enter this index.
 */
export const itemAcquisitionSources = (itemKey: string): DirectAcquisitionSource[] =>
  sourcesByItemKey[itemKey] ?? [];

/** Region attached to the source marker by the authoritative spatial map. */
export const directAcquisitionSourceRegion = (markerId: string): string | undefined =>
  sourceRegionByMarkerId.get(markerId)
  ?? sourceRegionByMarkerId.get(markerId.replace(/^er-boss-/, "boss:"));
