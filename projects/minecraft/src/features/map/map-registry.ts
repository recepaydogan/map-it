import { MAP_DATA_BASE_URL } from "./map-data-url";

/** Generated worlds and bundled reference maps must never share implicit identity. */
export const MAP_WORKSPACE_KIND: "generated" | "static" = "generated";

/**
 * The maps this app ships. Each entry points at a directory holding
 * `metadata.json` and a `tiles/` pyramid (see scripts/build-sample-map.mjs
 * for the expected layout). With more than one entry the map workspace shows
 * a map picker; with exactly one it stays hidden.
 *
 * `dataUrl` is usually `${MAP_DATA_BASE_URL}/<folder>` so the same registry
 * works against bundled files (`/maps/...`) in development and a CDN
 * (`VITE_MAP_DATA_BASE_URL`) in release builds.
 */
export interface MapDefinition {
  id: string;
  /** Shown in the map picker until the map's own `displayName` has loaded. */
  name: string;
  dataUrl: string;
}

export const MAP_DEFINITIONS: MapDefinition[] = [
  { id: "sample", name: "Sample World", dataUrl: `${MAP_DATA_BASE_URL}/sample` },
];

export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;

export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find((definition) => definition.id === id) ?? MAP_DEFINITIONS[0]!;
