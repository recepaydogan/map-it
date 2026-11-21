import {
  Archive,
  ArrowUpDown,
  Beaker,
  Bomb,
  BookOpen,
  Compass,
  Crown,
  createLucideIcon,
  DoorOpen,
  Drama,
  Eye,
  Flag,
  FlaskConical,
  Gem,
  Hand,
  HandCoins,
  House,
  Hourglass,
  KeyRound,
  Landmark,
  PackageSearch,
  MapPin,
  MapPinned,
  PackageOpen,
  Puzzle,
  ScrollText,
  Shield,
  ShieldAlert,
  ShieldUser,
  Shovel,
  Shirt,
  ShoppingBasket,
  Skull,
  Speech,
  Sparkles,
  Swords,
  Target,
  TriangleAlert,
  Truck,
  Utensils,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerColor, type UserMarkerIcon } from "./types";

/** A prone figure reads as a body at marker scale; a single bone does not. */
const Corpse = createLucideIcon("map-corpse", [
  ["circle", { cx: "5.5", cy: "7.5", r: "2", fill: "currentColor", stroke: "none", key: "head" }],
  ["path", { d: "m8 9 4.2 2.6 3.3-1a2 2 0 0 1 1.8.35l2.7 2.15", key: "body" }],
  ["path", { d: "m11.8 11.5-2.5 4.2-4.3.8", key: "arm" }],
  ["path", { d: "m14.7 11.1 1.2 4.7 4.1 1.2", key: "leg" }],
  ["path", { d: "M3 20h18", key: "ground" }],
]);

const RUIN_LOCATION_CATEGORIES = new Set(["waypoint", "transition", "vertical-access"]);
const isRuinLocation = (point: MapPoint) =>
  RUIN_LOCATION_CATEGORIES.has(point.category) && /\bruins?\b/i.test(point.name);

/** Reviewed features whose legacy placements do not yet expose a specific facet. */
const SECRET_FEATURE_ICONS: Record<string, LucideIcon> = {
  "21041096-0ec6-4b97-839d-b6de14a3b2ba": Archive,
  "9391dc0e-2b3f-42c4-a708-35478f592a4d": DoorOpen,
  "e6f5e44f-dda9-4a92-9d39-d8675b31af67": DoorOpen,
  "f1687389-b836-4a02-886b-d2a6cb869707": Archive,
};

const getSecretFeatureIcon = (point: MapPoint): LucideIcon => {
  const facets = new Set("categoryFacets" in point ? point.categoryFacets ?? [] : []);
  if (facets.has("buried-treasure") || facets.has("diggable-secret")) return Shovel;
  if (facets.has("hidden-passage") || facets.has("secret-door")) return DoorOpen;
  if (facets.has("chest") || facets.has("loot-container")) return Archive;
  if (facets.has("moving-object") || facets.has("secret-puzzle") || facets.has("plaque")) return DoorOpen;
  return ("contentId" in point && point.contentId && SECRET_FEATURE_ICONS[point.contentId]) || Eye;
};

/** Stable, accessible combat colours shared by the compact and full profiles. */
const MAP_COMBAT_TYPE_COLORS: Record<string, string> = {
  bludgeoning: "#d6a06a",
  slashing: "#cbd5e1",
  piercing: "#5eead4",
  acid: "#bef264",
  cold: "#7dd3fc",
  fire: "#fb923c",
  force: "#a5b4fc",
  lightning: "#facc15",
  necrotic: "#c084fc",
  poison: "#a3e635",
  psychic: "#f0abfc",
  radiant: "#fde68a",
  thunder: "#93c5fd",
};

export const getMapCombatTypeColor = (type: string) => {
  const normalized = type.toLocaleLowerCase("en-US");
  if (MAP_COMBAT_TYPE_COLORS[normalized]) return MAP_COMBAT_TYPE_COLORS[normalized];
  if (/bleed|wound|trauma/.test(normalized)) return "#f87171";
  if (/sleep/.test(normalized)) return "#c084fc";
  if (/burn|hellfire|lava/.test(normalized)) return "#fb923c";
  if (/frost|cold|chill/.test(normalized)) return "#7dd3fc";
  if (/poison|venom/.test(normalized)) return "#a3e635";
  if (/shock|lightning/.test(normalized)) return "#facc15";
  return "#cbbfa6";
};

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
  groupId: MapCategoryGroupId;
  defaultVisible: boolean;
  icon: LucideIcon;
  nativeIconPath?: string;
  markerClass: string;
}

