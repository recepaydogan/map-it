import { Anchor, Anvil, ArrowUpDown, BedDouble, BookOpen, CircleAlert, Coins, Cross, DoorOpen, Fish, Flag, Gem, Leaf,
  GraduationCap, Hammer, House, Landmark, LogOut, Mail, MapPin, PawPrint, Pickaxe, Plane,
  RefreshCcw, Scale, Scissors, ShoppingBag, Shirt, Skull,
  Sparkles, Swords, UserRound, UsersRound, Vault, type LucideIcon } from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerIcon } from "./types";
import { contentUrl } from "../../lib/content-url";

export interface MapCategoryConfig {
  id: string; labelKey: string; filterLabelKey?: string; groupId: MapCategoryGroupId;
  defaultVisible: boolean; icon: LucideIcon; nativeIconPath?: string;
  tooltipCategoryOnly?: boolean;
  preferCategoryIcon?: boolean;
  sourceReferenceIds?: string[]; filterId?: string; hideObjectAccessDetails?: boolean;
  artwork?: boolean; markerClass: string; linkedItemLabelKey?: string;
  routeLinkGroupKey?: string; routeLinksTitleKey?: string;
}
export type MapCategoryGroupId = "progression" | "dungeons" | "teleportation" | "places" | "class-trainers" | "profession-trainers" | "npcs" | "vendors" | "pvp" | "enemies" | "hunter-pets" | "herbs" | "mining" | "fishing" | "cloth" | "leather" | "collectables" | "personal";
export type MapFilterFocusRequest = { categoryId: string; requestId: number };
export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId; labelKey: string; icon: LucideIcon;
  defaultExpanded: boolean; showInFilters?: boolean;
}
export interface UserMarkerIconConfig { id: UserMarkerIcon; labelKey: string; icon: LucideIcon; nativeIconPath?: string; }

const trackingIcon = (name: string) => contentUrl(`maps/client-icons/tracking/${name}.png`);
const atlasIcon = (name: string) => contentUrl(`maps/client-icons/atlas/${name}.png`);
const mapgenieIcon = (name: string) => contentUrl(`maps/client-icons/mapgenie-${name}.svg`);

const FOREVER_GATHERABLE_TYPES = [
  ["herb-arthas-tears", "inv_misc_herb_13"],
  ["herb-black-lotus", "inv_misc_herb_blacklotus"],
  ["herb-blindweed", "inv_misc_herb_14"],
  ["herb-briarthorn", "inv_misc_root_01"],
  ["herb-bruiseweed", "inv_misc_herb_01"],
  ["herb-demonsage", "inv_misc_herb_mountainsilversage"],
  ["herb-dreamfoil", "inv_misc_herb_dreamfoil"],
  ["herb-earthroot", "inv_misc_herb_07"],
  ["herb-fadeleaf", "inv_misc_herb_12"],
  ["herb-firebloom", "inv_misc_herb_19"],
  ["herb-ghost-mushroom", "inv_mushroom_08"],
  ["herb-golden-sansam", "inv_misc_herb_sansamroot"],
  ["herb-goldthorn", "inv_misc_herb_15"],
  ["herb-grave-moss", "inv_misc_dust_02"],
  ["herb-gromsblood", "inv_misc_herb_16"],
  ["herb-icecap", "inv_misc_herb_icecap"],
  ["herb-khadgar-s-whisker", "inv_misc_herb_08"],
  ["herb-kingsblood", "inv_misc_herb_03"],
  ["herb-liferoot", "inv_misc_root_02"],
  ["herb-mageroyal", "inv_jewelry_talisman_03"],
  ["herb-mountain-silversage", "inv_misc_herb_mountainsilversage"],
  ["herb-peacebloom", "inv_misc_flower_02"],
  ["herb-plaguebloom", "inv_misc_herb_plaguebloom"],
  ["herb-purple-lotus", "inv_misc_herb_17"],
  ["herb-silverleaf", "inv_misc_herb_10"],
  ["herb-stranglekelp", "inv_misc_herb_11"],
  ["herb-stunted-silverleaf", "inv_misc_herb_10"],
  ["herb-sungrass", "inv_misc_herb_18"],
  ["herb-wild-steelbloom", "inv_misc_flower_01"],
  ["herb-wilted-peacebloom", "inv_misc_flower_02"],
  ["herb-wintersbite", "inv_misc_flower_03"],
  ["ore-chunk-of-amber", "inv_stone_06"],
  ["ore-copper-vein", "inv_ore_copper_01"],
  ["ore-dark-iron-deposit", "inv_ore_mithril_01"],
  ["ore-gold-vein", "inv_ore_copper_01"],
  ["ore-heavy-thorium-vein", "inv_ore_oxxein"],
  ["ore-spectral-iron-deposit", "inv_ore_ghostiron"],
  ["ore-incendicite-mineral-vein", "inv_ore_thorium_01"],
  ["ore-iron-deposit", "inv_ore_iron_01"],
  ["ore-large-chunk-of-amber", "inv_ore_copper_01"],
  ["ore-large-obsidian-chunk", "inv_stone_15"],
  ["ore-lesser-bloodstone-deposit", "inv_ore_thorium_01"],
  ["ore-mithril-deposit", "inv_ore_mithril_02"],
  ["ore-ooze-covered-gold-vein", "inv_ore_copper_01"],
  ["ore-ooze-covered-mithril-deposit", "inv_ore_mithril_02"],
  ["ore-ooze-covered-rich-thorium-vein", "inv_ore_thorium_02"],
  ["ore-ooze-covered-silver-vein", "inv_stone_16"],
  ["ore-ooze-covered-thorium-vein", "inv_ore_thorium_02"],
  ["ore-ooze-covered-truesilver-deposit", "inv_ore_truesilver_01"],
  ["ore-poor-copper-vein", "inv_ore_copper_01"],
  ["ore-rich-thorium-vein", "inv_ore_thorium_02"],
  ["ore-silver-vein", "inv_stone_16"],
  ["ore-small-obsidian-chunk", "inv_misc_stonetablet_01"],
  ["ore-small-thorium-vein", "inv_ore_thorium_02"],
  ["ore-tin-vein", "inv_ore_tin_01"],
  ["ore-truesilver-deposit", "inv_ore_truesilver_01"],
] as const;

