import { getItemDisplayName } from "../../lib/item-display-name.ts";
import { getCategoryConfig } from "./map-config";
import { getMapTrainerInfo } from "./map-trainer-info";
import { isUserMapMarker, type MapPoint } from "./types";

/** Item-backed locations share item display names; personal marker names stay literal. */
export const getMapPointDisplayName = (point: MapPoint): string =>
  ("itemId" in point && point.itemId) || ("reference" in point && point.reference?.category === "items")
    ? getItemDisplayName(point.name)
    : point.name;

export const getLocalizedMapPointDisplayName = (point: MapPoint, translate: (text: string) => string): string =>
  isUserMapMarker(point) ? point.name : translate(getMapPointDisplayName(point));

export const getMapPointTooltipLabel = (point: MapPoint, fullLabel: string, translate: (key: string) => string): string => {
  const trainer = getMapTrainerInfo(point);
  if (trainer) return trainer.title || fullLabel;
  const category = getCategoryConfig(point.category);
  return category.tooltipCategoryOnly ? translate(category.labelKey) : fullLabel;
};
