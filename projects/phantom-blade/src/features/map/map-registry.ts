import { MAP_DATA_BASE_URL } from "./map-data-url.ts";
import en from "../../i18n/locales/en.json";
import { formatGameName } from "../../lib/game-display-text";

export const REMOVED_MAP_CATEGORY_IDS = new Set<string>();
export interface MapDefinition {
  id: string;
  name: string;
  nameKey?: string;
  dataUrl: string;
  locationFiles?: string[];
}

/** Playable region maps with available marker data. */
const GAME_MAP_IDS = [
  "xi-gu", "fu-ji-zhi-lin",
  "lu-jia-cun", "zheng-dao-da-ying", "pang-zhen", "mei-gu-hu", "deng-ding-shan-dao", "duan-hun-shan",
] as const;
export const MAP_DEFINITIONS: MapDefinition[] = GAME_MAP_IDS.map((id) => ({
  id, name: formatGameName(en.map.maps.names[id]), nameKey: `map.maps.names.${id}`, dataUrl: `${MAP_DATA_BASE_URL}/${id}`,
  locationFiles: ["locations-game-files.json", "locations-quests.json"],
}));
export const MAP_BUNDLED_ASSET_DIRS = [...GAME_MAP_IDS, "category-icons"];
export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;
/** DT_MapData region IDs; shared source textures use the same app map. */
export const TRACKING_REGION_MAPS: Readonly<Record<string, { id: string; width: number; height: number }>> = {
  xigu: { id: "xi-gu", width: 8192, height: 8192 },
  fujizhilin: { id: "fu-ji-zhi-lin", width: 8192, height: 8192 },
  lujiacun: { id: "lu-jia-cun", width: 8192, height: 8192 },
  zhengdaodaying: { id: "zheng-dao-da-ying", width: 8192, height: 8192 },
  pangzhen: { id: "pang-zhen", width: 8192, height: 4512 },
  houjie: { id: "pang-zhen", width: 8192, height: 4512 },
  ximeng: { id: "pang-zhen", width: 8192, height: 4512 },
  meiguhu: { id: "mei-gu-hu", width: 8192, height: 8192 },
  meigu_yiji: { id: "mei-gu-hu", width: 8192, height: 8192 },
  dengdingshandao: { id: "deng-ding-shan-dao", width: 8192, height: 8192 },
  duanhunya: { id: "duan-hun-shan", width: 8192, height: 8192 },
  duanhunshan: { id: "duan-hun-shan", width: 8192, height: 8192 },
};
export const MAP_ITEM_PICKUP_SOURCES: Record<string, { mapId: string; locationFile: string; category: string }> = {};
export const resolveMapId = (id: string): string => id === "fu-ji-zhi-lin-winter" ? "fu-ji-zhi-lin" : id;
export const hasMapDefinition = (id: string): boolean => MAP_DEFINITIONS.some((definition) => definition.id === resolveMapId(id));
export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find((definition) => definition.id === (id ? resolveMapId(id) : id)) ?? MAP_DEFINITIONS[0]!;