const FOREVER_NEW_GATHERABLE_TYPES = [
  ["fish-elemental-water", "inv_potion_03"],
  ["fish-essence-of-water", "spell_nature_acid_01"],
  ["fish-globe-of-water", "inv_misc_orb_01"],
  ["fish-big-mouth-clam", "inv_misc_shell_03"],
  ["fish-darkclaw-lobster", "inv_misc_fish_14"],
  ["fish-deviate-fish", "inv_misc_monsterhead_01"],
  ["fish-whimsyfin", "inv_misc_fish_68"],
  ["fish-firefin-snapper", "inv_misc_monsterhead_01"],
  ["fish-large-raw-mightfish", "inv_misc_monsterhead_02"],
  ["fish-lightning-eel", "inv_misc_fish_12"],
  ["fish-oily-blackmouth", "inv_misc_monsterhead_04"],
  ["fish-raw-brilliant-smallfish", "inv_misc_fish_08"],
  ["fish-raw-bristle-whisker-catfish", "inv_misc_fish_30"],
  ["fish-raw-glossy-mightfish", "inv_misc_monsterhead_03"],
  ["fish-raw-greater-sagefish", "inv_misc_fish_21"],
  ["fish-raw-loch-frenzy", "inv_misc_fish_03"],
  ["fish-raw-longjaw-mud-snapper", "inv_misc_fish_32"],
  ["fish-raw-mithril-head-trout", "inv_misc_fish_02"],
  ["fish-raw-nightfin-snapper", "inv_misc_fish_23"],
  ["fish-raw-plated-armorfish", "inv_misc_fish_04"],
  ["fish-raw-rainbow-fin-albacore", "inv_misc_fish_25"],
  ["fish-raw-redgill", "inv_misc_fish_06"],
  ["fish-raw-rockscale-cod", "inv_misc_fish_04"],
  ["fish-raw-sagefish", "inv_misc_fish_20"],
  ["fish-raw-slitherskin-mackerel", "inv_misc_fish_24"],
  ["fish-raw-spotted-yellowtail", "inv_misc_fish_01"],
  ["fish-raw-summer-bass", "inv_misc_fish_03"],
  ["fish-raw-sunscale-salmon", "inv_misc_fish_19"],
  ["fish-raw-whitescale-salmon", "inv_misc_fish_20"],
  ["fish-raw-winter-squid", "inv_misc_fish_13"],
  ["fish-stonescale-eel", "inv_misc_fish_11"],
  ["fish-stranglekelp", "inv_misc_herb_11"],
  ["cloth-linen-cloth", "inv_fabric_linen_01"],
  ["cloth-wool-cloth", "inv_fabric_wool_01"],
  ["cloth-silk-cloth", "inv_fabric_silk_01"],
  ["cloth-mageweave-cloth", "inv_fabric_mageweave_01"],
  ["cloth-runecloth", "inv_fabric_purplefire_01"],
  ["leather-light-leather", "inv_misc_leatherscrap_03"],
  ["leather-medium-leather", "inv_misc_leatherscrap_05"],
  ["leather-heavy-leather", "inv_misc_leatherscrap_07"],
  ["leather-thick-leather", "inv_misc_leatherscrap_08"],
  ["leather-rugged-leather", "inv_misc_leatherscrap_02"],
] as const;

