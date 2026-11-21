import { contentUrl } from "../../lib/content-url";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useGameText } from "../../i18n/game-text";
import { useAppLanguage } from "../../i18n/app-language";
import { sortSearchSources, type searchGlobalCatalog, type GlobalSearchCatalog, type SearchItemSource } from "./map-global-search";
import type { MapSearchWorkerRequest, MapSearchWorkerResponse } from "./map-search-worker";

const EMPTY_RESULTS: ReturnType<typeof searchGlobalCatalog> = { locations: [], items: [], quests: [] };

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
let preparedRequest: Promise<GlobalSearchCatalog> | null = null;
function loadCatalog() {
  preparedRequest ??= load<GlobalSearchCatalog>("index.json").then(catalog => {
    if (!Array.isArray(catalog.locations) || !Array.isArray(catalog.items)) throw new Error("Invalid global search catalog");
    return catalog;
  }).catch((error: unknown) => { preparedRequest = null; throw error; });
  return preparedRequest;
}

export function loadGlobalMapSearchCatalog(): Promise<GlobalSearchCatalog> {
  return load<GlobalSearchCatalog>("index.json").then((catalog) => {
    if (!Array.isArray(catalog.locations) || !Array.isArray(catalog.items)) throw new Error("Invalid global search catalog");
    return catalog;
  });
}

export function useGlobalMapSearch(query: string, mapId: string, warm = false) {
  const gameText = useGameText();
  const language = useAppLanguage();
  const enabled = warm || Boolean(query.trim());
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [workerError, setWorkerError] = useState<GlobalSearchCatalog | null>(null);
  const [result, setResult] = useState<{ catalog: GlobalSearchCatalog; query: string; mapId: string; language: string; translate: typeof gameText; results: typeof EMPTY_RESULTS } | null>(null);
  const [sourceState, setSourceState] = useState<{ key: string; sources?: Record<string, SearchItemSource[]>; error?: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadCatalog().then(data => { if (!cancelled) { setCatalog(data); setCatalogError(false); } })
      .catch((error: unknown) => { console.error("Failed to load global map search", error); if (!cancelled) setCatalogError(true); });
    return () => { cancelled = true; };
  }, [enabled]);
  useEffect(() => {
    if (!catalog) return;
    const worker = new Worker(new URL("./map-search-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onerror = () => setWorkerError(catalog);
    const translations: Record<string, string> = {};
    if (language !== "en") {
      const visited = new Set<string>();
      const translate = (name: string, key?: string) => {
        const identity = `${key ?? ""}:${name}`;
        if (visited.has(identity)) return;
        visited.add(identity);
        const localized = gameText(name, key);
        if (localized !== name) translations[key ?? name] = localized;
      };
      for (const item of catalog.items) translate(item.name, `ItemSparse:${item.id}:4`);
      for (const { point, names } of catalog.locations) {
        for (const name of names ?? [point.name]) translate(name, "entityId" in point ? `Creature:${point.entityId}:0` : undefined);
        if ("questOffers" in point) for (const quest of point.questOffers ?? []) translate(quest.name, `Quest:${quest.id}:0`);
      }
    }
    worker.postMessage({ type: "global-init", catalog, translations } satisfies MapSearchWorkerRequest);
    return () => { workerRef.current = null; worker.terminate(); };
  }, [catalog, gameText, language]);
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !catalog) return;
    const id = ++requestId.current;
    let cancelled = false;
    worker.onmessage = ({ data }: MessageEvent<MapSearchWorkerResponse>) => {
      if (cancelled || data.id !== requestId.current) return;
      if (data.type === "error") setWorkerError(catalog);
      if (data.type === "global") startTransition(() => { setWorkerError(null); setResult({ catalog, query, mapId, language, translate: gameText, results: data.results }); });
    };
    worker.postMessage({ type: "global-query", id, query, mapId } satisfies MapSearchWorkerRequest);
    return () => { cancelled = true; };
  }, [catalog, gameText, language, mapId, query]);
  const currentResult = result?.catalog === catalog && result?.query === query && result?.mapId === mapId
    && result?.language === language && result?.translate === gameText;
  const results = currentResult ? result.results : EMPTY_RESULTS;
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
  const locations = useMemo(() => catalog?.locations ?? [], [catalog]);
  const items = useMemo(() => results.items.map(item => ({ ...item,
    sources: sortSearchSources(sourceState?.key === chunkKey ? sourceState.sources?.[item.id] ?? [] : [], locations, mapId),
  })), [results.items, sourceState, chunkKey, locations, mapId]);
  return { locations: results.locations, quests: results.quests, sourceLocations: locations, items,
    loading: !!query.trim() && !catalogError && (!catalog || workerError !== catalog)
      && (!currentResult || (Boolean(chunkKey) && sourceState?.key !== chunkKey)),
    error: catalogError || (!!catalog && workerError === catalog) || (sourceState?.key === chunkKey && Boolean(sourceState.error)),
  };
}
