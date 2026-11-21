import { CUSTOM_CATEGORIES } from "./custom-markers";
import type { CategoryDef, CategoryGroup, Game } from "./types";

/**
 * Full category dictionaries (mirrors spec Section 9.2 — every category, none
 * optional). `color` drives the marker, the filter chip and the detail header
 * identically, so a category has one visual identity defined once.
 */

const ER_CATEGORIES: CategoryDef[] = [
  // Locations
  { key: "site-of-grace", label: "Sites of Grace", color: "#e8c75a", icon: "grace" },
  { key: "cave", label: "Caves", color: "#8b9bb4", icon: "cave" },
  { key: "catacomb", label: "Catacombs", color: "#9d8cc4", icon: "bone" },
  { key: "tunnel", label: "Tunnels", color: "#b08968", icon: "pickaxe" },
  { key: "evergaol", label: "Evergaols", color: "#7fa6c9", icon: "lock" },
  { key: "legacy-dungeon", label: "Legacy Dungeons", color: "#c98f6b", icon: "castle" },
  { key: "divine-tower", label: "Divine Towers", color: "#a0c4d6", icon: "tower" },
  { key: "church", label: "Churches", color: "#d6c9a0", icon: "church" },
  { key: "ruins", label: "Ruins", color: "#9a8f7a", icon: "ruins" },
  { key: "fort", label: "Forts", color: "#9c7b6b", icon: "fort" },
  { key: "rise", label: "Rises", color: "#a89bd6", icon: "rise" },
  { key: "minor-erdtree", label: "Minor Erdtrees", color: "#86c98f", icon: "erdtree" },
  { key: "walking-mausoleum", label: "Walking Mausoleums", color: "#8a8273", icon: "mausoleum" },
  // Bosses — #e5342a is reserved for `boss` alone: the only fully saturated red in
  // the palette, so the deadliest thing on the map is the loudest marker on it.
  { key: "boss", label: "Bosses", color: "#e5342a", icon: "skull" },
  // ER-map boss tiers (er-boss-tiers.json): great = trophy-band story/legacy
  // bosses, legendary = the remembrance set. Gold tops the danger ramp.
  { key: "great-boss", label: "Great Bosses", color: "#e0622d", icon: "skull" },
  { key: "legendary-boss", label: "Legendary Bosses", color: "#d9a621", icon: "crown" },
  // Named NpcParam teamType-27 invader spawns (er-invaders.json).
  { key: "invasion", label: "Invasions", color: "#c04a75", icon: "swords" },
  // The 10 evergaol duels — same key + visuals as Nightreign's evergaol bosses.
  { key: "evergaol-boss", label: "Evergaol Bosses", color: "#7fa6c9", icon: "lock" },
  // ER map's field minibosses (er-elite-enemies.json — System A's miniboss rule),
  // so it shares the miniboss visuals; the two never appear on the same surface.
  { key: "elite-enemy", label: "Elite Enemies", color: "#d9713a", icon: "swords" },
  // The single plain-enemy category the old model-family buckets folded into.
  { key: "enemy", label: "Enemies", color: "#b85f59", icon: "enemy" },
  { key: "miniboss", label: "Minibosses", color: "#d9713a", icon: "swords" },
  // NPCs
  { key: "merchant", label: "Merchants", color: "#5ac9a0", icon: "merchant" },
  { key: "npc", label: "NPCs", color: "#5ab0c9", icon: "npc" },
  { key: "teardrop-scarab", label: "Teardrop Scarabs", color: "#d9b23f", icon: "scarab" },
  // Multiplayer — the game's own co-op summoning pools (SignPuddleParam).
  { key: "summon-pool", label: "Summoning Pools", color: "#c9a0e0", icon: "summon-pool" },
  // Traversal — extracted from the map MSBs (build-er-spiritsprings.mjs).
  { key: "spiritspring", label: "Spiritsprings", color: "#5ac9d6", icon: "spiritstream" },
  { key: "waygate", label: "Waygates", color: "#c9a0e0", icon: "waygate" },
  // Equipment
  { key: "weapon", label: "Weapons", color: "#c9b15a", icon: "sword" },
  { key: "shield", label: "Shields", color: "#6b95c9", icon: "shield" },
  { key: "armor", label: "Armor", color: "#b8946b", icon: "armor" },
  { key: "talisman", label: "Talismans", color: "#c95a9b", icon: "talisman" },
  { key: "ash-of-war", label: "Ashes of War", color: "#c97e5a", icon: "ash-of-war" },
  { key: "spirit-ash", label: "Spirit Ashes", color: "#9b8ac9", icon: "spirit-ash" },
  { key: "sorcery", label: "Sorceries", color: "#5a8ac9", icon: "sorcery" },
  { key: "incantation", label: "Incantations", color: "#c9a85a", icon: "incantation" },
  // Upgrades & collectibles
  { key: "golden-seed", label: "Golden Seeds", color: "#e0c14e", icon: "seed" },
  { key: "sacred-tear", label: "Sacred Tears", color: "#7ec9d6", icon: "tear" },
  { key: "smithing-stone", label: "Smithing Stones", color: "#9aa0a8", icon: "smithing" },
  { key: "glovewort", label: "Gloveworts", color: "#86c9a8", icon: "glovewort" },
  { key: "larval-tear", label: "Larval Tears", color: "#c98fd6", icon: "larval" },
  { key: "map-fragment", label: "Map Fragments", color: "#c9b88f", icon: "map" },
  { key: "bell-bearing", label: "Bell Bearings", color: "#c9c45a", icon: "bell" },
  { key: "cookbook", label: "Cookbooks", color: "#b0935a", icon: "cookbook" },
  { key: "key", label: "Keys", color: "#d6b85a", icon: "key" },
  { key: "whetblade", label: "Whetblades", color: "#9ba8b4", icon: "whetblade" },
  // SotE
  { key: "scadutree-fragment", label: "Scadutree Fragments", color: "#86b06b", icon: "scadutree" },
  { key: "revered-spirit-ash", label: "Revered Spirit Ashes", color: "#a89bd6", icon: "spirit-ash" },
  { key: "dlc-catacomb", label: "DLC Catacombs", color: "#9d8cc4", icon: "bone" },
  { key: "dlc-gaol", label: "DLC Gaols", color: "#7fa6c9", icon: "lock" },
  { key: "dlc-forge", label: "DLC Forges", color: "#c97e5a", icon: "forge" },
  { key: "miquella-cross", label: "Miquella's Crosses", color: "#d6c95a", icon: "cross" },
];

