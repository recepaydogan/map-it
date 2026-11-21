import { useEffect, useMemo, useState } from "react";
import { loadCachedMapJson } from "../map/map-data-cache";
import { MAP_DEFINITIONS } from "../map/map-registry";
import { groupReferenceLocations, type ReferenceMapPoint, type ReferenceMapPoints } from "./group-reference-locations";
import type { ReferenceLocation } from "./reference-types";

interface LocationLayer {
  locations: (ReferenceMapPoint & { id: string })[];
}

export function useGroupedReferenceLocations(locations: ReferenceLocation[]) {
  const [maps, setMaps] = useState<ReferenceMapPoints>(new Map());
  const mapIds = JSON.stringify([...new Set(locations.map(({ mapId }) => mapId))].sort());

  useEffect(() => {
    let cancelled = false;
    const ids = JSON.parse(mapIds) as string[];
    void Promise.all(ids.map(async (mapId) => {
      const definition = MAP_DEFINITIONS.find(({ id }) => id === mapId);
      if (!definition) return [mapId, new Map<string, ReferenceMapPoint>()] as const;
      const layers = await Promise.all(["metadata.json", ...(definition.locationFiles ?? [])].map((file) =>
        loadCachedMapJson<LocationLayer>(`${definition.dataUrl}/${file}`)));
      return [mapId, new Map(layers.flatMap((layer) => layer.locations.map((point) => [point.id, point] as const)))] as const;
    })).then((entries) => {
      if (!cancelled) setMaps(new Map(entries));
    }).catch((error: unknown) => {
      console.error("Failed to load coordinates for reference locations", error);
    });
    return () => { cancelled = true; };
  }, [mapIds]);

  return useMemo(() => groupReferenceLocations(locations, maps), [locations, maps]);
}
