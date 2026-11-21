import {
  Banknote,
  BedDouble,
  Carrot,
  Castle,
  Cherry,
  Cross,
  DoorOpen,
  Factory,
  Feather,
  Flag,
  Flame,
  Flower2,
  Fuel,
  Gem,
  Gift,
  House,
  Landmark,
  LifeBuoy,
  MapPin,
  MessageCircleMore,
  MoveUp,
  Pickaxe,
  PawPrint,
  Shield,
  Shell,
  ShoppingBasket,
  Signpost,
  Skull,
  Soup,
  Sparkles,
  Sprout,
  Store,
  Swords,
  TreePine,
  Truck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerColor, type UserMarkerIcon } from "./types";
import { contentUrl } from "../../lib/content-url";
import { EVENT_CANDY_ICON_PATH } from "../../game-config";
import EventEntranceIcon from "./event-entrance-icon";
import { getMapPetSources, petFilterId, type MapPetSource } from "./map-pet-sources";

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
  filterLabelKey?: string;
  groupId: MapCategoryGroupId;
  defaultVisible: boolean;
  icon: LucideIcon;
  nativeIconPath?: string;
  /** Source references assigned to this filter category when loading map data. */
  sourceReferenceIds?: string[];
  /** Categories with the same filter id share one visibility row without merging map points. */
  filterId?: string;
  /** Filter-only layers reuse the original points and do not have their own marker style. */
  filterOnly?: boolean;
  /** False for map layers whose locations cannot be marked as found. */
  supportsFound?: boolean;
  hideObjectAccessDetails?: boolean;
  showInstanceEntranceDetails?: boolean;
  /** Render full-color artwork on a neutral surface instead of a colored glyph badge. */
  artwork?: boolean;
  markerClass: string;
  markerSize?: number;
  markerScale?: number;
  markerPriority?: number;
  linkedItemLabelKey?: string;
  subtypeNameKeys?: Record<string, string>;
}

export type MapCategoryGroupId = "essentials" | "npcs" | "events" | "regions" | "teleportation" | "dungeons" | "progression" | "gatherables" | "gathering-2" | "collectables" | "personal" | "creatures" | "pets";

export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId;
  labelKey: string;
  /** Header glyph, so a collapsed group is recognisable without reading it. */
  icon: LucideIcon;
  defaultExpanded: boolean;
  showInFilters?: boolean;
  markerSize?: number;
  markerScale?: number;
  activeEventMarkerScale?: number;
  markerPriority?: number;
}

const MARKER_PRIORITY = {
  enemy: 0,
  gathering: 1,
  npc: 2,
  collectible: 3,
  objective: 4,
  questArea: 5,
  other: 6,
  travel: 6,
  merchant: 7,
  dungeon: 8,
  boss: 9,
} as const;

export const SELECTED_MARKER_PRIORITY = MARKER_PRIORITY.boss + 1;
export const ACTIVE_EVENT_MARKER_PRIORITY = SELECTED_MARKER_PRIORITY + 2;

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "regions", labelKey: "map.categoryGroups.regions", icon: MapPin, defaultExpanded: false, markerPriority: MARKER_PRIORITY.travel },
  { id: "teleportation", labelKey: "map.categoryGroups.teleportation", icon: Signpost, defaultExpanded: true, markerPriority: MARKER_PRIORITY.travel },
  { id: "dungeons", labelKey: "map.categoryGroups.dungeons", icon: DoorOpen, defaultExpanded: false, markerScale: 1.5, activeEventMarkerScale: 0.75, markerPriority: MARKER_PRIORITY.dungeon },
  { id: "progression", labelKey: "map.categoryGroups.progression", icon: Flag, defaultExpanded: false },
  { id: "npcs", labelKey: "map.categoryGroups.npcs", icon: House, defaultExpanded: false },
  { id: "events", labelKey: "map.categoryGroups.events", icon: Sparkles, defaultExpanded: true },
  { id: "creatures", labelKey: "map.categoryGroups.creatures", icon: Skull, defaultExpanded: false },
  { id: "pets", labelKey: "map.categoryGroups.pets", icon: PawPrint, defaultExpanded: false },
  { id: "gatherables", labelKey: "map.categoryGroups.gatherables", icon: Sprout, defaultExpanded: false, markerSize: 24, markerPriority: MARKER_PRIORITY.gathering },
  { id: "gathering-2", labelKey: "map.categoryGroups.gathering2", icon: Flower2, defaultExpanded: false, markerSize: 24, markerPriority: MARKER_PRIORITY.gathering },
  { id: "collectables", labelKey: "map.categoryGroups.collectables", icon: Feather, defaultExpanded: false, markerSize: 24, markerPriority: MARKER_PRIORITY.collectible },
  { id: "personal", labelKey: "map.markerGroups.title", icon: Flag, defaultExpanded: false, showInFilters: false },
  // Demo-only layers are unavailable on the shipped game maps.
  { id: "essentials", labelKey: "map.categoryGroups.essentials", icon: LifeBuoy, defaultExpanded: false },
];

