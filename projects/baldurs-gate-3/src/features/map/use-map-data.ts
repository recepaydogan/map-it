import { useEffect, useState } from "react";
import { loadCachedMapJson } from "./map-data-cache";
import { parseMapRasterMetadata } from "./map-raster-metadata";
import type { MapDefinition } from "./map-registry";
import type {
  MapContentCatalog,
  MapContentEntity,
  MapContentRelationship,
  MapLocation,
  MapMetadata,
  MapRegion,
} from "./types";

interface MapDataState {
  data: MapMetadata | null;
  loading: boolean;
  error: string | null;
  mapId: string | null;
}


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

const parseLocations = (value: unknown): MapLocation[] => (Array.isArray(value) ? value : [])
  .filter(isLocation)
  .map((location): MapLocation => ({
    ...location,
    label: typeof location.label === "string" ? location.label : "",
    subtype: typeof location.subtype === "string" ? location.subtype : location.category,
    regionId: typeof location.regionId === "string" ? location.regionId : "",
    region: typeof location.region === "string" ? location.region : "",
    ...(typeof location.contentId === "string" ? { contentId: location.contentId } : {}),
    ...(Array.isArray(location.searchTerms)
      ? { searchTerms: location.searchTerms.filter((term): term is string => typeof term === "string") }
      : {}),
    ...(Array.isArray(location.categoryFacets)
      ? { categoryFacets: location.categoryFacets.filter((facet): facet is string => typeof facet === "string") }
      : {}),
  }));

const isContentEntity = (value: unknown): value is MapContentEntity => isRecord(value)
  && typeof value.id === "string"
  && typeof value.kind === "string"
  && typeof value.title === "string"
  && Array.isArray(value.tags)
  && Array.isArray(value.spoilerBlocks)
  && Array.isArray(value.provenance)
  && isRecord(value.confidence);

const isRelationship = (value: unknown): value is MapContentRelationship => isRecord(value)
  && typeof value.id === "string"
  && typeof value.fromId === "string"
  && typeof value.toId === "string"
  && typeof value.kind === "string";

const parseContentCatalog = (value: unknown): MapContentCatalog => {
  if (!isRecord(value)) return { schemaVersion: 1, entities: {}, relationships: [] };
  const entityValues = Array.isArray(value.entities)
    ? value.entities
    : isRecord(value.entities) ? Object.values(value.entities) : [];
  const entities = entityValues
    .filter(isContentEntity)
    .reduce<Record<string, MapContentEntity>>((result, entity) => {
      result[entity.id] = entity;
      return result;
    }, {});
  return {
    schemaVersion: isFiniteNumber(value.schemaVersion) ? value.schemaVersion : 1,
    ...(typeof value.sourceBuild === "string" ? { sourceBuild: value.sourceBuild } : {}),
    entities,
    relationships: (Array.isArray(value.relationships) ? value.relationships : []).filter(isRelationship),
  };
};

const parseCoordinateReference = (value: unknown): MapMetadata["coordinateReference"] => {
  if (!isRecord(value) || !isRecord(value.worldBounds) || !isRecord(value.imageBounds)) return undefined;
  const { worldBounds, imageBounds } = value;
  if (
    !isFiniteNumber(worldBounds.x)
    || !isFiniteNumber(worldBounds.y)
    || !isFiniteNumber(worldBounds.width)
    || !isFiniteNumber(worldBounds.height)
    || worldBounds.width <= 0
    || worldBounds.height <= 0
    || !isFiniteNumber(imageBounds.x)
    || !isFiniteNumber(imageBounds.y)
    || !isFiniteNumber(imageBounds.width)
    || !isFiniteNumber(imageBounds.height)
    || imageBounds.width <= 0
    || imageBounds.height <= 0
  ) return undefined;
  return {
    worldBounds: {
      x: worldBounds.x,
      y: worldBounds.y,
      width: worldBounds.width,
      height: worldBounds.height,
    },
    imageBounds: {
      x: imageBounds.x,
      y: imageBounds.y,
      width: imageBounds.width,
      height: imageBounds.height,
    },
    flipY: value.flipY === true,
  };
};

/**
 * Validates a fetched `metadata.json` and fills in the runtime fields. Loose
 * on purpose about optional text (label, subtype, region) so a minimal file
 * with just names and coordinates still renders.
 */
const parseMapMetadata = (
  raw: unknown,
  definition: MapDefinition,
  sourcedLocations: MapLocation[],
  content: MapContentCatalog,
): MapMetadata => {
  if (!isRecord(raw)) throw new Error("metadata.json is not an object.");
  const raster = parseMapRasterMetadata(raw, definition.dataUrl);

  const regions = Array.isArray(raw.regions) ? raw.regions.filter(isRegion) : [];
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  const locations = [...parseLocations(raw.locations), ...sourcedLocations]
    .map((location) => ({
      ...location,
      region: location.region || regionNames.get(location.regionId) || "",
    }));
  const coordinateReference = parseCoordinateReference(raw.coordinateReference);

  return {
    id: definition.id,
    displayName: typeof raw.displayName === "string" && raw.displayName ? raw.displayName : definition.name,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    schemaVersion: isFiniteNumber(raw.schemaVersion) ? raw.schemaVersion : 1,
    ...(typeof raw.generatedAt === "string" ? { generatedAt: raw.generatedAt } : {}),
    ...(typeof raw.attribution === "string" ? { attribution: raw.attribution } : {}),
    ...(typeof raw.sourceBuild === "string" ? { sourceBuild: raw.sourceBuild } : {}),
    ...(coordinateReference ? { coordinateReference } : {}),
    ...raster,
    regions,
    locations,
    content,
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
      .then(async (raw) => {
        if (!isRecord(raw)) throw new Error("metadata.json is not an object.");
        const locationSources = Array.isArray(raw.locationSources)
          ? raw.locationSources.filter((source): source is string => typeof source === "string")
          : [];
        const sourcedLocationPayloads = await Promise.all(locationSources.map((source) =>
          loadCachedMapJson<unknown>(`${definition.dataUrl}/${source}`)));
        const sourcedLocations = sourcedLocationPayloads.flatMap((payload) =>
          parseLocations(isRecord(payload) && Array.isArray(payload.locations) ? payload.locations : payload));
        const contentPayload = typeof raw.contentSource === "string"
          ? await loadCachedMapJson<unknown>(`${definition.dataUrl}/${raw.contentSource}`)
          : null;
        if (cancelled) return;
        setState({
          data: parseMapMetadata(raw, definition, sourcedLocations, parseContentCatalog(contentPayload)),
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
