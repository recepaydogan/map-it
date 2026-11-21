import { useEffect, useState } from "react";
import { loadCachedMapJson } from "../map/map-data-cache";
import { MAP_DEFINITIONS } from "../map/map-registry";
import type { MapMetadata } from "../map/types";
import type { ItemAcquisitionSource } from "./item-database-types";

/** Resolve authored area names only within the source's own registered map. */
export function useAcquisitionRegions(sources: ItemAcquisitionSource[], enabled: boolean) {
  const key = JSON.stringify(enabled
    ? [...new Set(sources.filter((source) => !source.markerId && source.region && source.mapId)
      .map((source) => source.mapId!))].sort() : []);
  const [result, setResult] = useState<{
    key: string;
    maps: ReadonlyMap<string, Pick<MapMetadata, "regions" | "bounds">>;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ids = JSON.parse(key) as string[];
    void Promise.all(ids.map(async (id) => {
      const map = MAP_DEFINITIONS.find((definition) => definition.id === id);
      if (!map) return null;
      const data = await loadCachedMapJson<MapMetadata>(`${map.dataUrl}/metadata.json`);
      if (!Array.isArray(data.regions) || !data.bounds) throw new Error(`Invalid map regions for ${id}`);
      return [id, data] as const;
    })).then((maps) => {
      if (!cancelled) setResult({ key, maps: new Map(maps.filter((map) => map !== null)), error: false });
    }).catch((error: unknown) => {
      console.error("Failed to load acquisition regions", error);
      if (!cancelled) setResult({ key, maps: new Map(), error: true });
    });
    return () => { cancelled = true; };
  }, [key]);

  return result?.key === key ? result : { maps: new Map(), error: false };
}
