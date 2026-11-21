import {
  Anvil,
  Banknote,
  BedDouble,
  Boxes,
  Building2,
  Cog,
  CookingPot,
  Cross,
  Disc3,
  Droplets,
  Factory,
  Flag,
  Flame,
  FlameKindling,
  Fuel,
  GlassWater,
  Hammer,
  House,
  Landmark,
  LifeBuoy,
  MapPin,
  PackageSearch,
  PawPrint,
  Shield,
  ShoppingBasket,
  Signpost,
  Snowflake,
  Store,
  Skull,
  Soup,
  Truck,
  Tractor,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getMapDataUrl } from "./map-data-url";
import { isUserMapMarker, type MapPoint, type UserMarkerColor, type UserMarkerIcon } from "./types";

export interface MapCategoryConfig {
  id: string;
  labelKey: string;
  groupId: MapCategoryGroupId;
  defaultVisible: boolean;
  icon: LucideIcon;
  nativeIconPath?: string;
  markerClass: string;
}

export type MapCategoryGroupId = "essentials" | "objects" | "places" | "buildings" | "personal";

export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId;
  labelKey: string;
  /** Header glyph, so a collapsed group is recognisable without reading it. */
  icon: LucideIcon;
  defaultExpanded: boolean;
}

export const PERSONAL_MARKERS_UI_ENABLED = true;

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "essentials", labelKey: "map.categoryGroups.essentials", icon: LifeBuoy, defaultExpanded: true },
  { id: "objects", labelKey: "map.categoryGroups.objects", icon: PackageSearch, defaultExpanded: false },
  { id: "places", labelKey: "map.categoryGroups.places", icon: Signpost, defaultExpanded: true },
  { id: "buildings", labelKey: "map.categoryGroups.buildings", icon: Building2, defaultExpanded: false },
  { id: "personal", labelKey: "map.categoryGroups.personal", icon: Flag, defaultExpanded: false },
];

export interface UserMarkerColorConfig {
  id: UserMarkerColor;
  labelKey: string;
  markerClass: string;
}

export interface UserMarkerIconConfig {
  id: UserMarkerIcon;
  labelKey: string;
  icon: LucideIcon;
}

const nativeIconPath = (categoryId: string) => getMapDataUrl(`icons/${categoryId}.png`);

