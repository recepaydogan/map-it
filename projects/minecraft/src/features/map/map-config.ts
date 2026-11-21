import {
  Banknote,
  BedDouble,
  Box,
  Cross,
  Factory,
  Flag,
  Flame,
  Fuel,
  House,
  Landmark,
  LifeBuoy,
  MapPin,
  Pickaxe,
  Shield,
  ShoppingBasket,
  Signpost,
  Skull,
  Soup,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerColor, type UserMarkerIcon } from "./types";

/**
 * Marker categories — the map layers a player can show and hide.
 *
 * This is app-level configuration, not map data: every map this app ships
 * uses the same category ids, and the filter rail, search rows and detail
 * panel all read their labels and glyphs from here. To adapt the base for a
 * new game, edit `MAP_CATEGORIES` and `MAP_CATEGORY_GROUPS`, add the matching
 * `map.categories.*` / `map.categoryGroups.*` strings to the locales, give
 * each category a `.map-marker-<id>` background in index.css, and drop a PNG
 * icon into public/icons/categories/ (the lucide glyph is the fallback).
 */
export interface MapCategoryConfig {
  id: string;
  labelKey: string;
  groupId: MapCategoryGroupId;
  defaultVisible: boolean;
  icon: LucideIcon;
  nativeIconPath?: string;
  markerClass: string;
}

export type MapCategoryGroupId = "essentials" | "places" | "personal";

export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId;
  labelKey: string;
  /** Header glyph, so a collapsed group is recognisable without reading it. */
  icon: LucideIcon;
  defaultExpanded: boolean;
}

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "essentials", labelKey: "map.categoryGroups.essentials", icon: LifeBuoy, defaultExpanded: true },
  { id: "places", labelKey: "map.categoryGroups.places", icon: Signpost, defaultExpanded: true },
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

/** Category glyphs are app assets (public/icons/categories), shared by every map. */
const nativeIconPath = (categoryId: string) => `/icons/categories/${categoryId}.png`;

export const MAP_CATEGORIES: MapCategoryConfig[] = [
  { id: "medical", labelKey: "map.categories.medical", groupId: "essentials", defaultVisible: true, icon: Cross, nativeIconPath: nativeIconPath("medical"), markerClass: "map-marker-medical" },
  { id: "police", labelKey: "map.categories.police", groupId: "essentials", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("police"), markerClass: "map-marker-police" },
  { id: "fire", labelKey: "map.categories.fire", groupId: "essentials", defaultVisible: true, icon: Flame, nativeIconPath: nativeIconPath("fire"), markerClass: "map-marker-fire" },
  { id: "fuel", labelKey: "map.categories.fuel", groupId: "essentials", defaultVisible: true, icon: Fuel, nativeIconPath: nativeIconPath("fuel"), markerClass: "map-marker-fuel" },
  { id: "vehicle", labelKey: "map.categories.vehicle", groupId: "essentials", defaultVisible: true, icon: Wrench, nativeIconPath: nativeIconPath("vehicle"), markerClass: "map-marker-vehicle" },
  { id: "supplies", labelKey: "map.categories.supplies", groupId: "essentials", defaultVisible: true, icon: ShoppingBasket, nativeIconPath: nativeIconPath("supplies"), markerClass: "map-marker-supplies" },
  { id: "food", labelKey: "map.categories.food", groupId: "essentials", defaultVisible: true, icon: Soup, nativeIconPath: nativeIconPath("food"), markerClass: "map-marker-food" },
  { id: "military", labelKey: "map.categories.military", groupId: "places", defaultVisible: true, icon: Banknote, nativeIconPath: nativeIconPath("military"), markerClass: "map-marker-military" },
  { id: "weapons", labelKey: "map.categories.weapons", groupId: "places", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("weapons"), markerClass: "map-marker-weapons" },
  { id: "industrial", labelKey: "map.categories.industrial", groupId: "places", defaultVisible: true, icon: Factory, nativeIconPath: nativeIconPath("industrial"), markerClass: "map-marker-industrial" },
  { id: "community", labelKey: "map.categories.community", groupId: "places", defaultVisible: true, icon: Landmark, nativeIconPath: nativeIconPath("community"), markerClass: "map-marker-community" },
  { id: "lodging", labelKey: "map.categories.lodging", groupId: "places", defaultVisible: true, icon: BedDouble, nativeIconPath: nativeIconPath("lodging"), markerClass: "map-marker-lodging" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal", defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

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

export const DEFAULT_USER_MARKER_COLOR: UserMarkerColor = "sage";
export const DEFAULT_USER_MARKER_ICON: UserMarkerIcon = "pin";

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "home", labelKey: "map.markerStyle.icons.home", icon: House },
  { id: "flag", labelKey: "map.markerStyle.icons.flag", icon: Flag },
  { id: "vehicle", labelKey: "map.markerGroups.resources", icon: Pickaxe },
  { id: "supplies", labelKey: "map.categories.supplies", icon: Box },
  { id: "danger", labelKey: "map.markerStyle.icons.danger", icon: Skull },
];

export const getUserMarkerAppearance = (color?: UserMarkerColor, icon?: UserMarkerIcon) => ({
  icon: USER_MARKER_ICONS.find((item) => item.id === icon)?.icon ?? MapPin,
  markerClass: USER_MARKER_COLORS.find((item) => item.id === color)?.markerClass ?? "map-marker-custom",
});

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
    icon: getUserMarkerAppearance(point.color, point.icon).icon,
    nativeIconPath: undefined,
    markerClass: getUserMarkerAppearance(point.color, point.icon).markerClass ?? category.markerClass,
  };
};
