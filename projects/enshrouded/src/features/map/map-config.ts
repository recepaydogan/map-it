import { BookOpen, Castle, Gem, Landmark, Leaf, MapPin, Package, Pickaxe, Skull, Sparkles, type LucideIcon } from "lucide-react";
import mapGroups from "../../../public/data/enshrouded/map-groups.json";
import { contentUrl } from "../../lib/content-url";
import { getPointFilterCategories } from "./map-quest-filter";
import { isUserMapMarker, type MapPoint, type UserMarkerIcon } from "./types";

export type MapCategoryGroupId = "landmarks" | "settlements" | "shroud" | "lore" | "resources" | "collectibles" | "items" | "enemies" | "personal";
export interface MapCategoryConfig {
  id: string; labelKey: string; filterLabelKey?: string; groupId: MapCategoryGroupId;
  subgroupLabelKey?: string; filterable?: boolean;
  defaultVisible: boolean; icon: LucideIcon; nativeIconPath?: string;
  tooltipCategoryOnly?: boolean; preferCategoryIcon?: boolean;
  sourceReferenceIds?: string[]; filterId?: string; hideObjectAccessDetails?: boolean;
  artwork?: boolean; markerClass: string; linkedItemLabelKey?: string;
  routeLinkGroupKey?: string; routeLinksTitleKey?: string;
}
export type MapFilterFocusRequest = { categoryId: string; requestId: number };
export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId; labelKey: string; icon: LucideIcon;
  defaultExpanded: boolean; showInFilters?: boolean;
}
export interface UserMarkerIconConfig { id: UserMarkerIcon; labelKey: string; icon: LucideIcon; nativeIconPath?: string; }

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "landmarks", labelKey: "map.enshrouded.categoryGroups.landmarks", icon: Landmark, defaultExpanded: true },
  { id: "settlements", labelKey: "map.enshrouded.categoryGroups.settlements", icon: Castle, defaultExpanded: false },
  { id: "shroud", labelKey: "map.enshrouded.categoryGroups.shroud", icon: Sparkles, defaultExpanded: false },
  { id: "lore", labelKey: "map.enshrouded.categoryGroups.lore", icon: BookOpen, defaultExpanded: false },
  { id: "resources", labelKey: "map.enshrouded.categoryGroups.resources", icon: Pickaxe, defaultExpanded: false },
  { id: "collectibles", labelKey: "map.enshrouded.categoryGroups.collectibles", icon: Gem, defaultExpanded: false },
  { id: "items", labelKey: "map.enshrouded.items", icon: Package, defaultExpanded: false },
  { id: "enemies", labelKey: "map.enshrouded.categoryGroups.enemies", icon: Skull, defaultExpanded: false },
  { id: "personal", labelKey: "map.custom.personal", icon: MapPin, defaultExpanded: false, showInFilters: false },
];

const markerGroup = (id: string): MapCategoryGroupId => {
  if (id.startsWith("Lore") || id === "Physical_Inscription") return "lore";
  if (id.startsWith("Fixed_")) return "items";
  if (/^(Shroud_|Elixir_Well|Flame_Shrine|Balefire)/.test(id)) return "shroud";
  if (/^(Mine|Gem_Forge|Fossil)/.test(id)) return "resources";
  if (/^(Music_Sheet|DragonsMapPiece|QueenPikemeadStatuePiece|AlchemistWallHanging|WallTapestry|CyclopsSkeleton|DrakRelief|FlameMosaic|Hollow_Artifact|Painting|Miniature_Model|Meteorite|Orrery)/.test(id)) return "collectibles";
  if (/^(Village|Camp|Farm|Enemy_Camp)/.test(id)) return "settlements";
  return "landmarks";
};
const iconFor = (group: MapCategoryGroupId): LucideIcon => ({
  landmarks: Landmark, settlements: Castle, shroud: Sparkles, lore: BookOpen,
  resources: Pickaxe, collectibles: Gem, items: Package, enemies: Skull, personal: MapPin,
})[group];
const markerClassFor = (group: MapCategoryGroupId) => ({
  landmarks: "map-marker-community", settlements: "map-marker-community",
  shroud: "map-marker-travel", lore: "map-marker-lore",
  resources: "map-marker-gather-metal-ore", collectibles: "map-marker-collect-monoliths",
  items: "map-marker-collect-monoliths",
  enemies: "map-marker-community",
  personal: "map-marker-custom",
})[group];

