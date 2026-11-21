import type { MapCompanionSource } from "./map-companion-sources";
import type { MapPetSource } from "./map-pet-sources";

/** A named area of the map: the "jump to" targets and the labels drawn over the world. */
export interface MapRegion {
  id: string;
  name: string;
  /** Visual hierarchy supplied by the map data; unclassified places stay minor. */
  importance?: "major" | "minor";
  /** Inset headings render above their image instead of across its center. */
  inset?: boolean;
  /** Show dense region names only after the map is large enough to read them. */
  labelMinZoomPercent?: number;
  /** World-coordinate offset that keeps the label clear of a landmark marker at every zoom. */
  labelOffset?: { x: number; y: number };
  /** Native event spawn extent used to frame an area when navigating to it. */
  focusBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  x: number;
  y: number;
}

export interface MapMarkerAddress {
  mapId: string;
  markerId: string;
}

/** A point of interest shipped with the map data. */
export interface MapLocation {
  aliasIds?: string[];
  objectVariants?: { id: string; category: string }[];
  companionSources?: MapCompanionSource[];
  petSources?: MapPetSource[];
  hiddenFromMap?: boolean;
  id: string;
  name: string;
  /** Optional source key for a localized name in imported map data. */
  nameKey?: string;
  /** One of the ids in map-config.ts `MAP_CATEGORIES`. */
  category: string;
  /** Short kind label shown under the name ("Gas station", "Boss arena"). */
  label: string;
  /** Free-form sub-kind, searchable but never displayed on its own. */
  subtype: string;
  regionId: string;
  region: string;
  /** Optional source key for a localized region in imported map data. */
  regionKey?: string;
  x: number;
  y: number;
  /** Number of nearby same-name locations represented by this map marker. */
  occurrences?: number;
  /** Original coordinates shown to players when the image uses another grid. */
  referenceCoordinates?: MapCoordinate;
  /** Optional longer text shown in the details panel. */
  description?: string;
  /** Catalog item represented by this location, when the game supplies one. */
  itemId?: string;
  /** Verified artwork, relative to the bundled public asset root. */
  iconPath?: string;
  reference?: { category: string; id: string };
  entityId?: string;
  springboard?: { launch: boolean; glideLift: boolean };
  elevation?: number;
  spawnCount?: number;
  spawnProbability?: number;
  sourceActor?: string;
  sourceAsset?: string;
  /** Source marker for a temporary travel destination. */
  returnTo?: MapMarkerAddress;
}

export type UserMarkerColor = "sage" | "amber" | "red" | "blue" | "violet";
export type UserMarkerIcon = "pin" | "home" | "flag" | "vehicle" | "supplies" | "danger" | `category:${string}`;
export type UserMarkerGroup = "general" | "base" | "resources" | "travel" | "danger";
export type UserMarkerStyleChange = Partial<Pick<UserMapMarker, "color" | "icon">>;
export interface UserMarkerEdits {
  name: string;
  note: string;
  color: UserMarkerColor;
  icon: UserMarkerIcon;
  group: UserMarkerGroup;
}

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

/** A specific marker to return to after browsing another dashboard page. */
export interface MapMarkerTarget {
  mapId: string;
  markerId: string;
  name: string;
}

export const isUserMapMarker = (point: MapPoint): point is UserMapMarker =>
  point.category === "custom" && point.subtype === "custom" && point.regionId === "personal";

/** Where a map's tile pyramid lives and how a tile path is spelled. */
export interface MapTileSource {
  basePath: string;
  /** Pattern with `{level}`, `{x}` and `{y}` placeholders, relative to basePath. */
  tilePattern: string;
}

/** A separate, source-backed map arranged beside its parent map. */
export interface MapInset {
  id: string;
  name: string;
  nameKey: string;
  image: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  worldMapId: number;
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
  /** Camera limits include inset maps; base tile coordinates never change. */
  navigationBounds?: MapMetadata["bounds"];
  insets?: MapInset[];
  hideBaseTiles?: boolean;
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
