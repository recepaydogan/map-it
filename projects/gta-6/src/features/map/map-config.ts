import { Hotel, Utensils, Store, FerrisWheel, House, Building2, Building, Construction, Factory, Landmark, Hospital, Bus, UtilityPole, Tractor, Trees, MapPin, Flag, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerIcon } from "./types";
import { contentUrl } from "../../lib/content-url";
import mapIconArtwork from "./map-icon-artwork.json";
import markerArtwork from "./gta6-marker-artwork.json";
import extraCategories from "./gta6-extra-categories.json";
import { getSupplementalIconSymbol } from "./gta6-supplemental-icons.mjs";

const artwork = (symbol: string) => (markerArtwork as Record<string, string>)[symbol];





export interface MapCategoryConfig {
  id: string; labelKey: string; filterLabelKey?: string; groupId: MapCategoryGroupId;
  defaultVisible: boolean; icon: LucideIcon; nativeIconPath?: string;
  tooltipCategoryOnly?: boolean;
  preferCategoryIcon?: boolean;
  sourceReferenceIds?: string[]; filterId?: string; hideObjectAccessDetails?: boolean;
  artwork?: boolean; markerClass: string; linkedItemLabelKey?: string;
  routeLinkGroupKey?: string; routeLinksTitleKey?: string;
}
export type MapCategoryGroupId = "buildings" | "commercial" | "infrastructure" | "progression" | "dungeons" | "teleportation" | "places" | "class-trainers" | "profession-trainers" | "npcs" | "pvp" | "enemies" | "hunter-pets" | "herbs" | "mining" | "fishing" | "cloth" | "leather" | "collectables" | "activities" | "pickups" | "personal";
export type MapFilterFocusRequest = { categoryId: string; requestId: number };
export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId; labelKey: string; icon: LucideIcon;
  defaultExpanded: boolean; showInFilters?: boolean;
}
export interface UserMarkerIconConfig { id: UserMarkerIcon; labelKey: string; icon: LucideIcon; nativeIconPath?: string; }

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "buildings", labelKey: "map.landmarks.groups.buildings", icon: Building2, defaultExpanded: true },
  { id: "commercial", labelKey: "map.landmarks.groups.commercial", icon: Store, defaultExpanded: true },
  { id: "infrastructure", labelKey: "map.landmarks.groups.infrastructure", icon: Bus, defaultExpanded: true },
  { id: "places", labelKey: "map.landmarks.groups.places", icon: MapPin, defaultExpanded: true },
  { id: "activities", labelKey: "map.landmarks.groups.activities", icon: Flag, defaultExpanded: false },
  { id: "collectables", labelKey: "map.landmarks.groups.collectables", icon: Package, defaultExpanded: false },
  { id: "pickups", labelKey: "map.landmarks.groups.pickups", icon: Package, defaultExpanded: false },
  { id: "personal", labelKey: "map.custom.personal", icon: MapPin, defaultExpanded: false, showInFilters: false },
];
export const MAP_CATEGORIES: MapCategoryConfig[] = [
  { id: "place-hotel", nativeIconPath: artwork("hotel"), labelKey: "map.landmarks.categories.hotel", groupId: "commercial", defaultVisible: true, icon: Hotel, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-restaurant", nativeIconPath: artwork("restaurant"), labelKey: "map.landmarks.categories.restaurant", groupId: "commercial", defaultVisible: true, icon: Utensils, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-retail", nativeIconPath: artwork("storefront"), labelKey: "map.landmarks.categories.retail", groupId: "commercial", defaultVisible: true, icon: Store, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-leisure", nativeIconPath: artwork("ferris-wheel"), labelKey: "map.landmarks.categories.leisure", groupId: "commercial", defaultVisible: true, icon: FerrisWheel, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-residential", nativeIconPath: artwork("home"), labelKey: "map.landmarks.categories.residential", groupId: "buildings", defaultVisible: true, icon: House, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-office", nativeIconPath: artwork("location-city"), labelKey: "map.landmarks.categories.office", groupId: "buildings", defaultVisible: true, icon: Building2, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-mixed", nativeIconPath: artwork("location-city"), labelKey: "map.landmarks.categories.mixed", groupId: "buildings", defaultVisible: true, icon: Building, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-construction", nativeIconPath: artwork("construction"), labelKey: "map.landmarks.categories.construction", groupId: "buildings", defaultVisible: true, icon: Construction, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-industrial", nativeIconPath: artwork("industry"), labelKey: "map.landmarks.categories.industrial", groupId: "infrastructure", defaultVisible: true, icon: Factory, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-government", nativeIconPath: artwork("account-balance"), labelKey: "map.landmarks.categories.government", groupId: "infrastructure", defaultVisible: true, icon: Landmark, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-public", nativeIconPath: artwork("account-balance"), labelKey: "map.landmarks.categories.public", groupId: "infrastructure", defaultVisible: true, icon: Hospital, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-transportation", nativeIconPath: artwork("road"), labelKey: "map.landmarks.categories.transportation", groupId: "infrastructure", defaultVisible: true, icon: Bus, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-utilities", nativeIconPath: artwork("electrical-services"), labelKey: "map.landmarks.categories.utilities", groupId: "infrastructure", defaultVisible: true, icon: UtilityPole, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-agriculture", nativeIconPath: artwork("agriculture"), labelKey: "map.landmarks.categories.agriculture", groupId: "places", defaultVisible: true, icon: Tractor, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-natural", nativeIconPath: artwork("park"), labelKey: "map.landmarks.categories.natural", groupId: "places", defaultVisible: true, icon: Trees, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-landmark", nativeIconPath: artwork("area"), labelKey: "map.landmarks.categories.landmark", groupId: "places", defaultVisible: true, icon: MapPin, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-town", nativeIconPath: artwork("town"), labelKey: "map.landmarks.categories.town", groupId: "places", defaultVisible: true, icon: Building2, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-airport", nativeIconPath: artwork("flight"), labelKey: "map.landmarks.categories.airport", groupId: "infrastructure", defaultVisible: true, icon: Bus, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-marina", nativeIconPath: artwork("anchor"), labelKey: "map.landmarks.categories.marina", groupId: "infrastructure", defaultVisible: true, icon: Bus, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-rail", nativeIconPath: artwork("train"), labelKey: "map.landmarks.categories.rail", groupId: "infrastructure", defaultVisible: true, icon: Bus, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-gas", nativeIconPath: artwork("local-gas-station"), labelKey: "map.landmarks.categories.gas", groupId: "commercial", defaultVisible: true, icon: Store, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-police", nativeIconPath: artwork("local-police"), labelKey: "map.landmarks.categories.police", groupId: "infrastructure", defaultVisible: true, icon: Landmark, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-hospital", nativeIconPath: artwork("local-hospital"), labelKey: "map.landmarks.categories.hospital", groupId: "infrastructure", defaultVisible: true, icon: Hospital, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  { id: "place-repair", nativeIconPath: artwork("car-repair"), labelKey: "map.landmarks.categories.repair", groupId: "commercial", defaultVisible: true, icon: Store, preferCategoryIcon: false, artwork: true, markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker" },
  ...extraCategories.map(([id, groupId, symbol]): MapCategoryConfig => ({
    id: `place-${id}`, labelKey: `map.landmarks.categories.${id}`,
    groupId: groupId as MapCategoryGroupId, icon: MapPin,
    defaultVisible: id === "fire", nativeIconPath: artwork(symbol), artwork: true,
    markerClass: "map-landmark-marker map-marker-icon-only map-place-art map-png-marker",
  })),
  { id: "custom", nativeIconPath: artwork("photo-camera"), labelKey: "map.custom.personal", groupId: "personal", defaultVisible: true, icon: MapPin, artwork: true, markerClass: "map-marker-icon-only map-place-art map-png-marker" },
];
// Higher tiers render above the tiers below them and use a larger default icon.
const MAP_MARKER_TIERS = [
  { scale: 1.14, categories: ["custom"] },
  { scale: 1.10, categories: ["place-town", "place-landmark", "place-natural"] },
  { scale: 1.05, categories: ["place-hospital", "place-police", "place-fire"] },
  { scale: 1.00, categories: ["place-hotel", "place-retail", "place-restaurant", "place-leisure", "place-gas", "place-repair"] },
  { scale: 0.96, categories: ["place-event", "place-activity", "place-robbery", "place-vehicle", "place-weapon"] },
  { scale: 0.92, categories: ["place-government", "place-public", "place-transportation", "place-utilities", "place-agriculture", "place-industrial", "place-airport", "place-marina", "place-rail"] },
  { scale: 0.88, categories: ["place-residential", "place-office", "place-mixed", "place-construction"] },
  { scale: 0.84, categories: ["place-collectible", "place-card", "place-magazine", "place-stunt"] },
  { scale: 0.81, categories: ["place-transit-stop", "place-amenity", "place-food-stop"] },
] as const;
export const MAP_MARKER_PRIORITY_ORDER = MAP_MARKER_TIERS.map(({ categories }) => categories);
const MAP_MARKER_HIERARCHY = new Map<string, { priority: number; scale: number }>(
  MAP_MARKER_TIERS.flatMap(({ categories, scale }, index) =>
    categories.map(category => [category, { priority: MAP_MARKER_TIERS.length - index, scale }] as const)),
);
export const getMapMarkerPriority = (category: string): number => MAP_MARKER_HIERARCHY.get(category)?.priority ?? 1;

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
  { id: "pin", nativeIconPath: artwork("area"), labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "home", nativeIconPath: artwork("home"), labelKey: "map.markerGroups.base", icon: House },
  { id: "flag", nativeIconPath: artwork("personal-flag"), labelKey: "map.markerGroups.general", icon: Flag },
  { id: "supplies", nativeIconPath: artwork("package-2"), labelKey: "map.markerGroups.resources", icon: Package },
  { id: "danger", nativeIconPath: artwork("personal-danger"), labelKey: "map.markerGroups.danger", icon: TriangleAlert },
];
export const resolveUserMarkerIcon = (icon?: UserMarkerIcon): UserMarkerIcon =>
  USER_MARKER_ICONS.some((entry) => entry.id === icon) ? icon! : "pin";
const MAP_CATEGORY_BY_ID = new Map(MAP_CATEGORIES.map((category) => [category.id, category]));
export const getCategoryConfig = (categoryId: string) => MAP_CATEGORY_BY_ID.get(categoryId) ?? MAP_CATEGORIES.at(-1)!;
const RESOURCE_MARKER_GROUPS = new Set<MapCategoryGroupId>(["herbs", "mining", "fishing", "cloth", "leather", "collectables"]);
export const keepsMapMarkerPriorityOnHover = (categoryId: string) =>
  getMapMarkerPriority(categoryId) <= getMapMarkerPriority("place-collectible") ||
  RESOURCE_MARKER_GROUPS.has(getCategoryConfig(categoryId).groupId);
export const isCategoryArtwork = (category: MapCategoryConfig) => category.artwork === true;
const mapIconUrl = (source: string) => {
  const symbol = source.match(/maps\/category-icons\/gta6\/([^/]+)\.svg$/)?.[1];
  return contentUrl((symbol && artwork(symbol))
    || (mapIconArtwork as Record<string, { path: string }>)[source]?.path || source);
};
const landmarkArtwork = new WeakMap<MapPoint, string | undefined>();
const getPointArtwork = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (isUserMapMarker(point)) {
    return USER_MARKER_ICONS.find(item => item.id === resolveUserMarkerIcon(point.icon))?.nativeIconPath;
  }
  if (point.areaLabel) return artwork(point.category === "place-town" ? "town" : "area");
  if (category.preferCategoryIcon) return category.nativeIconPath;
  if (!landmarkArtwork.has(point)) {
    const symbol = point.landmark && getSupplementalIconSymbol(
      point.landmark.id, point.name, point.category, point.landmark.sourceCategory,
    );
    const isLegacyMural = point.iconPath?.endsWith("/sign.png") && /\bmurals?\b/i.test(point.name);
    landmarkArtwork.set(point, symbol ? artwork(symbol)
      : isLegacyMural ? artwork("gallery")
      : point.iconPath ? mapIconUrl(point.iconPath) : category.nativeIconPath);
  }
  return landmarkArtwork.get(point);
};
export const AREA_PIN_MARKER_SCALE = 0.8;
export const isAreaPin = (point: MapPoint) => !isUserMapMarker(point) &&
  (getPointArtwork(point)?.endsWith(artwork("area")) ?? false);
