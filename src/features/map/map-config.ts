import { Swords, type LucideIcon } from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerIcon } from "./types";
import { contentUrl } from "../../lib/content-url";
import mapIconArtwork from "./map-icon-artwork.json";
import { NATIVE_MAP_SYMBOLS as native, type NativeMapSymbolName } from "./native-map-symbols";
import nativeIconPaths from "./native-map-icons.json";

const nativeAppearance = (name: NativeMapSymbolName) => ({
  icon: native[name], nativeIconPath: contentUrl(nativeIconPaths[name]), artwork: true, preferCategoryIcon: true,
});

export interface MapCategoryConfig {
  id: string; labelKey: string; filterLabelKey?: string; groupId: MapCategoryGroupId;
  defaultVisible: boolean; icon: LucideIcon; nativeIconPath?: string;
  tooltipCategoryOnly?: boolean;
  preferCategoryIcon?: boolean;
  markerScale?: number;
  sourceReferenceIds?: string[]; filterId?: string; hideObjectAccessDetails?: boolean;
  artwork?: boolean; markerClass: string; linkedItemLabelKey?: string;
  routeLinkGroupKey?: string; routeLinksTitleKey?: string;
}
export type MapCategoryGroupId = "progression" | "dungeons" | "teleportation" | "places" | "class-trainers" | "profession-trainers" | "npcs" | "pvp" | "enemies" | "hunter-pets" | "herbs" | "mining" | "fishing" | "cloth" | "leather" | "collectables" | "personal";
export type MapFilterFocusRequest = { categoryId: string; requestId: number };
export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId; labelKey: string; icon: LucideIcon;
  defaultExpanded: boolean; showInFilters?: boolean;
}
export interface UserMarkerIconConfig { id: UserMarkerIcon; labelKey: string; icon: LucideIcon; nativeIconPath?: string; }

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "progression", labelKey: "reference.categories.quests", icon: native["quest-giver"], defaultExpanded: true },
  { id: "enemies", labelKey: "reference.categories.creatures", icon: Swords, defaultExpanded: true },
  { id: "npcs", labelKey: "reference.categories.npcs", icon: native.npc, defaultExpanded: true },
  { id: "teleportation", labelKey: "wiki.mapGroups.travel", icon: native.bell, defaultExpanded: true },
  { id: "collectables", labelKey: "wiki.mapGroups.collectables", icon: native.chest, defaultExpanded: true },
  { id: "places", labelKey: "map.categoryGroups.places", icon: native["long-pillar"], defaultExpanded: false },
  { id: "personal", labelKey: "map.custom.personal", icon: native.pin, defaultExpanded: false, showInFilters: false },
];
/** Add verified game categories here as game content is introduced. */
export const MAP_CATEGORIES: MapCategoryConfig[] = [
  { id: "native-quests", labelKey: "reference.categories.quests", groupId: "progression", defaultVisible: true, ...nativeAppearance("quest-giver"), markerScale: 0.75, markerClass: "map-marker-quest-giver" },
  { id: "native-bosses", labelKey: "wiki.spawnGroups.bosses", groupId: "enemies", defaultVisible: true, ...nativeAppearance("boss"), markerScale: 1.265, markerClass: "map-marker-default" },
  { id: "native-creatures", labelKey: "wiki.spawnGroups.creatures", groupId: "enemies", defaultVisible: true, icon: Swords, preferCategoryIcon: true, markerScale: 0.75, markerClass: "map-marker-enemy" },
  { id: "native-npcs", labelKey: "wiki.spawnGroups.npcs", groupId: "npcs", defaultVisible: true, ...nativeAppearance("npc"), markerScale: 1.4375, markerClass: "map-marker-default" },
  { id: "native-loot-containers", labelKey: "wiki.groups.SceneContainer", groupId: "collectables", defaultVisible: true, ...nativeAppearance("chest"), markerClass: "map-marker-default" },
  { id: "native-loot-pickups", labelKey: "wiki.groups.ScenePickup", groupId: "collectables", defaultVisible: true, ...nativeAppearance("ground-loot"), markerScale: 1.32, markerClass: "map-marker-default map-native-pickup-art" },
  { id: "native-waypoints", labelKey: "map.categories.waypoint", groupId: "teleportation", defaultVisible: true, ...nativeAppearance("bell"), markerScale: 1.25, markerClass: "map-marker-default" },
  { id: "point-of-interest", labelKey: "map.categories.pointOfInterest", groupId: "places", defaultVisible: true, ...nativeAppearance("pin"), markerClass: "map-marker-default" },
  { id: "custom", labelKey: "map.custom.personal", groupId: "personal", defaultVisible: true, ...nativeAppearance("pin"), markerClass: "map-marker-custom" },
];
// Like WoW Forever, higher entries win both drawing and pointer picking.
// Keep priorities independent of the sidebar order and below hover/selection layers.
export const MAP_MARKER_PRIORITY_ORDER = [
  ["custom"], ["native-waypoints"], ["native-bosses"], ["native-quests"], ["native-npcs"],
  ["native-loot-containers"], ["native-loot-pickups"], ["native-creatures"], ["point-of-interest"],
] as const;
const MAP_MARKER_PRIORITY = new Map<string, number>(MAP_MARKER_PRIORITY_ORDER.flatMap((categories, index) =>
  categories.map((category) => [category, MAP_MARKER_PRIORITY_ORDER.length - index] as const)));
