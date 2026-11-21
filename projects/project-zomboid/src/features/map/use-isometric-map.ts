import { useCallback, useEffect, useState } from "react";
import {
  createExternalIsometricMap,
  PROJECT_ZOMBOID_MAP_B42_GENERATED_AT,
  PROJECT_ZOMBOID_MAP_B42_METADATA,
} from "./isometric-map-source";
import type { MapIsometricCatalog, MapIsometricManifest } from "./map-isometric-types";

interface IsometricMapState {
  catalog: MapIsometricCatalog | null;
  groundSource: MapIsometricManifest | null;
  source: MapIsometricManifest | null;
  loading: boolean;
  reportSourceFailure: () => void;
}

interface LoadedIsometricMap {
  catalog: MapIsometricCatalog;
  source: MapIsometricManifest;
}

interface InternalIsometricMapState {
  catalog: MapIsometricCatalog | null;
  fallback: LoadedIsometricMap | null;
  source: MapIsometricManifest | null;
  loading: boolean;
}

const LOCAL_ASSET_ROOT = "/map-data/knox-country/isometric-optimized";
const ISOMETRIC_ASSET_ROOT = (import.meta.env.VITE_ISOMETRIC_ASSET_BASE_URL || LOCAL_ASSET_ROOT).replace(/\/$/, "");
const DEFAULT_EXTERNAL_ASSET_ROOT = "https://pz.ingredientassets.com/b42.20.2-r1/global";
const EXTERNAL_ASSET_ROOT = (
  import.meta.env.VITE_ISOMETRIC_EXTERNAL_BASE_URL || DEFAULT_EXTERNAL_ASSET_ROOT
).replace(/\/$/, "");
const EXTERNAL_SOURCE_ENABLED = import.meta.env.VITE_ISOMETRIC_EXTERNAL_ENABLED !== "false";
const LOCAL_FALLBACK_ENABLED = import.meta.env.VITE_ISOMETRIC_LOCAL_FALLBACK_ENABLED !== "false";
const CUMULATIVE_FLOORS_ENABLED = import.meta.env.VITE_CUMULATIVE_FLOORS_ENABLED !== "false";

