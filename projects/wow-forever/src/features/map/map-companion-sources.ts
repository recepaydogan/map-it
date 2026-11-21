import type { ReferenceLink } from "../reference/reference-types";
import type { MapLocation, MapPoint } from "./types";

export interface MapCompanionSource {
  companion: ReferenceLink & { icon: string };
  soul: ReferenceLink;
  required: number;
}

export interface MapCompanionCatalog {
  version: 1;
  sources: Record<string, MapCompanionSource[]>;
}

/** Attach rewards to existing identities without creating duplicate spawn markers. */
export function attachMapCompanions(locations: MapLocation[], catalog: MapCompanionCatalog): MapLocation[] {
  return locations.map((point) => {
    const companionSources = point.reference && catalog.sources[point.reference.id];
    return companionSources?.length ? { ...point, companionSources } : point;
  });
}

export function getMapCompanionSources(point: MapPoint): MapCompanionSource[] {
  return "companionSources" in point ? point.companionSources ?? [] : [];
}