const bestiaryFilter = (id: string, labelKey: string, subgroupLabelKey: string,
  boss = false, defaultVisible = false): MapCategoryConfig => ({
  id, labelKey, subgroupLabelKey, groupId: "enemies", defaultVisible,
  icon: Skull, markerClass: `${boss ? "map-marker-boss" : "map-marker-enemy"} map-marker-bestiary-${boss ? "danger" : id === "bestiary-fell-flora-fauna" ? "warning" : "normal"}`,
});

export const MAP_CATEGORIES: MapCategoryConfig[] = [
  ...Object.entries(mapGroups).map(([id, info]): MapCategoryConfig => {
    const groupId = markerGroup(id);
    return { id: `wiki-${id.toLowerCase()}`, labelKey: `map.enshrouded.groups.${id}`,
      groupId, defaultVisible: groupId !== "lore", icon: iconFor(groupId),
      nativeIconPath: info.icon ? contentUrl(info.icon) : undefined,
      artwork: Boolean(info.icon), markerClass: markerClassFor(groupId) };
  }),
  ...(["fell", "scavengers", "vukah", "hollow", "drak"] as const).map((faction): MapCategoryConfig => ({
    id: `bestiary-${faction}`, labelKey: `map.enshrouded.bestiary.factions.${faction}`,
    groupId: "enemies", defaultVisible: false, filterable: false,
    icon: Skull, markerClass: "map-marker-enemy",
  })),
  { id: "bestiary-bosses", labelKey: "map.enshrouded.bestiary.bosses",
    groupId: "enemies", defaultVisible: false, filterable: false, icon: Skull, markerClass: "map-marker-boss" },
  bestiaryFilter("bestiary-fell-militia", "map.enshrouded.bestiary.groups.fellMilitia", "map.enshrouded.bestiary.factions.fell"),
  bestiaryFilter("bestiary-fell-flora-fauna", "map.enshrouded.bestiary.groups.fellFloraFauna", "map.enshrouded.bestiary.factions.fell"),
  bestiaryFilter("bestiary-fell-bosses", "map.enshrouded.bestiary.groups.fellBosses", "map.enshrouded.bestiary.factions.fell", true, true),
  bestiaryFilter("bestiary-scavengers-enemies", "map.enshrouded.bestiary.groups.scavengerEnemies", "map.enshrouded.bestiary.factions.scavengers"),
  bestiaryFilter("bestiary-scavengers-bosses", "map.enshrouded.bestiary.groups.scavengerBosses", "map.enshrouded.bestiary.factions.scavengers", true, true),
  bestiaryFilter("bestiary-vukah-enemies", "map.enshrouded.bestiary.groups.vukahEnemies", "map.enshrouded.bestiary.factions.vukah"),
  bestiaryFilter("bestiary-vukah-bosses", "map.enshrouded.bestiary.groups.vukahBosses", "map.enshrouded.bestiary.factions.vukah", true, true),
  bestiaryFilter("bestiary-hollow-enemies", "map.enshrouded.bestiary.groups.hollowEnemies", "map.enshrouded.bestiary.factions.hollow"),
  bestiaryFilter("bestiary-hollow-bosses", "map.enshrouded.bestiary.groups.hollowBosses", "map.enshrouded.bestiary.factions.hollow", true, true),
  bestiaryFilter("bestiary-drak-enemies", "map.enshrouded.bestiary.groups.drakEnemies", "map.enshrouded.bestiary.factions.drak"),
  bestiaryFilter("bestiary-drak-bosses", "map.enshrouded.bestiary.groups.drakBosses", "map.enshrouded.bestiary.factions.drak", true, true),
  { id: "point-of-interest", labelKey: "map.categories.pointOfInterest", groupId: "landmarks",
    defaultVisible: true, icon: MapPin, markerClass: "map-marker-community" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal",
    defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

export const getMapMarkerPriority = (category: string): number => {
  if (category === "bestiary-bosses") return 3;
  if (getCategoryConfig(category).groupId === "enemies" && !category.endsWith("-bosses")) return 0;
  return category.startsWith("wiki-") ? 2 : 1;
};
export interface MapFlightRingEffect { durationSeconds: number; flightSpeedIncreasePercent: number; flightPowerCostReductionPercent: number; flightPowerRecoveryPercent: number; }
export const MAP_FLIGHT_RING_EFFECTS: Record<string, MapFlightRingEffect> = {};
export const FILTER_CATEGORY_GROUPS = MAP_CATEGORY_GROUPS.filter(({ showInFilters }) => showInFilters !== false);
export const FILTER_CATEGORIES = MAP_CATEGORIES.filter(({ id, groupId, filterable }) => id !== "point-of-interest" && filterable !== false
  && FILTER_CATEGORY_GROUPS.some((group) => group.id === groupId));
export const NAMED_GATHERABLE_CATEGORY_IDS: string[] = [];
export interface MapFilterCategory { category: MapCategoryConfig; ids: string[]; }
export const FILTER_CATEGORY_ROWS: MapFilterCategory[] = FILTER_CATEGORIES.map((category) => ({ category, ids: [category.id] }));
export const DEFAULT_CATEGORY_IDS = FILTER_CATEGORIES.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id);

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "city", labelKey: "map.markerStyle.icons.city", icon: Castle },
  { id: "town", labelKey: "map.markerStyle.icons.town", icon: Castle },
  { id: "dungeon", labelKey: "map.markerStyle.icons.dungeon", icon: Landmark },
  { id: "merchant", labelKey: "map.markerStyle.icons.merchant", icon: Leaf },
  { id: "quest", labelKey: "map.markerStyle.icons.quest", icon: BookOpen },
  { id: "treasure", labelKey: "map.markerStyle.icons.treasure", icon: Gem },
  { id: "boss", labelKey: "map.markerStyle.icons.boss", icon: Skull },
];
const LEGACY_USER_MARKER_ICON_ALIASES: Partial<Record<UserMarkerIcon, UserMarkerIcon>> = {
  home: "town", flag: "quest", vehicle: "pin", supplies: "merchant", danger: "boss",
};
export const resolveUserMarkerIcon = (icon?: UserMarkerIcon): UserMarkerIcon =>
  icon ? LEGACY_USER_MARKER_ICON_ALIASES[icon] ?? icon : "pin";
