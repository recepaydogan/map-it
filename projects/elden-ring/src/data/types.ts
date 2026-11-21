/**
 * Prototype data contract. Mirrors the unified schema from the pipeline spec
 * (Section 9) closely enough that swapping mock data for real dist/*.json is a
 * drop-in — the UI never assumes anything the real schema cannot provide.
 */

export type Game = "elden-ring" | "nightreign";

export type MapLayer =
  | "overworld"
  | "underground"
  | "dlc-realm-of-shadow"
  | "limveld";

/** A single category in the filter dictionary (categories.json). */
export interface CategoryDef {
  key: string;
  label: string;
  color: string;
  /** Icon key resolved through icon-map.tsx. */
  icon: string;
  /** Category-level blurb; detail panels fall back to it when the marker has none. */
  description?: string;
}

/** A collapsible meta-group bundling many categories into one scannable row. */
export interface CategoryGroup {
  key: string;
  label: string;
  icon: string;
  categories: string[];
  /** Translation key, when `group.<key>` won't do. Two games can file different
   *  groups under the same key — Elden Ring's combat group holds ordinary enemies
   *  as well as bosses, Nightreign's holds bosses only — and one key can't carry
   *  both names. See groupLabelKey. */
  labelKey?: string;
}

/** Intent-based one-click filter (the primary control, not the 40 toggles). */
export interface FilterPreset {
  key: string;
  label: string;
  icon: string;
  /** "all" / "none" or an explicit category allow-list. */
  categories: string[] | "all" | "none";
}

export interface StatRow {
  label: string;
  value: string;
}

/** Item reference shown in drop / shop / contents lists (joins to items.json). */
export interface ItemRef {
  id: string;
  name: string;
  category: string;
  qty?: number;
  note?: string;
  /** In-game item id + extracted icon id (real icon). */
  itemId?: number;
  iconId?: number;
  /** Unique (group:id) key — resolves the item unambiguously despite id collisions. */
  itemKey?: string;
}

export interface Marker {
  id: string;
  game: Game;
  layer: MapLayer;
  category: string;
  name: string;
  region?: string;
  /** Pixel coordinate in the map image space — what the renderer consumes. */
  pixel: { x: number; y: number };
  /** Layer-2 in-game text (FMG). Never a wiki link. */
  description?: string;
  /** Location names inside `description` to render emphasised (e.g. a connection's destination). */
  descriptionHighlights?: string[];
  /** Exact NpcParam row when the marker comes from the spatial game-data pipeline. */
  npcParamId?: number;
  stats?: StatRow[];
  drops?: ItemRef[];
  shopItems?: ItemRef[];
  bossMeta?: {
    /** REAL health-bar HP: NpcParam.hp × the area/SOTE scaling the boss's row carries.
     *  (`hpBase` alone is what the param stores, and it understates late bosses ~14×.) */
    hp?: number;
    runes?: number;
    /** Unscaled NpcParam.hp — kept for provenance next to the scaled number. */
    hpBase?: number;
    /** The region scaling applied to hpBase (from the boss's own NpcParam SpEffects). */
    hpScale?: { mult: number; region?: string };
    /** HP with 1 / 2 / 3 summoned phantoms (MultiPlayCorrectionParam). */
    hpCoop?: number[];
    /** Poise (super-armour) — stagger taken before a stance break. */
    poise?: number;
    /** Real resistance table from NpcParam (damage multipliers + status buildup). */
    combat?: {
      /** Every damage channel as an incoming-damage multiplier (1 = neutral, >1
       * weak, <1 resistant), sorted most-vulnerable → most-resistant. */
      damage: { type: string; mult: number }[];
      /** Status effects, most-effective first. */
      status: { type: string; tier: "effective" | "moderate" | "resistant" | "immune" }[];
    };
  };
  /** Landmark/dungeon: the boss that resides here (real EMEVD name). */
  dungeonBoss?: string;
  /** That resident boss's own marker id, so the panel can navigate to it. */
  dungeonBossId?: string;
  /** Every boss residing here, when the source can name the whole set rather
   * than a single one (the Test Map joins them exactly, on the interior map
   * id). Takes precedence over the single dungeonBoss above. */
  dungeonBosses?: { name: string; id?: string }[];
  /** Every dungeon entrance leading to this marker, nearest first — the
   * reverse of the above, so a boss reached on its own can point back at its
   * door(s); interiors shared by two doors list both. */
  dungeonEntrances?: { name: string; id?: string }[];
  /** A merged portal hub's destinations (several loading-zone crossings on the
   * exact same spot). Rows without an id render as plain labels. */
  connectionOptions?: { name: string; id?: string }[];
  /** Nightreign: which night this is relevant to. */
  day?: 1 | 2;
  /** Nightreign: whether the location is guaranteed (drops are not). */
  seeded?: boolean;
  /** Extracted POI icon filename (Nightreign). */
  icon?: string;
  /** Elden Ring: in-game item id + icon id (real item icon shown on the marker). */
  itemId?: number;
  iconId?: number;
  /** Unique (group:id) key — resolves the item unambiguously despite id collisions. */
  itemKey?: string;
  /** Elden Ring: authentic world-map POI symbol filename (public/icons/elden-ring/map). */
  mapIcon?: string;
  /** User-authored marker (created in-app, not extracted) — draggable, editable,
   * deletable. See data/custom-markers.ts. */
  custom?: boolean;
  /** A custom marker's chosen image: a preset symbol URL or an uploaded data URL.
   * Checked first by markerArtUrl, so it wins over every other art source. */
  customIcon?: string;
}

/** Per-game / per-layer map image descriptor for the Leaflet CRS.Simple view. */
export interface MapImage {
  src: string;
  width: number;
  height: number;
}
