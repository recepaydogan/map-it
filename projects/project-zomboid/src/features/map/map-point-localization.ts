import type { MapPoint } from "./types";

type MapPointTranslator = (key: string, fallback: string) => string;

/** Object markers use stable subtype ids, so their generated English copy can
 * be replaced by the app locale without translating personal marker names. */
export const localizeMapObjectPoint = (
  point: MapPoint,
  translate: MapPointTranslator,
): MapPoint => {
  if (!point.subtype.startsWith("object:")) return point;
  const objectType = point.subtype.slice("object:".length);
  if (!objectType) return point;
  return {
    ...point,
    name: translate(`map.objectTypes.${objectType}`, point.name),
    label: translate(`map.categories.${point.category}`, point.label),
  };
};