/** "hidden" categories keep a marker appearance but never appear in the filter rail. */
export type MapCategoryGroupId = "locations" | "quests" | "items" | "loot" | "unique-equipment" | "npcs" | "enemies" | "hidden" | "personal";

export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId;
  labelKey: string;
  /** Header glyph, so a collapsed group is recognisable without reading it. */
  icon: LucideIcon;
  defaultExpanded: boolean;
}

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "locations", labelKey: "map.categoryGroups.locations", icon: Compass, defaultExpanded: true },
  { id: "quests", labelKey: "map.categoryGroups.quests", icon: ScrollText, defaultExpanded: false },
  { id: "items", labelKey: "map.categoryGroups.items", icon: PackageOpen, defaultExpanded: false },
  { id: "loot", labelKey: "map.categoryGroups.loot", icon: PackageSearch, defaultExpanded: false },
  { id: "unique-equipment", labelKey: "map.categoryGroups.uniqueEquipment", icon: Gem, defaultExpanded: false },
  { id: "npcs", labelKey: "map.categoryGroups.npcs", icon: Speech, defaultExpanded: false },
  { id: "enemies", labelKey: "map.categoryGroups.enemies", icon: Skull, defaultExpanded: false },
];

export interface UserMarkerColorConfig {
  id: UserMarkerColor;
  labelKey: string;
  markerClass: string;
}

export interface UserMarkerIconConfig {
  id: UserMarkerIcon;
  labelKey: string;
  icon: LucideIcon;
}

