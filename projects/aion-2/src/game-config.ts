/**
 * Everything that makes this build a specific game's map app lives here.
 *
 * Branching the base for a new game starts with this file, then:
 *   - public/manifest.json — `meta.name`, `game_targeting` / `launch_events`
 *     game ids and `url_protocol.scheme` must match the values below
 *     (`npm run validate` checks that);
 *   - src/features/map/map-registry.ts — which maps the app ships;
 *   - src/features/map/map-config.ts — marker categories and their icons;
 *   - brand/icon-master.png — then `npm run build:icons`;
 *   - .env — the new app's own Supabase project and PostHog key.
 *
 * See docs/branching-guide.md for the full checklist.
 */
export interface GameConfig {
  /** App language choices supported by this game's bundled text catalog. */
  supportedAppLanguages: readonly string[];
  /** Optional game-text catalog, separate from the app's own UI translations. */
  gameLocaleDirectory?: string;
  /** Optional item-ID index into the game's source text catalog. */
  itemLocaleIndexFile?: string;
  /** Match app language choices to the game's localization package names. */
  gameLocaleCodes?: Readonly<Record<string, string>>;
  /** Optional companion rewards keyed by their source entity reference. */
  mapCompanionSourcesPath?: string;
  mapPetSourcesPath?: string;
  /** Optional bundled catalog of verified entity and marker artwork. */
  entityArtworkPath?: string;
  /** Product name shown in the title bar, tray and store listing. */
  appName: string;
  /** The game this companion is for, as shown in copy ("when {{game}} starts"). */
  gameName: string;
  /** Read-only live position source and replicated transform layout. */
  gameProcessName: string;
  positionSessionDirectory: string;
  /**
   * Overwolf game class ids the app reacts to. Every game callback fires for
   * ANY running game, so all game logic funnels through `isTargetGame`.
   * Must match `game_targeting.game_ids` in public/manifest.json.
   */
  gameClassIds: number[];
  /** Launcher class ids that start the app but do not receive game overlays. */
  launcherClassIds?: number[];
  /** Fallback identity check on the running game's title. */
  gameTitlePattern: RegExp;
  /** Build used for the bundled item catalog. */
  itemDatabaseBuild: string;
  /** Discord invite shown in the title bar; empty hides the button. */
  discordInviteUrl: string;
  /** Public http(s) survey opened on uninstall; empty skips it. */
  uninstallSurveyUrl: string;
  /**
   * Reserved custom URL scheme. Must match `data.url_protocol.scheme` in
   * public/manifest.json.
   */
  protocolScheme: string;
}

/** Player-facing labels for item categories whose raw names are ambiguous. */
export const ITEM_CATEGORY_LABEL_KEYS: Record<string, string> = {
  "Skin Reward Voucher": "intel.skins.voucherLabel",
};

/** Item categories omitted from the Items database without changing source records. */
export const ITEM_DATABASE_HIDDEN_CATEGORIES: ReadonlySet<string> = new Set(["Battle Pass"]);

/** Item categories displayed after the rest of the Items database. */
export const ITEM_DATABASE_LAST_CATEGORIES: ReadonlySet<string> = new Set(["Skin Reward Voucher"]);

/** Shared icon for title entries in the reference browser. */
export const TITLE_ICON = "data/items/icons/icon-currency-get-title-01-001.png";

/** Official expedition rules keyed by verified native dungeon IDs. */
export const CURRENT_DUNGEON_RULES: Readonly<Record<string, { requiredItemLevel: number; frenzyMinutes: number; revivesPerPlayer: number }>> = {
  "Dungeon:600004": { requiredItemLevel: 2600, frenzyMinutes: 4, revivesPerPlayer: 3 },
  "Dungeon:600033": { requiredItemLevel: 2600, frenzyMinutes: 4, revivesPerPlayer: 3 },
};

/** Player-facing faction names for the game's raw faction identifiers. */
export const GAME_FACTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  Light: "intel.factions.Light",
  Dark: "intel.factions.Dark",
  light: "intel.factions.Light",
  dark: "intel.factions.Dark",
  "ERace::Light": "intel.factions.Light",
  "ERace::Dark": "intel.factions.Dark",
};