// Groups and panels stay available for new game data.
export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "progression", labelKey: "map.categoryGroups.progression", icon: Flag, defaultExpanded: true },
  { id: "dungeons", labelKey: "map.categoryGroups.dungeons", icon: DoorOpen, defaultExpanded: true },
  { id: "enemies", labelKey: "map.categoryGroups.enemies", icon: Skull, defaultExpanded: true },
  { id: "class-trainers", labelKey: "map.categoryGroups.classTrainers", icon: GraduationCap, defaultExpanded: true },
  { id: "profession-trainers", labelKey: "map.categoryGroups.professionTrainers", icon: Hammer, defaultExpanded: true },
  { id: "teleportation", labelKey: "map.categoryGroups.teleportation", icon: Anchor, defaultExpanded: true },
  { id: "npcs", labelKey: "map.categoryGroups.npcs", icon: UsersRound, defaultExpanded: true },
  { id: "vendors", labelKey: "map.categoryGroups.vendors", icon: ShoppingBag, defaultExpanded: true },
  { id: "pvp", labelKey: "map.categoryGroups.pvp", icon: Swords, defaultExpanded: false },
  { id: "hunter-pets", labelKey: "map.categoryGroups.hunterPets", icon: PawPrint, defaultExpanded: false },
  { id: "herbs", labelKey: "map.categoryGroups.herbs", icon: Leaf, defaultExpanded: false },
  { id: "mining", labelKey: "map.categoryGroups.mining", icon: Pickaxe, defaultExpanded: false },
  { id: "fishing", labelKey: "map.categoryGroups.fishing", icon: Fish, defaultExpanded: false },
  { id: "cloth", labelKey: "map.categoryGroups.cloth", icon: Shirt, defaultExpanded: false },
  { id: "leather", labelKey: "map.categoryGroups.leather", icon: PawPrint, defaultExpanded: false },
  { id: "collectables", labelKey: "map.categoryGroups.collectables", icon: Gem, defaultExpanded: false },
  { id: "places", labelKey: "map.categoryGroups.places", icon: Landmark, defaultExpanded: false },
  { id: "personal", labelKey: "map.custom.personal", icon: MapPin, defaultExpanded: false, showInFilters: false },
];
const HUNTER_PET_ICONS: Record<string, string> = {
  bat: "ability_hunter_pet_bat", bear: "ability_hunter_pet_bear", "bird-of-prey": "ability_hunter_pet_owl",
  boar: "ability_hunter_pet_boar", "carrion-bird": "ability_hunter_pet_vulture", cat: "ability_hunter_pet_cat",
  crab: "ability_hunter_pet_crab", crocolisk: "ability_hunter_pet_crocolisk", fox: "ability_hunter_aspectofthefox",
  gorilla: "ability_hunter_pet_gorilla", raptor: "ability_hunter_pet_raptor", spider: "ability_hunter_pet_spider",
  hyena: "ability_hunter_pet_hyena", scorpid: "ability_hunter_pet_scorpid",
  tallstrider: "ability_hunter_pet_tallstrider", turtle: "ability_hunter_pet_turtle", wolf: "ability_hunter_pet_wolf",
  "wind-serpent": "ability_hunter_pet_windserpent",
};
export const MAP_CATEGORIES: MapCategoryConfig[] = [
  ...["bat", "bear", "bird-of-prey", "boar", "carrion-bird", "cat", "crab", "crocolisk", "fox", "gorilla", "hyena", "raptor", "scorpid", "spider", "tallstrider", "turtle", "wind-serpent", "wolf"].map((family): MapCategoryConfig => ({
    id: `hunter-pet-${family}`, labelKey: `map.hunterPets.${family}`, groupId: "hunter-pets",
    defaultVisible: false, icon: PawPrint, nativeIconPath: HUNTER_PET_ICONS[family]
      ? contentUrl(`data/items/site-icons/${HUNTER_PET_ICONS[family]}.jpg`) : mapgenieIcon("stable-master"), artwork: true,
    markerClass: "map-marker-service map-marker-mapgenie",
  })),
  { id: "quest", labelKey: "map.categories.quest", filterLabelKey: "map.categories.quests", groupId: "progression", defaultVisible: false, icon: CircleAlert, nativeIconPath: mapgenieIcon("quest"), artwork: true, markerClass: "map-marker-progression map-marker-mapgenie map-marker-quest" },
  { id: "repeatable-quest", labelKey: "map.categories.repeatableQuest", filterLabelKey: "map.categories.repeatableQuests", groupId: "progression", defaultVisible: true, icon: RefreshCcw, preferCategoryIcon: true, nativeIconPath: mapgenieIcon("repeatable-quest"), artwork: true, markerClass: "map-marker-progression map-marker-mapgenie map-marker-quest map-marker-repeatable-quest" },
  { id: "dungeon-quest", labelKey: "map.categories.dungeonQuest", filterLabelKey: "map.categories.dungeonQuests", groupId: "progression", defaultVisible: true, icon: CircleAlert, nativeIconPath: mapgenieIcon("quest"), artwork: true, markerClass: "map-marker-progression map-marker-mapgenie map-marker-quest" },
  { id: "quest-area", labelKey: "map.categories.questArea", groupId: "progression", defaultVisible: false, icon: Flag, markerClass: "map-marker-progression" },
  { id: "npc", labelKey: "map.categories.npc", filterLabelKey: "map.categories.questGivers", groupId: "progression", defaultVisible: true, icon: UserRound, nativeIconPath: contentUrl("maps/client-icons/quest-npc.png"), artwork: true, preferCategoryIcon: true, markerClass: "map-marker-merchant map-marker-quest-giver" },
  { id: "dungeon", labelKey: "map.categories.dungeon", filterLabelKey: "map.categories.dungeons", groupId: "dungeons", defaultVisible: true, icon: DoorOpen, preferCategoryIcon: true, nativeIconPath: mapgenieIcon("dungeon"), artwork: true, markerClass: "map-marker-dungeon map-marker-mapgenie" },
  { id: "dungeon-door", labelKey: "dungeonJournal.mapDoors.navigation", groupId: "dungeons", defaultVisible: false, icon: DoorOpen, markerClass: "map-marker-dungeon" },
  { id: "raid", labelKey: "map.categories.raid", filterLabelKey: "map.categories.raids", groupId: "dungeons", defaultVisible: true, icon: DoorOpen, preferCategoryIcon: true, nativeIconPath: mapgenieIcon("dungeon"), artwork: true, markerClass: "map-marker-dungeon map-marker-mapgenie" },
  { id: "flight-master", labelKey: "map.categories.flightMaster", filterLabelKey: "map.categories.flightMasters", groupId: "teleportation", defaultVisible: true, icon: Plane, nativeIconPath: trackingIcon("flight-master"), artwork: true, markerClass: "map-marker-service map-service-art", routeLinksTitleKey: "map.flightPoints.connections" },
  { id: "transport", labelKey: "map.categories.transport", groupId: "teleportation", defaultVisible: true, icon: Anchor, preferCategoryIcon: true, markerClass: "map-marker-transport", routeLinkGroupKey: "map.transportStops.routeStops" },
  { id: "portal", labelKey: "map.categories.portal", groupId: "teleportation", defaultVisible: false, icon: Sparkles, markerClass: "map-marker-travel" },
  { id: "teleport", labelKey: "map.categories.teleport", groupId: "teleportation", defaultVisible: false, icon: Sparkles, markerClass: "map-marker-travel" },
  { id: "city", labelKey: "map.categories.city", filterLabelKey: "map.categories.cities", groupId: "places", defaultVisible: true, icon: Landmark, nativeIconPath: atlasIcon("poi-majorcity"), artwork: true, markerClass: "map-marker-community map-place-art" },
  { id: "town", labelKey: "map.categories.town", filterLabelKey: "map.categories.towns", groupId: "places", defaultVisible: true, icon: House, nativeIconPath: atlasIcon("poi-town"), artwork: true, markerClass: "map-marker-community map-place-art" },
  { id: "graveyard", labelKey: "map.categories.graveyard", filterLabelKey: "map.categories.graveyards", groupId: "places", defaultVisible: true, icon: Cross, nativeIconPath: mapgenieIcon("graveyard"), artwork: true, markerClass: "map-marker-travel map-marker-mapgenie" },
  { id: "battlemaster", labelKey: "map.categories.battlemaster", groupId: "npcs", defaultVisible: true, icon: Swords, nativeIconPath: trackingIcon("battle-master"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-service-art" },
  { id: "point-of-interest", labelKey: "map.categories.pointOfInterest", groupId: "places", defaultVisible: false, icon: MapPin, markerClass: "map-marker-community map-marker-point-of-interest" },
  { id: "merchant", labelKey: "map.categories.merchant", groupId: "vendors", defaultVisible: true, icon: ShoppingBag, nativeIconPath: mapgenieIcon("merchant"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "auctioneer", labelKey: "map.categories.auctioneer", filterLabelKey: "map.categories.auctioneers", groupId: "npcs", defaultVisible: true, icon: Scale, nativeIconPath: mapgenieIcon("auctioneer"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "banker", labelKey: "map.categories.banker", filterLabelKey: "map.categories.bankers", groupId: "npcs", defaultVisible: true, icon: Coins, nativeIconPath: mapgenieIcon("banker"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "bank", labelKey: "map.categories.bank", filterLabelKey: "map.categories.banks", groupId: "npcs", defaultVisible: true, icon: Landmark, nativeIconPath: trackingIcon("banker"), artwork: true, markerClass: "map-marker-service map-service-art" },
  { id: "bank-sign", labelKey: "map.categories.bankSign", filterLabelKey: "map.places.bankSigns", groupId: "npcs", defaultVisible: true, icon: Landmark, nativeIconPath: trackingIcon("banker"), artwork: true, markerClass: "map-marker-service map-service-art" },
  { id: "repair-vendor", labelKey: "map.categories.repairVendor", filterLabelKey: "map.categories.repairVendors", groupId: "vendors", defaultVisible: true, icon: Anvil, nativeIconPath: mapgenieIcon("repair-vendor"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "class-trainer", labelKey: "map.categories.classTrainer", filterLabelKey: "map.categories.classTrainers", groupId: "class-trainers", defaultVisible: true, icon: GraduationCap, nativeIconPath: contentUrl("maps/client-icons/class-trainers/default.svg"), artwork: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "profession-trainer", labelKey: "map.categories.professionTrainer", filterLabelKey: "map.categories.professionTrainers", groupId: "profession-trainers", defaultVisible: true, icon: Hammer, nativeIconPath: mapgenieIcon("profession-trainer"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "barber-shop", labelKey: "map.categories.barberShop", filterLabelKey: "map.categories.barberShops", groupId: "npcs", defaultVisible: true, icon: Scissors, nativeIconPath: mapgenieIcon("barber-shop"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "transmogrifier", labelKey: "map.categories.transmogrifier", filterLabelKey: "map.categories.transmogrifiers", groupId: "npcs", defaultVisible: true, icon: Shirt, nativeIconPath: mapgenieIcon("transmogrifier"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "stable-master", labelKey: "map.categories.stableMaster", filterLabelKey: "map.categories.stableMasters", groupId: "npcs", defaultVisible: true, icon: PawPrint, nativeIconPath: mapgenieIcon("stable-master"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "innkeeper", labelKey: "map.categories.innkeeper", filterLabelKey: "map.categories.innkeepers", groupId: "npcs", defaultVisible: true, icon: BedDouble, nativeIconPath: mapgenieIcon("innkeeper"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "ammunition-vendor", labelKey: "map.categories.ammunitionVendor", groupId: "vendors", defaultVisible: false, icon: ShoppingBag, nativeIconPath: trackingIcon("ammunition"), artwork: true, markerClass: "map-marker-service map-service-art" },
  { id: "reagent-vendor", labelKey: "map.categories.reagentVendor", groupId: "vendors", defaultVisible: false, icon: ShoppingBag, nativeIconPath: trackingIcon("reagents"), artwork: true, markerClass: "map-marker-service map-service-art" },
  { id: "mailbox", labelKey: "map.categories.mailbox", filterLabelKey: "map.categories.mailboxes", groupId: "npcs", defaultVisible: true, icon: Mail, nativeIconPath: mapgenieIcon("mailbox"), artwork: true, tooltipCategoryOnly: true, markerClass: "map-marker-service map-marker-mapgenie" },
  { id: "guild-vault", labelKey: "map.categories.guildVault", groupId: "npcs", defaultVisible: true, icon: Vault, nativeIconPath: trackingIcon("banker"), artwork: true, markerClass: "map-marker-service map-service-art" },
  { id: "battleground-objective", labelKey: "map.categories.battlegroundObjective", filterLabelKey: "map.categories.battlegroundObjectives", groupId: "pvp", defaultVisible: true, icon: Flag, markerClass: "map-marker-progression" },
  { id: "rare", labelKey: "map.categories.rare", groupId: "enemies", defaultVisible: true, icon: Skull, nativeIconPath: contentUrl("maps/client-icons/rare-creature.png"), artwork: true, markerClass: "map-marker-rare map-marker-mapgenie" },
  { id: "rare-elite", labelKey: "map.categories.rareElite", groupId: "enemies", defaultVisible: true, icon: Skull, nativeIconPath: contentUrl("maps/client-icons/rare-creature.png"), artwork: true, markerClass: "map-marker-rare map-marker-mapgenie" },
  { id: "boss", labelKey: "map.categories.boss", groupId: "enemies", defaultVisible: false, icon: Skull, markerClass: "map-marker-boss" },
  { id: "enemy", labelKey: "map.categories.enemy", groupId: "enemies", defaultVisible: false, icon: Swords, markerClass: "map-marker-enemy" },
  { id: "gatherable", labelKey: "map.categories.gatherable", groupId: "herbs", defaultVisible: false, icon: Pickaxe, markerClass: "map-marker-gather-herbs" },
  { id: "gatherable-herb", labelKey: "map.categories.gatherableHerbs", groupId: "herbs", defaultVisible: false, icon: Leaf, nativeIconPath: contentUrl("maps/client-icons/gathering/herbs.png"), artwork: true, markerClass: "map-marker-gather-herbs" },
  { id: "gatherable-ore", labelKey: "map.categories.gatherableOre", groupId: "mining", defaultVisible: false, icon: Pickaxe, nativeIconPath: contentUrl("maps/client-icons/gathering/ore-veins.png"), artwork: true, markerClass: "map-marker-gather-metal-ore" },
  { id: "gatherable-wilted-peacebloom", labelKey: "map.categories.wiltedPeacebloom", groupId: "herbs", defaultVisible: false, icon: Leaf, nativeIconPath: contentUrl("maps/client-icons/gathering/herbs.png"), artwork: true, markerClass: "map-marker-gather-herbs" },
  { id: "gatherable-stunted-silverleaf", labelKey: "map.categories.stuntedSilverleaf", groupId: "herbs", defaultVisible: false, icon: Leaf, nativeIconPath: contentUrl("maps/client-icons/gathering/silverleaf.png"), artwork: true, markerClass: "map-marker-gather-herbs" },
  { id: "gatherable-chunk-of-amber", labelKey: "map.categories.chunkOfAmber", groupId: "mining", defaultVisible: false, icon: Pickaxe, nativeIconPath: contentUrl("maps/client-icons/gathering/chunk-of-amber.png"), artwork: true, markerClass: "map-marker-gather-metal-ore" },
  { id: "gatherable-large-chunk-of-amber", labelKey: "map.categories.largeChunkOfAmber", groupId: "mining", defaultVisible: false, icon: Pickaxe, nativeIconPath: contentUrl("maps/client-icons/gathering/chunk-of-amber.png"), artwork: true, markerClass: "map-marker-gather-metal-ore" },
  { id: "gatherable-poor-copper-vein", labelKey: "map.categories.poorCopperVein", groupId: "mining", defaultVisible: false, icon: Pickaxe, nativeIconPath: contentUrl("maps/client-icons/gathering/ore-veins.png"), artwork: true, markerClass: "map-marker-gather-metal-ore" },
  ...FOREVER_GATHERABLE_TYPES.map(([key, image]) => ({
    id: `gatherable-${key}`, labelKey: `map.gatherableTypes.${key}`,
    groupId: key.startsWith("herb-") ? "herbs" as const : "mining" as const, defaultVisible: false,
    icon: key.startsWith("herb-") ? Leaf : Pickaxe,
    nativeIconPath: contentUrl(`data/items/site-icons/${image}.jpg`), artwork: true,
    markerClass: key.startsWith("herb-") ? "map-marker-gather-herbs" : "map-marker-gather-metal-ore",
  })),
  ...FOREVER_NEW_GATHERABLE_TYPES.map(([key, image]) => {
    const groupId = key.startsWith("fish-") ? "fishing" as const
      : key.startsWith("cloth-") ? "cloth" as const : "leather" as const;
    return { id: `gatherable-${key}`, labelKey: `map.gatherableTypes.${key}`,
      groupId, defaultVisible: false,
      icon: groupId === "fishing" ? Fish : groupId === "cloth" ? Shirt : PawPrint,
      nativeIconPath: contentUrl(`data/items/site-icons/${image}.jpg`), artwork: true,
      markerClass: "map-marker-gather-herbs" };
  }),
  { id: "treasure", labelKey: "map.categories.treasure", groupId: "collectables", defaultVisible: true, icon: Gem, nativeIconPath: mapgenieIcon("treasure"), artwork: true, markerClass: "map-marker-collect-monoliths map-marker-mapgenie" },
  { id: "book", labelKey: "map.categories.book", filterLabelKey: "map.categories.books", groupId: "collectables", defaultVisible: true, icon: BookOpen, nativeIconPath: contentUrl("data/items/site-icons/inv_misc_book_12.jpg"), artwork: true, markerClass: "map-marker-collect-monoliths" },
  { id: "collectable", labelKey: "map.categories.collectable", groupId: "collectables", defaultVisible: false, icon: Gem, markerClass: "map-marker-collect-monoliths" },
  { id: "ley-line", labelKey: "map.categories.leyLine", filterLabelKey: "map.categories.leyLines", groupId: "collectables", defaultVisible: false, icon: Sparkles, nativeIconPath: contentUrl("data/spells/icons/236219.webp"), artwork: true, markerClass: "map-marker-collect-monoliths map-marker-icon-only" },
  { id: "elemental-convergence", labelKey: "map.categories.elementalConvergence", filterLabelKey: "map.categories.elementalConvergences", groupId: "collectables", defaultVisible: false, icon: Sparkles, nativeIconPath: contentUrl("data/spells/icons/1029587.webp"), artwork: true, markerClass: "map-marker-collect-monoliths map-marker-icon-only" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal", defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

// Higher entries win when marker icons overlap. Keep this independent from
// filter order so changing the sidebar cannot change map hit targets.
const MAP_MARKER_PRIORITY_ORDER = [
  ["custom"],
  ["raid"],
  ["dungeon"],
  ["portal", "teleport"],
  ["flight-master"],
  ["transport"],
  ["graveyard"],
  ["boss"],
  ["rare", "rare-elite"],
  ["battleground-objective"],
  ["class-trainer"],
  ["profession-trainer"],
  ["quest", "dungeon-quest"],
  ["repeatable-quest"],
  ["npc"],
  ["quest-area"],
  ["gatherable", "gatherable-herb", "gatherable-ore", "gatherable-wilted-peacebloom", "gatherable-stunted-silverleaf", "gatherable-chunk-of-amber", "gatherable-large-chunk-of-amber", "gatherable-poor-copper-vein"],
  ["treasure"],
  ["book"],
  ["innkeeper"],
  ["battlemaster"],
  ["auctioneer"],
  ["bank", "banker"],
  ["merchant"],
  ["repair-vendor"],
  ["stable-master"],
  ["mailbox", "guild-vault"],
  ["barber-shop", "transmogrifier"],
  ["collectable", "ley-line", "elemental-convergence"],
  ["enemy"],
  ["bank-sign"],
  ["city"],
  ["town"],
  ["point-of-interest"],
] as const;
const MAP_MARKER_PRIORITY = new Map<string, number>(MAP_MARKER_PRIORITY_ORDER.flatMap((categories, index) =>
  categories.map((category) => [category, MAP_MARKER_PRIORITY_ORDER.length - index] as const)));
export const getMapMarkerPriority = (category: string): number =>
  MAP_MARKER_PRIORITY.get(category)
    ?? (category.startsWith("gatherable-")
      ? MAP_MARKER_PRIORITY.get("gatherable-herb")! : 1);

export interface MapFlightRingEffect { durationSeconds: number; flightSpeedIncreasePercent: number; flightPowerCostReductionPercent: number; flightPowerRecoveryPercent: number; }
export const MAP_FLIGHT_RING_EFFECTS: Record<string, MapFlightRingEffect> = {};
export const FILTER_CATEGORY_GROUPS = MAP_CATEGORY_GROUPS.filter(({ showInFilters }) => showInFilters !== false);
export const FILTER_CATEGORIES = MAP_CATEGORIES.filter(({ id, groupId }) => id !== "quest"
  && id !== "quest-area" && id !== "point-of-interest"
  && FILTER_CATEGORY_GROUPS.some((group) => group.id === groupId));
export const FOREVER_GATHERABLE_CATEGORY_IDS = [...FOREVER_GATHERABLE_TYPES, ...FOREVER_NEW_GATHERABLE_TYPES]
  .map(([key]) => `gatherable-${key}`);
export const ZONES_FILTER_GROUP = { id: "zones", labelKey: "map.categoryGroups.zones", defaultExpanded: false } as const;
export type MapFilterGroupId = MapCategoryGroupId | typeof ZONES_FILTER_GROUP.id;
export type MapFilterCategory = {
  category: Omit<MapCategoryConfig, "groupId" | "defaultVisible"> & { groupId: MapFilterGroupId };
  ids: string[];
};
export const FILTER_CATEGORY_ROWS: MapFilterCategory[] = FILTER_CATEGORIES
  .filter(({ id }) => id !== "bank-sign")
  .map((category) => ({ category,
    ids: category.id === "bank" ? ["bank", "bank-sign"] : [category.id] }));
// First-launch visibility follows the expanded sections, including every filter
// in those sections. Later expansion and marker selections remain independent.
export const DEFAULT_CATEGORY_IDS = FILTER_CATEGORY_ROWS
  .filter(({ category }) => MAP_CATEGORY_GROUPS.some(({ id, defaultExpanded }) =>
    id === category.groupId && defaultExpanded))
  .flatMap(({ ids }) => ids);
const USER_MARKER_ICON_CATEGORY_IDS = [
  "city", "town", "dungeon", "graveyard", "innkeeper", "merchant", "auctioneer",
  "banker", "bank", "repair-vendor", "profession-trainer", "class-trainer",
  "barber-shop", "transmogrifier", "battlemaster", "flight-master", "quest",
  "repeatable-quest", "treasure", "mailbox", "stable-master", "boss",
] as const satisfies readonly UserMarkerIcon[];

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  ...USER_MARKER_ICON_CATEGORY_IDS.map((id) => {
    const category = MAP_CATEGORIES.find((item) => item.id === id)!;
    return { id, labelKey: category.labelKey, icon: category.icon, nativeIconPath: category.nativeIconPath };
  }),
];

const LEGACY_USER_MARKER_ICON_ALIASES: Partial<Record<UserMarkerIcon, UserMarkerIcon>> = {
  home: "town",
  flag: "quest",
  vehicle: "flight-master",
  supplies: "merchant",
  danger: "boss",
};

export const resolveUserMarkerIcon = (icon?: UserMarkerIcon): UserMarkerIcon =>
  icon ? LEGACY_USER_MARKER_ICON_ALIASES[icon] ?? icon : "pin";
const MAP_CATEGORY_BY_ID = new Map(MAP_CATEGORIES.map((category) => [category.id, category]));
export const getCategoryConfig = (categoryId: string) => MAP_CATEGORY_BY_ID.get(categoryId) ?? MAP_CATEGORIES.at(-1)!;
const RESOURCE_MARKER_GROUPS = new Set<MapCategoryGroupId>(["herbs", "mining", "fishing", "cloth", "leather", "collectables"]);
export const isResourceMarkerCategory = (categoryId: string) => RESOURCE_MARKER_GROUPS.has(getCategoryConfig(categoryId).groupId);
export const isCategoryArtwork = (category: Pick<MapCategoryConfig, "artwork">) => category.artwork === true;
export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (!isUserMapMarker(point)) return {
    icon: point.category === "dungeon-door"
      ? point.subtype === "exit" ? LogOut : point.subtype === "passage" ? ArrowUpDown : DoorOpen
      : category.icon,
    nativeIconPath: category.preferCategoryIcon ? category.nativeIconPath
      : point.iconPath ? contentUrl(point.iconPath) : category.nativeIconPath,
    markerClass: category.markerClass,
    itemArt: !!point.iconPath || isCategoryArtwork(category),
  };
  const personalIcon = USER_MARKER_ICONS.find((item) => item.id === resolveUserMarkerIcon(point.icon));
  return {
    icon: personalIcon?.icon ?? MapPin,
    nativeIconPath: personalIcon?.nativeIconPath,
    markerClass: category.markerClass,
    itemArt: false,
  };
};
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string): MapCategoryConfig | undefined => {
  void referenceId;
  void sourceCategoryId;
  return undefined;
};
export const migrateCategorySelection = (ids: string[]) => [...new Set(ids.flatMap((id) => {
  if (id === "rare-creature") return ["rare", "rare-elite"];
  if (id === "forever-rare") return ["rare"];
  if (id === "forever-rare-elite") return ["rare-elite"];
  return MAP_CATEGORIES.some((category) => category.id === id) ? [id] : [];
}))];
