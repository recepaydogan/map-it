import { useEffect, useState } from "react";
import { hasMapDefinition, REMOVED_MAP_CATEGORY_IDS } from "../map/map-registry";
import { loadGlobalMapSearchCatalog } from "../map/use-global-map-search";
import { indexItemSourceMapLocations, type ItemSourceMapIndex } from "./item-source-map-links";

let request: Promise<ItemSourceMapIndex> | undefined;
const load = () => request ??= loadGlobalMapSearchCatalog().then(({ locations }) => indexItemSourceMapLocations(
  locations.filter(({ mapId, point }) => hasMapDefinition(mapId) && !REMOVED_MAP_CATEGORY_IDS.has(point.category)),
)).catch((error: unknown) => { request = undefined; throw error; });

export function useItemSourceMapLinks(enabled: boolean) {
  const [state, setState] = useState<{ index?: ItemSourceMapIndex; error?: boolean }>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then((index) => { if (active) setState({ index }); })
      .catch((error: unknown) => {
        console.error("Failed to resolve item source locations", error);
        if (active) setState({ error: true });
      });
    return () => { active = false; };
  }, [enabled]);
  return { ...state, loading: enabled && !state.index && !state.error };
}
