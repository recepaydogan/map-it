import { useEffect, useMemo, useState } from "react";
import { loadCachedMapJson } from "../map/map-data-cache";
import { MAP_DEFINITIONS } from "../map/map-registry";
import { groupCreatureReferenceLocations, groupQuestReferenceLocations, groupReferenceLocations, type ReferenceMapPoint, type ReferenceMapPoints } from "./group-reference-locations";
import type { ReferenceLocation } from "./reference-types";

interface LocationLayer {
  displayName?: string;
  regions?: { id: string; name: string }[];
  locations: (ReferenceMapPoint & { id: string })[];
}

export function useGroupedReferenceLocations(locations: ReferenceLocation[], creatureName?: string, groupQuestEnemies = false) {
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
      const mapName = layers[0]?.displayName ?? definition.name;
      const regionNames = new Map(layers[0]?.regions?.map(({ id, name }) => [id, name]) ?? []);
      return [mapId, new Map(layers.flatMap((layer) => layer.locations.map((point) =>
        [point.id, { ...point, region: (typeof point.region === "string"
          ? point.region : regionNames.get(point.regionId ?? "")) || mapName }] as const)))] as const;
    })).then((entries) => {
      if (!cancelled) setMaps(new Map(entries));
    }).catch((error: unknown) => {
      console.error("Failed to load coordinates for reference locations", error);
    });
    return () => { cancelled = true; };
  }, [mapIds]);

  return useMemo(() => creatureName
    ? groupCreatureReferenceLocations(locations, creatureName, maps).map((group) => ({ ...group, search: undefined }))
    : groupQuestEnemies ? groupQuestReferenceLocations(locations, maps)
    : groupReferenceLocations(locations, maps).map((location) => ({ location, region: location.name, search: undefined })),
  [creatureName, groupQuestEnemies, locations, maps]);
}