const MAP_CATEGORY_BY_ID = new Map(MAP_CATEGORIES.map((category) => [category.id, category]));
export const getCategoryConfig = (categoryId: string) => MAP_CATEGORY_BY_ID.get(categoryId) ?? MAP_CATEGORY_BY_ID.get("point-of-interest")!;
export const isCategoryArtwork = (category: MapCategoryConfig) => category.artwork === true;
export const getBestiaryMarkerTier = (point: MapPoint): "normal" | "warning" | "danger" | null => {
  if (!point.category.startsWith("bestiary-")) return null;
  const filterCategory = getPointFilterCategories(point)[0];
  if (filterCategory?.endsWith("-bosses")) return "danger";
  return filterCategory === "bestiary-fell-flora-fauna" ? "warning" : "normal";
};
export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  const bestiaryTier = getBestiaryMarkerTier(point);
  if (!isUserMapMarker(point)) return {
    icon: category.icon,
    nativeIconPath: point.iconPath ? contentUrl(point.iconPath) : category.nativeIconPath,
    markerClass: bestiaryTier ? `${category.markerClass} map-marker-bestiary-${bestiaryTier}` : category.markerClass,
    itemArt: !!point.iconPath || isCategoryArtwork(category),
  };
  const personalIcon = USER_MARKER_ICONS.find((item) => item.id === resolveUserMarkerIcon(point.icon));
  return { icon: personalIcon?.icon ?? MapPin, nativeIconPath: personalIcon?.nativeIconPath,
    markerClass: category.markerClass, itemArt: false };
};
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string): MapCategoryConfig | undefined => {
  void referenceId; void sourceCategoryId;
  return undefined;
};
export const migrateCategorySelection = (ids: string[]) => [...new Set(ids.flatMap((id) => {
  if (id === "wiki-lorereward") return ["wiki-fixed_equipment", "wiki-fixed_weapons"];
  if (id === "bestiary-fell") return ["bestiary-fell-militia", "bestiary-fell-flora-fauna"];
  if (id === "bestiary-bosses") return ["bestiary-fell-bosses", "bestiary-scavengers-bosses", "bestiary-vukah-bosses", "bestiary-hollow-bosses", "bestiary-drak-bosses"];
  if (["bestiary-scavengers", "bestiary-vukah", "bestiary-hollow", "bestiary-drak"].includes(id)) return [`${id}-enemies`];
  return MAP_CATEGORY_BY_ID.has(id) ? [id] : [];
}))];