const markerSizeByGroup = new Map(MAP_CATEGORY_GROUPS.map(({ id, markerSize }) => [id, markerSize]));
export const markerScaleByGroup = new Map(MAP_CATEGORY_GROUPS.map(({ id, markerScale }) => [id, markerScale]));
export const activeEventMarkerScaleByGroup = new Map(MAP_CATEGORY_GROUPS.map(({ id, activeEventMarkerScale }) => [id, activeEventMarkerScale]));
const markerPriorityByGroup = new Map(MAP_CATEGORY_GROUPS.map(({ id, markerPriority }) => [id, markerPriority]));

export interface UserMarkerColorConfig {
  id: UserMarkerColor;
  labelKey: string;
  markerClass: string;
}

export interface UserMarkerIconConfig {
  id: UserMarkerIcon;
  labelKey: string;
  icon: LucideIcon;
  nativeIconPath?: string;
  serviceArt?: boolean;
}

/** Category glyphs are app assets (public/icons/categories), shared by every map. */
const nativeIconPath = (categoryId: string) => `/icons/categories/${categoryId}.png`;
const questAreaIconPath = "/data/reference/artwork/ut-marker-quest-hero-incomplete-a2fd9e60eb90.png";

/** Game-client item art for the item ids present in the shipped map layers. */
const MAP_ITEM_ICONS: Record<string, string> = {
  "631900001": "icon_item_monolith_material_l_001.png",
  "631900005": "icon_item_monolith_material_l_005.png",
  "631900012": "icon_item_monolith_material_d_006.png",
  "631900007": "icon_item_monolith_material_d_001.png",
  "631900013": "icon_item_monolith_material_l_004.png",
  "610610013": "icon_item_gather_od_l_lv2_02a.png",
  "610610014": "icon_item_gather_od_l_lv4_02a.png",
  "610610015": "icon_item_gather_od_l_lv4_04a.png",
  "610610016": "icon_item_gather_od_a_u_001.png",
  "610620013": "icon_item_gather_ore_a_c_002.png",
  "610650011": "icon_item_gather_wood_a_c_001.png",
  "610650012": "icon_item_gather_wood_a_c_001.png",
  "610660025": "icon_item_gather_gemstone_a_c_002.png",
  "610660026": "icon_item_gather_gemstone_a_c_003.png",
  "610660027": "icon_item_gather_gemstone_a_c_004.png",
  "610670041": "icon_item_gather_herb_l_c_001.png",
  "610670042": "icon_item_gather_herb_d_c_002.png",
  "610670043": "icon_item_gather_herb_d_c_001.png",
  "610670044": "icon_item_gather_herb_d_c_002.png",
  "610680043": "icon_item_gather_food_l_c_001.png",
  "610680045": "icon_item_gather_food_d_c_003.png",
  "610680048": "icon_item_gather_food_l_c_006.png",
  "610680049": "icon_item_gather_food_l_c_001.png",
  "610680051": "icon_item_gather_food_l_c_003.png",
  "610680054": "icon_item_gather_food_l_c_006.png",
};

const mapItemIconPath = (itemId: string) => {
  const file = MAP_ITEM_ICONS[itemId];
  return file ? `/data/items/icons/${file}` : undefined;
};

const NATIVE_RESOURCE_STYLES = {
  od: { icon: Sparkles, markerClass: "map-marker-gather-od" },
  ore: { icon: Pickaxe, markerClass: "map-marker-gather-metal-ore" },
  gem: { icon: Gem, markerClass: "map-marker-gather-gems" },
  herb: { icon: Flower2, markerClass: "map-marker-gather-herbs" },
  tree: { icon: TreePine, markerClass: "map-marker-gather-trees" },
  resource: { icon: Sprout, markerClass: "map-marker-gather-herbs" },
} satisfies Record<string, { icon: LucideIcon; markerClass: string }>;

const nativeResourceCategory = (
  id: string,
  style: keyof typeof NATIVE_RESOURCE_STYLES,
  sourceReferenceIds: string[],
  nativeIconPath: string,
): MapCategoryConfig => ({
  id: `native-${id}`,
  labelKey: `map.categories.nativeResources.${id}`,
  groupId: "gathering-2",
  defaultVisible: false,
  nativeIconPath,
  artwork: true,
  ...NATIVE_RESOURCE_STYLES[style],
  sourceReferenceIds,
});