const ER_GROUPS: CategoryGroup[] = [
  {
    key: "landmarks",
    label: "Landmarks",
    icon: "grace",
    categories: [
      "site-of-grace", "church", "ruins", "fort", "rise", "minor-erdtree",
      "walking-mausoleum", "miquella-cross", "spiritspring", "waygate",
    ],
  },
  // One combat group, ordered from the highest boss tier down to regular enemies.
  // Its own label key: the `bosses` key is shared with Nightreign's group, which
  // really is bosses only, so `group.bosses` can't name both.
  {
    key: "bosses",
    labelKey: "group.bossesEnemies",
    label: "Bosses & Enemies",
    icon: "skull",
    categories: [
      "legendary-boss", "great-boss", "evergaol-boss", "invasion", "boss",
      "elite-enemy", "enemy", "miniboss",
    ],
  },
  {
    key: "dungeons",
    label: "Dungeons",
    icon: "castle",
    categories: [
      "cave", "catacomb", "tunnel", "evergaol", "legacy-dungeon", "divine-tower",
      "dlc-catacomb", "dlc-gaol", "dlc-forge",
    ],
  },
  {
    key: "equipment",
    label: "Equipment",
    icon: "sword",
    categories: ["weapon", "shield", "armor", "talisman", "ash-of-war", "spirit-ash", "sorcery", "incantation", "revered-spirit-ash"],
  },
  { key: "npcs", label: "NPCs & Merchants", icon: "merchant", categories: ["merchant", "npc"] },
  {
    key: "upgrades",
    label: "Upgrades & Collectibles",
    icon: "seed",
    categories: [
      "golden-seed", "sacred-tear", "smithing-stone", "glovewort", "teardrop-scarab", "larval-tear",
      "map-fragment", "bell-bearing", "cookbook", "key", "whetblade", "scadutree-fragment",
    ],
  },
  // Summoning pools are the only co-op surface with real coordinates, so they get
  // their own row rather than hiding under NPCs — you look for them for one reason.
  // Kept last: co-op is a niche pass, and it's never part of the default selection.
  { key: "multiplayer", label: "Multiplayer", icon: "summon-pool", categories: ["summon-pool"] },
];