/** Game text keys for the item grades shown in reward and item views. */
export const ITEM_GRADE_TEXT_KEYS: Readonly<Record<string, string>> = {
  Common: "String_Tooltip_Grade_Common_body",
  Rare: "String_Tooltip_Grade_Rare_body",
  Heroic: "String_Tooltip_Grade_Epic_body",
  Epic: "String_Tooltip_Grade_Legend_body",
  Unique: "String_Tooltip_Grade_Unique_body",
  Special: "String_Tooltip_Grade_Special_body",
};

/** Text colors shared by item names and grade labels. */
export const ITEM_GRADE_COLORS: Readonly<Partial<Record<string, string>>> = {
  Common: "text-grade-common",
  Rare: "text-grade-rare",
  Heroic: "text-grade-heroic",
  Epic: "text-grade-epic",
  Unique: "text-grade-unique",
  Special: "text-grade-special",
};

/** Data identifiers used to resolve item rewards without matching display names. */
export const ITEM_SOUL_EFFECT = "Get Vehicle Soul";
export const ITEM_PET_EFFECT = "Get Vehicle";
/** Possible acquisition hints for items without a verified source in this client build. */
export const ITEM_POSSIBLE_ACQUISITION_KEYS: Readonly<Record<string, string>> = {
  "532400067": "database.acquisition.possibleSoloSeasonShop",
  "532400068": "database.acquisition.possibleSoloSeasonShop",
};
/** Description text that states the enhancement required before a conversion recipe. */
export const ITEM_RECIPE_ENHANCEMENT_REQUIREMENT = {
  recipeGroup: "Conversion Recipe",
  descriptionPattern: /Can be upgraded via Substance Morph after enhancing it (\d+) times\./i,
} as const;
/** Token items whose collection and progression share the reference guide. */
export const COLLECTIBLE_PROGRESSION = {
  itemIds: ["631900001", "631900007", "631900005", "631900012", "631900013"] as readonly string[],
  referenceGroup: "Monolith",
};
export const ACQUISITION_CREATURE_ID_PREFIX = "NpcData:";

/** One linked reference per dungeon family that grants the Halloween Candy Key Fragment. */
export const EVENT_CANDY_FRAGMENT_ITEM_ID = "662560017";
export const EVENT_CANDY_FRAGMENT_SOURCE_NAME = "Expedition and Transcendence Dungeons";
export const EVENT_CANDY_FRAGMENT_KEY_SHORTHAND = "Red/Yellow/Blue Candy Key (Event)";
export const EVENT_CANDY_KEY_ITEM_IDS = ["662560018", "662560019", "662560020"] as const;
export const EVENT_CANDY_FRAGMENT_DUNGEONS = [
  { category: "expedition", dungeonIds: ["600001", "600012", "600022", "600032", "600072", "600092"] },
  { category: "transcendence", dungeonIds: ["600053", "600063"] },
] as const;

const worldBossTextKeys: Readonly<Record<string, string>> = {
  "world-boss:PeriodSpawn:1151": "String_STR_M_AR2_ABBOSS_01_001_body",
  "world-boss:PeriodSpawn:1152": "String_STR_M_AR3_ABBOSS_01_001_body",
  "world-boss:PeriodSpawn:1153": "String_STR_M_AR3_KASHAPA_01_CV02_001_body",
  "world-boss:PeriodSpawn:1019": "String_STR_M_AR1_WSA_ELEKING_01_V02_002_body",
  "world-boss:PeriodSpawn:1020": "String_STR_M_AR1_BERITRAD_01_002_body",
  "world-boss:PeriodSpawn:1018": "String_STR_M_AR1_RADVIMA_01_CV02_001_body",
  "world-boss:PeriodSpawn:1013": "String_STR_M_AR1_RR_ABBOSS_01_001_body",
  "world-boss:PeriodSpawn:1014": "String_STR_M_AR1_RR_ABBOSS_01_001_body",
  "world-boss:PeriodSpawn:1015": "String_STR_M_AR1_RR_ABBOSS_01_001_body",
  "world-boss:PeriodSpawn:1155": "String_STR_M_AR3_NAHID_01_CV02_001_body",
  "world-boss:PeriodSpawn:1154": "String_STR_M_AR3_EVSPIRIT_02_CV02_001_body",
  "world-boss:PeriodSpawn:1006": "String_STR_M_AR1_BERITRAD_01_001_body",
};

/** Match scheduled event identifiers to the game's localized title strings. */
export const gameEventTextKey = (id: string): string | undefined =>
  id.startsWith("event:") ? `String_${id.slice("event:".length)}_body` : worldBossTextKeys[id];

