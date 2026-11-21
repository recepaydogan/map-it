import type { WorldSessionBinding } from "./world-session-binding.ts";
import type { ObservedJourneyPortal } from "../journey/journey-observed-portals.ts";

/** All persisted world coordinates use three named axes, never renderer axes. */
export interface WorldCoordinate {
  x: number;
  y: number | null;
  z: number;
}

export interface WorldGeneration {
  version: string;
  seed: string;
  preset: string;
  settings: Record<string, string | number | boolean>;
}

export interface WorldAssociation {
  kind: "local" | "server" | "realm";
  identity: string;
  /** Optional save-root fingerprint or remote sub-world identity. */
  sourceId?: string;
  worldName?: string;
  /** A previous confirmation may be restored only when its match is unique. */
  confirmedAt: number;
}

export interface WorldPin extends WorldCoordinate {
  id: string;
  dimension: string;
  name: string;
  icon: string;
  color: string;
  group: string;
  note: string;
}

export interface DimensionView {
  mode: "2d" | "3d";
  camera2d: { x: number; z: number; zoom: number } | null;
  camera3d: {
    x: number; y: number; z: number; yaw: number; pitch: number; distance: number;
    cutawayY: number | null;
  } | null;
  /**
   * Full-map windows share filters and personal data, but each owns its camera
   * and renderer mode. Optional for schema-1 records created before the
   * multi-window split; the legacy fields above remain the desktop fallback.
   */
  modeBySurface?: Partial<Record<WorldMapSurface, "2d" | "3d">>;
  camera2dBySurface?: Partial<Record<WorldMapSurface, { x: number; z: number; zoom: number } | null>>;
  camera3dBySurface?: Partial<Record<WorldMapSurface, {
    x: number; y: number; z: number; yaw: number; pitch: number; distance: number;
    cutawayY: number | null;
  } | null>>;
  /** null uses category defaults; [] explicitly hides every category. */
  visibleCategories: string[] | null;
  /** Applied additive structure-registry migrations. Missing on legacy schema-1 records. */
  structureFilterRevision?: number;
  expandedGroup: string | null;
  filterSearch: string;
  hideFound: boolean;
  favoritesOnly: boolean;
  /** Personal-marker groups hidden on this dimension. Missing means all groups are visible. */
  hiddenPinGroups?: string[];
}

export const WORLD_MAP_SURFACES = ["desktop", "in-game"] as const;
export type WorldMapSurface = typeof WORLD_MAP_SURFACES[number];

export interface TrackedDestination extends WorldCoordinate {
  id: string;
  dimension: string;
  label: string;
  pointId: string | null;
  /** Missing means an ordinary destination created before destination kinds existed. */
  kind?: "destination" | "portal-plan" | "player-pin";
}

export interface WorldPersonalState {
  /** Device-only resume state, isolated by account during sign-out. */
  resume?: WorldResumeState;
  pins: WorldPin[];
  /** Observed cross-dimension portal pairs survive journey history trimming and clearing. */
  portals?: ObservedJourneyPortal[];
  /** Removed portal pairs prevent journey migration and account merging from restoring them. */
  removedPortals?: ObservedJourneyPortal[];
  /** Point references include dimension; identical source IDs may occur in each. */
  favorites: string[];
  found: string[];
  notes: Record<string, string>;
  tracked: TrackedDestination[];
  views: Record<string, DimensionView>;
}

export interface WorldResumeState {
  dimensionBySurface?: Partial<Record<WorldMapSurface, string>>;
  lastPosition?: {
    generationKey: string; dimension: string; x: number; y: number; z: number; receivedAt: number;
  };
}

export interface WorldRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  edition: string;
  generation: WorldGeneration;
  association: WorldAssociation | null;
  favorite: boolean;
  createdAt: number;
  lastOpenedAt: number;
  /** Bottom-pinned entries follow recent entries; opening clears this override. */
  movedToBottomAt: number | null;
  personal: WorldPersonalState;
}

export interface NewWorld {
  name: string;
  edition: string;
  generation: WorldGeneration;
}

export interface WorldCreateRequest {
  revision: number;
  input: NewWorld;
}

export interface WorldSelection {
  id: "selection";
  worldId: string | null;
  /** Increases even when selecting the same world, invalidating prior async jobs. */
  revision: number;
}

export interface WorldLibrarySnapshot {
  worlds: WorldRecord[];
  selection: WorldSelection;
  binding: WorldSessionBinding | null;
}

export const emptyPersonalState = (): WorldPersonalState => ({
  pins: [], portals: [], removedPortals: [], favorites: [], found: [], notes: {}, tracked: [], views: {},
});

export const defaultDimensionView = (): DimensionView => ({
  mode: "2d", camera2d: null, camera3d: null, visibleCategories: null,
  structureFilterRevision: 0, expandedGroup: null, filterSearch: "", hideFound: false, favoritesOnly: false,
  hiddenPinGroups: [],
});

export const pointReference = (dimension: string, pointId: string): string =>
  JSON.stringify([dimension, pointId]);

/** Seed is only one part of generation identity. Saved chunks need a separate source revision. */
export const generationKey = (world: Pick<WorldRecord, "edition" | "generation">): string => {
  const { version, seed, preset, settings } = world.generation;
  return JSON.stringify([world.edition, version, seed, preset,
    Object.keys(settings).sort().map(key => [key, settings[key]])]);
};

export const orderWorlds = (worlds: WorldRecord[]): WorldRecord[] => [...worlds].sort((a, b) => {
  if (a.movedToBottomAt === null && b.movedToBottomAt !== null) return -1;
  if (a.movedToBottomAt !== null && b.movedToBottomAt === null) return 1;
  return a.movedToBottomAt !== null && b.movedToBottomAt !== null
    ? a.movedToBottomAt - b.movedToBottomAt || a.id.localeCompare(b.id)
    : b.lastOpenedAt - a.lastOpenedAt || a.id.localeCompare(b.id);
});
