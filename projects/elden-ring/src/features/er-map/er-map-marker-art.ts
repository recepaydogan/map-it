import { fallbackIconUrl } from "../../data/fallback-icons";
import { itemIconUrl } from "../../utils/assets";
import { isErMapEnemyCategory } from "./er-map-enemy-category";
import type { RawErMapMarker } from "./types";

const CATEGORY_MAP_ICON: Record<string, string> = {
  boss: "Enemy",
  "great-boss": "Enemy",
  "legendary-boss": "Enemy",
  "evergaol-boss": "Enemy",
  invasion: "Enemy",
  "elite-enemy": "mini-boss",
  enemy: "Enemy",
  npc: "80",
  merchant: "80",
  "site-of-grace": "01_Bonfire",
  "stake-of-marika": "01_Bonfire",
  "spawn-point": "01_Bonfire",
  "summon-pool": "89",
  "summon-sign": "89",
  spiritspring: "48",
  waygate: "87",
  interaction: "87",
  elevator: "21",
  connection: "11",
  church: "20",
  cave: "13",
  tunnel: "14",
  catacomb: "16",
  "divine-tower": "23",
  "legacy-dungeon": "29",
};

const mapIconUrl = (icon: string) =>
  `/icons/elden-ring/map/${icon.includes(".") ? icon : `${icon}.png`}`;

export const erMapCategoryArtUrl = (category: string): string =>
  fallbackIconUrl(category) ??
  fallbackIconUrl(isErMapEnemyCategory(category) ? "enemy" : category) ??
  fallbackIconUrl(category === "item" ? "consumable" : category) ??
  mapIconUrl(CATEGORY_MAP_ICON[category] ?? (isErMapEnemyCategory(category) ? "Enemy" : "11"));

export const erMapMarkerArtUrl = (marker: RawErMapMarker): string => {
  if (marker.customIcon) return marker.customIcon;
  if (marker.itemIconId != null) return itemIconUrl(marker.itemIconId);
  if (marker.mapIcon) return mapIconUrl(marker.mapIcon);
  return erMapCategoryArtUrl(marker.category);
};

export const erMapMarkerFallbackUrl = (marker: RawErMapMarker): string | undefined =>
  marker.itemIconId != null
    ? fallbackIconUrl(marker.category) ?? fallbackIconUrl("consumable")
    : undefined;