/** Native Slime_02 family portrait for NPCs whose CV02 model has no authored portrait. */
export const ENTITY_ARTWORK_FALLBACKS: Record<string, string> = {
  "NpcData:2939220": "data/items/icons/ut-vehicle-portrait-slime-02.png",
  "NpcData:2939238": "data/items/icons/ut-vehicle-portrait-slime-02.png",
  "NpcData:2939239": "data/items/icons/ut-vehicle-portrait-slime-02.png",
};

/** Client stat values use hundredths of a displayed Flight Power point. */
export const REFERENCE_FACT_VALUE_DIVISORS: Readonly<Record<string, number>> = {
  "reference.labels.flight-power": 100,
};

/** Map client quest goal types to readable fallback text when localization is unavailable. */
export const QUEST_OBJECTIVE_ACTIONS: Readonly<Record<string, { defaultKey: string; targetKey?: string }>> = {
  "Ask Npc": { defaultKey: "talk", targetKey: "talkTo" },
  "Kill Npc": { defaultKey: "defeat", targetKey: "defeatTarget" },
  "Use Env Obj": { defaultKey: "useObject", targetKey: "useTarget" },
  "Close Npc": { defaultKey: "talk", targetKey: "finishTalkingTo" },
  "Enter Volume PC": { defaultKey: "enterQuestArea" },
  "Enter Sub Zone": { defaultKey: "enterQuestArea" },
  "Clear Map Event": { defaultKey: "completeMapEvent", targetKey: "completeNamedMapEvent" },
  "Complete Celvice Talk": { defaultKey: "completeConversation" },
  "Close Note": { defaultKey: "interactWithNote" },
  "Use Fake Item": { defaultKey: "useQuestItem" },
  "Collect Fake Item": { defaultKey: "collectQuestItem" },
  "Clear Quest": { defaultKey: "completeQuest" },
};

/** Resolve verified native summon patterns to player-facing encounter text. */
export const scriptedHpSummonTextKey = (summons: readonly { id: string; count: number }[]): string | undefined => {
  const signature = summons.map(({ id, count }) => `${id}:${count}`).sort().join("|");
  if (signature === "Basic_RecoveryOrb_01:1|Basic_RecoveryOrb_02:1|Basic_RecoveryOrb_03:1") {
    return "reference.guide.summonsThreeBloodOrbs";
  }
  if (signature === "E_FE_Common_RecoveryOrb_01:10|E_FE_Common_RecoveryOrb_02:5|E_FE_Common_RecoveryOrb_03:5") {
    return "reference.guide.summonsRecoveryOrbs";
  }
  return undefined;
};

/** Bump when a new What's New entry is published. */
export const UPDATES_RELEASE_ID = "2026-10-28-weekly-update";
export const EVENTS_DISCOVERY_CAMPAIGN = "2026-10-15-halloween-event-reminder";

/** Resolve challenge families to their verified in-game portrait identity. */
export const ACTIVITY_CHALLENGE_ARTWORK_ID = (familyId: string): string | undefined => {
  const prefix = "challenge:BossChallenge_";
  return familyId.startsWith(prefix) ? `BossChallengeGroup:${familyId.slice(prefix.length)}` : undefined;
};

export const GAME_CONFIG: GameConfig = {
  supportedAppLanguages: ["en", "ko", "ja", "de", "fr", "es", "pt-BR", "ru"],
  gameLocaleDirectory: "data/game-locales",
  itemLocaleIndexFile: "item-key-index.json",
  gameLocaleCodes: {
    en: "en-US", ko: "ko-KR", ja: "ja-JP", de: "de-DE",
    fr: "fr-FR", es: "es-ES", "pt-BR": "pt-BR", ru: "ru-RU",
  },
  mapCompanionSourcesPath: "data/reference/map-companion-sources.json",
  mapPetSourcesPath: "data/reference/map-pet-sources.json",
  entityArtworkPath: "data/reference/entity-artwork.json",
  appName: "Aion 2 Interactive Map",
  gameName: "Aion 2",
  gameProcessName: "AION2",
  positionSessionDirectory: "NCSOFT/NccrData/com.ncsoft.aion2global",
  // Observed replicated transform layout; motion validation is still required.
  gameClassIds: [28260],
  gameTitlePattern: /aion\s*2/i,
  itemDatabaseBuild: "AION 2 Playtest",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfCEeiBk4cILP-4cEYIUu0bYGhuoPECN9-EJQvu0nDVijEFAA/viewform?usp=dialog",
  protocolScheme: "aion2map",
};

