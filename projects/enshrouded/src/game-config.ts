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
 */
export interface GameConfig {
  /** App language choices supported by this game's bundled text catalog. */
  supportedAppLanguages: readonly string[];
  /** Optional game-text catalog, separate from the app's own UI translations. */
  gameLocaleDirectory?: string;
  /** App-authored catalog prose and display aliases, bundled beside game text. */
  contentLocaleDirectory?: string;
  /** UI locale packs available in the selected immutable content release. */
  appLocaleDirectory?: string;
  /** Match app language choices to the game's localization package names. */
  gameLocaleCodes?: Readonly<Record<string, string>>;
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

/** Game-specific catalogs will be replaced when Enshrouded data is supplied. */
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
  supportedAppLanguages: ["en", "de", "fr", "it", "es", "ru", "pl", "ja", "ko", "pt-BR", "th", "tr", "zh-Hans", "zh-Hant", "uk"],
  gameLocaleDirectory: "data/enshrouded/locales",
  contentLocaleDirectory: "data/enshrouded/content-locales",
  appLocaleDirectory: "data/enshrouded/app-locales",
  gameLocaleCodes: {
    en: "en-us", de: "de-de", fr: "fr-fr", it: "it-it", es: "es-es",
    ru: "ru-ru", pl: "pl-pl", ja: "ja-jp", ko: "ko-kr", "pt-BR": "pt-br",
    th: "th-th", tr: "tr-tr", "zh-Hans": "zh-cn", "zh-Hant": "zh-tw", uk: "uk-ua",
  },
  appName: "Enshrouded Companion",
  appSlug: "enshrouded-map",
  gameName: "Enshrouded",
  gameClassIds: [23946],
  launcherClassIds: [],
  diagnosticGameClassIds: [],
  developerName: "Keen Games",
  itemDatabaseBuild: "",
  developerTermsUrl: "",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLScOlL9wY1pbu7XDRrmhXFte3GAnVWIrDABt1AUHi_RzhjzISw/viewform",
  protocolScheme: "enshroudedmap",
};

/** Immutable R2 release used by production builds; development still reads local content. */
export const APP_LOCALE_RELEASE = {
  contentBaseUrl: "https://enshrouded.ingredientassets.com/releases/110f375cfe4cd80d0d9fa896",
  baseUrl: "https://enshrouded.ingredientassets.com/locales/enshrouded/ui/releases/de8e8d00223040753f10bafd",
};

export const DEFAULT_CONTENT_BASE_URL = "https://enshrouded.ingredientassets.com/releases/8fa95eccb30c86daec86ff42";

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
export const REFERENCE_NAV_CATEGORIES: readonly string[] = [];
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
export const isTargetGameExecutable = (gameInfo?: { executionPath?: string } | null): boolean =>
  /(?:^|[\\/])enshrouded\.exe$/i.test(String(gameInfo?.executionPath ?? ""));

export const isGameDetectionCandidate = (gameInfo?: {
  classId?: number; executionPath?: string;
} | null): boolean => {
  if (!gameInfo) return false;
  const classId = Number(gameInfo.classId);
  return GAME_CONFIG.gameClassIds.includes(classId) ||
    (GAME_CONFIG.diagnosticGameClassIds.includes(classId) && isTargetGameExecutable(gameInfo));
};

/** Require the actual game class ID; launcher titles are not game evidence. */
export const isTargetGame = (gameInfo?: { classId?: number } | null): boolean =>
  Boolean(gameInfo && GAME_CONFIG.gameClassIds.includes(Number(gameInfo.classId)));
