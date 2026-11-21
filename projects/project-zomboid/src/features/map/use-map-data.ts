import { useEffect, useMemo, useState } from "react";
import type { MapLibraryEntry } from "./community-map-types";
import { BUILTIN_MAP_ENTRY, BUILTIN_MAP_ID } from "./map-library-config";
import type { MapMetadata } from "./types";
import { useGameContentLanguage } from "../../game-content/game-content-language";
import {
  applyGameContentLocale,
  type GameContentLocaleOverlay,
} from "../../game-content/game-content-localization";
import { createMapBootstrapData } from "./map-bootstrap-data";
import { loadCachedMapJson } from "./map-data-cache";
import { getMapDataUrl, MAP_DATA_BASE_URL } from "./map-data-url";
import {
  createPreparedMapModMetadata,
  parsePreparedMapModData,
  type PreparedMapModData,
} from "./prepared-map-mod-data";

interface MapDataState {
  data: MapMetadata | null;
  loading: boolean;
  error: string | null;
  mapKey?: string;
  includesBuiltinMap?: boolean;
}

export const useMapData = (selectedMap: MapLibraryEntry): MapDataState => {
  const gameContentLanguage = useGameContentLanguage();
  const communityMetadata = useMemo(
    () => selectedMap.kind === "community" && selectedMap.metadata
      ? selectedMap.metadata
      : null,
    [selectedMap],
  );
  const [state, setState] = useState<MapDataState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (selectedMap.kind === "community") return () => {
      cancelled = true;
    };
    const bootstrapData = createMapBootstrapData(selectedMap);
    const includesBuiltinMap = selectedMap.includesBuiltinMap !== false;
    const getPreparedBounds = () => {
      const cellSize = selectedMap.modCellSize ?? 256;
      const coordinates = (selectedMap.modCells ?? []).map((cell) => cell.split(",").map(Number))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (coordinates.length === 0) return bootstrapData.bounds;
      return {
        minX: Math.min(...coordinates.map(([x]) => x)) * cellSize,
        minY: Math.min(...coordinates.map(([, y]) => y)) * cellSize,
        maxX: (Math.max(...coordinates.map(([x]) => x)) + 1) * cellSize,
        maxY: (Math.max(...coordinates.map(([, y]) => y)) + 1) * cellSize,
      };
    };
    const metadataPromise = includesBuiltinMap
      ? loadCachedMapJson<MapMetadata>(getMapDataUrl("metadata.json"))
      : Promise.resolve({ ...bootstrapData, bounds: getPreparedBounds() });
    const localePromise = includesBuiltinMap && gameContentLanguage !== "en"
      ? loadCachedMapJson<GameContentLocaleOverlay>(
        getMapDataUrl(`locales/${encodeURIComponent(gameContentLanguage)}.json`),
      ).catch((error: unknown) => {
        if (!cancelled) console.warn("Game-content locale could not be loaded.", error);
        return null;
      })
      : Promise.resolve(null);
    const preparedMods = selectedMap.preparedMods ?? [];
    const modDataPromise = preparedMods.length > 0
      ? Promise.all(preparedMods.map(async (mod) => ({
        mod,
        data: mod.dataUrl
          ? await loadCachedMapJson<unknown>(mod.dataUrl).then(parsePreparedMapModData)
          : null,
      })))
      : selectedMap.kind === "mod" && selectedMap.modDataUrl
        ? loadCachedMapJson<unknown>(selectedMap.modDataUrl).then(parsePreparedMapModData)
          .then((data) => [{ mod: null, data }])
        : Promise.resolve<Array<{ mod: null; data: PreparedMapModData | null }>>([]);

    void Promise.all([metadataPromise, localePromise, modDataPromise])
      .then(([baseData, locale, preparedData]) => {
        if (cancelled) return;
        const localizedData = locale ? applyGameContentLocale(baseData, locale) : baseData;
        // Project Zomboid gives maps nearer the top of Map Order priority.
        // Merge from the bottom upward so every higher-priority package
        // replaces the cells already contributed by lower-priority maps.
        const data = [...preparedData].reverse().reduce((current, entry) => {
          if (!entry.data) return current;
          const cells = entry.mod?.overlays.flatMap(({ cells: overlayCells }) => overlayCells)
            ?? selectedMap.modCells
            ?? [];
          const cellSize = entry.mod?.overlays[0]?.source.mapInfo.cell_size
            ?? selectedMap.modCellSize
            ?? 256;
          return createPreparedMapModMetadata(current, entry.data, cells, cellSize);
        }, localizedData);
        const navigationBaseUrls = preparedData.flatMap(({ mod }) => {
          if (mod) return mod.overlays.map(({ source }) => `${source.basePath}/navigation`);
          const dataUrl = selectedMap.kind === "mod" ? selectedMap.modDataUrl : null;
          return dataUrl ? [new URL("navigation/", dataUrl).toString()] : [];
        });
        setState({
          data: {
            ...data,
            id: selectedMap.kind === "mod" && includesBuiltinMap ? BUILTIN_MAP_ID : selectedMap.key,
            displayName: selectedMap.displayName,
            description: selectedMap.description ?? BUILTIN_MAP_ENTRY.description,
            creator: BUILTIN_MAP_ENTRY.creator,
            navigationBaseUrls,
            tileSource: {
              kind: "static",
              basePath: MAP_DATA_BASE_URL,
              tilePattern: "tiles/{level}/tile{x}x{y}.png",
            },
          },
          loading: false,
          error: null,
          mapKey: selectedMap.key,
          includesBuiltinMap,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((current) => ({
          data: includesBuiltinMap && current.includesBuiltinMap
            ? current.data ?? bootstrapData
            : current.mapKey === selectedMap.key
              ? current.data ?? bootstrapData
              : bootstrapData,
          loading: false,
          error: error instanceof Error ? error.message : "Map data could not be loaded.",
          mapKey: selectedMap.key,
          includesBuiltinMap,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [gameContentLanguage, selectedMap]);

  if (selectedMap.kind === "community" && communityMetadata) {
    return {
      data: communityMetadata,
      loading: false,
      error: null,
      mapKey: selectedMap.key,
      includesBuiltinMap: false,
    };
  }
  if (state.mapKey === selectedMap.key) return state;
  const includesBuiltinMap = selectedMap.includesBuiltinMap !== false;
  if (includesBuiltinMap && state.includesBuiltinMap && state.data) {
    return {
      data: state.data,
      loading: true,
      error: null,
      mapKey: selectedMap.key,
      includesBuiltinMap: true,
    };
  }
  return {
    data: createMapBootstrapData(selectedMap),
    loading: true,
    error: null,
    mapKey: selectedMap.key,
    includesBuiltinMap,
  };
};