/** Public character data exposed by this game's official website. */
export const CHARACTER_PROFILE_CONFIG = {
  regions: ["naw", "nae", "eu", "la", "as"] as const,
  locale: "en-US",
  gearScoreStatType: "ItemLevel",
  searchPageSize: 20,
  searchUrl: "https://api-search.plaync.com/aion2global/search/v2/character",
  serversUrl: "https://aion2.plaync.com/en-us/api/gameinfo/servers",
  profileImageBaseUrl: "https://profileimg.plaync.com",
  detailUrl: "https://aion2.plaync.com/api/character",
  equipmentGroups: [
    { key: "weapons", slots: ["MainHand", "SubHand"] },
    { key: "armor", slots: ["Torso", "Pants", "Helmet", "Shoulder", "Gloves", "Boots", "Cape"] },
    { key: "accessories", slots: ["Belt", "Necklace", "Earring1", "Earring2", "Ring1", "Ring2", "Bracelet1", "Bracelet2", "Rune1", "Rune2", "Amulet"] },
    { key: "arcana", slots: ["Arcana1", "Arcana2", "Arcana3", "Arcana4", "Arcana5"] },
  ],
};

/** Search pcId uses four variants per class, verified against official character profiles. */
export const characterClassKeyForPcId = (pcId: number): string | null => {
  if (!Number.isInteger(pcId) || pcId < 5 || pcId > 36) return null;
  const classKeys = ["gladiator", "templar", "ranger", "assassin", "spiritmaster", "sorcerer", "cleric", "chanter"];
  return classKeys[Math.floor((pcId - 5) / 4)] ?? null;
};

/** Global server clocks observed in the live client on October 5, 2026. */
export const EVENT_SERVER_REGIONS = [
  { key: "eu", labelKey: "events.servers.eu", timeZone: "Europe/Berlin" },
  { key: "nae", labelKey: "events.servers.nae", timeZone: "America/New_York" },
  { key: "naw", labelKey: "events.servers.naw", timeZone: "America/Los_Angeles" },
  { key: "la", labelKey: "events.servers.sa", timeZone: "America/Sao_Paulo" },
  { key: "as", labelKey: "events.servers.as", timeZone: "Asia/Tokyo" },
] as const;

export type EventServerRegion = (typeof EVENT_SERVER_REGIONS)[number]["key"];

/** Display groups for the game's item categories; unfamiliar categories fall into Other. */
export const ITEM_CATEGORY_GROUPS = {
  weapons: ["Bow", "Dagger", "Fist", "Greatsword", "Longsword", "Mace", "Orb", "Spellbook", "Staff"],
  armor: ["Cloak", "Gloves", "Guard", "Helm", "Legs", "Pauldrons", "Shoes", "Top"],
  accessories: ["Amulet", "Belt", "Bracelet", "Earrings", "Necklace", "Ring"],
  consumables: ["Beverage", "Food", "Potion", "Power Shard", "Resurrection Tool", "Scroll", "Teleport Scroll"],
  crafting: ["Arcana Material", "Conversion Recipe", "Crafting Material", "Crafting Skill Learning Tool", "Essence Extraction Learning Tool", "Gather", "Gatherable Material", "Special Material", "Special Substance Morph Material", "Substance Morph Material", "Transmutation Material"],
  enhancements: ["Arcana", "Manastone", "Philosopher's Stone", "Potential Enhance Stone", "Soul Crystal", "Theostone", "Transfer Stone", "Upgrade"],
  collectibles: ["Customization", "Emote", "Extract Skin", "Get Title", "Get Wing", "Pantheon Decor", "Pet", "Pet Transformation", "Skin Combine", "Skin Reward Voucher", "Transformation"],
  rewards: ["Battle Pass", "Contents Sweep Ticket", "Key", "Kina Chest", "Monolith All Clear", "Monolith Token", "Occupation Territory All Clear", "Quest Scroll", "Reward Chest", "Seal All Clear", "Usage Count Recharge Ticket", "Usage Duration Recharge Ticket"],
  currency: ["Currency", "Quna Recharge", "Special Points"],
} as const;

/** Weapon categories used by the world-boss equipment reward pools. */
export const WORLD_BOSS_REWARD_WEAPON_CATEGORIES = [...ITEM_CATEGORY_GROUPS.weapons, "Guard"] as readonly string[];

