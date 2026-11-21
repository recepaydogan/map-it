/**
 * Everything that makes this build a specific game's map app lives here.
 *
 * Branching the base for a new game starts with this file, then:
 *   - public/manifest.json — `meta.name`, `game_targeting` / `launch_events`
 *     game and launcher ids and `url_protocol.scheme` must match the values below
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
  /** Match app language choices to the game's localization package names. */
  gameLocaleCodes?: Readonly<Record<string, string>>;
  /** Optional companion rewards keyed by their source entity reference. */
  mapCompanionSourcesPath?: string;
  /** Optional bundled catalog of verified entity and marker artwork. */
  entityArtworkPath?: string;
  /** Show shop panels for games with a tabbed merchant shop catalog. */
  enableMerchantShops?: boolean;
  /** Product name shown in the title bar, tray and store listing. */
  appName: string;
  /** Kebab-case identifier used for the release package file name. */
  appSlug: string;
  /** The game this companion is for, as shown in copy ("when {{game}} starts"). */
  gameName: string;
  /**
   * Overwolf game class ids the app reacts to. Every game callback fires for
   * ANY running game, so all game logic funnels through `isTargetGame`.
   * Must match `game_targeting.game_ids` in public/manifest.json.
   */
  gameClassIds: number[];
  /** Launcher ids that auto-launch the app but do not enable the in-game overlay. */
  launcherClassIds: number[];
  /** The studio behind the game, for the legal notice. */
  developerName: string;
  /** Build used for the bundled item catalog. */
  itemDatabaseBuild: string;
  /** Where the legal notice links to; empty hides the link. */
  developerTermsUrl: string;
  /** Discord invite shown in the title bar; empty hides the button. */
  discordInviteUrl: string;
  /** Public http(s) survey opened on uninstall; empty skips it. */
  uninstallSurveyUrl: string;
  /**
   * Reserved custom URL scheme. Must match `data.url_protocol.scheme` in
   * public/manifest.json.
   */
  protocolScheme: string;
  /** Tebex packages that grant this app's ad-free entitlement. */
  premiumPackageIds: Readonly<Record<"monthly" | "quarterly" | "annual" | "lifetime", number>>;
  premiumPackageTiers: Readonly<Record<"monthly" | "quarterly" | "annual" | "lifetime", number>>;
}

/** Game-specific catalogs start empty until World of Warcraft data is supplied. */
export const ITEM_CATEGORY_LABEL_KEYS: Record<string, string> = {};
export const ITEM_SOUL_EFFECT = "";
export const ITEM_RECIPE_ENHANCEMENT_REQUIREMENT = {
  recipeGroup: "",
  descriptionPattern: /$^/,
} as const;
export const COLLECTIBLE_PROGRESSION = { itemIds: [] as readonly string[], referenceGroup: "" };
export const ACQUISITION_CREATURE_ID_PREFIX = "";
export const ENTITY_ARTWORK_FALLBACKS: Record<string, string> = {};
export const ACTIVITY_CHALLENGE_ARTWORK_ID = (familyId: string): string | undefined => { void familyId; return undefined; };

export const GAME_CONFIG: GameConfig = {
  supportedAppLanguages: ["en", "de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"],
  gameLocaleDirectory: "data/locales/wow-forever",
  gameLocaleCodes: {
    de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
    "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW",
  },
  appName: "WoW Forever Map",
  appSlug: "wow-forever-map",
  gameName: "World of Warcraft: Forever",
  gameClassIds: [28268],
  launcherClassIds: [],
  developerName: "Blizzard Entertainment",
  itemDatabaseBuild: "70291",
  developerTermsUrl: "",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeUmHdRg5o5rCQe8LAUSAqRZjxArSnv0rSJPS_i6J8g-_lOvA/viewform",
  protocolScheme: "wowforevermap",
  premiumPackageIds: { monthly: 7793904, quarterly: 7815469, annual: 7797990, lifetime: 7797992 },
  premiumPackageTiers: { monthly: 1, quarterly: 1, annual: 2, lifetime: 3 },
};

/** Published content used by normal builds and development until the next manual R2 release. */
export const DEFAULT_CONTENT_BASE_URL = "https://wowforever.ingredientassets.com/releases/cd1f8b6eaf470abc1cd6ac40";

