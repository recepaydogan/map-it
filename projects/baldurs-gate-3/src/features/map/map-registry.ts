import { MAP_DATA_BASE_URL } from "./map-data-url";

/**
 * The maps this app ships. Each entry points at a directory holding
 * `metadata.json` and a `tiles/` pyramid (see scripts/build-sample-map.mjs
 * for the expected layout). With more than one entry the map workspace shows
 * a map picker; with exactly one it stays hidden.
 *
 * `dataUrl` is usually `${MAP_DATA_BASE_URL}/<folder>` so the same registry
 * works against bundled files (`/maps/...`) in development and a CDN
 * (`VITE_MAP_DATA_BASE_URL`) in release builds.
 */
export interface MapDefinition {
  id: string;
  /** Shown in the map picker until the map's own `displayName` has loaded. */
  name: string;
  dataUrl: string;
  /** Known raw GEP main_map/sub_map labels. Exact observations can be added after capture. */
  gameMapAliases?: string[];
  /** Retired app map ids that should reopen this map after an upgrade. */
  legacyIds?: string[];
  /** Translation key for the act/phase heading in the map picker. */
  groupKey?: string;
  /** Containing map used for navigation and grouping interior floors. */
  parentMapId?: string;
}

export interface MapAtlasPlacement {
  mapId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapAtlasDefinition {
  /** Navigation group only; spatial atlas placement is unchanged. */
  parentAtlasId?: string;
  id: string;
  name: string;
  width: number;
  height: number;
  /** Labels that remain visible at the full-atlas zoom level. */
  featuredMapIds: string[];
  placements: MapAtlasPlacement[];
}

export const MAP_DEFINITIONS: MapDefinition[] = [
  {
    id: "wilderness",
    name: "Wilderness",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/wilderness`,
    gameMapAliases: ["Wilderness", "WLD_Main_A"],
  },
  {
    id: "rivington-campsite",
    name: "Rivington Campsite",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/rivington-campsite`,
    gameMapAliases: ["Rivington Campsite"],
  },
  {
    id: "rosymorn-campsite",
    name: "Rosymorn Monastery Trail Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/rosymorn-campsite`,
    gameMapAliases: ["Rosymorn Monastery Trail Campsite"],
  },
  {
    id: "creche-campsite",
    name: "Crèche Y'llek Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/creche-campsite`,
    gameMapAliases: ["Crèche Y'llek Campsite"],
  },
  {
    id: "lower-city-campsite",
    name: "Lower City Alley Campsite",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lower-city-campsite`,
    gameMapAliases: ["Lower City Alley Campsite"],
  },
  {
    id: "elfsong-tavern-campsite",
    name: "Elfsong Tavern Suite",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/elfsong-tavern-campsite`,
    gameMapAliases: ["Elfsong Tavern Suite"],
  },
  {
    id: "gauntlet-campsite",
    name: "Gauntlet of Shar Campsite",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-campsite`,
    gameMapAliases: ["Gauntlet of Shar Campsite"],
  },
  {
    id: "shadow-cursed-campsite",
    name: "Shadow-Cursed Lands Campsite",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/shadow-cursed-campsite`,
    gameMapAliases: ["Shadow-Cursed Lands Campsite"],
  },
  {
    id: "last-light-campsite",
    name: "Last Light Inn Campsite",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/last-light-campsite`,
    gameMapAliases: ["Last Light Inn Campsite"],
  },
  {
    id: "moonrise-campsite",
    name: "Moonrise Towers Campsite",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/moonrise-campsite`,
    gameMapAliases: ["Moonrise Towers Campsite"],
  },
  {
    id: "cavern-campsite",
    name: "Cavern Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/cavern-campsite`,
    gameMapAliases: ["Cavern Campsite"],
  },
  {
    id: "chapel-campsite",
    name: "Overgrown Chapel Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/chapel-campsite`,
    gameMapAliases: ["Overgrown Chapel Campsite"],
  },
  {
    id: "grymforge-campsite",
    name: "Grymforge Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/grymforge-campsite`,
    gameMapAliases: ["Grymforge Campsite"],
  },
  {
    id: "wilderness-campsite",
    name: "Wilderness Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/wilderness-campsite`,
    gameMapAliases: ["Wilderness Campsite"],
  },
  {
    id: "underground-campsite",
    name: "Underground Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/underground-campsite`,
    gameMapAliases: ["Underground Campsite"],
  },
  {
    id: "underdark-campsite",
    name: "Underdark Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/underdark-campsite`,
    gameMapAliases: ["Underdark Campsite"],
  },
  {
    id: "wyrms-lookout",
    name: "Wyrm's Lookout",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-lookout`,
    gameMapAliases: ["Wyrm's Lookout", "INT_Main_A"],
  },
  {
    id: "epilogue-campsite",
    name: "Epilogue Campsite",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/epilogue-campsite`,
    gameMapAliases: ["Epilogue Campsite", "EPI_Main_A"],
  },
  {
    id: "astral-plane-intermezzo",
    name: "Astral Plane — Wyrm's Lookout",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/astral-plane-intermezzo`,
    gameMapAliases: ["Astral Plane — Wyrm's Lookout"],
  },
  {
    id: "astral-plane-creche",
    name: "Astral Plane — Crèche Y'llek",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/astral-plane-creche`,
    gameMapAliases: ["Astral Plane — Crèche Y'llek"],
  },
  {
    id: "astral-plane-finale",
    name: "Astral Plane — Final Visit",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/astral-plane-finale`,
    gameMapAliases: ["Astral Plane — Final Visit"],
  },
  {
    id: "basement-campsite",
    name: "Basement Campsite",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/basement-campsite`,
    gameMapAliases: ["Basement Campsite", "CMP_Basement_A"],
  },
  {
    id: "zhentarim-hideout",
    name: "Zhentarim Hideout",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/zhentarim-hideout`,
    gameMapAliases: ["Zhentarim Hideout", "Zhent Hideout"],
  },
  {
    id: "owlbear-nest",
    name: "Owlbear Nest",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/owlbear-nest`,
    gameMapAliases: ["Owlbear Nest", "Owlbear Cave"],
  },
  {
    id: "necromancers-cellar",
    name: "Necromancer's Cellar",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/necromancers-cellar`,
    gameMapAliases: ["Necromancer's Cellar", "Thayan Cellar"],
  },
  {
    id: "whispering-depths",
    name: "Whispering Depths",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/whispering-depths`,
    gameMapAliases: ["Whispering Depths", "Spider Cave", "WLD_SpiderCave"],
  },
  {
    id: "overgrown-tunnel",
    name: "Overgrown Tunnel",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/overgrown-tunnel`,
    gameMapAliases: ["Overgrown Tunnel", "Hag Lair", "WLD_HagLair_D"],
  },
  {
    id: "dank-crypt",
    name: "Dank Crypt",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/dank-crypt`,
    gameMapAliases: ["Dank Crypt", "Chapel Crypt", "WLD_Chapel_H", "WLD_Chapel_Push"],
  },
  {
    id: "chapel-refectory",
    name: "Overgrown Ruins — Refectory",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/chapel-refectory`,
    gameMapAliases: ["Overgrown Ruins", "Refectory", "Chapel Refectory", "WLD_Chapel_Push"],
  },
  {
    id: "shattered-sanctum",
    name: "Shattered Sanctum",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/shattered-sanctum`,
    gameMapAliases: ["Shattered Sanctum", "Goblin Camp Interior"],
  },
  {
    id: "shattered-sanctum-spider-pit",
    parentMapId: "shattered-sanctum",
    name: "Shattered Sanctum — Spider Pit",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/shattered-sanctum-spider-pit`,
  },
  {
    id: "shattered-sanctum-upper-platform",
    parentMapId: "shattered-sanctum",
    name: "Shattered Sanctum — Upper Platform",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/shattered-sanctum-upper-platform`,
  },
  {
    id: "worg-pens",
    name: "Worg Pens",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/worg-pens`,
    gameMapAliases: ["Worg Pens", "Wolf Pens", "Goblin Camp Dungeon", "WLD_GoblinCamp_D"],
  },
  {
    id: "defiled-temple",
    name: "Defiled Temple",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/defiled-temple`,
    gameMapAliases: ["Defiled Temple"],
  },
  {
    id: "nautiloid",
    name: "Nautiloid — Upper Deck",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/nautiloid`,
    gameMapAliases: ["Nautiloid", "TUT_Avernus_C"],
  },
  {
    id: "nautiloid-lower-deck",
    name: "Nautiloid — Lower Deck",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/nautiloid-lower-deck`,
    gameMapAliases: ["Nautiloid Lower Deck"],
  },
  {
    id: "underdark",
    name: "Underdark",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/underdark`,
    gameMapAliases: ["Underdark", "Under Dark"],
  },
  {
    id: "arcane-tower-level-0",
    parentMapId: "underdark",
    name: "Arcane Tower — Generator Floor",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-0`,
  },
  {
    id: "arcane-tower-level-1",
    parentMapId: "underdark",
    name: "Arcane Tower — Lift Level 0",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-1`,
  },
  {
    id: "arcane-tower-level-2",
    parentMapId: "underdark",
    name: "Arcane Tower — Lift Level 1",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-2`,
  },
  {
    id: "arcane-tower-level-3",
    parentMapId: "underdark",
    name: "Arcane Tower — Lift Level 2",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-3`,
  },
  {
    id: "arcane-tower-level-4",
    parentMapId: "underdark",
    name: "Arcane Tower — Lift Level 3",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-4`,
  },
  {
    id: "arcane-tower-level-5",
    parentMapId: "underdark",
    name: "Arcane Tower — Lift Level 4",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-level-5`,
  },
  {
    id: "arcane-tower-basement",
    name: "Arcane Tower — Hidden Basement",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/arcane-tower-basement`,
  },
  {
    id: "grymforge",
    name: "Grymforge",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/grymforge`,
    gameMapAliases: ["Grymforge", "Ketheric City", "Duergar Camp", "Adamantine Forge", "Ancient Forge"],
    legacyIds: ["adamantine-forge"],
  },
  {
    id: "mountain-pass",
    name: "Mountain Pass & Rosymorn Monastery",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/mountain-pass`,
    gameMapAliases: ["Mountain Pass", "Rosymorn Monastery", "CRE_Main_A"],
  },
  {
    id: "githyanki-creche",
    name: "Crèche Y'llek",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/githyanki-creche`,
    gameMapAliases: ["Creche Yllek", "Crèche Y'llek", "Githyanki Creche", "CRE_GithDungeon_A"],
  },
  {
    id: "shadow-cursed-lands",
    name: "Shadow-Cursed Lands",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/shadow-cursed-lands`,
    gameMapAliases: ["Shadow-Cursed Lands", "SCL_Main_A"],
  },
  {
    id: "house-of-healing-morgue",
    name: "House of Healing — Morgue",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/house-of-healing-morgue`,
    gameMapAliases: ["House of Healing Morgue", "Hospital Basement"],
  },
  {
    id: "sharran-sanctuary",
    name: "Sharran Sanctuary",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/sharran-sanctuary`,
    gameMapAliases: ["Sharran Sanctuary", "Shar Sanctuary"],
  },
  {
    id: "last-light-inn-cellar",
    name: "Last Light Inn — Cellar",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/last-light-inn-cellar`,
    gameMapAliases: ["Last Light Inn Cellar", "Haven Cellar"],
  },
  {
    id: "grymforge-lift-entrance",
    name: "Grymforge Lift — Shadow-Cursed Entrance",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/grymforge-lift-entrance`,
    gameMapAliases: ["Grymforge Lift", "Shadow-Cursed Lands Grymforge Entrance"],
  },
  {
    id: "grand-mausoleum",
    name: "Grand Mausoleum",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/grand-mausoleum`,
    gameMapAliases: ["Grand Mausoleum", "Thorm Mausoleum"],
  },
  {
    id: "reithwin-tollhouse-basement-level-0",
    parentMapId: "reithwin-tollhouse-basement",
    name: "Reithwin Tollhouse — Basement Level 0",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/reithwin-tollhouse-basement-level-0`,
  },
  {
    id: "reithwin-tollhouse-basement-level-1",
    parentMapId: "reithwin-tollhouse-basement",
    name: "Reithwin Tollhouse — Basement Level 1",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/reithwin-tollhouse-basement-level-1`,
  },
  {
    id: "reithwin-tollhouse-basement",
    name: "Reithwin Tollhouse — Basement",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/reithwin-tollhouse-basement`,
    gameMapAliases: ["Reithwin Tollhouse Basement", "Tollhouse Basement"],
  },
  {
    id: "masons-guild-basement",
    name: "Mason's Guild Basement",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/masons-guild-basement`,
    gameMapAliases: ["Mason's Guild Basement", "Masons Guild Cellar"],
  },
  {
    id: "moonrise-prison",
    name: "Moonrise Towers Prison",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/moonrise-prison`,
    gameMapAliases: ["Moonrise Towers Prison", "Moonrise Dungeon", "SCL_MoonriseDungeon_E_ART"],
  },
  {
    id: "moonrise-towers-ground-floor",
    name: "Moonrise Towers — Ground Floor",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/moonrise-towers-ground-floor`,
    gameMapAliases: ["Moonrise Towers Ground Floor", "Moonrise Towers", "Moonrise0"],
  },
  {
    id: "moonrise-towers-second-floor",
    name: "Moonrise Towers — Second Floor",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/moonrise-towers-second-floor`,
    gameMapAliases: ["Moonrise Towers Second Floor", "Moonrise Towers Upper Floor", "Moonrise3"],
  },
  {
    id: "moonrise-towers-rooftop",
    name: "Moonrise Towers — Rooftop",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/moonrise-towers-rooftop`,
    gameMapAliases: ["Moonrise Towers Rooftop", "Moonrise Rooftop", "Moonrise5"],
  },
  {
    id: "gauntlet-of-shar",
    name: "Gauntlet of Shar",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar`,
    gameMapAliases: ["Gauntlet of Shar", "Shar Temple", "WLD_SharTemple_E"],
  },
  {
    id: "gauntlet-of-shar-level-0",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 0",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-0`,
  },
  {
    id: "gauntlet-of-shar-level-1",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 1",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-1`,
  },
  {
    id: "gauntlet-of-shar-level-2",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 2",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-2`,
  },
  {
    id: "gauntlet-of-shar-level-3",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 3",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-3`,
  },
  {
    id: "gauntlet-of-shar-level-4",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 4",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-4`,
  },
  {
    id: "gauntlet-of-shar-level-5",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Level 5",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-level-5`,
  },
  {
    id: "gauntlet-of-shar-statue-base",
    parentMapId: "gauntlet-of-shar",
    name: "Gauntlet of Shar — Statue Base",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/gauntlet-of-shar-statue-base`,
  },
  {
    id: "nightsong-prison",
    name: "Shadowfell — Nightsong's Prison",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/nightsong-prison`,
    gameMapAliases: ["Shadowfell", "Nightsong's Prison", "Nightsong Prison", "SCL_Nightsong_A"],
  },
  {
    id: "mind-flayer-colony",
    name: "Mind Flayer Colony",
    groupKey: "map.maps.groups.act2",
    dataUrl: `${MAP_DATA_BASE_URL}/mind-flayer-colony`,
    gameMapAliases: ["Mind Flayer Colony", "SCL_MindflayerColony"],
  },
  {
    id: "wyrms-crossing",
    name: "Rivington & Wyrm's Crossing",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-crossing`,
    gameMapAliases: ["Rivington", "Wyrm's Crossing", "BGO_Main_A", "BGO_WyrmsCrossing_C"],
  },
  {
    id: "jungle-of-chult",
    name: "Jungle of Chult",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jungle-of-chult`,
    gameMapAliases: ["Jungle of Chult", "Chult Jungle"],
  },
  {
    id: "wyrmway",
    name: "Wyrmway",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrmway`,
    gameMapAliases: ["Wyrmway", "BGO_Wyrmsway_C"],
  },
  {
    id: "ironhand-hideout",
    name: "Ironhand Hideout",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/ironhand-hideout`,
    gameMapAliases: ["Ironhand Hideout", "Angleiron's Cellar", "Blacksmith Cellar"],
  },
  {
    id: "wyrms-rock-prison",
    name: "Wyrm's Rock Prison",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-rock-prison`,
    gameMapAliases: ["Wyrm's Rock Prison", "Wyrm Rock Prison", "BGO_WyrmRockDungeon_D_Art"],
  },
  {
    id: "dragon-sanctum",
    name: "Dragon's Sanctum",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/dragon-sanctum`,
    gameMapAliases: ["Dragon's Sanctum", "Ansur's Lair", "BGO_WyrmswayArena_Crystal_Art"],
  },
  {
    id: "open-hand-temple-cellar",
    name: "Open Hand Temple Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/open-hand-temple-cellar`,
    gameMapAliases: ["Open Hand Temple Cellar", "BGO_MerchantHouseBasement_A"],
  },
  {
    id: "rivington-well",
    name: "Rivington Well",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/rivington-well`,
    gameMapAliases: ["Rivington Well", "BGO_WellDepths_A"],
  },
  {
    id: "smugglers-passageway",
    name: "Smugglers Passageway",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/smugglers-passageway`,
    gameMapAliases: ["Smugglers Passageway", "Smuggler Tunnel", "BGO_SmugglerTunnel_A"],
  },
  {
    id: "smugglers-cave",
    name: "Smugglers' Cave",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/smugglers-cave`,
    gameMapAliases: ["Smugglers' Cave", "BGO_SmugglersCave_Basement_A"],
  },
  {
    id: "windmill-cellar",
    name: "Rivington Windmill Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/windmill-cellar`,
    gameMapAliases: ["Rivington Windmill Cellar", "BGO_WindmillCellar_A"],
  },
  {
    id: "lower-city",
    name: "Lower City",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lower-city`,
    gameMapAliases: ["Lower City", "CTY_Main_A", "CTY_LowerCity_A"],
  },
  {
    id: "jannaths-estate-floor-0",
    parentMapId: "lower-city",
    name: "Lady Jannath's Estate — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jannaths-estate-floor-0`,
  },
  {
    id: "jannaths-estate-floor-1",
    parentMapId: "lower-city",
    name: "Lady Jannath's Estate — First Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jannaths-estate-floor-1`,
  },
  {
    id: "jannaths-estate-floor-2",
    parentMapId: "lower-city",
    name: "Lady Jannath's Estate — Second Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jannaths-estate-floor-2`,
  },
  {
    id: "jannaths-estate-floor-3",
    parentMapId: "lower-city",
    name: "Lady Jannath's Estate — Third Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jannaths-estate-floor-3`,
  },
  {
    id: "jannaths-estate-floor-4",
    parentMapId: "lower-city",
    name: "Lady Jannath's Estate — Atelier",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jannaths-estate-floor-4`,
  },
  {
    id: "ancient-lair",
    name: "Ancient Lair",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/ancient-lair`,
    gameMapAliases: ["Ancient Lair", "Mystic Carrion's Ancient Lair"],
  },
  {
    id: "jaheiras-basement",
    name: "Jaheira's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/jaheiras-basement`,
    gameMapAliases: ["Jaheira's Basement", "Jaheira Basement"],
  },
  {
    id: "emperors-old-hideout",
    name: "Emperor's Old Hideout",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/emperors-old-hideout`,
    gameMapAliases: ["Emperor's Old Hideout", "Knights of the Shield Hideout"],
  },
  {
    id: "elfsong-tavern-ground-floor",
    parentMapId: "lower-city",
    name: "Elfsong Tavern — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/elfsong-tavern-ground-floor`,
  },
  {
    id: "elfsong-tavern-upper-floor",
    parentMapId: "lower-city",
    name: "Elfsong Tavern — Upper Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/elfsong-tavern-upper-floor`,
  },
  {
    id: "elfsong-cellar",
    name: "Elfsong Tavern — Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/elfsong-cellar`,
    gameMapAliases: ["Elfsong Tavern Cellar", "Elfsong Cellar", "BGO_ElfsongBasement_A"],
  },
  {
    id: "blushing-mermaid-cellar",
    name: "Blushing Mermaid Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/blushing-mermaid-cellar`,
    gameMapAliases: ["Blushing Mermaid Cellar", "Auntie Ethel's Lair"],
  },
  {
    id: "heapside-prison",
    name: "Heapside Prison",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/heapside-prison`,
    gameMapAliases: ["Heapside Prison", "Basilisk Gate Prison"],
  },
  {
    id: "house-of-hope",
    name: "House of Hope",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/house-of-hope`,
    gameMapAliases: ["House of Hope", "BGO_HouseOfHope_C", "HoH"],
  },
  {
    id: "house-of-hope-prison",
    name: "House of Hope — Prison",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/house-of-hope-prison`,
    gameMapAliases: ["House of Hope Prison", "Hope's Prison", "Infernal Engine Room"],
  },
  {
    id: "house-of-grief",
    name: "House of Grief — Sharran Grotto",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/house-of-grief`,
    gameMapAliases: ["House of Grief", "Sharran Grotto", "Cloister of Sombre Embrace", "BGOSharranGrotto"],
  },
  {
    id: "ramaziths-tower",
    name: "Ramazith's Tower",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/ramaziths-tower`,
    gameMapAliases: ["Ramazith's Tower", "Ramaziths Tower", "BGO_RamazithTower_A_ART"],
  },
  {
    id: "murder-tribunal",
    name: "Murder Tribunal",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/murder-tribunal`,
    gameMapAliases: ["Murder Tribunal", "CTY_MurderTribunal_A"],
  },
  {
    id: "szarr-palace",
    name: "Szarr Palace",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/szarr-palace`,
    gameMapAliases: ["Szarr Palace", "Cazador's Palace", "CTY_CazadorPalace_A"],
  },
  {
    id: "steel-watch-foundry",
    name: "Steel Watch Foundry",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/steel-watch-foundry`,
    gameMapAliases: ["Steel Watch Foundry", "Steel Watch Lab", "BGO_SteelWatchLabControlCenter_B"],
  },
  {
    id: "steel-watch-foundry-upper",
    name: "Steel Watch Foundry — Upper Lab",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/steel-watch-foundry-upper`,
    gameMapAliases: ["Steel Watch Foundry Upper Lab", "Steel Watch Lab A"],
  },
  {
    id: "counting-house-vault",
    name: "Counting House — High-Security Vault",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/counting-house-vault`,
    gameMapAliases: ["Counting House Vault", "High-Security Vault", "BGH_CountingHouseVault_C"],
  },
  {
    id: "cazador-dungeon",
    name: "Cazador's Dungeon",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/cazador-dungeon`,
    gameMapAliases: ["Cazador's Dungeon", "Szarr Palace Dungeon", "CTY_CazadorPalace_A", "BGO_UC_CazadorChapel_A"],
  },
  {
    id: "lower-city-sewers",
    name: "Lower City Sewers & Undercity",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lower-city-sewers`,
    gameMapAliases: ["Lower City Sewers", "Undercity", "CTY_Undercity"],
  },
  {
    id: "stormshore-tabernacle-basement",
    name: "Stormshore Tabernacle — Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/stormshore-tabernacle-basement`,
    gameMapAliases: ["Stormshore Tabernacle Basement", "CTY_Tabernacle_Basement_A"],
  },
  {
    id: "water-queens-cellar",
    name: "Water Queen's Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/water-queens-cellar`,
    gameMapAliases: ["Water Queen's Cellar", "CTY_WQH_Basement_A"],
  },
  {
    id: "flymms-cargo-basement",
    name: "Flymm Cargo's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/flymms-cargo-basement`,
    gameMapAliases: ["Flymm Cargo's Basement", "CTY_DockWarehouseBasement_A"],
  },
  {
    id: "submersible",
    name: "Submersible",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/submersible`,
    gameMapAliases: ["Submersible", "CTY_Submersible_A", "IRN_Submersible_A"],
  },
  {
    id: "lower-city-catacombs",
    name: "Lower City Catacombs",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lower-city-catacombs`,
    gameMapAliases: ["Lower City Catacombs", "CTY_Catacombs_A"],
  },
  {
    id: "sorcerous-vault",
    name: "Sorcerous Vault",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/sorcerous-vault`,
    gameMapAliases: ["Sorcerous Vault", "CTY_SorcerousSundriesBasement_A"],
  },
  {
    id: "baldurs-mouth-basement",
    name: "Baldur's Mouth Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/baldurs-mouth-basement`,
    gameMapAliases: ["Baldur's Mouth Basement", "BGH_BaldursMouth_Basement_A"],
  },
  {
    id: "bonecloak-apothecary-ground-floor",
    parentMapId: "lower-city",
    name: "Bonecloak's Apothecary — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/bonecloak-apothecary-ground-floor`,
  },
  {
    id: "bonecloak-apothecary-upper-floor",
    parentMapId: "lower-city",
    name: "Bonecloak's Apothecary — Upper Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/bonecloak-apothecary-upper-floor`,
  },
  {
    id: "bonecloak-apothecary-basement",
    name: "Bonecloak's Apothecary Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/bonecloak-apothecary-basement`,
    gameMapAliases: ["Bonecloak's Apothecary Basement", "BGH_BonecloaksApothecary_Basement_A"],
  },
  {
    id: "fireworks-basement",
    name: "Felogyr's Fireworks Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/fireworks-basement`,
    gameMapAliases: ["Felogyr's Fireworks Basement", "CTY_FireWorks_Basement_A"],
  },
  {
    id: "garlows-basement",
    name: "Garlow's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/garlows-basement`,
    gameMapAliases: ["Garlow's Basement", "CTY_HagSurvivor_Basement_A"],
  },
  {
    id: "gardeners-basement",
    name: "Gardener's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/gardeners-basement`,
    gameMapAliases: ["Gardener's Basement", "CTY_GardenerStoreRoom_A"],
  },
  {
    id: "guildhall-basement",
    name: "Guildhall Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/guildhall-basement`,
    gameMapAliases: ["Guildhall Basement", "CTY_Guildhall_Basement_A"],
  },
  {
    id: "lodge-basement",
    name: "The Lodge Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lodge-basement`,
    gameMapAliases: ["The Lodge Basement", "CTY_LodgeBasement_A"],
  },
  {
    id: "philgraves-basement",
    name: "Philgrave's Mansion Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/philgraves-basement`,
    gameMapAliases: ["Philgrave's Mansion Basement", "CTY_PhilgraveBasement_A"],
  },
  {
    id: "peartrees-basement",
    name: "Peartree's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/peartrees-basement`,
    gameMapAliases: ["Peartree's Basement", "CTY_Peartree_Basement_A"],
  },
  {
    id: "sanguine-laboratory",
    name: "Sanguine Laboratory",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/sanguine-laboratory`,
    gameMapAliases: ["Sanguine Laboratory", "BGO_BloodMerchantLab_A_ART"],
  },
  {
    id: "devil-and-smith-basement",
    name: "Devil's Fee Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/devil-and-smith-basement`,
    gameMapAliases: ["Devil's Fee Basement", "CTY_DevilandSmithBasement"],
  },
  {
    id: "golbraiths-cellar",
    name: "Golbraith's Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/golbraiths-cellar`,
    gameMapAliases: ["Golbraith's Cellar", "CTY_Golbraith_Basement_A"],
  },
  {
    id: "cazador-side-rooms",
    name: "Szarr Palace — Attic & Side Rooms",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/cazador-side-rooms`,
    gameMapAliases: ["Szarr Palace Attic", "CTY_CazSideRooms_A"],
  },
  {
    id: "iron-throne",
    name: "Iron Throne",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/iron-throne`,
    gameMapAliases: ["Iron Throne", "IRN_Main_A", "IRN_IronThrone_C"],
  },
  {
    id: "high-hall",
    name: "High Hall",
    groupKey: "map.maps.groups.finale",
    dataUrl: `${MAP_DATA_BASE_URL}/high-hall`,
    gameMapAliases: ["High Hall", "END_Main", "END_HighHall_C"],
  },
  {
    id: "morphic-pool",
    name: "Morphic Pool",
    groupKey: "map.maps.groups.finale",
    dataUrl: `${MAP_DATA_BASE_URL}/morphic-pool`,
    gameMapAliases: ["Morphic Pool"],
  },
  {
    id: "netherbrain",
    name: "The Netherbrain",
    groupKey: "map.maps.groups.finale",
    dataUrl: `${MAP_DATA_BASE_URL}/netherbrain`,
    gameMapAliases: ["The Netherbrain", "Netherbrain"],
  },
  {
    id: "secluded-chamber",
    name: "Secluded Chamber",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/secluded-chamber`,
    gameMapAliases: ["Secluded Chamber", "Zevlor's Chamber"],
  },
  {
    id: "tiefling-hideout",
    name: "Tiefling Hideout",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/tiefling-hideout`,
    gameMapAliases: ["Tiefling Hideout", "Children's Hideout"],
  },
  {
    id: "hidden-vault",
    name: "Hidden Vault",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/hidden-vault`,
    gameMapAliases: ["Hidden Vault", "Emerald Grove Vault"],
  },
  {
    id: "inner-sanctum",
    name: "Emerald Grove — Inner Sanctum",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/inner-sanctum`,
    gameMapAliases: ["Inner Sanctum", "Druid Grove Inner Sanctum"],
  },
  {
    id: "underground-passage",
    name: "Emerald Grove — Underground Passage",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/underground-passage`,
    gameMapAliases: ["Underground Passage", "Emerald Grove Underground Passage"],
  },
  {
    id: "festering-cove",
    name: "Festering Cove",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/festering-cove`,
    gameMapAliases: ["Festering Cove", "Underdark Shrine"],
  },
  {
    id: "toll-house-basement",
    name: "Toll House Basement",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/toll-house-basement`,
    gameMapAliases: ["Toll House Basement", "Paladins' Toll House Basement"],
  },
  {
    id: "blighted-village-windmill-cellar",
    name: "Blighted Village Windmill Cellar",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/blighted-village-windmill-cellar`,
    gameMapAliases: ["Blighted Village Windmill Cellar"],
  },
  {
    id: "zhentarim-cellar",
    name: "Zhentarim Cellar",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/zhentarim-cellar`,
    gameMapAliases: ["Zhentarim Cellar", "Waukeen's Rest Cellar"],
  },
  {
    id: "secret-chamber",
    name: "Rosymorn Monastery — Secret Chamber",
    groupKey: "map.maps.groups.act1",
    dataUrl: `${MAP_DATA_BASE_URL}/secret-chamber`,
    gameMapAliases: ["Secret Chamber", "Blood of Lathander Chamber"],
  },
  {
    id: "wyrms-rock-ground-floor",
    name: "Wyrm's Rock Fortress — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-rock-ground-floor`,
    gameMapAliases: ["Wyrm's Rock Fortress Ground Floor"],
  },
  {
    id: "wyrms-rock-audience-hall",
    name: "Wyrm's Rock Fortress — Audience Hall",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-rock-audience-hall`,
    gameMapAliases: ["Wyrm's Rock Audience Hall", "Audience Hall"],
  },
  {
    id: "wyrms-rock-office",
    name: "Wyrm's Rock Fortress — Gortash's Office",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-rock-office`,
    gameMapAliases: ["Gortash's Office", "Wyrm's Rock Office"],
  },
  {
    id: "wyrms-rock-rooftop",
    name: "Wyrm's Rock Fortress — Rooftop",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/wyrms-rock-rooftop`,
    gameMapAliases: ["Wyrm's Rock Rooftop"],
  },
  {
    id: "highberry-cellar",
    name: "Highberry's Cellar",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/highberry-cellar`,
    gameMapAliases: ["Highberry's Cellar", "Highberry Cellar"],
  },
  {
    id: "counting-house-vault-connection",
    name: "Counting House — Vault Passage",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/counting-house-vault-connection`,
    gameMapAliases: ["Counting House Vault Passage", "Counting House Vault Connection"],
  },
  {
    id: "beehive-basement",
    name: "Beehive General Goods — Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/beehive-basement`,
    gameMapAliases: ["Beehive General Goods Basement", "General Store Basement"],
  },
  {
    id: "chromatic-scale-basement",
    name: "Chromatic Scale — Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/chromatic-scale-basement`,
    gameMapAliases: ["Chromatic Scale Basement", "Music Store Basement"],
  },
  {
    id: "rainforests-basement",
    name: "Rainforest's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/rainforests-basement`,
    gameMapAliases: ["Rainforest's Basement", "Rainforest Basement"],
  },
  {
    id: "thrumbos-basement",
    name: "Thrumbo's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/thrumbos-basement`,
    gameMapAliases: ["Thrumbo's Basement", "Thrumbo Basement"],
  },
  {
    id: "figaros-basement",
    name: "Facemaker's Boutique — Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/figaros-basement`,
    gameMapAliases: ["Figaro's Basement", "Facemaker's Boutique Basement"],
  },
  {
    id: "lavernicas-basement",
    name: "Lavernica's Basement",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/lavernicas-basement`,
    gameMapAliases: ["Lavernica's Basement", "Lavernica's Home Basement"],
  },
  {
    id: "high-hall-sewer",
    name: "High Hall Sewer",
    groupKey: "map.maps.groups.finale",
    dataUrl: `${MAP_DATA_BASE_URL}/high-hall-sewer`,
    gameMapAliases: ["High Hall Sewer"],
  },
  {
    id: "mind-of-the-netherbrain",
    name: "Mind of the Netherbrain",
    groupKey: "map.maps.groups.finale",
    dataUrl: `${MAP_DATA_BASE_URL}/mind-of-the-netherbrain`,
    gameMapAliases: ["Mind of the Netherbrain", "Netherbrain Platforms"],
  },
  {
    id: "sorcerous-sundries-ground-floor",
    parentMapId: "lower-city",
    name: "Sorcerous Sundries — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/sorcerous-sundries-ground-floor`,
  },
  {
    id: "sorcerous-sundries-upper-floor",
    parentMapId: "lower-city",
    name: "Sorcerous Sundries — Upper Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/sorcerous-sundries-upper-floor`,
  },
  {
    id: "steel-watch-foundry-production-floor",
    parentMapId: "lower-city",
    name: "Steel Watch Foundry — Production Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/steel-watch-foundry-production-floor`,
  },
  {
    id: "steel-watch-foundry-upper-walkways",
    parentMapId: "lower-city",
    name: "Steel Watch Foundry — Upper Walkways",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/steel-watch-foundry-upper-walkways`,
  },
  {
    id: "counting-house-ground-floor",
    parentMapId: "lower-city",
    name: "The Counting House — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/counting-house-ground-floor`,
  },
  {
    id: "counting-house-upper-floor",
    parentMapId: "lower-city",
    name: "The Counting House — Upper Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/counting-house-upper-floor`,
  },
  {
    id: "facemakers-boutique-ground-floor",
    parentMapId: "lower-city",
    name: "Facemaker's Boutique — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/facemakers-boutique-ground-floor`,
  },
  {
    id: "facemakers-boutique-upper-floor",
    parentMapId: "lower-city",
    name: "Facemaker's Boutique — Upper Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/facemakers-boutique-upper-floor`,
  },
  {
    id: "stormshore-tabernacle-ground-floor",
    parentMapId: "lower-city",
    name: "Stormshore Tabernacle — Ground Floor",
    groupKey: "map.maps.groups.act3",
    dataUrl: `${MAP_DATA_BASE_URL}/stormshore-tabernacle-ground-floor`,
  },

];

/** Four player-facing world atlases. Individual maps retain their stable ids;
 * these placements only define the connection-aware overview composition. */
export const MAP_ATLASES: MapAtlasDefinition[] = [
  {
    id: "nautiloid",
    parentAtlasId: "wilderness",
    name: "Nautiloid",
    width: 1900,
    height: 1800,
    featuredMapIds: ["nautiloid"],
    placements: [
      { mapId: "nautiloid", x: 100, y: 154.879224, width: 1700, height: 986.241553 },
      { mapId: "nautiloid-lower-deck", x: 510.344902, y: 1220, width: 879.310195, height: 482 },
    ],
  },
  {
    id: "wilderness",
    name: "Wilderness",
    width: 3800,
    height: 3200,
    featuredMapIds: ["wilderness", "underdark", "grymforge", "mountain-pass"],
    placements: [
      { mapId: "wilderness", x: 1050.235338, y: 550, width: 1099.529325, height: 924 },
      { mapId: "zhentarim-hideout", x: 120.059333, y: 160, width: 299.881335, height: 414 },
      { mapId: "owlbear-nest", x: 560.079576, y: 250, width: 359.840849, height: 238 },
      { mapId: "chapel-refectory", x: 2420, y: 180.693548, width: 220, height: 367.612903 },
      { mapId: "dank-crypt", x: 2730, y: 216.130435, width: 300, height: 321.73913 },
      { mapId: "necromancers-cellar", x: 2420, y: 690.085339, width: 260, height: 233.829322 },
      { mapId: "whispering-depths", x: 2735.274596, y: 690, width: 389.450808, height: 256 },
      { mapId: "overgrown-tunnel", x: 2570, y: 1071.204197, width: 430, height: 256.591607 },
      { mapId: "shattered-sanctum", x: 368.950464, y: 850, width: 292.099071, height: 458 },
      { mapId: "shattered-sanctum-spider-pit", x: 720, y: 1110.090395, width: 200, height: 215.819209 },
      { mapId: "shattered-sanctum-upper-platform", x: 720, y: 850.225806, width: 200, height: 193.548387 },
      { mapId: "worg-pens", x: 63.74359, y: 1020, width: 212.512821, height: 224 },
      { mapId: "defiled-temple", x: 361.955479, y: 1420, width: 296.089041, height: 311 },
      { mapId: "underdark", x: 1200, y: 1602.682464, width: 650, height: 1056.635071 },
      { mapId: "arcane-tower-level-0", x: 1001.22093, y: 2380, width: 137.55814, height: 140 },
      { mapId: "arcane-tower-level-1", x: 1001.22093, y: 2212, width: 137.55814, height: 140 },
      { mapId: "arcane-tower-level-2", x: 1007.666667, y: 2044, width: 124.666667, height: 140 },
      { mapId: "arcane-tower-level-3", x: 997.333333, y: 1876, width: 145.333333, height: 140 },
      { mapId: "arcane-tower-level-4", x: 1001.715686, y: 1708, width: 136.568627, height: 140 },
      { mapId: "arcane-tower-level-5", x: 1000.353535, y: 1540, width: 139.292929, height: 140 },
      { mapId: "arcane-tower-basement", x: 996.343284, y: 2548, width: 147.313433, height: 140 },
      { mapId: "grymforge", x: 420, y: 1900.146341, width: 500, height: 731.707317 },
      { mapId: "mountain-pass", x: 2070, y: 1650.050725, width: 650, height: 680.898551 },
      { mapId: "githyanki-creche", x: 2762.672806, y: 1780, width: 394.654389, height: 433 },
      { mapId: "astral-plane-creche", x: 3290, y: 2220.254209, width: 350, height: 257.491582 },
      { mapId: "secluded-chamber", x: 930, y: 126.906433, width: 220, height: 178.187135 },
      { mapId: "tiefling-hideout", x: 1195.736544, y: 110, width: 238.526912, height: 200 },
      { mapId: "hidden-vault", x: 1499.391386, y: 120, width: 171.217228, height: 205 },
      { mapId: "inner-sanctum", x: 1740, y: 94.505618, width: 230, height: 290.988764 },
      { mapId: "underground-passage", x: 2049.431529, y: 80, width: 211.136943, height: 294 },
      { mapId: "zhentarim-cellar", x: 120, y: 620.152174, width: 210, height: 223.695652 },
      { mapId: "toll-house-basement", x: 2420, y: 1371.912371, width: 210, height: 199.175258 },
      { mapId: "blighted-village-windmill-cellar", x: 2690, y: 1453.312977, width: 180, height: 181.374046 },
      { mapId: "festering-cove", x: 1174.154321, y: 2700, width: 261.691358, height: 369 },
      { mapId: "secret-chamber", x: 3290, y: 1862.566274, width: 380, height: 209.867452 },
      { mapId: "basement-campsite", x: 3160, y: 1130.136691, width: 220, height: 281.726619 },
      { mapId: "rosymorn-campsite", x: 2010.177305, y: 2480, width: 399.64539, height: 460 },
      { mapId: "creche-campsite", x: 2860, y: 2410.155612, width: 290, height: 185.688776 },
      { mapId: "cavern-campsite", x: 3210, y: 680.072626, width: 300, height: 243.854749 },
      { mapId: "chapel-campsite", x: 3190, y: 210.015625, width: 290, height: 299.96875 },
      { mapId: "grymforge-campsite", x: 590.23871, y: 2800, width: 359.522581, height: 298 },
      { mapId: "wilderness-campsite", x: 1055.421446, y: 350, width: 219.157107, height: 194 },
      { mapId: "underground-campsite", x: 41.986287, y: 1390, width: 246.027426, height: 277 },
      { mapId: "underdark-campsite", x: 1610, y: 2750.05, width: 330, height: 306.9 },
    ],
  },
  {
    id: "shadow-cursed-lands",
    name: "Shadow-Cursed Lands",
    width: 3500,
    height: 3200,
    featuredMapIds: ["shadow-cursed-lands", "gauntlet-of-shar", "moonrise-towers-ground-floor", "mind-flayer-colony"],
    placements: [
      { mapId: "shadow-cursed-lands", x: 1100, y: 484.078324, width: 950, height: 1153.843352 },
      { mapId: "grymforge-lift-entrance", x: 160, y: 260.126761, width: 300, height: 257.746479 },
      { mapId: "last-light-inn-cellar", x: 560, y: 250.136483, width: 260, height: 363.727034 },
      { mapId: "reithwin-tollhouse-basement", x: 760, y: 850.115385, width: 180, height: 194.769231 },
      { mapId: "reithwin-tollhouse-basement-level-0", x: 850.013423, y: 530, width: 199.973154, height: 156 },
      { mapId: "reithwin-tollhouse-basement-level-1", x: 630.00939, y: 830, width: 109.981221, height: 106 },
      { mapId: "sharran-sanctuary", x: 800.275862, y: 1160, width: 219.448276, height: 172 },
      { mapId: "house-of-healing-morgue", x: 302.551621, y: 1180, width: 314.896759, height: 461 },
      { mapId: "masons-guild-basement", x: 720, y: 1501.52381, width: 260, height: 290.952381 },
      { mapId: "grand-mausoleum", x: 100.051825, y: 1850, width: 259.89635, height: 453 },
      { mapId: "gauntlet-of-shar", x: 450, y: 1900.841517, width: 700, height: 764.316966 },
      { mapId: "gauntlet-of-shar-level-0", x: 1260, y: 1820.010638, width: 240, height: 334.978723 },
      { mapId: "gauntlet-of-shar-statue-base", x: 1260, y: 2740.076271, width: 300, height: 230.847458 },
      { mapId: "gauntlet-of-shar-level-1", x: 1710.223881, y: 1820, width: 259.552239, height: 235 },
      { mapId: "gauntlet-of-shar-level-2", x: 1260, y: 2170.211701, width: 380, height: 223.576598 },
      { mapId: "gauntlet-of-shar-level-3", x: 1710.004065, y: 2170, width: 379.99187, height: 154 },
      { mapId: "gauntlet-of-shar-level-4", x: 1260.461538, y: 2520, width: 379.076923, height: 154 },
      { mapId: "gauntlet-of-shar-level-5", x: 1710, y: 2520.146113, width: 300, height: 372.707775 },
      { mapId: "nightsong-prison", x: 520.213563, y: 2800, width: 599.572874, height: 241 },
      { mapId: "moonrise-towers-ground-floor", x: 2300, y: 353.548387, width: 340, height: 287.903226 },
      { mapId: "moonrise-towers-second-floor", x: 2385.475, y: 790, width: 249.05, height: 289 },
      { mapId: "moonrise-towers-rooftop", x: 2390, y: 1190.68306, width: 250, height: 248.63388 },
      { mapId: "moonrise-prison", x: 2860.179171, y: 400, width: 419.641657, height: 410 },
      { mapId: "mind-flayer-colony", x: 2250.236056, y: 1810, width: 849.527888, height: 694 },
      { mapId: "gauntlet-campsite", x: 49.66269, y: 2400, width: 310.67462, height: 299 },
      { mapId: "shadow-cursed-campsite", x: 1430.076923, y: 50, width: 429.846154, height: 396 },
      { mapId: "last-light-campsite", x: 160.209961, y: 650, width: 399.580078, height: 345 },
      { mapId: "moonrise-campsite", x: 2860.133779, y: 1100, width: 309.732441, height: 343 },
    ],
  },
  {
    id: "baldurs-gate",
    name: "Baldur's Gate",
    width: 7600,
    height: 6200,
    featuredMapIds: ["lower-city", "wyrms-crossing", "lower-city-sewers", "house-of-hope", "high-hall"],
    placements: [
      { mapId: "high-hall", x: 3600, y: 103.764874, width: 850, height: 757.470251 },
      { mapId: "morphic-pool", x: 4601.037182, y: 240, width: 297.925636, height: 440 },
      { mapId: "astral-plane-finale", x: 4521.330907, y: 740, width: 467.338186, height: 410 },
      { mapId: "netherbrain", x: 5100.265152, y: 330, width: 299.469697, height: 295 },
      { mapId: "mind-of-the-netherbrain", x: 5507.103175, y: 330, width: 275.793651, height: 278 },
      { mapId: "epilogue-campsite", x: 5950.037037, y: 280, width: 389.925926, height: 376 },
      { mapId: "rivington-campsite", x: 6720.172745, y: 2340, width: 379.654511, height: 344 },
      { mapId: "lower-city-campsite", x: 1250, y: 1810.080247, width: 320, height: 332.839506 },
      { mapId: "elfsong-tavern-campsite", x: 1201.404412, y: 3330, width: 307.191176, height: 396 },
      { mapId: "high-hall-sewer", x: 4100, y: 949.636364, width: 360, height: 206.727273 },
      { mapId: "house-of-hope", x: 2800, y: 603.068182, width: 500, height: 473.863636 },
      { mapId: "house-of-hope-prison", x: 3351.067294, y: 900, width: 357.865412, height: 380 },
      { mapId: "devil-and-smith-basement", x: 3815.1875, y: 950, width: 189.625, height: 205 },
      { mapId: "szarr-palace", x: 1700, y: 666.409396, width: 330, height: 287.181208 },
      { mapId: "cazador-side-rooms", x: 2080, y: 703.238281, width: 430, height: 153.523438 },
      { mapId: "cazador-dungeon", x: 1816.397849, y: 1050, width: 247.204301, height: 380 },
      { mapId: "baldurs-mouth-basement", x: 2457.613982, y: 1020, width: 224.772036, height: 290 },
      { mapId: "blushing-mermaid-cellar", x: 900, y: 1112.885572, width: 260, height: 274.228856 },
      { mapId: "jaheiras-basement", x: 1243.333333, y: 1200, width: 293.333333, height: 260 },
      { mapId: "lodge-basement", x: 620, y: 1504.73545, width: 260, height: 320.529101 },
      { mapId: "counting-house-vault", x: 4300, y: 2680, width: 233.689024, height: 210 },
      { mapId: "lower-city-catacombs", x: 2338.538012, y: 1420, width: 482.923977, height: 300 },
      { mapId: "stormshore-tabernacle-basement", x: 3140, y: 1381.666667, width: 220, height: 146.666667 },
      { mapId: "ramaziths-tower", x: 3550, y: 1410.150754, width: 360, height: 299.698492 },
      { mapId: "sorcerous-vault", x: 4059.424006, y: 1370, width: 311.151988, height: 370 },
      { mapId: "lower-city", x: 1802.45821, y: 1900, width: 1495.083579, height: 1000 },
      { mapId: "jannaths-estate-floor-0", x: 1600.144118, y: 1810, width: 169.711765, height: 177 },
      { mapId: "jannaths-estate-floor-1", x: 1600, y: 2050.216867, width: 170, height: 236.566265 },
      { mapId: "jannaths-estate-floor-2", x: 1600, y: 2350.222892, width: 170, height: 193.554217 },
      { mapId: "jannaths-estate-floor-3", x: 1600, y: 2600.215909, width: 170, height: 125.568182 },
      { mapId: "jannaths-estate-floor-4", x: 1600.171875, y: 2800, width: 169.65625, height: 183 },
      { mapId: "sanguine-laboratory", x: 1020, y: 2265.555556, width: 210, height: 178.888889 },
      { mapId: "gardeners-basement", x: 1331.029412, y: 2200, width: 187.941176, height: 180 },
      { mapId: "golbraiths-cellar", x: 1331.892202, y: 2480, width: 206.215596, height: 185 },
      { mapId: "water-queens-cellar", x: 620, y: 2317.727273, width: 300, height: 154.545455 },
      { mapId: "steel-watch-foundry", x: 500, y: 2722.245011, width: 350, height: 320.509978 },
      { mapId: "steel-watch-foundry-upper", x: 900, y: 2782.965116, width: 300, height: 279.069767 },
      { mapId: "fireworks-basement", x: 3400, y: 2167.835052, width: 220, height: 214.329897 },
      { mapId: "garlows-basement", x: 3712.380952, y: 2160, width: 155.238095, height: 220 },
      { mapId: "bonecloak-apothecary-basement", x: 3964.43609, y: 2150, width: 291.12782, height: 220 },
      { mapId: "bonecloak-apothecary-ground-floor", x: 3950, y: 2460.405405, width: 180, height: 119.189189 },
      { mapId: "elfsong-tavern-ground-floor", x: 1620, y: 3422.911392, width: 180, height: 154.177215 },
      { mapId: "elfsong-tavern-upper-floor", x: 1874.876847, y: 3420, width: 170.246305, height: 160 },
      { mapId: "bonecloak-apothecary-upper-floor", x: 4170, y: 2455.2, width: 180, height: 129.6 },
      { mapId: "peartrees-basement", x: 4330.526316, y: 2180, width: 158.947368, height: 180 },
      { mapId: "house-of-grief", x: 4616.003741, y: 2150, width: 447.992519, height: 310 },
      { mapId: "heapside-prison", x: 3380, y: 2623.847737, width: 200, height: 282.304527 },
      { mapId: "philgraves-basement", x: 2100, y: 3030, width: 177.583893, height: 180 },
      { mapId: "elfsong-cellar", x: 1642.524272, y: 3060, width: 154.951456, height: 280 },
      { mapId: "emperors-old-hideout", x: 1928.348416, y: 3060, width: 153.303167, height: 280 },
      { mapId: "flymms-cargo-basement", x: 500, y: 3264.220779, width: 300, height: 291.558442 },
      { mapId: "submersible", x: 880, y: 3405.09434, width: 240, height: 289.811321 },
      { mapId: "lower-city-sewers", x: 2205.973451, y: 3250, width: 988.053097, height: 1500 },
      { mapId: "guildhall-basement", x: 3320, y: 3420.163043, width: 220, height: 199.673913 },
      { mapId: "murder-tribunal", x: 1656.302817, y: 3800, width: 287.394366, height: 350 },
      { mapId: "ancient-lair", x: 1660, y: 4265.38874, width: 280, height: 249.22252 },
      { mapId: "iron-throne", x: 180, y: 3907.678571, width: 450, height: 414.642857 },
      { mapId: "wyrms-rock-prison", x: 5180.505051, y: 2020, width: 298.989899, height: 250 },
      { mapId: "wyrmway", x: 5293.383905, y: 1640, width: 353.23219, height: 350 },
      { mapId: "dragon-sanctum", x: 5782.958333, y: 1540, width: 354.083333, height: 420 },
      { mapId: "wyrms-rock-ground-floor", x: 4920, y: 1180.07177, width: 300, height: 269.856459 },
      { mapId: "wyrms-rock-audience-hall", x: 5280, y: 1180.023866, width: 300, height: 279.952267 },
      { mapId: "wyrms-rock-office", x: 5640, y: 1200.071599, width: 300, height: 239.856802 },
      { mapId: "wyrms-rock-rooftop", x: 6000.222222, y: 1200, width: 219.555556, height: 247 },
      { mapId: "wyrms-crossing", x: 5185.379747, y: 2480, width: 989.240506, height: 1200 },
      { mapId: "wyrms-lookout", x: 5850, y: 4120.0625, width: 400, height: 451.875 },
      { mapId: "astral-plane-intermezzo", x: 6341.436184, y: 4120, width: 547.127632, height: 480 },
      { mapId: "rivington-well", x: 6420, y: 2366.953353, width: 260, height: 316.093294 },
      { mapId: "open-hand-temple-cellar", x: 6380, y: 2817.248908, width: 240, height: 185.502183 },
      { mapId: "smugglers-passageway", x: 6303.916016, y: 3180, width: 432.167969, height: 290 },
      { mapId: "smugglers-cave", x: 6840, y: 3215.993976, width: 230, height: 248.012048 },
      { mapId: "windmill-cellar", x: 6254.047619, y: 3600, width: 171.904762, height: 190 },
      { mapId: "ironhand-hideout", x: 4927.261307, y: 3920, width: 235.477387, height: 330 },
      { mapId: "jungle-of-chult", x: 5360, y: 4026.656101, width: 350, height: 336.687797 },
      { mapId: "highberry-cellar", x: 3671.712821, y: 3000, width: 166.574359, height: 218 },
      { mapId: "counting-house-vault-connection", x: 3933.230769, y: 2980, width: 343.538462, height: 203 },
      { mapId: "beehive-basement", x: 4350, y: 3010.92053, width: 190, height: 176.15894 },
      { mapId: "chromatic-scale-basement", x: 4614.309896, y: 3000, width: 201.380208, height: 185 },
      { mapId: "rainforests-basement", x: 3650, y: 3351.125, width: 180, height: 177.75 },
      { mapId: "thrumbos-basement", x: 3902.340426, y: 3330, width: 215.319149, height: 220 },
      { mapId: "figaros-basement", x: 2000, y: 1550, width: 175.119816, height: 239 },
      { mapId: "lavernicas-basement", x: 4490, y: 3330.194444, width: 190, height: 239.611111 },
      { mapId: "sorcerous-sundries-ground-floor", x: 3500, y: 1830, width: 240, height: 243.185841 },
      { mapId: "sorcerous-sundries-upper-floor", x: 3820, y: 1830, width: 240, height: 243.185841 },
      { mapId: "steel-watch-foundry-production-floor", x: 1220, y: 2770, width: 300, height: 182.894737 },
      { mapId: "steel-watch-foundry-upper-walkways", x: 1240, y: 3090, width: 300, height: 182.635135 },
      { mapId: "counting-house-ground-floor", x: 3630, y: 2700, width: 260, height: 192.719298 },
      { mapId: "counting-house-upper-floor", x: 3990, y: 2700, width: 240, height: 119.396985 },
      { mapId: "facemakers-boutique-ground-floor", x: 1400, y: 1540, width: 220, height: 198 },
      { mapId: "facemakers-boutique-upper-floor", x: 1700, y: 1530, width: 220, height: 132.727273 },
      { mapId: "stormshore-tabernacle-ground-floor", x: 3100, y: 1640, width: 200, height: 219.310345 },
    ],
  },
];

const atlasesByMapId = new Map(MAP_ATLASES.flatMap((atlas) =>
  atlas.placements.map(({ mapId }) => [mapId, atlas] as const)));

const registeredMapIds = new Set(MAP_DEFINITIONS.map(({ id }) => id));
const placedMapIds = new Set<string>();
for (const atlas of MAP_ATLASES) {
  const atlasMapIds = new Set(atlas.placements.map(({ mapId }) => mapId));
  const unknownFeaturedMapIds = atlas.featuredMapIds.filter((mapId) => !atlasMapIds.has(mapId));
  if (unknownFeaturedMapIds.length > 0) {
    throw new Error(`Atlas "${atlas.id}" features maps it does not contain: ${unknownFeaturedMapIds.join(", ")}.`);
  }
  for (const placement of atlas.placements) {
    if (!registeredMapIds.has(placement.mapId)) {
      throw new Error(`Atlas "${atlas.id}" contains unknown map "${placement.mapId}".`);
    }
    if (placedMapIds.has(placement.mapId)) {
      throw new Error(`Map "${placement.mapId}" appears in more than one atlas.`);
    }
    if (placement.x < 0 || placement.y < 0
      || placement.x + placement.width > atlas.width
      || placement.y + placement.height > atlas.height) {
      throw new Error(`Map "${placement.mapId}" lies outside atlas "${atlas.id}".`);
    }
    placedMapIds.add(placement.mapId);
  }
  for (let index = 0; index < atlas.placements.length; index += 1) {
    const placement = atlas.placements[index]!;
    for (const candidate of atlas.placements.slice(index + 1)) {
      const overlapWidth = Math.min(placement.x + placement.width, candidate.x + candidate.width)
        - Math.max(placement.x, candidate.x);
      const overlapHeight = Math.min(placement.y + placement.height, candidate.y + candidate.height)
        - Math.max(placement.y, candidate.y);
      if (overlapWidth > 0 && overlapHeight > 0) {
        throw new Error(`Maps "${placement.mapId}" and "${candidate.mapId}" overlap in atlas "${atlas.id}".`);
      }
    }
  }
}
const missingAtlasMaps = MAP_DEFINITIONS.filter(({ id }) => !placedMapIds.has(id));
if (missingAtlasMaps.length > 0) {
  throw new Error(`Maps without an atlas: ${missingAtlasMaps.map(({ id }) => id).join(", ")}.`);
}

export const getMapAtlas = (id: string | null | undefined): MapAtlasDefinition =>
  MAP_ATLASES.find((atlas) => atlas.id === id) ?? MAP_ATLASES[1]!;

export const getMapAtlasForMap = (mapId: string): MapAtlasDefinition =>
  atlasesByMapId.get(mapId) ?? MAP_ATLASES[1]!;

export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;

export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find((definition) => definition.id === id || definition.legacyIds?.includes(id ?? ""))
  ?? MAP_DEFINITIONS[0]!;

const normalizeGameMapLabel = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve only explicit aliases; unknown observations stay untouched until calibrated. */
export const resolveGameMapDefinition = (
  mainMap: string | null | undefined,
  subMap: string | null | undefined,
): MapDefinition | null => {
  for (const rawLabel of [subMap, mainMap]) {
    if (!rawLabel) continue;
    const label = normalizeGameMapLabel(rawLabel);
    const match = MAP_DEFINITIONS.find((definition) =>
      definition.gameMapAliases?.some((alias) => normalizeGameMapLabel(alias) === label));
    if (match) return match;
  }
  return null;
};