const NATIVE_RESOURCE_CATEGORIES: MapCategoryConfig[] = [
  nativeResourceCategory("aria", "herb", ["EnvObjData:1500032"], "/data/items/icons/icon_item_gather_herb_l_c_001.png"),
  nativeResourceCategory("asvata", "tree", ["EnvObjData:1550012"], "/data/items/icons/icon_item_gather_wood_a_c_001.png"),
  nativeResourceCategory("azpha", "herb", ["EnvObjData:1550032"], "/data/items/icons/icon_item_gather_herb_d_c_001.png"),
  nativeResourceCategory("calendula", "herb", ["EnvObjData:1550033"], "/data/items/icons/icon_item_gather_herb_d_c_002.png"),
  nativeResourceCategory("conide", "resource", ["EnvObjData:1550042"], "/data/items/icons/icon-gather-food-l-lv1-01c.png"),
  nativeResourceCategory("coriolus", "resource", ["EnvObjData:1500041"], "/data/items/icons/icon_item_gather_food_l_c_001.png"),
  nativeResourceCategory("cypri", "resource", ["EnvObjData:1500043", "EnvObjData:1500061"], "/data/items/icons/icon_item_gather_food_l_c_006.png"),
  nativeResourceCategory("diamond", "gem", ["EnvObjData:1550021", "EnvObjData:1500021"], "/data/items/icons/icon_item_gather_gemstone_a_c_003.png"),
  nativeResourceCategory("inina", "resource", ["EnvObjData:1500042"], "/data/items/icons/icon-gather-food-l-lv1-01c.png"),
  nativeResourceCategory("kukuru", "resource", ["EnvObjData:1500045"], "/data/items/icons/icon-gather-fruit-l-lv2-01a.png"),
  nativeResourceCategory("mela", "resource", ["EnvObjData:1500040"], "/data/items/icons/icon_item_gather_food_d_c_003.png"),
  nativeResourceCategory("morfa", "resource", ["EnvObjData:1550041"], "/data/items/icons/icon_item_gather_food_l_c_001.png"),
  nativeResourceCategory("mysterious-odyle", "od", ["EnvObjData:1590002"], "/data/items/icons/icon_item_gather_od_l_lv2_02a.png"),
  nativeResourceCategory("odyle", "od", ["EnvObjData:1500062", "EnvObjData:1590001", "EnvObjData:1550000", "EnvObjData:1500000"], "/data/items/icons/icon_item_gather_od_l_lv2_02a.png"),
  nativeResourceCategory("ohkra", "resource", ["EnvObjData:1550045"], "/data/items/icons/icon-gather-fruit-l-lv2-01a.png"),
  nativeResourceCategory("orichalcum", "ore", ["EnvObjData:1550004", "EnvObjData:1500004"], "/data/items/icons/icon_item_gather_ore_a_c_002.png"),
  nativeResourceCategory("pujery", "resource", ["EnvObjData:1550043"], "/data/items/icons/icon_item_gather_food_l_c_006.png"),
  nativeResourceCategory("raydam", "resource", ["EnvObjData:1550040"], "/data/items/icons/icon_item_gather_food_l_c_003.png"),
  nativeResourceCategory("ruby", "gem", ["EnvObjData:1550022", "EnvObjData:1500022"], "/data/items/icons/icon_item_gather_gemstone_a_c_004.png"),
  nativeResourceCategory("sapphire", "gem", ["EnvObjData:1550020", "EnvObjData:1500020"], "/data/items/icons/icon_item_gather_gemstone_a_c_002.png"),
  nativeResourceCategory("splendent-odyle", "od", ["EnvObjData:1500063"], "/data/items/icons/icon_item_gather_od_l_lv2_02a.png"),
  nativeResourceCategory("targena", "herb", ["EnvObjData:1500033"], "/data/items/icons/icon_item_gather_herb_d_c_002.png"),
  nativeResourceCategory("yggdrasil", "tree", ["EnvObjData:1500012"], "/data/items/icons/icon_item_gather_wood_a_c_001.png"),
];