export const getMapPointPriority = (point: MapPoint) => isAreaPin(point) ? 0 : getMapMarkerPriority(point.category);
export const getMapPointDefaultScale = (point: MapPoint) => isAreaPin(point) ? AREA_PIN_MARKER_SCALE
  : MAP_MARKER_HIERARCHY.get(point.category)?.scale ?? 1;
export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  const personalIcon = isUserMapMarker(point)
    ? USER_MARKER_ICONS.find(item => item.id === resolveUserMarkerIcon(point.icon)) : undefined;
  const source = getPointArtwork(point);
  return {
    areaPin: !isUserMapMarker(point) && (source?.endsWith(artwork("area")) ?? false),
    icon: personalIcon?.icon ?? category.icon,
    nativeIconPath: source ? contentUrl(source) : undefined,
    markerClass: category.markerClass
      + (source?.includes("/symbols/") ? " map-png-symbol" : "")
      + (source?.includes("/gta6-generated/") ? " map-generated-marker" : ""),
    itemArt: true,
  };
};
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string): MapCategoryConfig | undefined => {
  void referenceId;
  void sourceCategoryId;
  return undefined;
};
export const migrateCategorySelection = (ids: string[]) => {
  const migrated = ids.map(id => ["place-other", "place-unclassified"].includes(id) ? "place-landmark" : id)
    .filter(id => MAP_CATEGORY_BY_ID.has(id));
  // Legacy broad categories split into named place types once; current choices stay intact.
  if (ids.includes("place-unclassified")) migrated.push("place-town", "place-airport", "place-marina",
    "place-rail", "place-gas", "place-police", "place-hospital", "place-repair");
  return [...new Set(migrated)];
};
export const migrateRewardSourceCategories = migrateCategorySelection;
