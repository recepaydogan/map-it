export type ErMapLayer = "overworld" | "underground" | "dlc-realm-of-shadow";

import type { CategoryDef, CategoryGroup, ItemRef, Marker } from "../../data/types";

export type ErMapMarkerSource = "world-map-point" | "bonfire" | "boss" | "msb" | "test-custom";

export interface RawErMapMarker {
  id: string;
  source: ErMapMarkerSource;
  name: string;
  /** Original English name, kept on LOCALIZED copies — some assets (enemy
   * portraits) are keyed by the English string. Absent on the raw data itself. */
  enName?: string;
  category: string;
  /** Shared user-created marker projected into this map's raw marker pipeline. */
  custom?: boolean;
  customIcon?: string;
  /** NOMINAL map-space position used only by shared user-created markers. */
  pixel?: { x: number; y: number };
  region?: string;
  description?: string;
  /** A connection's destination place name (game PlaceName) — highlighted in the panel. */
  connectionTarget?: string;
  /** The destination's full map id (e.g. m31_06_00_00) — enables click-through navigation. */
  connectionTargetMap?: string;
  /** Build-time-resolved arrival: the view + marker id a destination click selects. */
  connectionTargetView?: string;
  connectionTargetMarkerId?: string;
  /** Merged portal stack (several crossings on the exact same spot): every
   * distinct destination reachable from here. Mirrors dungeonBosses'
   * {name,id,view} click-through shape; id/view are absent when a crossing's
   * arrival marker couldn't be resolved (the row then renders unclickable). */
  connectionOptions?: { name: string; id?: string; view?: string }[];
  /** Dungeon entrance: the interior map it leads to (e.g. m30_05_00_00). */
  dungeonMap?: string;
  /** Every boss inside, joined at build time on the shared interior map id.
   * Each carries the view its marker lives in, so the panel can select it. */
  dungeonBosses?: { name: string; id: string; view: string }[];
  /** Interior boss: every dungeon entrance that reaches it, nearest-to-arena
   * first — the reverse of dungeonBosses. Usually one door; shared interiors
   * (Sealed Tunnel/Divine Tower of West Altus, Haligtree/Elphael) list all. */
  dungeonEntrances?: { name: string; id: string; view: string }[];
  mapIcon?: string;
  areaNo: string;
  gridX: number;
  gridZ: number;
  localX: number;
  localY: number;
  localZ: number;
  iconId?: number;
  map?: string;
  section?: string;
  type?: string;
  entityId?: number;
  eventId?: number;
  regionId?: number;
  modelName?: string;
  npcParamId?: number;
  thinkParamId?: number;
  charaInitId?: number;
  itemLotId?: number;
  itemId?: number;
  itemIconId?: number;
  itemKey?: string;
  objActId?: number;
  linkedType?: string;
  placementCount?: number;
  drops?: ItemRef[];
  /** Merchant wares — ESD OpenRegularShop ranges joined to ShopLineupParam. */
  shop?: ItemRef[];
  reference?: { field: string; value: string };
}

export interface ErMapEnemyProfile {
  bossMeta: NonNullable<Marker["bossMeta"]>;
  drops?: ItemRef[];
}

/**
 * How a marker hands an item over. Authored by the item-index builder from the
 * extractors' own fields — never re-derived here, because category alone can't
 * tell a merchant's stock from the loot they drop when killed (both are true of
 * the same marker). `drop` is implied by the dropSources list and isn't written.
 */
export type ErAcquisitionKind = "treasure" | "shop" | "npc-drop" | "area" | "drop";

/** One marker an item traces back to, as the item index authors it. */
export interface ErMapItemIndexRow {
  /** Raw marker id — `wmp:<id>` for a World Map Point, else an MSB path. */
  id: string;
  name: string;
  category: string;
  region: string;
  layer: string;
  /** locations only; dropSources rows are all implicitly `drop`. */
  kind?: ErAcquisitionKind;
  /** Chance on a drop ("Guaranteed" / "25% drop"), rune price on a shop row. */
  note?: string;
}

/**
 * itemKey (group:id, see erItemKey) → every marker that hands the item over.
 * `locations` are places the item IS (a pickup, a merchant's stock, the area
 * holding it); `dropSources` are enemies that drop it.
 */
export type ErMapItemIndex = Record<string, {
  locations: ErMapItemIndexRow[];
  dropSources: ErMapItemIndexRow[];
}>;

export interface RawSpatialRecord {
  id: string;
  map: string;
  section: string;
  type: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  shape?: { type: string; radius?: number; height?: number; width?: number; depth?: number };
  entityId?: number;
  eventId?: number;
  regionId?: number;
  modelName?: string;
  npcParamId?: number;
  talkId?: number;
  thinkParamId?: number;
  charaInitId?: number;
  itemLotId?: number;
  objActId?: number;
  linkedType?: string;
  reference?: { field: string; value: string };
}

export interface ErMapManifestCategory extends CategoryDef {
  group: string;
  defaultVisible?: boolean;
}

export type ErMapManifestGroup = Omit<CategoryGroup, "categories">;

export type BossRewardFilters = Record<string, {
  category: string;
  rewards: string[];
  /** Exact reward item keys grouped by their fine filter category. */
  rewardItems?: Record<string, string[]>;
}>;

export interface ErMapViewDefinition {
  key: string;
  map: string;
  label: string;
  kind: "tiled" | "native";
  recordCount: number;
  typeCounts: Record<string, number>;
  /** Extra filter membership for existing boss markers; never additional pins. */
  bossRewardFilters?: BossRewardFilters;
  url?: string;
  chunks?: Record<string, string>;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface ErMapManifest {
  totalRecords: number;
  categories: ErMapManifestCategory[];
  groups: ErMapManifestGroup[];
  views: ErMapViewDefinition[];
  globalTypeCounts: Record<string, number>;
}

export interface ErMapLayerDefinition {
  key: ErMapLayer;
  areaNo: string;
  tileSet: string;
  imageWidth: number;
  imageHeight: number;
  contentBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  tileMinX: number;
  tileMaxX: number;
  tileMinZ: number;
  tileMaxZ: number;
  coordinateMode: "world-grid" | "world-blocks";
}

export interface ErMapPosition {
  x: number;
  y: number;
  rawWorldX: number;
  rawWorldZ: number;
  outsideCanvas: boolean;
}
