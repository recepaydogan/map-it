import catalog from "../../../public/data/dungeons/maps.json" with { type: "json" };
import navigation from "../../../public/data/dungeons/navigation.json" with { type: "json" };
import type { TFunction } from "i18next";

interface DungeonMapFloor {
  image: string;
  width: number;
  height: number;
  name?: string;
  gameNameKey?: string;
  labelKey?: string;
  artist?: string;
  bosses?: { name: string; npcId?: number; x: number; y: number }[];
}

export interface DungeonMap {
  id: string;
  name: string;
  floors: readonly DungeonMapFloor[];
}

export const dungeonMaps: readonly DungeonMap[] = catalog;
export const getDungeonMap = (id: string) => dungeonMaps.find((map) => map.id === id);

export interface DungeonDoor {
  id: string;
  kind: "entrance" | "exit" | "passage";
  x: number;
  y: number;
  to?: { floor: number; door: string };
}

interface DungeonFloorNavigation {
  doors?: DungeonDoor[];
  routes?: { points: [number, number][]; optional?: boolean }[];
}

export const dungeonNavigation = navigation as unknown as Readonly<Partial<Record<string, DungeonFloorNavigation>>>;

export const dungeonFloorId = (dungeonId: string, index: number) => `dungeon:${dungeonId}:${index + 1}`;

type GameText = (name: string, key?: string) => string;

const dungeonClientKeys: Readonly<Partial<Record<string, string>>> = {
  "Hall of Thanes": "Map:3065:1",
  "Ragefire Chasm": "LFGDungeons:3:0",
  "Ruins of Lordaeron": "Map:2999:1",
  "Wailing Caverns": "LFGDungeons:1:0",
  "The Deadmines": "AreaTable:1581:1",
  "Shadowfang Keep": "LFGDungeons:7:0",
  "Blackfathom Deeps": "AreaTable:719:1",
  "The Stockade": "AreaTable:717:1",
  "Excavation Site": "Map:2998:1",
  "City of Dalaran": "LFGDungeons:3271:0",
  Gnomeregan: "AreaTable:721:1",
  "Razorfen Kraul": "AreaTable:491:1",
  "Scarlet Monastery": "AreaTable:796:1",
  "The Drowned City": "WMOAreaTable:144590:0",
  "Krol'dok Stronghold": "AreaTable:17780:1",
  "Alcaz Prison": "WMOAreaTable:137677:0",
  "Blackmaw Hold": "AreaTable:1216:1",
  "The Shaper's Terrace": "AreaTable:16985:1",
  "Temple of Atal'Hakkar": "AreaTable:1477:1",
};

const dungeonClientNames: Readonly<Partial<Record<string, string>>> = {
  "Hall of Thanes": "The Hall of Thanes",
  "Excavation Site": "Excavation Site: Wetlands",
  "Temple of Atal'Hakkar": "The Temple of Atal'Hakkar",
};

export const dungeonDisplayName = (name: string, gameText: GameText) => {
  const clientName = dungeonClientNames[name] ?? name;
  const localized = gameText(clientName, dungeonClientKeys[name]);
  return localized === clientName ? name : localized;
};

export const dungeonFloorLabel = (floor: DungeonMapFloor, index: number, t: TFunction, gameText: GameText) =>
  floor.labelKey ? t(floor.labelKey) : floor.name ? gameText(floor.name, floor.gameNameKey) : t("dungeonJournal.mapFloor", { number: index + 1 });
