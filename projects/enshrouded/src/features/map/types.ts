import type { MapCompanionSource } from "./map-companion-sources";

/** A named area of the map: the "jump to" targets and the labels drawn over the world. */
export interface MapRegion {
  id: string;
  name: string;
  /** Visual hierarchy supplied by the map data; unclassified places stay minor. */
  importance?: "major" | "minor";
  /** Inset headings render above their image instead of across its center. */
  inset?: boolean;
  /** Native event spawn extent used to frame an area when navigating to it. */
  focusBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  x: number;
  y: number;
}

export interface MapMarkerAddress {
  mapId: string;
  markerId: string;
}

export interface MapInstanceFacts {
  minimumEntryLevel?: number;
  groupSize?: number;
  betaAvailable?: boolean;
  betaLevelRange?: string;
}

export interface MapQuestInfo {
  faction?: "Alliance" | "Horde" | "Neutral";
  requiredLevel?: number;
  requiredClassKey?: string;
  requiredProfessionKey?: string;
  startsAtKey?: string;
  endsAtKey?: string;
}

export interface MapQuestOffer {
  id: string;
  name: string;
  level: number;
  kind?: "normal" | "repeatable" | "dungeon";
  objectiveItem?: { id: string; name: string; quality: "Common" | "Uncommon"; quantity: number; icon?: string };
  objectiveItems?: { id: string; name: string; quantity: number; icon?: string }[];
  currencyRewards?: { id: string; name: string; quantity: number; icon: string }[];
  reward?: string;
}

/** A point of interest shipped with the map data. */
export interface MapLocation {
  /** A collectible book identity shared by all reported pickup locations. */
  bookId?: string;
  bookLocationId?: string;
  aliasIds?: string[];
  objectVariants?: { id: string; category: string }[];
  companionSources?: MapCompanionSource[];
  hiddenFromMap?: boolean;
  id: string;
  name: string;
  nameKey?: string;
  labelKey?: string;
  regionKey?: string;
  /** Optional short, translated qualifier shown beside the marker kind. */
  detailLabel?: string;
  detailLabelKey?: string;
  /** Structured fields for class and profession trainer markers. */
  trainerTitle?: string;
  trainerTitleKey?: string;
  trainerFaction?: "Alliance" | "Horde";
  trainerClass?: string;
  trainerClassKey?: string;
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
  /** Number of nearby same-name locations represented by this map marker. */
  occurrences?: number;
  /** Original coordinates shown to players when the image uses another grid. */
  referenceCoordinates?: MapCoordinate;
  /** Dungeon quest panels reachable from a reported NPC location. */
  questNpcDungeonIds?: string[];
  questNpcNameKey?: string;
  questInfo?: MapQuestInfo;
  /** Quests nested under a giver pin in the world map. */
  questOffers?: MapQuestOffer[];
  /** Forever world-map quest identity and the character offering it. */
  questId?: string;
  questLevel?: number;
  questGiverMarkerId?: string;
  questGiverName?: string;
  /** Optional longer text shown in the details panel. */
  description?: string;
  descriptionKey?: string;
  /** Catalog item represented by this location, when the game supplies one. */
  itemId?: string;
  /** Verified artwork, relative to the bundled public asset root. */
  iconPath?: string;
  /** Verified wide artwork shown in the marker panel when available. */
  artworkPath?: string;
  /** Article title in the source wiki, when one is associated with this pin. */
  wikiArticle?: string;
  /** Source map layers on which the pin appears. */
  sourceLayers?: string[];
  /** Source-wiki links that resolve to entries bundled in the building catalog. */
  relatedPages?: { page: string; label: string }[];
  /** Client-backed entry requirement and standard difficulty group size. */
  instanceFacts?: MapInstanceFacts;
  instanceEncounters?: { id: number; nameKey: string }[];
  /** Verified client Map record with locally extracted terrain. */
  relatedMapId?: string;
  reference?: { category: string; id: string };
  entityId?: string;
  springboard?: { launch: boolean; glideLift: boolean };
  elevation?: number;
  spawnCount?: number;
  spawnProbability?: number;
  sourceActor?: string;
  sourceAsset?: string;
  /** Direct, verified travel links to other published map markers. */
  linkedMarkers?: { mapId: string; markerId: string; nameKey: string }[];
  linkedMarkersTitleKey?: string;
  linkedMarkerGroups?: { titleKey: string;
    links: { mapId: string; markerId: string; nameKey: string }[] }[];
  /** Source marker for a temporary travel destination. */
  returnTo?: MapMarkerAddress;
}

export type UserMarkerIcon = "pin" | "city" | "town" | "dungeon" | "graveyard"
  | "innkeeper" | "merchant" | "auctioneer" | "banker" | "repair-vendor"
  | "profession-trainer" | "flight-master" | "quest" | "treasure" | "mailbox"
  | "stable-master" | "barber-shop" | "transmogrifier" | "class-trainer"
  | "battlemaster" | "bank" | "repeatable-quest" | "boss"
  | "home" | "flag" | "vehicle" | "supplies" | "danger";
export type UserMarkerGroup = "general" | "base" | "resources" | "travel" | "danger";
export type UserMarkerStyleChange = { icon: UserMarkerIcon };
export interface UserMarkerEdits {
  name: string;
  note: string;
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

/** A native tile pyramid positioned on a shared world canvas. */
export interface MapTerrainLayer extends MapTileSource {
  id: string;
  labelKey?: string;
  tileSize: number;
  detailLevels: number[];
  tileCoverage: Set<string>[];
  sourceBounds: MapMetadata["bounds"];
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
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
  /** Present tile coordinates at each detail level for sparse terrain maps. */
  tileCoverage?: Set<string>[];
  terrainLayers?: MapTerrainLayer[];
  backgroundColor?: string;
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