export const MAP_CATEGORIES: MapCategoryConfig[] = [
  // Locations: the places themselves and what is built into them.
  { id: "waypoint", labelKey: "map.categories.waypoint", groupId: "locations", defaultVisible: true, icon: Waypoints, markerClass: "map-marker-waypoint" },
  { id: "transition", labelKey: "map.categories.transition", groupId: "locations", defaultVisible: true, icon: DoorOpen, markerClass: "map-marker-transition" },
  { id: "vertical-access", labelKey: "map.categories.verticalAccess", groupId: "locations", defaultVisible: false, icon: ArrowUpDown, markerClass: "map-marker-vertical-access" },
  { id: "puzzle", labelKey: "map.categories.puzzle", groupId: "locations", defaultVisible: true, icon: Puzzle, markerClass: "map-marker-puzzle" },
  { id: "secret", labelKey: "map.categories.secret", groupId: "locations", defaultVisible: true, icon: Eye, markerClass: "map-marker-secret" },
  { id: "trap", labelKey: "map.categories.trap", groupId: "locations", defaultVisible: false, icon: TriangleAlert, markerClass: "map-marker-trap" },
  { id: "ownership-zone", labelKey: "map.categories.ownershipZone", groupId: "locations", defaultVisible: false, icon: ShieldAlert, markerClass: "map-marker-ownership-zone" },
  { id: "story-interaction", labelKey: "map.categories.storyInteraction", groupId: "locations", defaultVisible: false, icon: Drama, markerClass: "map-marker-story-interaction" },
  { id: "interactable", labelKey: "map.categories.interactable", groupId: "locations", defaultVisible: false, icon: Hand, markerClass: "map-marker-interactable" },
  // Quests: objectives, deadlines and story moments.
  { id: "quest", labelKey: "map.categories.quest", groupId: "quests", defaultVisible: true, icon: ScrollText, markerClass: "map-marker-quest" },
  { id: "missable", labelKey: "map.categories.missable", groupId: "quests", defaultVisible: true, icon: Hourglass, markerClass: "map-marker-missable" },
  { id: "inspiration", labelKey: "map.categories.inspiration", groupId: "quests", defaultVisible: true, icon: Sparkles, markerClass: "map-marker-inspiration" },
  // Items: loose, directly collectable objects plus access items and upgrades.
  { id: "item-weapons", labelKey: "map.categories.itemWeapons", groupId: "items", defaultVisible: true, icon: Swords, markerClass: "map-marker-item" },
  { id: "item-shields", labelKey: "map.categories.itemShields", groupId: "items", defaultVisible: true, icon: Shield, markerClass: "map-marker-item" },
  { id: "item-armor", labelKey: "map.categories.itemArmor", groupId: "items", defaultVisible: true, icon: Shirt, markerClass: "map-marker-item" },
  { id: "item-accessories", labelKey: "map.categories.itemAccessories", groupId: "items", defaultVisible: true, icon: Gem, markerClass: "map-marker-item" },
  { id: "item-potions", labelKey: "map.categories.itemPotions", groupId: "items", defaultVisible: true, icon: FlaskConical, markerClass: "map-marker-item" },
  { id: "item-scrolls", labelKey: "map.categories.itemScrolls", groupId: "items", defaultVisible: true, icon: ScrollText, markerClass: "map-marker-item" },
  { id: "item-ammunition", labelKey: "map.categories.itemAmmunition", groupId: "items", defaultVisible: true, icon: Target, markerClass: "map-marker-item" },
  { id: "item-throwables", labelKey: "map.categories.itemThrowables", groupId: "items", defaultVisible: true, icon: Bomb, markerClass: "map-marker-item" },
  { id: "item-consumables", labelKey: "map.categories.itemConsumables", groupId: "items", defaultVisible: true, icon: Utensils, markerClass: "map-marker-item" },
  { id: "item-alchemy", labelKey: "map.categories.itemAlchemy", groupId: "items", defaultVisible: true, icon: Beaker, markerClass: "map-marker-item" },
  // Readable objects share one marker appearance but expose focused filters.
  // The legacy umbrella stays hidden so stored selections keep working.
  { id: "item-books-lore", labelKey: "map.categories.itemBooksLore", groupId: "items", defaultVisible: false, icon: BookOpen, markerClass: "map-marker-item" },
  { id: "item-letters-notes", labelKey: "map.categories.itemLettersNotes", groupId: "items", defaultVisible: false, icon: ScrollText, markerClass: "map-marker-item" },
  { id: "item-journals-records", labelKey: "map.categories.itemJournalsRecords", groupId: "items", defaultVisible: false, icon: BookOpen, markerClass: "map-marker-item" },
  { id: "item-maps-plans", labelKey: "map.categories.itemMapsPlans", groupId: "items", defaultVisible: false, icon: MapPinned, markerClass: "map-marker-item" },
  { id: "item-arcane-books", labelKey: "map.categories.itemArcaneBooks", groupId: "items", defaultVisible: false, icon: Sparkles, markerClass: "map-marker-item" },
  { id: "item-recipes", labelKey: "map.categories.itemRecipes", groupId: "items", defaultVisible: false, icon: Utensils, markerClass: "map-marker-item" },
  { id: "item-publications", labelKey: "map.categories.itemPublications", groupId: "items", defaultVisible: false, icon: ScrollText, markerClass: "map-marker-item" },
  { id: "item-paintings", labelKey: "map.categories.itemPaintings", groupId: "items", defaultVisible: false, icon: Gem, markerClass: "map-marker-item" },
  { id: "item-quest-items", labelKey: "map.categories.itemQuestItems", groupId: "items", defaultVisible: true, icon: Flag, markerClass: "map-marker-item" },
  { id: "item-miscellaneous", labelKey: "map.categories.itemMiscellaneous", groupId: "items", defaultVisible: true, icon: PackageOpen, markerClass: "map-marker-item" },
  { id: "key-item", labelKey: "map.categories.keyItem", groupId: "items", defaultVisible: false, icon: KeyRound, markerClass: "map-marker-key-item" },
  { id: "permanent-upgrade", labelKey: "map.categories.permanentUpgrade", groupId: "items", defaultVisible: true, icon: Sparkles, markerClass: "map-marker-permanent-upgrade" },
  // Loot: bodies and world containers that expose an inventory when searched.
  // A corpse is a dead Character placement, not an inventory item or an enemy.
  { id: "corpse", labelKey: "map.categories.corpse", groupId: "loot", defaultVisible: false, icon: Corpse, markerClass: "map-marker-corpse" },
  { id: "chest", labelKey: "map.categories.chest", groupId: "loot", defaultVisible: false, icon: Archive, markerClass: "map-marker-chest" },
  { id: "loot-container", labelKey: "map.categories.lootContainer", groupId: "loot", defaultVisible: false, icon: PackageSearch, markerClass: "map-marker-loot-container" },
  // Unique equipment: uncommon-or-better gear, split by what it is. These are
  // facets on item markers, so the marker keeps its item appearance.
  { id: "unique-weapon", labelKey: "map.categories.uniqueWeapon", groupId: "unique-equipment", defaultVisible: true, icon: Swords, markerClass: "map-marker-unique-weapon" },
  { id: "unique-armor", labelKey: "map.categories.uniqueArmor", groupId: "unique-equipment", defaultVisible: true, icon: Shirt, markerClass: "map-marker-unique-armor" },
  { id: "unique-shield", labelKey: "map.categories.uniqueShield", groupId: "unique-equipment", defaultVisible: true, icon: Shield, markerClass: "map-marker-unique-shield" },
  { id: "unique-jewellery", labelKey: "map.categories.uniqueJewellery", groupId: "unique-equipment", defaultVisible: true, icon: Gem, markerClass: "map-marker-unique-jewellery" },
  // NPCs: everyone who talks before they fight.
  { id: "party-member", labelKey: "map.categories.partyMember", groupId: "npcs", defaultVisible: true, icon: ShieldUser, markerClass: "map-marker-party-member" },
  { id: "vendor", labelKey: "map.categories.vendor", groupId: "npcs", defaultVisible: true, icon: HandCoins, markerClass: "map-marker-vendor" },
  { id: "npc", labelKey: "map.categories.npc", groupId: "npcs", defaultVisible: false, icon: Speech, markerClass: "map-marker-npc" },
  // Enemies: bosses, hostile creatures and ambush zones.
  { id: "boss", labelKey: "map.categories.boss", groupId: "enemies", defaultVisible: true, icon: Crown, markerClass: "map-marker-boss" },
  { id: "enemy", labelKey: "map.categories.enemy", groupId: "enemies", defaultVisible: true, icon: Skull, markerClass: "map-marker-enemy" },
  { id: "encounter", labelKey: "map.categories.encounter", groupId: "enemies", defaultVisible: false, icon: Swords, markerClass: "map-marker-encounter" },
  // Carried valuables keep their appearance but are reached through their owner.
  { id: "item-books", labelKey: "map.categories.itemBooks", groupId: "hidden", defaultVisible: false, icon: BookOpen, markerClass: "map-marker-item" },
  { id: "valuable-item", labelKey: "map.categories.valuableItem", groupId: "hidden", defaultVisible: false, icon: Gem, markerClass: "map-marker-valuable-item" },
  { id: "custom", labelKey: "map.categories.custom", groupId: "personal", defaultVisible: true, icon: MapPin, markerClass: "map-marker-custom" },
];