export type ItemCategoryGroup = keyof typeof ITEM_CATEGORY_GROUPS | "other";

/** Reference group exposed as the weekly missions page. */
export const WEEKLY_MISSIONS_REFERENCE = { category: "achievements", group: "Weekly Mission" } as const;

/** Current seasonal mission catalog generated from the installed client. */
export const EVENT_MISSIONS_CATALOG_PATH = "data/events/halloween-missions.json";
export const EVENT_GUIDE_CATALOG_PATH = "data/events/halloween-guide.json";
/** Artwork shown for the Halloween Candy objects on the map and in the guide. */
export const EVENT_CANDY_ICON_PATH = "data/items/icons/icon_item_usable_food_event_a_r_006.png";
/** A verified candy marker for each faction's event town. */
export const EVENT_CANDY_MAP_TARGETS = {
  light: { mapId: "world-l-a", markerId: "world-l-a-event-object-9b4c7d14411ffaa8" },
  dark: { mapId: "world-d-a", markerId: "world-d-a-event-object-e4966c3f0cc9499f" },
} as const;
export const getEventCandyMapTarget = (currentMapId: string) => currentMapId.startsWith("world-d")
  ? EVENT_CANDY_MAP_TARGETS.dark : EVENT_CANDY_MAP_TARGETS.light;
/** The unlock represented by each event product's item record. */
export const EVENT_GUIDE_UNLOCK_TARGETS: Readonly<Record<string, { category: "mounts" | "wings"; id: string }>> = {
  "534760341": { category: "mounts", id: "VehicleList:1363" },
  "534760342": { category: "mounts", id: "VehicleList:1343" },
  "532400147": { category: "wings", id: "Wing:30701000" },
  "532400148": { category: "wings", id: "Wing:40701000" },
};
export const EVENT_MISSIONS_REWARD_ITEM_ID = "960300012";
export const EVENT_ATTENDANCE_SOURCE_NAME = "Trick or Treat attendance";
export const EVENT_MISSION_OBJECTIVE_LINKS: Readonly<Record<string, { text: string; category: string; id: string }>> = {
  "239241800": { text: "Nightmare", category: "dungeons", id: "Dungeon:200003" },
};

/** Editorial class rankings shown for this game's global release. */
export const CLASS_TIER_LIST_SOURCE = {
  pages: {
    pve: "https://shugo.gg/tierlist",
    pvp: "https://shugo.gg/tierlist/pvp",
    solo: "https://shugo.gg/tierlist/solo",
  },
} as const;

/** Class portraits bundled with the app's tier-list page. */
export const CLASS_TIER_LIST_ARTWORK = {
  Assassin: "class-art/assassin.webp",
  Chanter: "class-art/chanter.webp",
  Cleric: "class-art/cleric.webp",
  Gladiator: "class-art/gladiator.webp",
  Ranger: "class-art/ranger.webp",
  Sorcerer: "class-art/sorcerer.webp",
  Spiritmaster: "class-art/spiritmaster.webp",
  Templar: "class-art/templar.webp",
} as const;

/** Class emblems from the game's official class showcase. */
export const CLASS_LEADERBOARD_EMBLEMS = {
  Assassin: "class-emblems/assassin.webp",
  Chanter: "class-emblems/chanter.webp",
  Cleric: "class-emblems/cleric.webp",
  Gladiator: "class-emblems/gladiator.webp",
  Ranger: "class-emblems/ranger.webp",
  Sorcerer: "class-emblems/sorcerer.webp",
  Spiritmaster: "class-emblems/spiritmaster.webp",
  Templar: "class-emblems/templar.webp",
} as const;

/** Verified achievement objectives missing from the bundled reference text. */
export const ACHIEVEMENT_OBJECTIVE_CONTEXT: Record<string,
  | { kind: "sealed-dungeon-clear"; region: string }
  | { kind: "object-open"; target: string }
> = {
  "Achievement:323100100": { kind: "sealed-dungeon-clear", region: "Verteron" },
  "Achievement:423100100": { kind: "sealed-dungeon-clear", region: "Altgard" },
  "Achievement:320100400": { kind: "object-open", target: "Hidden Cubes" },
  "Achievement:420100400": { kind: "object-open", target: "Hidden Cubes" },
};

