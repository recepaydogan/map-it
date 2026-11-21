import { useEffect, useState } from "react";
import { loadCachedMapJson } from "./map-data-cache";
import { MAP_DATA_BASE_URL } from "./map-data-url";
import type { MapSearchIndex, MapSearchIndexLocation } from "./types";

interface MapSearchIndexState {
  data: MapSearchIndex | null;
  loading: boolean;
  error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isGameplayFacets = (value: unknown) => value === undefined || (isRecord(value)
  && ["rarity", "slot", "armorType", "weaponType", "proficiency"]
    .every((key) => value[key] === undefined || typeof value[key] === "string")
  && (value.unique === undefined || typeof value.unique === "boolean"));

const isIndexLocation = (value: unknown): value is MapSearchIndexLocation => isRecord(value)
  && typeof value.id === "string"
  && typeof value.mapId === "string"
  && typeof value.mapName === "string"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && isGameplayFacets(value.gameplay)
  && typeof value.x === "number"
  && Number.isFinite(value.x)
  && typeof value.y === "number"
  && Number.isFinite(value.y);

const isRelationship = (value: unknown): value is MapSearchIndex["relationships"][number] => isRecord(value)
  && typeof value.id === "string"
  && value.kind === "exact-name-match"
  && value.confidence === "uncertain"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && Array.isArray(value.appearances)
  && value.appearances.every((appearance) => isRecord(appearance)
    && typeof appearance.mapId === "string"
    && typeof appearance.locationId === "string");

const CONNECTION_EVIDENCE = new Set(["reciprocal-navigation-portal", "navigation-portal-target"]);

const isMapBounds = (value: unknown) => isRecord(value)
  && [value.minX, value.minY, value.maxX, value.maxY]
    .every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));

const isConnection = (value: unknown): value is MapSearchIndex["connections"][number] => isRecord(value)
  && typeof value.id === "string"
  && typeof value.evidence === "string"
  && CONNECTION_EVIDENCE.has(value.evidence)
  && value.confidence === "verified"
  && Array.isArray(value.endpoints)
  && value.endpoints.length === 2
  && value.endpoints.every((endpoint) => isRecord(endpoint)
    && typeof endpoint.mapId === "string"
    && typeof endpoint.locationId === "string")
  && Array.isArray(value.sourcePortalIds)
  && value.sourcePortalIds.length === 2
  && value.sourcePortalIds.every((portalId) => typeof portalId === "string")
  && typeof value.sourceToTargetDistance === "number"
  && Number.isFinite(value.sourceToTargetDistance)
  && typeof value.targetToSourceDistance === "number"
  && Number.isFinite(value.targetToSourceDistance);

const parseMapSearchIndex = (value: unknown): MapSearchIndex => {
  if (!isRecord(value) || !Array.isArray(value.locations)) {
    throw new Error("The global map search index is invalid.");
  }
  const locations = value.locations.filter(isIndexLocation);
  if (locations.length !== value.locations.length) {
    throw new Error("The global map search index contains invalid locations.");
  }
  const connections = Array.isArray(value.connections) ? value.connections.filter(isConnection) : [];
  if (!Array.isArray(value.connections) || connections.length !== value.connections.length) {
    throw new Error("The global map search index contains invalid verified connections.");
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    sourceBuilds: Array.isArray(value.sourceBuilds)
      ? value.sourceBuilds.filter((build): build is string => typeof build === "string")
      : [],
    maps: Array.isArray(value.maps)
      ? value.maps.filter((map): map is MapSearchIndex["maps"][number] => isRecord(map)
        && typeof map.id === "string"
        && typeof map.name === "string"
        && typeof map.locationCount === "number"
        && isMapBounds(map.bounds))
      : [],
    locations,
    relationships: Array.isArray(value.relationships)
      ? value.relationships.filter(isRelationship)
      : [],
    connections,
  };
};

export const useMapSearchIndex = (): MapSearchIndexState => {
  const [state, setState] = useState<MapSearchIndexState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    void loadCachedMapJson<unknown>(`${MAP_DATA_BASE_URL}/index.json`)
      .then(parseMapSearchIndex)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        console.error("The global map search index could not be loaded.", error);
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "The global map search index could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