export const MAP_CATEGORIES: MapCategoryConfig[] = [
  { id: "medical", labelKey: "map.categories.medical", groupId: "essentials", defaultVisible: true, icon: Cross, nativeIconPath: nativeIconPath("medical"), markerClass: "map-marker-medical" },
  { id: "police", labelKey: "map.categories.police", groupId: "essentials", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("police"), markerClass: "map-marker-police" },
  { id: "fire", labelKey: "map.categories.fire", groupId: "essentials", defaultVisible: true, icon: Flame, nativeIconPath: nativeIconPath("fire"), markerClass: "map-marker-fire" },
  { id: "fuel", labelKey: "map.categories.fuel", groupId: "essentials", defaultVisible: true, icon: Fuel, nativeIconPath: nativeIconPath("fuel"), markerClass: "map-marker-fuel" },
  { id: "vehicle", labelKey: "map.categories.vehicle", groupId: "essentials", defaultVisible: true, icon: Wrench, nativeIconPath: nativeIconPath("vehicle"), markerClass: "map-marker-vehicle" },
  { id: "supplies", labelKey: "map.categories.supplies", groupId: "essentials", defaultVisible: true, icon: ShoppingBasket, nativeIconPath: nativeIconPath("supplies"), markerClass: "map-marker-supplies" },
  { id: "food", labelKey: "map.categories.food", groupId: "essentials", defaultVisible: true, icon: Soup, nativeIconPath: nativeIconPath("food"), markerClass: "map-marker-food" },
  { id: "military", labelKey: "map.categories.military", groupId: "essentials", defaultVisible: true, icon: Banknote, nativeIconPath: nativeIconPath("military"), markerClass: "map-marker-military" },
  { id: "weapons", labelKey: "map.categories.weapons", groupId: "essentials", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("weapons"), markerClass: "map-marker-weapons" },
  { id: "object-water", labelKey: "map.categories.object-water", groupId: "objects", defaultVisible: true, icon: Droplets, markerClass: "map-marker-object-water" },
  { id: "object-fuel", labelKey: "map.categories.object-fuel", groupId: "objects", defaultVisible: false, icon: Fuel, markerClass: "map-marker-object-fuel" },
  { id: "object-heat", labelKey: "map.categories.object-heat", groupId: "objects", defaultVisible: false, icon: FlameKindling, markerClass: "map-marker-object-heat" },
  { id: "object-power", labelKey: "map.categories.object-power", groupId: "objects", defaultVisible: true, icon: Zap, markerClass: "map-marker-object-power" },
  { id: "object-blacksmithing", labelKey: "map.categories.object-blacksmithing", groupId: "objects", defaultVisible: true, icon: Anvil, markerClass: "map-marker-object-blacksmithing" },
  { id: "object-grinding", labelKey: "map.categories.object-grinding", groupId: "objects", defaultVisible: false, icon: Disc3, markerClass: "map-marker-object-grinding" },
  { id: "object-production", labelKey: "map.categories.object-production", groupId: "objects", defaultVisible: true, icon: Cog, markerClass: "map-marker-object-production" },
  { id: "object-workbenches", labelKey: "map.categories.object-workbenches", groupId: "objects", defaultVisible: false, icon: Hammer, markerClass: "map-marker-object-workbenches" },
  { id: "object-preservation", labelKey: "map.categories.object-preservation", groupId: "objects", defaultVisible: false, icon: Wind, markerClass: "map-marker-object-preservation" },
  { id: "object-ranching", labelKey: "map.categories.object-ranching", groupId: "objects", defaultVisible: false, icon: PawPrint, markerClass: "map-marker-object-ranching" },
  { id: "object-freezers", labelKey: "map.categories.object-freezers", groupId: "objects", defaultVisible: false, icon: Snowflake, markerClass: "map-marker-object-freezers" },
  { id: "object-water-dispensers", labelKey: "map.categories.object-water-dispensers", groupId: "objects", defaultVisible: false, icon: GlassWater, markerClass: "map-marker-object-water-dispensers" },
  { id: "object-barbecues", labelKey: "map.categories.object-barbecues", groupId: "objects", defaultVisible: false, icon: CookingPot, markerClass: "map-marker-object-barbecues" },
  { id: "industrial", labelKey: "map.categories.industrial", groupId: "places", defaultVisible: true, icon: Factory, nativeIconPath: nativeIconPath("industrial"), markerClass: "map-marker-industrial" },
  { id: "community", labelKey: "map.categories.community", groupId: "places", defaultVisible: true, icon: Landmark, nativeIconPath: nativeIconPath("community"), markerClass: "map-marker-community" },
  { id: "lodging", labelKey: "map.categories.lodging", groupId: "places", defaultVisible: true, icon: BedDouble, nativeIconPath: nativeIconPath("lodging"), markerClass: "map-marker-lodging" },
  { id: "commercial", labelKey: "map.categories.commercial", groupId: "places", defaultVisible: false, icon: Store, markerClass: "map-marker-commercial" },
  { id: "agriculture", labelKey: "map.categories.agriculture", groupId: "places", defaultVisible: false, icon: Tractor, markerClass: "map-marker-agriculture" },
  { id: "houses", labelKey: "map.categories.houses", groupId: "buildings", defaultVisible: false, icon: House, markerClass: "map-marker-residential" },
  { id: "apartments", labelKey: "map.categories.apartments", groupId: "buildings", defaultVisible: false, icon: Building2, markerClass: "map-marker-residential" },
  { id: "residential", labelKey: "map.categories.residential", groupId: "buildings", defaultVisible: false, icon: Building2, markerClass: "map-marker-residential" },
  { id: "storage", labelKey: "map.categories.storage", groupId: "buildings", defaultVisible: false, icon: Boxes, markerClass: "map-marker-storage" },
  { id: "other", labelKey: "map.categories.other", groupId: "buildings", defaultVisible: false, icon: Building2, markerClass: "map-marker-other" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal", defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

/** High-value object layers offered by the Useful objects introduction. */
export const RECOMMENDED_OBJECT_CATEGORY_IDS = [
  "object-water",
  "object-power",
  "object-blacksmithing",
  "object-production",
] as const;

export const DEFAULT_CATEGORY_IDS = MAP_CATEGORIES
  .filter(({ defaultVisible }) => defaultVisible)
  .map(({ id }) => id);

export const USER_MARKER_COLORS: UserMarkerColorConfig[] = [
  { id: "sage", labelKey: "map.markerStyle.colors.sage", markerClass: "map-marker-custom-sage" },
  { id: "amber", labelKey: "map.markerStyle.colors.amber", markerClass: "map-marker-custom-amber" },
  { id: "red", labelKey: "map.markerStyle.colors.red", markerClass: "map-marker-custom-red" },
  { id: "blue", labelKey: "map.markerStyle.colors.blue", markerClass: "map-marker-custom-blue" },
  { id: "violet", labelKey: "map.markerStyle.colors.violet", markerClass: "map-marker-custom-violet" },
];

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "home", labelKey: "map.markerStyle.icons.home", icon: House },
  { id: "flag", labelKey: "map.markerStyle.icons.flag", icon: Flag },
  { id: "vehicle", labelKey: "map.markerStyle.icons.vehicle", icon: Truck },
  { id: "supplies", labelKey: "map.markerStyle.icons.supplies", icon: ShoppingBasket },
  { id: "danger", labelKey: "map.markerStyle.icons.danger", icon: Skull },
];

export const getCategoryConfig = (categoryId: string) =>
  MAP_CATEGORIES.find((category) => category.id === categoryId) ?? MAP_CATEGORIES.at(-1)!;

export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (!isUserMapMarker(point)) {
    return {
      icon: category.icon,
      nativeIconPath: category.nativeIconPath,
      markerClass: category.markerClass,
    };
  }
  return {
    icon: USER_MARKER_ICONS.find((item) => item.id === point.icon)?.icon ?? MapPin,
    nativeIconPath: MAP_CATEGORIES.find(({ id }) => id === point.imageCategory)?.nativeIconPath,
    markerClass: USER_MARKER_COLORS.find((item) => item.id === point.color)?.markerClass ?? category.markerClass,
  };
};