/** Portal lifetime in the decoded portal records, separate from time inside. */
export const EXTRA_SCHEDULED_EVENTS = [{
  id: "spacetime-rift", name: "Spacetime Rift", kind: "rift" as const,
  days: [0, 1, 2, 3, 4, 5, 6], minutes: [120, 300, 480, 660, 840, 1020, 1200, 1380],
  entryWindowSeconds: 600, durationSeconds: 600,
  // Each choice opens a verified rift pin in that region; the map shows the other possible pins.
  mapTargets: [
    { mapId: "world-l-a", markerId: "world-l-a-rift-12ad8ed208df42f7" },
    { mapId: "world-l-b", markerId: "world-l-b-rift-15bb1ca530f4d0fb" },
    { mapId: "world-d-a", markerId: "world-d-a-rift-768f8b3fabcbe45c" },
    { mapId: "world-d-b", markerId: "world-d-b-rift-1816c9bdea322604" },
  ],
}];

/** Display order for the grades present in this game's item catalog. */
export const ITEM_GRADE_ORDER = ["Common", "Rare", "Heroic", "Epic", "Unique", "Special"] as const;

/** Destinations for the current client-data release notes. */
export const UPDATE_REFERENCE_LINKS = [
  { label: "updates.gamePatch.openKrao", category: "dungeons", id: "Dungeon:600004" },
  { label: "updates.gamePatch.openDraupnir", category: "dungeons", id: "Dungeon:600033" },
  { label: "updates.gamePatch.openAriel", category: "boards", id: "" },
  { label: "updates.gamePatch.openCrystal", category: "items", id: "531900901" },
  { label: "updates.gamePatch.openAchievements", category: "achievements", id: "Achievement:330101300" },
] as const;

export const CURRENT_UPDATE = {
  highlights: ["expeditions", "progression"],
  links: [
    { key: "urugugu", category: "dungeons", id: "Dungeon:600013" },
    { key: "vakron", category: "dungeons", id: "Dungeon:600073" },
    { key: "daily", category: "dungeons", id: "Dungeon:900002" },
    { key: "recipes", category: "recipes", id: "ConversionRecipe:31050014" },
    { key: "assassin", category: "skills", id: "Skill:13310000" },
    { key: "attendance", category: "seasons", id: "Attendance:1025" },
    { key: "pass", category: "seasons", id: "BattlePass:601322" },
    { key: "gathering", category: "progression", id: "ContentsUnlock:18" },
    { key: "abyss", category: "achievements", id: "Achievement:230211500" },
    { key: "items", category: "items", id: "" },
  ],
} as const;

const categoryGroups = new Map<string, ItemCategoryGroup>(
  Object.entries(ITEM_CATEGORY_GROUPS).flatMap(([group, categories]) =>
    categories.map((category) => [category, group as ItemCategoryGroup] as const),
  ),
);

export const getItemCategoryGroup = (category: string): ItemCategoryGroup => categoryGroups.get(category) ?? "other";

/** The class id the manifest hotkeys are registered under. */
export const PRIMARY_GAME_CLASS_ID = GAME_CONFIG.gameClassIds[0]!;

/**
 * Whether an Overwolf game-info payload describes the targeted game. Class id
 * is authoritative; the title regex is a fallback in case a callback ever
 * reports a numerically different id shape.
 */
export const isTargetGame = (
  gameInfo?: { classId?: number; title?: string } | null,
): boolean => {
  if (!gameInfo) return false;
  const classId = Number(gameInfo.classId);
  if (GAME_CONFIG.gameClassIds.includes(classId)) return true;
  if (GAME_CONFIG.launcherClassIds?.includes(classId)) return false;
  return GAME_CONFIG.gameTitlePattern.test(String(gameInfo.title ?? ""));
};

/** Packages and catalogue prices verified in this app's Tebex category. */
export const SUBSCRIPTION_CONFIG = {
  protocolScheme: GAME_CONFIG.protocolScheme,
  premiumPackageIds: { monthly: 7813924, quarterly: 7815468, annual: 7813925 },
  premiumPackageTiers: { monthly: 1, quarterly: 1, annual: 2 },
  premiumPrices: {
    monthly: { price: 4.99, currency: 'USD' },
    quarterly: { price: 12.99, currency: 'USD' },
    annual: { price: 39.99, currency: 'USD' },
  },
} as const;

/** Independent, text-only channel; does not switch game-content releases. */
export const SUBSCRIPTION_LOCALE_CONFIG = {"origin": "https://aion2.ingredientassets.com", "slug": "aion-2", "languages": ["en", "ko", "ja", "de", "fr", "es", "pt-BR", "ru"]} as const;
