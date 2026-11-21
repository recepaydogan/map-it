import { getCategoryConfig } from "../map/map-config";
import type { ItemSourceMapLocation } from "./item-source-map-links";
import type { ItemSourceRecord } from "./use-item-research";

export const TREASURE_CHEST_ARTWORK = "maps/client-icons/world-map/treasure-chest.png";

export function getItemSourceArtwork(
  source: Pick<ItemSourceRecord, "t" | "n">,
  locations: readonly ItemSourceMapLocation[],
): string | undefined {
  const markerArt = locations.find(({ iconPath }) => iconPath)?.iconPath;
  if (markerArt) return markerArt;

  if (source.t === "object") {
    const name = source.n ?? "";
    if (/\b(?:chest|lockbox|strongbox|footlocker|coffer|cache|treasure)\b/i.test(name)) return TREASURE_CHEST_ARTWORK;
    if (/\bcrate\b/i.test(name)) return "data/items/site-icons/inv_crate_05.jpg";
    if (/\bbox\b/i.test(name)) return "data/items/site-icons/inv_box_01.jpg";
    if (/\b(?:vein|deposit)\b/i.test(name)) return getCategoryConfig("gatherable-ore").nativeIconPath;
    if (/\b(?:book|tome)\b/i.test(name)) return getCategoryConfig("book").nativeIconPath;
  }

  if (source.t === "quest") return getCategoryConfig("quest").nativeIconPath;
  if (source.t === "vendor") {
    const category = locations.find(({ category }) => category === "reagent-vendor" || category === "ammunition-vendor")?.category;
    return getCategoryConfig(category ?? "merchant").nativeIconPath;
  }
  if (source.t === "drop" && locations.some(({ category }) => category === "rare" || category === "rare-elite")) {
    return getCategoryConfig("rare").nativeIconPath;
  }
  return undefined;
}
