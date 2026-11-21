import i18n from "i18next";
import { getItemDisplayName } from "../../lib/item-display-name.ts";
import { getCategoryConfig } from "./map-config.ts";
import { isUserMapMarker, type MapPoint } from "./types.ts";

/** Item-backed locations share item display names; personal marker names stay literal. */
export const getMapPointDisplayName = (point: MapPoint): string =>
  ("itemId" in point && point.itemId) || ("reference" in point && point.reference?.category === "items")
    ? getItemDisplayName(point.name)
    : point.name;

export const getLocalizedMapPointDisplayName = (point: MapPoint, translate: (text: string) => string): string => {
  if (isUserMapMarker(point)) return point.name;
  if (point.category === "teleport") return i18n.t("map.categories.teleport");
  const subtypeNameKey = getCategoryConfig(point.category).subtypeNameKeys?.[point.subtype];
  if (subtypeNameKey) return i18n.t(subtypeNameKey);
  const name = getMapPointDisplayName(point);
  return ("itemId" in point && point.itemId) || ("reference" in point && point.reference?.category === "items")
    ? getItemDisplayName(name, translate(name)) : translate(name);
};
