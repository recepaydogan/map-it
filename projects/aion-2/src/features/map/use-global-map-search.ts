import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { getSourceCategory } from "./map-config";
import { MAP_DEFINITIONS } from "./map-registry";
import { prepareGlobalSearch, searchGlobalCatalog, sortSearchSources, type GlobalSearchCatalog, type SearchItemSource } from "./map-global-search";

const requests = new Map<string, Promise<unknown>>();
function load<T>(path: string): Promise<T> {
  let request = requests.get(path);
  if (!request) {
    request = fetch(contentUrl(`data/map-search/${path}`)).then(async response => {
      if (!response.ok) throw new Error(`Map search ${path}: HTTP ${response.status}`);
      const data = await response.json();
      if (data?.version !== 1) throw new Error(`Invalid map search data: ${path}`);
      return data;
    }).catch((error: unknown) => { requests.delete(path); throw error; });
    requests.set(path, request);
  }
  return request as Promise<T>;
}
let preparedRequest: Promise<ReturnType<typeof prepareGlobalSearch>> | null = null;
function loadCatalog() {
  preparedRequest ??= load<GlobalSearchCatalog>("index.json").then(catalog => {
    if (!Array.isArray(catalog.locations) || !Array.isArray(catalog.items)) throw new Error("Invalid global search catalog");
    return prepareGlobalSearch({
      ...catalog,
      regions: [...(catalog.regions ?? []), ...MAP_DEFINITIONS.flatMap(({ id, name, regionLabels }) =>
        (regionLabels ?? []).map(region => ({ mapId: id, mapName: name, region })))],
      locations: catalog.locations.map((location) => {
        const referenceId = "reference" in location.point ? location.point.reference?.id : undefined;
        const category = getSourceCategory(referenceId, location.point.category);
        return category ? { ...location, point: { ...location.point, category: category.id } } : location;
      }),
    });
  }).catch((error: unknown) => { preparedRequest = null; throw error; });
  return preparedRequest;
}

export function useGlobalMapSearch(query: string, mapId: string) {
  const deferredQuery = useDeferredValue(query.trim());
  const enabled = Boolean(deferredQuery);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [sourceState, setSourceState] = useState<{ key: string; sources?: Record<string, SearchItemSource[]>; error?: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadCatalog().then(data => { if (!cancelled) { setCatalog(data); setCatalogError(false); } })
      .catch((error: unknown) => { console.error("Failed to load global map search", error); if (!cancelled) setCatalogError(true); });
    return () => { cancelled = true; };
  }, [enabled]);
  const results = useMemo(() => catalog ? searchGlobalCatalog(catalog, deferredQuery, mapId) : { locations: [], items: [] }, [catalog, deferredQuery, mapId]);
  const chunkKey = [...new Set(results.items.map(item => item.chunk))].sort().join(",");
  useEffect(() => {
    if (!chunkKey) return;
    let cancelled = false;
    Promise.all(chunkKey.split(",").map(chunk => load<{ sources: Record<string, SearchItemSource[]> }>(`${chunk}.json`)))
      .then(chunks => {
        if (chunks.some(chunk => !chunk.sources || typeof chunk.sources !== "object")) throw new Error("Invalid map item sources");
        if (!cancelled) setSourceState({ key: chunkKey, sources: Object.assign({}, ...chunks.map(chunk => chunk.sources)) });
      }).catch((error: unknown) => {
        console.error("Failed to load map item sources", error);
        if (!cancelled) setSourceState({ key: chunkKey, error: true });
      });
    return () => { cancelled = true; };
  }, [chunkKey]);
  const locations = useMemo(() => catalog?.locations.map(entry => entry.location) ?? [], [catalog]);
  const items = useMemo(() => results.items.map(item => ({ ...item,
    sources: sortSearchSources(sourceState?.key === chunkKey ? sourceState.sources?.[item.id] ?? [] : [], locations, mapId),
  })), [results.items, sourceState, chunkKey, locations, mapId]);
  return { locations: results.locations, sourceLocations: locations, items,
    loading: enabled && ((!catalog && !catalogError) || (Boolean(chunkKey) && sourceState?.key !== chunkKey) || deferredQuery !== query.trim()),
    error: catalogError || (sourceState?.key === chunkKey && Boolean(sourceState.error)),
  };
}
