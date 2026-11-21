import { type CustomMarker } from "../../data/custom-markers";
import type { RawErMapMarker } from "./types";

const areaFor = (marker: CustomMarker): string => {
  if (marker.layer === "underground") return "12";
  if (marker.layer === "dlc-realm-of-shadow") return "61";
  return "60";
};

/** Projects the shared persisted custom-marker shape into the raw ER map pipeline. */
export const erMapCustomMarker = (marker: CustomMarker): RawErMapMarker => ({
  id: marker.id,
  source: "test-custom",
  name: marker.name,
  category: marker.category,
  description: marker.description,
  custom: true,
  customIcon: marker.icon,
  pixel: marker.pixel,
  areaNo: areaFor(marker),
  gridX: 0,
  gridZ: 0,
  localX: 0,
  localY: 0,
  localZ: 0,
});
