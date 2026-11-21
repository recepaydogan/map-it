import { useEffect, useState } from "react";
import { loadEntityArtwork } from "../../lib/entity-artwork";
import { contentUrl } from "../../lib/content-url";
import { migrateMapMarkerAliases } from "./map-marker-aliases";
import { getSourceCategory } from "./map-config";
import { GAME_CONFIG } from "../../game-config";
import i18n from "../../i18n";
import { attachMapCompanions, type MapCompanionCatalog } from "./map-companion-sources";
import { attachMapPetSources, type MapPetSourceCatalog } from "./map-pet-sources";
import { loadCachedMapJson, MapDataRequestError } from "./map-data-cache";
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

const isBounds = (value: unknown): value is MapMetadata["bounds"] => isRecord(value)
  && isFiniteNumber(value.minX) && isFiniteNumber(value.minY)
  && isFiniteNumber(value.maxX) && isFiniteNumber(value.maxY)
  && value.maxX > value.minX && value.maxY > value.minY;

const isRegion = (value: unknown): value is MapRegion => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y)
  && (value.labelMinZoomPercent === undefined || isFiniteNumber(value.labelMinZoomPercent))
  && (value.labelOffset === undefined || isRecord(value.labelOffset)
    && isFiniteNumber(value.labelOffset.x) && isFiniteNumber(value.labelOffset.y))
  && (value.focusBounds === undefined || isBounds(value.focusBounds));

const isLocation = (value: unknown): value is MapLocation => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y);