// The Nightlord (final-night boss) is intentionally NOT a category here — it never has a
// map marker (it's surfaced through the seed bar + the dedicated Nightlord panel), so a
// filter row for it would always be empty. Likewise "Key Locations" and "Roundtable
// Utilities" were spec placeholders with no data source and were removed.
const NR_CATEGORIES: CategoryDef[] = [
  { key: "field-boss", label: "Field Bosses", color: "#d65a4e", icon: "skull" },
  { key: "night-boss", label: "Night Bosses", color: "#7e5ac9", icon: "moon" },
  { key: "evergaol-boss", label: "Evergaol Bosses", color: "#7fa6c9", icon: "lock" },
  { key: "arena-boss", label: "Arena Bosses", color: "#d68a5a", icon: "swords" },
  { key: "buried-treasure", label: "Buried Treasure", color: "#e0c14e", icon: "treasure" },
  // Shifting-Earth-only boon pickups: Rot Blessings appear only in Rotted Woods runs, the
  // buff only in Mountaintop runs (extracted from those earths' coordinate files).
  { key: "rot-blessing", label: "Rot Blessings", color: "#9fb04a", icon: "rot" },
  { key: "mountaintop-buff", label: "Mountaintop Buffs", color: "#a9d4e0", icon: "buff" },
  { key: "site-of-grace", label: "Sites of Grace", color: "#e8c75a", icon: "grace" },
  { key: "scarab", label: "Scarabs", color: "#c8954c", icon: "scarab" },
  { key: "spiritstream", label: "Spiritstreams", color: "#5ac9d6", icon: "spiritstream" },
  { key: "smithing-table", label: "Smithing Tables", color: "#9aa0a8", icon: "smithing" },
  { key: "merchant", label: "Merchants", color: "#5ac9a0", icon: "merchant" },
  { key: "spectral-hawk-tree", label: "Spectral Hawk Trees", color: "#86c9a8", icon: "hawk" },
  { key: "tunnel-entrance", label: "Tunnel Entrances", color: "#b08968", icon: "tunnel" },
  { key: "church", label: "Churches", color: "#d6c9a0", icon: "church" },
  { key: "sorcerers-rise", label: "Sorcerer's Rises", color: "#a89bd6", icon: "rise" },
  { key: "township", label: "Townships", color: "#c9b88f", icon: "township" },
  { key: "spawn-point", label: "Spawn Points", color: "#5ab0c9", icon: "spawn" },
  { key: "circle-day1", label: "Day 1 Circle", color: "#5a9bc9", icon: "circle-1" },
  { key: "circle-day2", label: "Day 2 Circle", color: "#c95a5a", icon: "circle-2" },
  { key: "shifting-earth-event", label: "Shifting Earth", color: "#c97ed6", icon: "event" },
];

const NR_GROUPS: CategoryGroup[] = [
  {
    key: "bosses",
    label: "Bosses",
    icon: "skull",
    categories: ["field-boss", "night-boss", "evergaol-boss", "arena-boss"],
  },
  {
    key: "pois",
    label: "Points of Interest",
    icon: "church",
    categories: [
      "site-of-grace", "spiritstream", "smithing-table", "merchant",
      "spectral-hawk-tree", "tunnel-entrance", "church",
      "sorcerers-rise", "township", "spawn-point",
    ],
  },
  {
    key: "loot",
    label: "Loot",
    icon: "treasure",
    categories: ["buried-treasure", "scarab", "rot-blessing", "mountaintop-buff"],
  },
  {
    key: "events",
    label: "Circles & Events",
    icon: "event",
    categories: ["circle-day1", "circle-day2", "shifting-earth-event"],
  },
];

// Custom (user-authored) types are valid in BOTH games, so they're appended to
// each dictionary — that's all it takes for a custom marker's colour, glyph,
// clustering and filter row to resolve through the normal category machinery. The
// "Your Markers" group itself is injected into the rail dynamically (only once the
// user has custom markers); see map-experience.
export const categoriesByGame: Record<Game, CategoryDef[]> = {
  "elden-ring": [...ER_CATEGORIES, ...CUSTOM_CATEGORIES],
  nightreign: [...NR_CATEGORIES, ...CUSTOM_CATEGORIES],
};

export const groupsByGame: Record<Game, CategoryGroup[]> = {
  "elden-ring": ER_GROUPS,
  nightreign: NR_GROUPS,
};

/** The translation key a group's rail label reads from. Every call site goes
 *  through this so an override can never be honoured in one rail and missed in
 *  another (which is exactly how the shared `bosses` key went unnoticed). */
export const groupLabelKey = (group: Pick<CategoryGroup, "key" | "labelKey">): string =>
  group.labelKey ?? `group.${group.key}`;

export const categoryMap = (game: Game): Map<string, CategoryDef> =>
  new Map(categoriesByGame[game].map((c) => [c.key, c]));