/** Passage categories: markers that move the party somewhere else. */
export const TRANSITION_CATEGORIES = ["transition", "vertical-access"];

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
];

export interface MapConnectionDefinition {
  id: string;
  endpoints: readonly [
    { mapId: string; locationId: string },
    { mapId: string; locationId: string },
  ];
  evidence: "paired-extracted-teleport-name" | "scripted-party-teleport";
  direction?: "forward";
}

/** Source-verified duplicate IDs; retain their saved state on the real pin. */
export const MAP_LOCATION_ALIASES: Readonly<Record<string, string>> = {
  "1fc893ad-277f-4bb3-914c-9bdef4ff0385:destination": "1fc893ad-277f-4bb3-914c-9bdef4ff0385",
  "c20c1d4e-eea9-473b-b26e-abe5973ba0eb:destination:8acce947-e8bb-401e-94e9-4a068326be2d": "c20c1d4e-eea9-473b-b26e-abe5973ba0eb",
};

/** Only endpoints supported by extracted reciprocal portals or an exact
 * scripted party teleport. Ambiguous doors and visual proximity are excluded. */
export const MAP_CONNECTIONS: MapConnectionDefinition[] = [
  {
    id: "gauntlet-entrance-to-shadowfell",
    endpoints: [
      { mapId: "gauntlet-of-shar-level-0", locationId: "1fc893ad-277f-4bb3-914c-9bdef4ff0385" },
      { mapId: "nightsong-prison", locationId: "49b61a34-31ba-47cb-b075-f4baf6e6f122" },
    ],
    // Act2_SHA_NightsongPrison:683-697,715-721,791-835. Ready-check/dialog
    // branches enter the prison; its arrival trigger is not a return exit.
    evidence: "scripted-party-teleport",
    direction: "forward",
  },
  {
    id: "creche-to-astral-plane",
    endpoints: [
      { mapId: "githyanki-creche", locationId: "c8295f70-f69a-4a49-961f-309141d98bc0" },
      { mapId: "astral-plane-creche", locationId: "b73922c5-5ac4-4551-b492-ce85e01175d1" },
    ],
    evidence: "scripted-party-teleport",
  },
  {
    id: "astral-plane-return-to-creche",
    endpoints: [
      { mapId: "astral-plane-creche", locationId: "87ca4464-d8ab-4fd2-b578-678b64666939" },
      { mapId: "githyanki-creche", locationId: "a07eb0c0-3bf4-46ec-8516-0f1ef4654fb4" },
    ],
    evidence: "scripted-party-teleport",
  },
  {
    id: "astral-plane-illithid-to-high-hall",
    endpoints: [
      { mapId: "astral-plane-finale", locationId: "2a62d420-290b-47e5-a224-71b5cda70f50" },
      { mapId: "high-hall", locationId: "250b3364-3f6a-48dc-aef9-0c82366f352d" },
    ],
    evidence: "scripted-party-teleport",
  },
  {
    id: "astral-plane-orpheus-to-high-hall",
    endpoints: [
      { mapId: "astral-plane-finale", locationId: "b86aadd0-1cdd-460b-8c02-63c01a9a612e" },
      { mapId: "high-hall", locationId: "250b3364-3f6a-48dc-aef9-0c82366f352d" },
    ],
    evidence: "scripted-party-teleport",
  },
  {
    id: "moonrise-rooftop-to-mind-flayer-colony",
    endpoints: [
      { mapId: "moonrise-towers-rooftop", locationId: "c29cec63-82da-4579-b11d-75a5a08bbe1b" },
      { mapId: "mind-flayer-colony", locationId: "21b37cc1-8a65-46aa-8b63-59ccf71efed7" },
    ],
    evidence: "scripted-party-teleport",
  },
];