const parseAdditionalLocations = (
  raw: unknown,
  metadata: MapMetadata,
  existingIds: Set<string>,
): MapLocation[] => {
  if (!isRecord(raw) || !Array.isArray(raw.locations)) {
    throw new Error("Additional map data needs a locations array.");
  }
  return raw.locations.map((location: unknown): MapLocation => {
    const inset = isRecord(location) && typeof location.regionId === "string"
      ? metadata.insets?.find((candidate) => candidate.id === location.regionId)
      : undefined;
    const bounds = inset?.bounds ?? metadata.bounds;
    if (!isLocation(location)
      || existingIds.has(location.id)
      || location.x < bounds.minX || location.x > bounds.maxX
      || location.y < bounds.minY || location.y > bounds.maxY) {
      throw new Error(`Invalid or duplicate additional location in ${metadata.id}.`);
    }
    existingIds.add(location.id);
    return {
      ...location,
      name: typeof location.nameKey === "string" ? i18n.t(location.nameKey) : location.name,
      label: typeof location.label === "string" ? location.label : "",
      subtype: typeof location.subtype === "string" ? location.subtype : location.category,
      regionId: typeof location.regionId === "string" ? location.regionId : "",
      region: typeof location.regionKey === "string" ? i18n.t(location.regionKey) : typeof location.region === "string" ? location.region : "",
    };
  });
};

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

  const sourceRegions = Array.isArray(raw.regions) ? raw.regions.filter(isRegion) : [];
  const regionIds = new Set(sourceRegions.map((region) => region.id));
  const regions = [...sourceRegions, ...(definition.regionLabels ?? []).filter((region) => !regionIds.has(region.id))];
  const insets = Array.isArray(raw.insets) ? raw.insets : [];
  for (const inset of insets) {
    if (!isRecord(inset) || typeof inset.id !== "string" || typeof inset.name !== "string"
      || typeof inset.nameKey !== "string" || typeof inset.image !== "string" || !isFiniteNumber(inset.worldMapId)
      || !isBounds(inset.bounds)) {
      throw new Error("Invalid inset map.");
    }
  }
  const navigationBounds = raw.navigationBounds;
  if (navigationBounds !== undefined && (!isBounds(navigationBounds)
    || navigationBounds.minX > bounds.minX || navigationBounds.minY > bounds.minY
    || navigationBounds.maxX < bounds.maxX || navigationBounds.maxY < bounds.maxY)) {
    throw new Error("Invalid map navigation bounds.");
  }
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  const locations = (Array.isArray(raw.locations) ? raw.locations.filter(isLocation).filter((location) => !location.hiddenFromMap) : [])
    .map((location): MapLocation => ({
      ...location,
      label: typeof location.label === "string" ? location.label : "",
      subtype: typeof location.subtype === "string" ? location.subtype : location.category,
      regionId: typeof location.regionId === "string" ? location.regionId : "",
      region: typeof location.region === "string"
        ? location.region
        : regionNames.get(String(location.regionId)) ?? "",
      ...(isRecord(location.referenceCoordinates)
        && isFiniteNumber(location.referenceCoordinates.x)
        && isFiniteNumber(location.referenceCoordinates.y)
        ? { referenceCoordinates: {
          x: location.referenceCoordinates.x,
          y: location.referenceCoordinates.y,
        } }
        : {}),
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
    insets: insets as MapMetadata["insets"],
    navigationBounds: navigationBounds as MapMetadata["navigationBounds"],
    hideBaseTiles: raw.hideBaseTiles === true,
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
    void Promise.all([
      loadEntityArtwork(),
      GAME_CONFIG.mapCompanionSourcesPath
        ? loadCachedMapJson<MapCompanionCatalog>(contentUrl(GAME_CONFIG.mapCompanionSourcesPath))
        : Promise.resolve<MapCompanionCatalog>({ version: 1, sources: {} }),
      GAME_CONFIG.mapPetSourcesPath
        ? loadCachedMapJson<MapPetSourceCatalog>(contentUrl(GAME_CONFIG.mapPetSourcesPath))
          .catch((error: unknown): MapPetSourceCatalog => {
            if (error instanceof MapDataRequestError && error.status === 404) {
              console.warn(`Map pet source catalog is unavailable at ${error.url}; using existing companion sources.`);
              return { version: 1, pets: {}, sources: {} };
            }
            throw error;
          })
        : Promise.resolve<MapPetSourceCatalog>({ version: 1, pets: {}, sources: {} }),
      loadCachedMapJson<unknown>(`${definition.dataUrl}/metadata.json`),
      ...(definition.locationFiles ?? []).map((file) =>
        loadCachedMapJson<unknown>(`${definition.dataUrl}/${file}`)),
    ])
      .then(([artwork, companions, pets, raw, ...additionalData]) => {
        if (cancelled) return;
        if (companions.version !== 1 || !isRecord(companions.sources)) throw new Error("Invalid map companion catalog.");
        if (pets.version !== 1 || !isRecord(pets.pets) || !isRecord(pets.sources)) throw new Error("Invalid map pet source catalog.");
        const parsed = parseMapMetadata(raw, definition);
        const ids = new Set(parsed.locations.map(({ id }) => id));
        const aliases = new Set(parsed.locations.flatMap((point) => point.aliasIds ?? []));
        const locations = additionalData.flatMap((layer) => parseAdditionalLocations(layer, parsed, ids))
          .filter((point) => !aliases.has(point.id));
        if (migrateMapMarkerAliases(parsed.locations, localStorage)) window.dispatchEvent(new Event("gm:saved-state-changed"));
        setState({
          data: {
            ...parsed,
            locations: attachMapPetSources(attachMapCompanions([...parsed.locations, ...locations], companions), pets, definition.id).map((location) => {
              const sourceCategory = getSourceCategory(location.reference?.id, location.category);
              const iconPath = sourceCategory?.nativeIconPath?.replace(/^\//, "")
                ?? (location.itemId ? artwork.items[location.itemId] : undefined)
                ?? (location.reference ? artwork.icons[location.reference.id] : undefined)
                ?? location.iconPath;
              return { ...location, ...(sourceCategory ? { category: sourceCategory.id } : {}), ...(iconPath ? { iconPath } : {}) };
            }),
          },
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