export const getMapMarkerPriority = (category: string): number => MAP_MARKER_PRIORITY.get(category) ?? 1;

export interface MapFlightRingEffect { durationSeconds: number; flightSpeedIncreasePercent: number; flightPowerCostReductionPercent: number; flightPowerRecoveryPercent: number; }
export const MAP_FLIGHT_RING_EFFECTS: Record<string, MapFlightRingEffect> = {};
export const FILTER_CATEGORY_GROUPS = MAP_CATEGORY_GROUPS.filter(({ showInFilters }) => showInFilters !== false);
export const FILTER_CATEGORIES = MAP_CATEGORIES.filter(({ id, groupId }) => id !== "quest"
  && id !== "quest-area" && id !== "point-of-interest"
  && FILTER_CATEGORY_GROUPS.some((group) => group.id === groupId));
export const FOREVER_GATHERABLE_CATEGORY_IDS: string[] = [];
export interface MapFilterCategory { category: MapCategoryConfig; ids: string[]; }
export const FILTER_CATEGORY_ROWS: MapFilterCategory[] = FILTER_CATEGORIES
  .filter(({ id }) => id !== "bank-sign")
  .map((category) => ({ category,
    ids: category.id === "bank" ? ["bank", "bank-sign"] : [category.id] }));
export const DEFAULT_CATEGORY_IDS = MAP_CATEGORIES.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id);
export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", ...nativeAppearance("pin") },
  { id: "home", labelKey: "map.markerGroups.base", ...nativeAppearance("home") },
  { id: "flag", labelKey: "map.markerGroups.general", ...nativeAppearance("quest") },
  { id: "supplies", labelKey: "map.markerGroups.resources", ...nativeAppearance("ground-loot") },
  { id: "danger", labelKey: "map.markerGroups.danger", ...nativeAppearance("boss") },
];
export const resolveUserMarkerIcon = (icon?: UserMarkerIcon): UserMarkerIcon =>
  USER_MARKER_ICONS.some((entry) => entry.id === icon) ? icon! : "pin";
const MAP_CATEGORY_BY_ID = new Map(MAP_CATEGORIES.map((category) => [category.id, category]));
export const getCategoryConfig = (categoryId: string) => MAP_CATEGORY_BY_ID.get(categoryId) ?? MAP_CATEGORIES.at(-1)!;
const RESOURCE_MARKER_GROUPS = new Set<MapCategoryGroupId>(["herbs", "mining", "fishing", "cloth", "leather", "collectables"]);
export const isResourceMarkerCategory = (categoryId: string) => RESOURCE_MARKER_GROUPS.has(getCategoryConfig(categoryId).groupId);
export const isCategoryArtwork = (category: MapCategoryConfig) => category.artwork === true;
const mapIconUrl = (source: string) => contentUrl(
  (mapIconArtwork as Record<string, { path: string }>)[source]?.path ?? source,
);
export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  const markerClass = point.category === "native-creatures"
    ? category.markerClass : `${category.markerClass} map-marker-icon-only`;
  if (!isUserMapMarker(point)) return {
    icon: category.icon,
    nativeIconPath: category.preferCategoryIcon ? category.nativeIconPath
      : point.iconPath ? mapIconUrl(point.iconPath) : category.nativeIconPath,
    markerClass,
    itemArt: category.preferCategoryIcon ? isCategoryArtwork(category) : !!point.iconPath || isCategoryArtwork(category),
  };
  const personalIcon = USER_MARKER_ICONS.find((item) => item.id === resolveUserMarkerIcon(point.icon));
  return {
    icon: personalIcon?.icon ?? native.pin,
    nativeIconPath: personalIcon?.nativeIconPath,
    markerClass,
    itemArt: false,
  };
};
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string): MapCategoryConfig | undefined => {
  void referenceId;
  void sourceCategoryId;
  return undefined;
};
export const migrateRewardSourceCategories = (ids: string[]) => [...new Set(ids.filter(id => MAP_CATEGORY_BY_ID.has(id)))];
export const migrateCategorySelection = (ids: string[]) => [...new Set(ids.filter((id) => MAP_CATEGORY_BY_ID.has(id)))];
