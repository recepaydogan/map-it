/** A named area of the map: the "jump to" targets and the labels drawn over the world. */
export interface MapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** A point of interest shipped with the map data. */
export interface MapLocation {
  id: string;
  name: string;
  /** One of the ids in map-config.ts `MAP_CATEGORIES`. */
  category: string;
  /** Short kind label shown under the name ("Gas station", "Boss arena"). */
  label: string;
  /** Free-form sub-kind, searchable but never displayed on its own. */
  subtype: string;
  regionId: string;
  region: string;
  x: number;
  y: number;
  /** Optional longer text shown in the details panel. */
  description?: string;
}

export type UserMarkerColor = "sage" | "amber" | "red" | "blue" | "violet";
export type UserMarkerIcon = "pin" | "home" | "flag" | "vehicle" | "supplies" | "danger";
export type UserMarkerGroup = "general" | "base" | "resources" | "travel" | "danger";
export type UserMarkerStyleChange = Partial<Pick<UserMapMarker, "color" | "icon">>;

/** A marker the player placed themselves. */
export interface UserMapMarker {
  id: string;
  name: string;
  category: "custom";
  label: string;
  subtype: "custom";
  regionId: "personal";
  region: string;
  x: number;
  y: number;
  color?: UserMarkerColor;
  icon?: UserMarkerIcon;
  group?: UserMarkerGroup;
  mapId?: string;
}

export type MapPoint = MapLocation | UserMapMarker;

export const isUserMapMarker = (point: MapPoint): point is UserMapMarker =>
  point.category === "custom" && point.subtype === "custom" && point.regionId === "personal";

/** Where a map's tile pyramid lives and how a tile path is spelled. */
export interface MapTileSource {
  basePath: string;
  /** Pattern with `{level}`, `{x}` and `{y}` placeholders, relative to basePath. */
  tilePattern: string;
}

/**
 * The `metadata.json` of one map, plus the runtime fields the loader fills in
 * (`id`, `tileSource`). Level 0 tiles are the most detailed; level N tiles
 * each cover `tileSize * 2^N` world units.
 */
export interface MapMetadata {
  id: string;
  displayName: string;
  description?: string;
  schemaVersion: number;
  generatedAt?: string;
  attribution?: string;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  tileSize: number;
  detailLevels: number[];
  regions: MapRegion[];
  locations: MapLocation[];
  tileSource: MapTileSource;
}

export interface MapView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface MapCoordinate {
  x: number;
  y: number;
}