export const MAP_CATEGORIES: MapCategoryConfig[] = [
  { id: "region", labelKey: "map.regions.label", groupId: "regions", defaultVisible: true, icon: MapPin, filterOnly: true, supportsFound: false, markerClass: "map-marker-travel" },
  { id: "teleport", labelKey: "map.categories.teleport", groupId: "teleportation", defaultVisible: true, icon: Signpost, nativeIconPath: nativeIconPath("teleport"), artwork: true, markerClass: "map-service-art map-marker-travel" },
  { id: "portal", labelKey: "map.categories.portal", groupId: "teleportation", defaultVisible: true, icon: Sparkles, nativeIconPath: nativeIconPath("rift"), artwork: true, markerClass: "map-service-art map-marker-travel" },
  { id: "rift", labelKey: "map.categories.rift", groupId: "teleportation", defaultVisible: true, icon: Sparkles, nativeIconPath: nativeIconPath("rift"), artwork: true, markerClass: "map-service-art map-marker-travel" },
  { id: "flight", labelKey: "map.categories.flight", groupId: "teleportation", defaultVisible: true, icon: Feather, nativeIconPath: nativeIconPath("flight"), artwork: true, markerClass: "map-service-art map-marker-travel" },
  { id: "springboard", labelKey: "map.categories.springboard", groupId: "teleportation", defaultVisible: true, icon: MoveUp, nativeIconPath: nativeIconPath("springboard"), artwork: true, markerClass: "map-service-art map-marker-travel" },
  { id: "dungeon", labelKey: "map.categories.dungeon", groupId: "dungeons", defaultVisible: true, icon: Landmark, nativeIconPath: nativeIconPath("dungeon"), artwork: true, markerClass: "map-service-art map-marker-dungeon map-marker-large-native-icon" },
  {
    id: "stronghold", labelKey: "map.categories.stronghold", groupId: "dungeons", defaultVisible: true,
    icon: Flame, nativeIconPath: "/icons/categories/stronghold.webp", artwork: true,
    showInstanceEntranceDetails: true,
    markerClass: "map-service-art map-marker-dungeon",
    sourceReferenceIds: [
      // Verteron
      "EnvObjData:1200103", "EnvObjData:1200105", "EnvObjData:1200106", "EnvObjData:1200107", "EnvObjData:1200108",
      "EnvObjData:1200109", "EnvObjData:1200110", "EnvObjData:1200111", "EnvObjData:1200112", "EnvObjData:1200113",
      "EnvObjData:1200114", "EnvObjData:1200115", "EnvObjData:1200116", "EnvObjData:1200117", "EnvObjData:1200118",
      // Altgard
      "EnvObjData:1300074", "EnvObjData:1300621", "EnvObjData:1300633", "EnvObjData:1300702", "EnvObjData:1300704",
      "EnvObjData:1300706", "EnvObjData:1300712", "EnvObjData:1300733", "EnvObjData:1300737", "EnvObjData:1300766",
      "EnvObjData:1300787", "EnvObjData:1300799", "EnvObjData:1300932", "EnvObjData:1301049", "EnvObjData:1301054",
      // Eltnen
      "EnvObjData:1201436", "EnvObjData:1201438", "EnvObjData:1201440", "EnvObjData:1201442",
      "EnvObjData:1201463", "EnvObjData:1201486",
      // Morheim
      "EnvObjData:1301223", "EnvObjData:1301225", "EnvObjData:1301234", "EnvObjData:1301276",
      "EnvObjData:1301284", "EnvObjData:1301286",
    ],
  },
  { id: "instance-entrance", labelKey: "map.categories.instanceEntrance", groupId: "progression", defaultVisible: true, icon: Gem, nativeIconPath: questAreaIconPath, artwork: true, showInstanceEntranceDetails: true, markerClass: "map-service-art map-marker-progression map-marker-quest-area", markerPriority: MARKER_PRIORITY.questArea },
  { id: "event-entrance", labelKey: "map.categories.eventEntrance", groupId: "dungeons", defaultVisible: true, icon: EventEntranceIcon, nativeIconPath: nativeIconPath("rift"), artwork: true, markerClass: "map-service-art map-marker-progression map-marker-large-native-icon" },
  { id: "guild-hall", labelKey: "map.categories.guildHall", groupId: "dungeons", defaultVisible: true, icon: Castle, nativeIconPath: "/data/items/icons/icon_coin_guild.png", artwork: true, markerClass: "map-service-art map-marker-dungeon" },
  { id: "quest-area", labelKey: "map.categories.questArea", groupId: "progression", defaultVisible: false, icon: Gem, nativeIconPath: questAreaIconPath, artwork: true, markerClass: "map-service-art map-marker-progression map-marker-quest-area", markerPriority: MARKER_PRIORITY.questArea },
  { id: "quest-object", labelKey: "map.categories.quest-object", groupId: "progression", defaultVisible: false, icon: Flag, nativeIconPath: nativeIconPath("quest-object"), artwork: true, markerClass: "map-service-art map-marker-progression", markerSize: 24, markerPriority: MARKER_PRIORITY.objective },
  { id: "quest-npc", labelKey: "map.categories.quest-npc", groupId: "progression", defaultVisible: true, icon: MessageCircleMore, nativeIconPath: nativeIconPath("quest-npc"), artwork: true, markerClass: "map-service-art map-marker-quest-npc", markerSize: 24, markerPriority: MARKER_PRIORITY.objective },
  { id: "objective", labelKey: "map.categories.objective", groupId: "progression", defaultVisible: false, icon: Flag, nativeIconPath: nativeIconPath("objective"), artwork: true, markerClass: "map-service-art map-marker-progression", markerPriority: MARKER_PRIORITY.objective },
  { id: "monolith", labelKey: "map.categories.monolith", groupId: "progression", defaultVisible: false, icon: Gem, nativeIconPath: nativeIconPath("monolith"), artwork: true, markerClass: "map-service-art map-marker-progression" },
  { id: "merchant", labelKey: "map.categories.merchant", groupId: "npcs", defaultVisible: false, icon: Store, nativeIconPath: nativeIconPath("merchant"), artwork: true, markerClass: "map-service-art map-marker-merchant", markerPriority: MARKER_PRIORITY.merchant },
  { id: "event-npc", labelKey: "map.categories.eventNpc", groupId: "events", defaultVisible: true, icon: Store, nativeIconPath: nativeIconPath("merchant"), artwork: true, markerClass: "map-service-art map-marker-merchant", markerPriority: MARKER_PRIORITY.merchant },
  { id: "event-object", labelKey: "map.categories.eventCandy", groupId: "events", defaultVisible: true,
    icon: Gift, nativeIconPath: EVENT_CANDY_ICON_PATH, artwork: true,
    subtypeNameKeys: {
      red: "events.guide.mapCandyNames.red",
      yellow: "events.guide.mapCandyNames.yellow",
      blue: "events.guide.mapCandyNames.blue",
    },
    markerClass: "map-service-art map-marker-progression", markerSize: 24, markerPriority: MARKER_PRIORITY.objective },
  { id: "craft-service", labelKey: "map.categories.craft-service", groupId: "npcs", defaultVisible: false, icon: Wrench, nativeIconPath: nativeIconPath("craft-service"), artwork: true, markerClass: "map-service-art map-marker-service" },
  { id: "storage", labelKey: "map.categories.storage", groupId: "npcs", defaultVisible: false, icon: ShoppingBasket, nativeIconPath: nativeIconPath("storage"), artwork: true, markerClass: "map-service-art map-marker-service" },
  { id: "npc", labelKey: "map.categories.npc", groupId: "npcs", defaultVisible: false, icon: UserRound, markerClass: "map-marker-npc", markerPriority: MARKER_PRIORITY.npc },
  { id: "boss", labelKey: "map.categories.boss", groupId: "creatures", defaultVisible: true, icon: Skull, nativeIconPath: "/data/reference/title-artwork/ut-titleicon-s3-bosschallenge-03.png", artwork: true, markerClass: "map-service-art map-marker-boss map-marker-large-native-icon", markerScale: 3, markerPriority: MARKER_PRIORITY.boss },
  { id: "dungeon-boss", labelKey: "map.categories.namedBoss", groupId: "creatures", defaultVisible: true, icon: Skull, markerClass: "map-marker-dungeon-boss", markerPriority: MARKER_PRIORITY.boss },
  { id: "enemy", labelKey: "map.categories.enemy", groupId: "creatures", defaultVisible: false, icon: Swords, markerClass: "map-marker-enemy", markerSize: 16, markerPriority: MARKER_PRIORITY.enemy },
  { id: "gather-od", labelKey: "map.categories.gatherOd", groupId: "gatherables", defaultVisible: false, icon: Sparkles, nativeIconPath: mapItemIconPath("610610013"), markerClass: "map-marker-gather-od" },
  { id: "gather-metal-ore", labelKey: "map.categories.gatherMetalOre", groupId: "gatherables", defaultVisible: false, icon: Pickaxe, nativeIconPath: mapItemIconPath("610620013"), markerClass: "map-marker-gather-metal-ore" },
  { id: "gather-gems", labelKey: "map.categories.gatherGems", groupId: "gatherables", defaultVisible: false, icon: Gem, nativeIconPath: mapItemIconPath("610660027"), markerClass: "map-marker-gather-gems" },
  { id: "gather-herbs", labelKey: "map.categories.gatherHerbs", groupId: "gatherables", defaultVisible: false, icon: Flower2, nativeIconPath: mapItemIconPath("610670041"), markerClass: "map-marker-gather-herbs" },
  { id: "gather-trees", labelKey: "map.categories.gatherTrees", groupId: "gatherables", defaultVisible: false, icon: TreePine, nativeIconPath: mapItemIconPath("610650011"), markerClass: "map-marker-gather-trees" },
  { id: "gather-berries", labelKey: "map.categories.gatherBerries", groupId: "gatherables", defaultVisible: false, icon: Cherry, nativeIconPath: mapItemIconPath("610680045"), markerClass: "map-marker-gather-berries" },
  { id: "gather-vegetables", labelKey: "map.categories.gatherVegetables", groupId: "gatherables", defaultVisible: false, icon: Carrot, nativeIconPath: mapItemIconPath("610680043"), markerClass: "map-marker-gather-vegetables" },
  { id: "gather-shellfish", labelKey: "map.categories.gatherShellfish", groupId: "gatherables", defaultVisible: false, icon: Shell, nativeIconPath: mapItemIconPath("610680048"), markerClass: "map-marker-gather-shellfish" },
  ...NATIVE_RESOURCE_CATEGORIES,
  { id: "native-resource", labelKey: "map.categories.native-resource", groupId: "gathering-2", defaultVisible: false, icon: Sprout, markerClass: "map-marker-gather-herbs" },
  { id: "collect-monoliths", labelKey: "map.categories.collectMonoliths", filterLabelKey: "map.categories.empyreanTraces", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900001"), markerClass: "map-marker-collect-monoliths", linkedItemLabelKey: "database.acquisition.collectedItem" },
  { id: "collect-empyrean-trace-altgard", labelKey: "map.categories.empyreanTraceAltgard", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900007"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1300865", "EnvObjData:1300891", "EnvObjData:1300892", "EnvObjData:1301134"] },
  { id: "collect-empyrean-trace-eltnen", labelKey: "map.categories.empyreanTraceEltnen", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900005"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1201511", "EnvObjData:1201512", "EnvObjData:1201513"] },
  { id: "collect-empyrean-trace-lower-reshanta", labelKey: "map.categories.empyreanTraceLowerReshanta", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900013"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1100228", "EnvObjData:1100229"] },
  { id: "collect-empyrean-trace-middle-reshanta", labelKey: "map.categories.empyreanTraceMiddleReshanta", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900013"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1100230"] },
  { id: "collect-empyrean-trace-morheim", labelKey: "map.categories.empyreanTraceMorheim", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900012"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1301228", "EnvObjData:1301229", "EnvObjData:1301230"] },
  { id: "collect-empyrean-trace-verteron", labelKey: "map.categories.empyreanTraceVerteron", groupId: "collectables", filterId: "empyrean-traces", defaultVisible: false, icon: Feather, nativeIconPath: mapItemIconPath("631900001"), filterLabelKey: "map.categories.empyreanTraces", markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1200860", "EnvObjData:1200865", "EnvObjData:1200868", "EnvObjData:1201290"] },
  { id: "collect-hidden-cube", labelKey: "map.categories.hiddenCube", filterLabelKey: "map.categories.hiddenCubes", groupId: "collectables", defaultVisible: false, icon: Gem, nativeIconPath: nativeIconPath("hidden-cube"), markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1200039", "EnvObjData:1200040", "EnvObjData:1200041", "EnvObjData:1201502", "EnvObjData:1201504", "EnvObjData:1201505", "EnvObjData:1301199", "EnvObjData:1301200", "EnvObjData:1301242", "EnvObjData:1301243"] },
  { id: "collect-treasure-chest", labelKey: "map.categories.treasureChest", filterLabelKey: "map.categories.treasureChests", groupId: "collectables", defaultVisible: false, icon: Gem, nativeIconPath: nativeIconPath("treasure-chest"), hideObjectAccessDetails: true, markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1400711", "EnvObjData:1402028", "EnvObjData:1402193"] },
  { id: "collect-precious-treasure-chest", labelKey: "map.categories.preciousTreasureChest", filterLabelKey: "map.categories.preciousTreasureChests", groupId: "collectables", defaultVisible: false, icon: Gem, nativeIconPath: nativeIconPath("precious-treasure-chest"), hideObjectAccessDetails: true, markerClass: "map-marker-collect-monoliths", sourceReferenceIds: ["EnvObjData:1400712", "EnvObjData:1402194"] },
  { id: "collect-object", labelKey: "map.categories.collectObject", groupId: "collectables", defaultVisible: false, icon: Gem, markerClass: "map-marker-collect-monoliths" },
  { id: "pet-souls", labelKey: "map.categories.petSouls", groupId: "pets", defaultVisible: false, icon: PawPrint, artwork: true, filterOnly: true, markerClass: "map-marker-collect-monoliths" },
  { id: "medical", labelKey: "map.categories.medical", groupId: "essentials", defaultVisible: true, icon: Cross, nativeIconPath: nativeIconPath("medical"), markerClass: "map-marker-medical" },
  { id: "police", labelKey: "map.categories.police", groupId: "essentials", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("police"), markerClass: "map-marker-police" },
  { id: "fire", labelKey: "map.categories.fire", groupId: "essentials", defaultVisible: true, icon: Flame, nativeIconPath: nativeIconPath("fire"), markerClass: "map-marker-fire" },
  { id: "fuel", labelKey: "map.categories.fuel", groupId: "essentials", defaultVisible: true, icon: Fuel, nativeIconPath: nativeIconPath("fuel"), markerClass: "map-marker-fuel" },
  { id: "vehicle", labelKey: "map.categories.vehicle", groupId: "essentials", defaultVisible: true, icon: Wrench, nativeIconPath: nativeIconPath("vehicle"), markerClass: "map-marker-vehicle" },
  { id: "supplies", labelKey: "map.categories.supplies", groupId: "essentials", defaultVisible: true, icon: ShoppingBasket, nativeIconPath: nativeIconPath("supplies"), markerClass: "map-marker-supplies" },
  { id: "food", labelKey: "map.categories.food", groupId: "essentials", defaultVisible: true, icon: Soup, nativeIconPath: nativeIconPath("food"), markerClass: "map-marker-food" },
  { id: "military", labelKey: "map.categories.military", groupId: "essentials", defaultVisible: true, icon: Banknote, nativeIconPath: nativeIconPath("military"), markerClass: "map-marker-military" },
  { id: "weapons", labelKey: "map.categories.weapons", groupId: "essentials", defaultVisible: true, icon: Shield, nativeIconPath: nativeIconPath("weapons"), markerClass: "map-marker-weapons" },
  { id: "industrial", labelKey: "map.categories.industrial", groupId: "essentials", defaultVisible: true, icon: Factory, nativeIconPath: nativeIconPath("industrial"), markerClass: "map-marker-industrial" },
  { id: "community", labelKey: "map.categories.community", groupId: "essentials", defaultVisible: true, icon: Landmark, nativeIconPath: nativeIconPath("community"), markerClass: "map-marker-community" },
  { id: "lodging", labelKey: "map.categories.lodging", groupId: "essentials", defaultVisible: true, icon: BedDouble, nativeIconPath: nativeIconPath("lodging"), markerClass: "map-marker-lodging" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal", defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

export interface MapFlightRingEffect {
  durationSeconds: number;
  flightSpeedIncreasePercent: number;
  flightPowerCostReductionPercent: number;
  flightPowerRecoveryPercent: number;
}

// The two client records with independently verified normal and Abyss effect profiles.
export const MAP_FLIGHT_RING_EFFECTS: Record<string, MapFlightRingEffect> = {
  "EnvObjData:1100033": { durationSeconds: 3, flightSpeedIncreasePercent: 150, flightPowerCostReductionPercent: 100, flightPowerRecoveryPercent: 100 },
  "EnvObjData:1100016": { durationSeconds: 3, flightSpeedIncreasePercent: 150, flightPowerCostReductionPercent: 100, flightPowerRecoveryPercent: 50 },
};

const HIDDEN_MAP_CATEGORY_IDS = new Set(["npc"]);
export const isMapCategoryAvailable = (categoryId: string) => !HIDDEN_MAP_CATEGORY_IDS.has(categoryId);

export const FILTER_CATEGORY_GROUPS = MAP_CATEGORY_GROUPS.filter(({ showInFilters }) => showInFilters !== false);
export const FILTER_CATEGORIES = MAP_CATEGORIES.filter(({ id, groupId }) =>
  id !== "pet-souls" && isMapCategoryAvailable(id) && FILTER_CATEGORY_GROUPS.some(({ id }) => id === groupId));

export interface MapFilterCategory {
  category: MapCategoryConfig;
  ids: string[];
  label?: string;
}

export const getPetFilterCategory = (pet: MapPetSource): MapFilterCategory => ({
  category: {
    id: petFilterId(pet.id), labelKey: "", groupId: "pets", defaultVisible: false,
    icon: PawPrint, nativeIconPath: pet.icon, artwork: true, filterOnly: true,
    markerClass: "map-marker-collect-monoliths",
  },
  ids: [petFilterId(pet.id)],
  label: pet.name,
});

const filterCategoriesById = new Map<string, MapFilterCategory>();
for (const category of FILTER_CATEGORIES) {
  const filterId = category.filterId ?? category.id;
  const row = filterCategoriesById.get(filterId);
  if (row) row.ids.push(category.id);
  else filterCategoriesById.set(filterId, { category, ids: [category.id] });
}
export const FILTER_CATEGORY_ROWS = [...filterCategoriesById.values()];

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

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "home", labelKey: "map.markerStyle.icons.home", icon: House },
  { id: "flag", labelKey: "map.markerStyle.icons.flag", icon: Flag },
  { id: "vehicle", labelKey: "map.markerStyle.icons.vehicle", icon: Truck },
  { id: "supplies", labelKey: "map.markerStyle.icons.supplies", icon: ShoppingBasket },
  { id: "danger", labelKey: "map.markerStyle.icons.danger", icon: Skull },
  ...FILTER_CATEGORY_ROWS.map(({ category }) => ({
    id: `category:${category.id}` as const,
    labelKey: category.filterLabelKey ?? category.labelKey,
    icon: category.icon,
    nativeIconPath: category.nativeIconPath,
    serviceArt: category.markerClass.includes("map-service-art"),
  })),
];

export const getCategoryConfig = (categoryId: string) =>
  MAP_CATEGORIES.find((category) => category.id === categoryId) ?? MAP_CATEGORIES.at(-1)!;

export const getPointTooltipOffsetY = (point: MapPoint) =>
  point.category === "boss" ? 16 : 0;

export const getPointFilterCategories = (point: MapPoint): string[] =>
  [point.category, ...getMapPetSources(point).map(({ id }) => petFilterId(id))];

export const isCategoryArtwork = (category: MapCategoryConfig) =>
  category.artwork === true || category.groupId === "gatherables" || category.groupId === "collectables";

export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (!isUserMapMarker(point)) {
    const useCategoryIcon = point.category === "boss" || point.category === "dungeon-boss" || point.category === "enemy"
      || point.category === "teleport"
      || category.showInstanceEntranceDetails === true || point.category === "event-entrance"
      || point.category === "npc" || point.category === "quest-npc";
    const itemIconPath = !useCategoryIcon && point.itemId ? mapItemIconPath(point.itemId) : undefined;
    const candyColorClass = point.category === "event-object" && ["red", "yellow", "blue"].includes(point.subtype)
      ? ` map-marker-event-candy-${point.subtype}` : "";
    return {
      icon: category.icon,
      nativeIconPath: (!useCategoryIcon && point.iconPath ? contentUrl(point.iconPath) : undefined)
        ?? (itemIconPath ? contentUrl(itemIconPath) : undefined)
        ?? (category.nativeIconPath ? contentUrl(category.nativeIconPath) : undefined),
      markerClass: `${category.markerClass ?? ""}${candyColorClass}`,
      markerSize: category.markerSize ?? markerSizeByGroup.get(category.groupId),
      markerPriority: category.markerPriority ?? markerPriorityByGroup.get(category.groupId) ?? MARKER_PRIORITY.other,
      itemArt: (!useCategoryIcon && !!point.iconPath) || isCategoryArtwork(category),
    };
  }
  const selectedIcon = USER_MARKER_ICONS.find((item) => item.id === point.icon);
  return {
    icon: selectedIcon?.icon ?? MapPin,
    nativeIconPath: selectedIcon?.nativeIconPath ? contentUrl(selectedIcon.nativeIconPath) : undefined,
    markerClass: `${USER_MARKER_COLORS.find((item) => item.id === point.color)?.markerClass ?? category.markerClass}${selectedIcon?.serviceArt ? " map-service-art" : ""}`,
    markerSize: undefined,
    markerPriority: MARKER_PRIORITY.other,
    itemArt: false,
  };
};

const SOURCE_CATEGORY_GROUPS: Record<string, MapCategoryGroupId> = {
  "collect-object": "collectables",
  "instance-entrance": "dungeons",
  "native-resource": "gathering-2",
};

/** Split only the intended map layer; reference details can still look up by ID alone. */
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string) => {
  if (!referenceId) return undefined;
  const groupId = sourceCategoryId === undefined ? undefined : SOURCE_CATEGORY_GROUPS[sourceCategoryId];
  if (sourceCategoryId !== undefined && !groupId) return undefined;
  return MAP_CATEGORIES.find((category) => (!groupId || category.groupId === groupId)
    && category.sourceReferenceIds?.includes(referenceId));
};

/** Preserve visibility when former combined filters are split. */
export const migrateCategorySelection = (ids: string[], includeSplitEntrances = false) => [...new Set(ids.flatMap((id) => {
  if (id === "instance-entrance" && includeSplitEntrances) return [id, "stronghold"];
  if (id === "collect-object") return MAP_CATEGORIES
    .filter((category) => category.groupId === "collectables" && category.sourceReferenceIds)
    .map((category) => category.id);
  if (id === "native-resource") return [id, ...NATIVE_RESOURCE_CATEGORIES.map((category) => category.id)];
  return [id];
}))];
