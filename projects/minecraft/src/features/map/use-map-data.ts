import { useEffect, useState } from "react";
import { loadCachedMapJson } from "./map-data-cache";
import type { MapDefinition } from "./map-registry";
import type { MapLocation, MapMetadata, MapRegion } from "./types";

interface MapDataState {
  data: MapMetadata | null;
  loading: boolean;
  error: string | null;
  mapId: string | null;
}

const DEFAULT_TILE_PATTERN = "tiles/{level}/tile{x}x{y}.webp";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRegion = (value: unknown): value is MapRegion => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y);

const isLocation = (value: unknown): value is MapLocation => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y);

/**
 * Validates a fetched `metadata.json` and fills in the runtime fields. Loose
 * on purpose about optional text (label, subtype, region) so a minimal file
 * with just names and coordinates still renders.
 */
const parseMapMetadata = (raw: unknown, definition: MapDefinition): MapMetadata => {
  if (!isRecord(raw)) throw new Error("metadata.json is not an object.");
  const bounds = raw.bounds;
  if (!isRecord(bounds)
    || !isFiniteNumber(bounds.minX) || !isFiniteNumber(bounds.minY)
    || !isFiniteNumber(bounds.maxX) || !isFiniteNumber(bounds.maxY)
    || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new Error("metadata.json needs bounds { minX, minY, maxX, maxY }.");
  }
  if (!isFiniteNumber(raw.tileSize) || raw.tileSize <= 0) {
    throw new Error("metadata.json needs a positive tileSize.");
  }
  const detailLevels = Array.isArray(raw.detailLevels)
    ? raw.detailLevels.filter(isFiniteNumber)
    : [];
  if (detailLevels.length === 0) throw new Error("metadata.json needs detailLevels.");

  const regions = Array.isArray(raw.regions) ? raw.regions.filter(isRegion) : [];
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  const locations = (Array.isArray(raw.locations) ? raw.locations.filter(isLocation) : [])
    .map((location): MapLocation => ({
      ...location,
      label: typeof location.label === "string" ? location.label : "",
      subtype: typeof location.subtype === "string" ? location.subtype : location.category,
      regionId: typeof location.regionId === "string" ? location.regionId : "",
      region: typeof location.region === "string"
        ? location.region
        : regionNames.get(String(location.regionId)) ?? "",
    }));

  return {
    id: definition.id,
    displayName: typeof raw.displayName === "string" && raw.displayName ? raw.displayName : definition.name,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    schemaVersion: isFiniteNumber(raw.schemaVersion) ? raw.schemaVersion : 1,
    ...(typeof raw.generatedAt === "string" ? { generatedAt: raw.generatedAt } : {}),
    ...(typeof raw.attribution === "string" ? { attribution: raw.attribution } : {}),
    bounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
    tileSize: raw.tileSize,
    detailLevels,
    regions,
    locations,
    tileSource: {
      basePath: definition.dataUrl,
      tilePattern: typeof raw.tilePattern === "string" && raw.tilePattern
        ? raw.tilePattern
        : DEFAULT_TILE_PATTERN,
    },
  };
};

/** Loads `<dataUrl>/metadata.json` for the selected map; cached per URL. */
export const useMapData = (definition: MapDefinition): MapDataState => {
  const [state, setState] = useState<MapDataState>({
    data: null,
    loading: true,
    error: null,
    mapId: null,
  });

  useEffect(() => {
    let cancelled = false;
    void loadCachedMapJson<unknown>(`${definition.dataUrl}/metadata.json`)
      .then((raw) => {
        if (cancelled) return;
        setState({
          data: parseMapMetadata(raw, definition),
          loading: false,
          error: null,
          mapId: definition.id,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(`Map data for "${definition.id}" could not be loaded.`, error);
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Map data could not be loaded.",
          mapId: definition.id,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [definition]);

  // A switch to another map shows its loading state, never the previous map
  // with the new map's name on it.
  if (state.mapId !== definition.id) {
    return { data: null, loading: true, error: null, mapId: definition.id };
  }
  return state;
};
