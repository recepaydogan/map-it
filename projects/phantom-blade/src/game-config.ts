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
 * See README.md for the content and integration setup checklist.
 */
export interface GameConfig {
  /** App language choices supported by this game's bundled text catalog. */
  supportedAppLanguages: readonly string[];
  /** Enable only when this game has corresponding verified content/integration. */
  features: { characterProfiles: boolean; factionFilters: boolean; livePosition: boolean };
  /** Optional game-text catalog, separate from the app's own UI translations. */
  gameLocaleDirectory?: string;
  /** Match app language choices to the game's localization package names. */
  gameLocaleCodes?: Readonly<Record<string, string>>;
  /** Namespace/key resources extracted from the installed game's locres files. */
  gameLocaleFormat?: "native";
  /** Optional companion rewards keyed by their source entity reference. */
  mapCompanionSourcesPath?: string;
  /** Optional bundled catalog of verified entity and marker artwork. */
  entityArtworkPath?: string;
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
  /** Game ids observed only to measure beta detection; they never enable app windows. */
  diagnosticGameClassIds: number[];
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
}

/** Game-specific catalogs start empty until verified game data is supplied. */
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
  supportedAppLanguages: ["en", "zh-Hans", "zh-Hant", "de", "fr", "es", "es-419", "it", "pt-BR", "pt", "ru", "ja", "ko", "th", "vi"],
  gameLocaleDirectory: "data/locales/phantom-blade-zero",
  gameLocaleFormat: "native",
  gameLocaleCodes: { en: "en-US", "zh-Hans": "zh-Hans", "zh-Hant": "zh-Hant", de: "de", fr: "fr", es: "es-ES", "es-419": "es-419", it: "it", "pt-BR": "pt-BR", pt: "pt-PT", ru: "ru", ja: "ja", ko: "ko", th: "th", vi: "vi" },
  features: { characterProfiles: false, factionFilters: false, livePosition: true },
  appName: "Phantom Blade Interactive Map",
  appSlug: "phantom-blade-app",
  gameName: "Phantom Blade Zero",
  gameClassIds: [28310],
  launcherClassIds: [],
  diagnosticGameClassIds: [],
  developerName: "",
  itemDatabaseBuild: "",
  developerTermsUrl: "",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLScSY9JoM2DStmmXiVyP1DcP-qYVEu8YU-o9vQMI50tN5G43Tw/viewform",
  protocolScheme: "phantombladeapp",
};

/** Published content used by normal builds and development until the next manual R2 release. */
export const DEFAULT_CONTENT_BASE_URL = "";
export const POSITION_PROFILES_URL = "https://pzb.ingredientassets.com/live-position/profiles-v1.json";

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
export const REFERENCE_NAV_CATEGORIES: readonly string[] = ["items"];
/** Gameplay equipment first, followed by general inventory, reading and cosmetics. */
export const NATIVE_ITEM_GROUP_ORDER: readonly string[] = [
  "weapons", "phantom-edges", "accessories", "medicines", "inventory", "books", "appearances",
];
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
export const PRIMARY_GAME_CLASS_ID = GAME_CONFIG.gameClassIds[0];

/** Only explicitly supported game class IDs enable game-dependent behavior. */
export const isTargetGame = (gameInfo?: { classId?: number } | null): boolean =>
  Boolean(gameInfo && GAME_CONFIG.gameClassIds.includes(Number(gameInfo.classId)));
export const isGameDetectionCandidate = isTargetGame;