export const getCategoryConfig = (categoryId: string) =>
  MAP_CATEGORIES.find((category) => category.id === categoryId) ?? MAP_CATEGORIES.at(-1)!;

/** The first user-visible filter group that contains this point. */
export const getPointCategoryGroupConfig = (point: MapPoint) => {
  const categoryIds = [
    point.category,
    ...("categoryFacets" in point ? point.categoryFacets ?? [] : []),
  ];
  const visibleCategory = categoryIds
    .map((categoryId) => MAP_CATEGORIES.find(({ id }) => id === categoryId))
    .find((category) => category && category.groupId !== "hidden");
  return visibleCategory
    ? MAP_CATEGORY_GROUPS.find(({ id }) => id === visibleCategory.groupId)
    : undefined;
};

export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (!isUserMapMarker(point)) {
    if (point.category === "secret") {
      return { icon: getSecretFeatureIcon(point), nativeIconPath: undefined, markerClass: category.markerClass };
    }
    if (isRuinLocation(point)) {
      return {
        icon: Landmark,
        nativeIconPath: undefined,
        markerClass: "map-marker-ruins",
      };
    }
    return {
      icon: category.icon,
      nativeIconPath: category.nativeIconPath,
      markerClass: category.markerClass,
    };
  }
  return {
    icon: USER_MARKER_ICONS.find((item) => item.id === point.icon)?.icon ?? MapPin,
    nativeIconPath: undefined,
    markerClass: USER_MARKER_COLORS.find((item) => item.id === point.color)?.markerClass ?? category.markerClass,
  };
};