const resolvePackBasePath = (basePath: string) => {
  if (/^(?:https?:)?\/\//.test(basePath) || basePath.startsWith("/")) return basePath.replace(/\/$/, "");
  if (basePath === ".") return ISOMETRIC_ASSET_ROOT;
  return `${ISOMETRIC_ASSET_ROOT}/${basePath.replace(/^\.\//, "")}`;
};

const normalizeCatalog = (catalog: MapIsometricCatalog): MapIsometricCatalog => ({
  ...catalog,
  packs: catalog.packs.map((pack) => ({
    ...pack,
    basePath: resolvePackBasePath(pack.basePath),
    tileSourceKind: pack.tileSourceKind ?? "direct",
  })),
});

const normalizeGlobalManifest = (
  manifest: Omit<MapIsometricManifest, "id" | "basePath">,
): MapIsometricManifest => ({
  ...manifest,
  cumulativeFloors: CUMULATIVE_FLOORS_ENABLED ? manifest.cumulativeFloors : undefined,
  id: "global",
  basePath: `${ISOMETRIC_ASSET_ROOT}/global`,
  tileSourceKind: "direct",
});

const createCatalogForSource = (source: MapIsometricManifest): MapIsometricCatalog => ({
  schemaVersion: 1,
  generatedAt: source.generatedAt,
  worldCellRange: source.cellRange,
  cellSize: source.mapInfo.cell_size,
  totalCells: source.mapInfo.cell_rects?.reduce(
    (total, [, , width, height]) => total + width * height,
    0,
  ) ?? source.cellRange[2] * source.cellRange[3],
  renderedCells: source.mapInfo.cell_rects?.reduce(
    (total, [, , width, height]) => total + width * height,
    0,
  ) ?? source.cellRange[2] * source.cellRange[3],
  complete: source.complete,
  floors: source.floors.map(({ floor }) => floor),
  packs: [source],
});

const selectPreviewSource = (catalog: MapIsometricCatalog) =>
  catalog.packs.find(({ id }) => id === "legacy-preview") ?? catalog.packs[0] ?? null;

const selectEmbeddedGlobalSource = (catalog: MapIsometricCatalog) =>
  catalog.packs.find(({ complete, id }) => complete && id === "global") ?? null;

const createLegacyCatalog = (manifest: Omit<MapIsometricManifest, "id" | "basePath">): MapIsometricCatalog => ({
  schemaVersion: 1,
  generatedAt: manifest.generatedAt,
  worldCellRange: manifest.cellRange,
  cellSize: manifest.mapInfo.cell_size,
  totalCells: manifest.cellRange[2] * manifest.cellRange[3],
  renderedCells: manifest.cellRange[2] * manifest.cellRange[3],
  complete: manifest.complete,
  floors: manifest.floors.map(({ floor }) => floor),
  packs: [{
    ...manifest,
    id: "legacy-preview",
    basePath: ISOMETRIC_ASSET_ROOT,
    tileSourceKind: "direct",
  }],
});

const createHostedIsometricMap = (): LoadedIsometricMap =>
  createExternalIsometricMap({
    basePath: EXTERNAL_ASSET_ROOT,
    generatedAt: PROJECT_ZOMBOID_MAP_B42_GENERATED_AT,
    id: "project-zomboid-map-b42.20.2-r1",
    payload: PROJECT_ZOMBOID_MAP_B42_METADATA,
  });

const HOSTED_ISOMETRIC_MAP = createHostedIsometricMap();
const INITIAL_EXTERNAL_MAP = EXTERNAL_SOURCE_ENABLED ? HOSTED_ISOMETRIC_MAP : null;

const normalizeHostedGlobalManifest = (
  manifest: Omit<MapIsometricManifest, "id" | "basePath">,
): LoadedIsometricMap => {
  const groundFloor = HOSTED_ISOMETRIC_MAP.source.floors.find(({ floor }) => floor === 0);
  const floors = [
    ...manifest.floors,
    ...(groundFloor && !manifest.floors.some(({ floor }) => floor === 0) ? [groundFloor] : []),
  ].sort((left, right) => right.floor - left.floor);
  const source: MapIsometricManifest = {
    ...manifest,
    cumulativeFloors: CUMULATIVE_FLOORS_ENABLED ? manifest.cumulativeFloors : undefined,
    id: HOSTED_ISOMETRIC_MAP.source.id,
    basePath: EXTERNAL_ASSET_ROOT,
    tileSourceKind: "direct",
    mapInfo: {
      ...manifest.mapInfo,
      minlayer: Math.min(...floors.map(({ floor }) => floor)),
      maxlayer: Math.max(...floors.map(({ floor }) => floor)),
    },
    layerRange: [
      Math.min(...floors.map(({ floor }) => floor)),
      Math.max(...floors.map(({ floor }) => floor)) + 1,
    ],
    floors,
  };
  return { catalog: createCatalogForSource(source), source };
};

export const useIsometricMap = (): IsometricMapState => {
  const [state, setState] = useState<InternalIsometricMapState>({
    catalog: INITIAL_EXTERNAL_MAP?.catalog ?? null,
    fallback: null,
    source: INITIAL_EXTERNAL_MAP?.source ?? null,
    loading: !INITIAL_EXTERNAL_MAP && LOCAL_FALLBACK_ENABLED,
  });

  const reportSourceFailure = useCallback(() => {
    setState((current) => current.fallback ? {
      catalog: current.fallback.catalog,
      fallback: null,
      source: current.fallback.source,
      loading: false,
    } : current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadCatalog = async () => {
      try {
        const response = await fetch(`${ISOMETRIC_ASSET_ROOT}/catalog.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Isometric map catalog request failed with ${response.status}.`);
        return normalizeCatalog(await response.json() as MapIsometricCatalog);
      } catch (catalogError) {
        if (controller.signal.aborted) throw catalogError;
        try {
          const response = await fetch(`${ISOMETRIC_ASSET_ROOT}/manifest.json`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Legacy isometric manifest request failed with ${response.status}.`);
          const manifest = await response.json() as Omit<MapIsometricManifest, "id" | "basePath">;
          return createLegacyCatalog(manifest);
        } catch (legacyError) {
          throw new AggregateError([catalogError, legacyError], "No isometric map manifest is available.");
        }
      }
    };
    const loadGlobalSource = async () => {
      const response = await fetch(`${ISOMETRIC_ASSET_ROOT}/global/manifest.json`, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Global isometric manifest request failed with ${response.status}.`);
      if (!response.headers.get("content-type")?.includes("application/json")) return null;
      return normalizeGlobalManifest(await response.json() as Omit<MapIsometricManifest, "id" | "basePath">);
    };
    const loadHostedMap = async (): Promise<LoadedIsometricMap> => {
      const response = await fetch(`${EXTERNAL_ASSET_ROOT}/manifest.json`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Hosted isometric manifest request failed with ${response.status}.`);
      return normalizeHostedGlobalManifest(
        await response.json() as Omit<MapIsometricManifest, "id" | "basePath">,
      );
    };

    const loadLocalMap = async (): Promise<LoadedIsometricMap> => {
      const catalog = await loadCatalog();
      const embeddedGlobalSource = selectEmbeddedGlobalSource(catalog);
      const globalSource = embeddedGlobalSource ?? await loadGlobalSource().catch(() => null);
      const source = globalSource ?? selectPreviewSource(catalog);
      if (!source) throw new Error("Local isometric map has no usable source.");
      return { catalog, source };
    };

    const externalMap = INITIAL_EXTERNAL_MAP;

    if (externalMap) {
      void loadHostedMap()
        .then((hostedMap) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            ...current,
            catalog: hostedMap.catalog,
            source: hostedMap.source,
            loading: false,
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("Hosted isometric floor manifest is unavailable; Ground remains active.", error);
        });
    }

    if (!LOCAL_FALLBACK_ENABLED) {
      if (!externalMap) {
        console.error("Isometric map initialization failed: every source is disabled.");
      }
      return () => controller.abort();
    }

    void loadLocalMap()
      .then((localMap) => {
        if (controller.signal.aborted) return;
        if (externalMap) {
          setState((current) => ({ ...current, fallback: localMap }));
          return;
        }
        setState({
          catalog: localMap.catalog,
          fallback: null,
          source: localMap.source,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (externalMap) {
          console.warn("Local isometric map fallback is unavailable.", error);
          return;
        }
        console.error("Isometric map initialization failed.", error);
        setState({ catalog: null, fallback: null, source: null, loading: false });
      });
    return () => controller.abort();
  }, []);

  return {
    catalog: state.catalog,
    groundSource: state.source && !state.source.floors.some(({ floor }) => floor === 0)
      ? HOSTED_ISOMETRIC_MAP.source
      : null,
    source: state.source,
    loading: state.loading,
    reportSourceFailure,
  };
};