/** Dungeon artwork and guide data are published as a separate immutable release. */
export const DEFAULT_DUNGEON_CONTENT_BASE_URL = "https://wowforever.ingredientassets.com/releases/62a94cf22684bd8253e00b27";

/** Verified snapshot used if the locale channel has not been cached and cannot be reached. */
export const DEFAULT_LOCALE_CONTENT_BASE_URL = "https://wowforever.ingredientassets.com/releases/c017fa2eab90ce8c4a23be45";
/** Keep this catalog paired with its quest translation source while the shared locale channel serves older clients. */
export const USE_PINNED_LOCALE_RELEASE = true;

export const ITEM_CATEGORY_GROUPS = {
  weapons: [] as string[], armor: [] as string[], accessories: [] as string[],
  consumables: [] as string[], crafting: [] as string[], enhancements: [] as string[],
  collectibles: [] as string[], rewards: [] as string[], currency: [] as string[],
};
export const CREATURE_REWARD_LAYOUT_TRIAL = { creatureId: "", weaponCategories: [] as readonly string[] };
export type ItemCategoryGroup = keyof typeof ITEM_CATEGORY_GROUPS | "other";
export const WEEKLY_MISSIONS_REFERENCE = { category: "", group: "" } as const;
export const ACHIEVEMENT_OBJECTIVE_CONTEXT: Record<string, { kind: "sealed-dungeon-clear"; region: string } | { kind: "object-open"; target: string }> = {};
export const EXTRA_SCHEDULED_EVENTS: { id: string; name: string; kind: "rift"; days: number[]; minutes: number[]; entryWindowSeconds: number; durationSeconds: number; mapTargets: { mapId: string; markerId: string }[] }[] = [];
export const ITEM_GRADE_ORDER: string[] = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"];
export const REFERENCE_NAV_CATEGORIES = ["items", "classes", "races", "professions", "spells", "dungeons", "guides"] as const;
export const ITEM_GRADE_COLORS: Record<string, string> = {
  Poor: "text-[#aaa9a7]",
  Common: "text-[#f1f1f1]",
  Uncommon: "text-[#63dd50]",
  Rare: "text-[#65a8ee]",
  Epic: "text-[#c4a9ee]",
  Legendary: "text-[#ff9b37]",
  Artifact: "text-[#e6cc80]",
  Heirloom: "text-[#00ccff]",
};
export const getItemCategoryGroup = (category: string): ItemCategoryGroup => {
  const itemClass = category.split(" · ", 1)[0];
  if (itemClass === "Weapon" || itemClass === "Projectile" || itemClass === "Quiver") return "weapons";
  if (itemClass === "Armor") return "armor";
  if (itemClass === "Consumable") return "consumables";
  if (itemClass === "Trade Goods") return "crafting";
  if (itemClass === "Quest") return "rewards";
  return "other";
};
export const PRIMARY_GAME_CLASS_ID = GAME_CONFIG.gameClassIds[0]!;
export const GEP_FEATURES = ["gep_internal", "game_info", "player_info", "location"] as const;
/** Only the standalone Forever client receives the companion addon. */
export const POSITION_ADDON_CONFIG = {
  clientDirectory: "_forever_",
  executable: "Wow.exe",
  installDirectory: "World of Warcraft",
  addonDirectory: "wfm-position-bridge",
  savedVariables: "WFM_CharacterDB",
  // Legacy channel metadata; the application consumes only SavedVariables files.
  protocolVersion: 1,
  // Older app versions keep using v1, which has no on-screen position card.
  cdnBaseUrl: "https://wowforever.ingredientassets.com/addons/wow-forever/position-bridge/v2",
  positionCardVersion: "0.1.6",
  startTrackerVersion: "0.1.7",
  currentVersion: "0.1.8",
  checkIntervalMs: 60_000,
  downloadTimeoutMs: 8_000,
} as const;

/** Require the actual game class ID; launcher titles are not game evidence. */
export const isTargetGame = (gameInfo?: { classId?: number } | null): boolean =>
  Boolean(gameInfo && GAME_CONFIG.gameClassIds.includes(Number(gameInfo.classId)));

/** Independent, text-only channel; does not switch game-content releases. */
export const SUBSCRIPTION_LOCALE_CONFIG = {"origin": "https://wowforever.ingredientassets.com", "slug": "wow-forever", "languages": ["en", "de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]} as const;
