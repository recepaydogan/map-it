/**
 * Everything that makes this build a specific game's map app lives here.
 *
 * Branching the base for a new game starts with this file, then:
 *   - public/manifest.json — `meta.name`, `game_targeting` / `launch_events`
 *     game ids must match the values below
 *     (`npm run validate` checks that);
 *   - src/features/map/map-registry.ts — which maps the app ships;
 *   - src/features/map/map-config.ts — marker categories and their icons;
 *   - brand/icon-master.png — then `npm run build:icons`;
 *   - .env — the new app's own Supabase project and PostHog key.
 *
 * See docs/branching-guide.md for the full checklist.
 */
export interface GameConfig {
  /** Product name shown in the title bar, tray and store listing. */
  appName: string;
  /** Kebab-case identifier used for the release package file name. */
  appSlug: string;
  /** Stable namespace for existing local data across product renames. */
  storageNamespace: string;
  /** The game this companion is for, as shown in copy ("when {{game}} starts"). */
  gameName: string;
  /**
   * Overwolf game class ids the app reacts to. Every game callback fires for
   * ANY running game, so all game logic funnels through `isTargetGame`.
   * Must match `game_targeting.game_ids` in public/manifest.json.
   */
  gameClassIds: number[];
  /** Fallback identity check on the running game's title. */
  gameTitlePattern: RegExp;
  /** The studio behind the game, for the legal notice. */
  developerName: string;
  /** Where the legal notice links to; empty hides the link. */
  developerTermsUrl: string;
  /** Discord invite shown in the title bar; empty hides the button. */
  discordInviteUrl: string;
  /** Public http(s) survey opened on uninstall; empty skips it. */
  uninstallSurveyUrl: string;
}

/** A missing altitude keeps the player's current Y rather than inventing a safe height. */
export const formatGameTeleportCommand = (point: { x: number; y: number | null; z: number }) =>
  `/tp ${Math.floor(point.x)} ${point.y === null ? "~" : Math.floor(point.y)} ${Math.floor(point.z)}`;

export const GAME_CONFIG: GameConfig = {
  appName: "Minecraft Companion",
  appSlug: "minecraft-companion",
  storageNamespace: "minecraft-map",
  gameName: "Minecraft",
  gameClassIds: [8032, 22176],
  gameTitlePattern: /^minecraft(?!\s+(?:dungeons|legends)(?:\s|$))(?:\s|$)/i,
  developerName: "Mojang Studios",
  developerTermsUrl: "https://www.minecraft.net/usage-guidelines",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdipDA57GCqj4wX3DSEszRg4QB8bhmYaKxEvIO5pnYJZB8MiQ/viewform",
};

/** The class id the manifest hotkeys are registered under. */
export const PRIMARY_GAME_CLASS_ID = GAME_CONFIG.gameClassIds[0]!;

/**
 * Whether an Overwolf game-info payload describes the targeted game. Class id
 * is authoritative; the title regex is a fallback only when the callback
 * does not provide a class id.
 */
export const isTargetGame = (
  gameInfo?: { classId?: number; title?: string } | null,
): boolean => {
  if (!gameInfo) return false;
  if (gameInfo.classId != null) return GAME_CONFIG.gameClassIds.includes(Number(gameInfo.classId));
  return GAME_CONFIG.gameTitlePattern.test(String(gameInfo.title ?? ""));
};

/** Provider identities and dimension aliases belong to the game configuration. */
export const GAME_EDITIONS = [
  { id: "java", labelKey: "worlds.editions.java", gameClassId: 8032 },
  { id: "bedrock", labelKey: "worlds.editions.bedrock", gameClassId: 22176 },
] as const;

/** Standalone titles shown by the guide. A game becomes selectable when it has at least one packaged guide source. */
export const GAME_GUIDE_GAMES = [
  { id: "minecraft", labelKey: "inspector.games.minecraft", hasEditions: true },
] as const;

/** The first craftable item shown when the crafting planner has no saved targets. */
export const DEFAULT_CRAFTING_TARGET_ID = "minecraft:bow";

/** Release identifiers and world types offered by the world generator UI. Every selectable combination must have a map preview. */
export const GAME_WORLD_CATALOG = {
  java: { versions: ["26.3", "26.2", "1.21.10", "1.21.9", "1.21.3", "1.20.6", "1.18.2"], presets: [
    { id: "default", labelKey: "worlds.defaultPreset" },
    { id: "large-biomes", labelKey: "worlds.largeBiomesPreset" },
    { id: "amplified", labelKey: "worlds.amplifiedPreset" },
    { id: "flat", labelKey: "worlds.flatPreset" },
    { id: "single-biome", labelKey: "worlds.singleBiomePreset", versions: ["1.21.3", "1.20.6"] },
  ] },
  bedrock: { versions: ["26.52", "26.51", "26.45", "1.21.121", "1.21.120", "1.21.60", "1.21.50"], presets: [
    { id: "default", labelKey: "worlds.defaultPreset" },
    { id: "flat", labelKey: "worlds.flatPreset" },
  ] },
} as const;

/** A reviewed subset present in both official Java 1.20.6 and 1.21.3 registries. */
export const GAME_CUSTOM_WORLD_BIOMES = [
  { id: "minecraft:plains", labelKey: "worlds.biomes.plains" },
  { id: "minecraft:forest", labelKey: "worlds.biomes.forest" },
  { id: "minecraft:cherry_grove", labelKey: "worlds.biomes.cherryGrove" },
  { id: "minecraft:snowy_plains", labelKey: "worlds.biomes.snowyPlains" },
  { id: "minecraft:snowy_slopes", labelKey: "worlds.biomes.snowySlopes" },
  { id: "minecraft:jagged_peaks", labelKey: "worlds.biomes.jaggedPeaks" },
  { id: "minecraft:frozen_peaks", labelKey: "worlds.biomes.frozenPeaks" },
  { id: "minecraft:desert", labelKey: "worlds.biomes.desert" },
  { id: "minecraft:savanna", labelKey: "worlds.biomes.savanna" },
  { id: "minecraft:jungle", labelKey: "worlds.biomes.jungle" },
  { id: "minecraft:swamp", labelKey: "worlds.biomes.swamp" },
  { id: "minecraft:badlands", labelKey: "worlds.biomes.badlands" },
  { id: "minecraft:mushroom_fields", labelKey: "worlds.biomes.mushroomFields" },
  { id: "minecraft:deep_dark", labelKey: "worlds.biomes.deepDark" },
  { id: "minecraft:ocean", labelKey: "worlds.biomes.ocean" },
] as const;

/** A bounded block subset present in both reviewed Java 1.20.6 and 1.21.3 registries. */
export const GAME_CUSTOM_FLAT_BLOCKS = [
  { id: "minecraft:dirt", labelKey: "worlds.blocks.dirt" },
  { id: "minecraft:stone", labelKey: "worlds.blocks.stone" },
  { id: "minecraft:sandstone", labelKey: "worlds.blocks.sandstone" },
  { id: "minecraft:sand", labelKey: "worlds.blocks.sand" },
  { id: "minecraft:deepslate", labelKey: "worlds.blocks.deepslate" },
  { id: "minecraft:snow_block", labelKey: "worlds.blocks.snowBlock" },
  { id: "minecraft:packed_ice", labelKey: "worlds.blocks.packedIce" },
  { id: "minecraft:white_concrete", labelKey: "worlds.blocks.whiteConcrete" },
  { id: "minecraft:grass_block", labelKey: "worlds.blocks.grassBlock" },
  { id: "minecraft:glass", labelKey: "worlds.blocks.glass" },
] as const;

export const GAME_CUSTOM_FLAT_LIMITS = {
  minLayerHeight: 1,
  maxLayerHeight: 382,
  /** One additional bedrock foundation layer is always emitted. */
  maxConfiguredHeight: 383,
} as const;

/** Exact pack-format pins read from the corresponding official Mojang server artifacts. */
export const GAME_CUSTOM_WORLD_EXPORTS = [
  { edition: "java", version: "1.20.6", preset: "single-biome", packFormat: 41 },
  { edition: "java", version: "1.21.3", preset: "single-biome", packFormat: 57 },
  { edition: "java", version: "1.20.6", preset: "flat", packFormat: 41 },
  { edition: "java", version: "1.21.3", preset: "flat", packFormat: 57 },
] as const;

const gameVanillaOtherDimensions = () => ({
  "minecraft:the_end": { type: "minecraft:the_end", generator: { type: "minecraft:noise",
    biome_source: { type: "minecraft:the_end" }, settings: "minecraft:end" } },
  "minecraft:the_nether": { type: "minecraft:the_nether", generator: { type: "minecraft:noise",
    biome_source: { type: "minecraft:multi_noise", preset: "minecraft:nether" }, settings: "minecraft:nether" } },
});

/** Minecraft-specific registry content stays in game configuration rather than the reusable ZIP writer. */
export const gameSingleBiomeWorldPreset = (biome: string) => ({ dimensions: {
  "minecraft:overworld": { type: "minecraft:overworld", generator: { type: "minecraft:noise",
    biome_source: { type: "minecraft:fixed", biome }, settings: "minecraft:overworld" } },
  ...gameVanillaOtherDimensions(),
} });

export interface GameFlatWorldOptions {
  biome: string;
  baseBlock: string;
  baseHeight: number;
  surfaceBlock: string;
  surfaceHeight: number;
  structures: boolean;
  features: boolean;
  lakes: boolean;
}

export const gameFlatWorldPreset = (options: GameFlatWorldOptions) => ({ dimensions: {
  "minecraft:overworld": { type: "minecraft:overworld", generator: { type: "minecraft:flat", settings: {
    biome: options.biome,
    features: options.features,
    lakes: options.lakes,
    layers: [
      { block: "minecraft:bedrock", height: 1 },
      { block: options.baseBlock, height: options.baseHeight },
      { block: options.surfaceBlock, height: options.surfaceHeight },
    ],
    structure_overrides: options.structures ? ["minecraft:strongholds", "minecraft:villages"] : [],
  } } },
  ...gameVanillaOtherDimensions(),
} });

export const WORLD_LIBRARY_CONFIG = {
  databaseName: `${GAME_CONFIG.storageNamespace}:world-library`,
  terrainHandleDatabaseName: `${GAME_CONFIG.storageNamespace}:terrain-directory-handles`,
  channelName: `${GAME_CONFIG.storageNamespace}:world-library:changed`,
  changePulseKey: `${GAME_CONFIG.storageNamespace}:world-library:change-pulse`,
  detachedPreviewKeyPrefix: `${GAME_CONFIG.storageNamespace}:world-preview:v1`,
  exampleWorld: {
    id: `${GAME_CONFIG.storageNamespace}:example-world`,
    initializedMetaId: "example-world-initialized",
    nameKey: "worlds.example.name",
    edition: "java",
    version: GAME_WORLD_CATALOG.java.versions[0],
    preset: "default",
  },
};

/** Stable bridge slots: upstream enum values differ between editions and must never cross the ABI. */
export const GAME_STRUCTURE_TYPES = [
  { id: "village", symbol: "Village", knowledgeId: "minecraft:village", group: "settlements", icon: "home", color: "#e8c66c", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-artwork/villager-head.png", preview: "/guide-structures/village.webp" },
  { id: "desert-pyramid", symbol: "Desert_Pyramid", knowledgeId: "minecraft:desert_pyramid", group: "exploration", icon: "landmark", color: "#e6b282", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-structure-markers/desert-pyramid.svg", preview: "/guide-structures/desert-pyramid.webp" },
  { id: "jungle-temple", symbol: "Jungle_Temple", knowledgeId: "minecraft:jungle_pyramid", group: "exploration", icon: "landmark", color: "#99cb8a", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-structure-markers/jungle-temple.svg", preview: "/guide-structures/jungle-temple.webp" },
  { id: "swamp-hut", symbol: "Swamp_Hut", knowledgeId: "minecraft:swamp_hut", group: "exploration", icon: "home", color: "#c3a9de", artwork: "/guide-structure-markers/swamp-hut.svg", preview: "/guide-structures/swamp-hut.webp" },
  { id: "igloo", symbol: "Igloo", knowledgeId: "minecraft:igloo", group: "exploration", icon: "home", color: "#d4e9f3", artwork: "/guide-structure-markers/igloo.svg", preview: "/guide-structures/igloo.webp" },
  { id: "ocean-ruin", minimumMarkerZoomPercentage: 80, symbol: "Ocean_Ruin", knowledgeId: "minecraft:ocean_ruin", group: "ocean", icon: "waves", color: "#96cfde", markerScale: 0.7, iconScale: 0.7, artwork: "/guide-structure-markers/ocean-ruin.svg", preview: "/guide-structures/ocean-ruin.webp" },
  { id: "shipwreck", symbol: "Shipwreck", knowledgeId: "minecraft:shipwreck", group: "ocean", icon: "ship", color: "#c5ba9b", artwork: "/guide-structure-markers/shipwreck.svg", preview: "/guide-structures/shipwreck.webp" },
  { id: "monument", symbol: "Monument", knowledgeId: "minecraft:monument", group: "ocean", icon: "landmark", color: "#80d4c9", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-entities/minecraft_guardian.png", preview: "/guide-structures/monument.webp" },
  { id: "mansion", symbol: "Mansion", knowledgeId: "minecraft:mansion", group: "settlements", icon: "castle", color: "#cba698", artwork: "/guide-structure-markers/woodland-mansion.svg", preview: "/guide-structures/mansion.webp" },
  { id: "outpost", symbol: "Outpost", knowledgeId: "minecraft:pillager_outpost", group: "settlements", icon: "flag", color: "#dfa194", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-artwork/crossbow.png", preview: "/guide-structures/outpost.webp" },
  { id: "ruined-portal", minimumMarkerZoomPercentage: 80, symbol: "Ruined_Portal", knowledgeId: "minecraft:ruined_portal", group: "portals", icon: "portal", color: "#cc9de6", markerScale: 0.7, iconScale: 0.7, artwork: "/guide-structure-markers/ruined-portal.svg", preview: "/guide-structures/ruined-portal.webp" },
  { id: "ruined-portal-nether", minimumMarkerZoomPercentage: 80, symbol: "Ruined_Portal_N", knowledgeId: "minecraft:ruined_portal", group: "portals", icon: "portal", color: "#cc9de6", markerScale: 0.7, iconScale: 0.7, artwork: "/guide-structure-markers/ruined-portal.svg", preview: "/guide-structures/ruined-portal-nether.webp" },
  { id: "ancient-city", symbol: "Ancient_City", knowledgeId: "minecraft:ancient_city", group: "exploration", icon: "castle", color: "#8ac7d4", artwork: "/guide-structure-markers/ancient-city.svg", preview: "/guide-structures/ancient-city.webp" },
  { id: "trail-ruins", symbol: "Trail_Ruins", knowledgeId: "minecraft:trail_ruins", group: "exploration", icon: "landmark", color: "#d5b992", markerScale: 0.7, markerIconScale: 0.7, iconScale: 1.2, artwork: "/guide-artwork/brush.png", preview: "/guide-structures/trail-ruins.webp" },
  { id: "trial-chambers", minimumMarkerZoomPercentage: 80, symbol: "Trial_Chambers", knowledgeId: "minecraft:trial_chambers", group: "exploration", icon: "landmark", color: "#e9af84", artwork: "/guide-structure-markers/trial-chambers.svg", preview: "/guide-structures/trial-chambers.webp" },
  { id: "fortress", symbol: "Fortress", knowledgeId: "minecraft:fortress", group: "nether", icon: "castle", color: "#e79f96", artwork: "/guide-artwork/nether_bricks.png", darkArtwork: true, preview: "/guide-structures/fortress.webp" },
  { id: "bastion", symbol: "Bastion", knowledgeId: "minecraft:bastion_remnant", group: "nether", icon: "castle", color: "#e5c47a", artwork: "/guide-artwork/gilded_blackstone.png", darkArtwork: true, preview: "/guide-structures/bastion.webp" },
  { id: "end-city", symbol: "End_City", knowledgeId: "minecraft:end_city", group: "end", icon: "castle", color: "#cfafe0", artwork: "/guide-artwork/purpur_block.png", preview: "/guide-structures/end-city.webp" },
  { id: "stronghold", symbol: "Stronghold", javaSymbol: "ENGINE_STRONGHOLD", loadPriority: "deferred", knowledgeId: "minecraft:stronghold", group: "settlements", icon: "castle", color: "#9fae91", markerScale: 1.3, iconScale: 1.3, artwork: "/guide-artwork/ender_eye.png", preview: "/guide-structures/stronghold.webp" },
  { id: "mineshaft", minimumMarkerZoomPercentage: 80, symbol: "Mineshaft", knowledgeId: "minecraft:mineshaft", group: "exploration", icon: "landmark", color: "#b58b61", markerScale: 0.7, iconScale: 0.7, artwork: "/guide-artwork/rail.png", preview: "/guide-structures/mineshaft.webp" },
  { id: "buried-treasure", symbol: "Treasure", knowledgeId: "minecraft:buried_treasure", group: "exploration", icon: "landmark", color: "#e1bd67", artwork: "/guide-structure-markers/buried-treasure.svg", preview: "/guide-structures/buried-treasure.webp" },
  { id: "abandoned-camp", symbol: "Abandoned_Camp", javaSymbol: "ENGINE_UNSUPPORTED_STRUCTURE", knowledgeId: "minecraft:abandoned_camp", group: "exploration", icon: "flag", color: "#d8ba84", artwork: "/guide-structure-markers/abandoned-camp.svg", preview: "/guide-structures/abandoned-camp.webp" },
] as const;

/** Static map-card facts for structures whose packaged guide source has no matching item pages. */
export const GAME_STRUCTURE_HIGHLIGHTS: Readonly<Record<string, { titleKey: string; valueKeys: readonly string[] }>> = {
  "abandoned-camp": {
    titleKey: "structureMap.highlights.abandoned-camp.title",
    valueKeys: [
      "structureMap.highlights.abandoned-camp.supplies",
      "structureMap.highlights.abandoned-camp.maps",
      "structureMap.highlights.abandoned-camp.rest",
    ],
  },
};

interface GameStructureDiscoverySubject {
  readonly id: string;
  readonly since?: Readonly<Record<string, string>>;
}

/**
 * Curated discoveries shown on structure cards. Loot is limited to container,
 * archaeology, fixed collectible and structure-specific mob rewards; ordinary
 * construction blocks that merely make up a structure never belong here.
 */
export const GAME_STRUCTURE_DISCOVERIES = {
  village: {
    mobs: ["minecraft:villager", "minecraft:iron_golem", "minecraft:cat"],
    loot: ["minecraft:emerald", "minecraft:bread", "minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:diamond", "minecraft:saddle"],
  },
  "desert-pyramid": {
    mobs: [],
    loot: ["minecraft:enchanted_golden_apple", "minecraft:diamond", "minecraft:emerald", "minecraft:gold_ingot",
      { id: "minecraft:dune_armor_trim_smithing_template", since: { java: "1.20" } },
      { id: "minecraft:archer_pottery_sherd", since: { java: "1.20" } }],
  },
  "jungle-temple": {
    mobs: [],
    loot: ["minecraft:diamond", "minecraft:emerald", "minecraft:gold_ingot", "minecraft:iron_ingot",
      { id: "minecraft:wild_armor_trim_smithing_template", since: { java: "1.20" } }, "minecraft:enchanted_book"],
  },
  "swamp-hut": {
    mobs: ["minecraft:witch", "minecraft:cat"],
    loot: [],
  },
  igloo: {
    mobs: ["minecraft:villager", "minecraft:zombie_villager"],
    loot: ["minecraft:golden_apple", "minecraft:emerald", "minecraft:gold_nugget", "minecraft:wheat", "minecraft:apple", "minecraft:coal"],
  },
  "ocean-ruin": {
    mobs: ["minecraft:drowned"],
    loot: [{ id: "minecraft:sniffer_egg", since: { java: "1.20" } }, "minecraft:emerald", "minecraft:golden_apple", "minecraft:fishing_rod", "minecraft:coal", "minecraft:wheat"],
  },
  shipwreck: {
    mobs: ["minecraft:drowned"],
    loot: ["minecraft:diamond", "minecraft:emerald", "minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:lapis_lazuli"],
  },
  monument: {
    mobs: ["minecraft:guardian", "minecraft:elder_guardian"],
    loot: [],
  },
  mansion: {
    mobs: ["minecraft:vindicator", "minecraft:evoker", { id: "minecraft:allay", since: { java: "1.19" } }, "minecraft:vex"],
    loot: ["minecraft:totem_of_undying", "minecraft:enchanted_golden_apple", "minecraft:diamond_hoe", "minecraft:enchanted_book", "minecraft:name_tag", "minecraft:music_disc_cat"],
  },
  outpost: {
    mobs: ["minecraft:pillager", "minecraft:iron_golem", { id: "minecraft:allay", since: { java: "1.19" } }],
    loot: ["minecraft:crossbow", { id: "minecraft:goat_horn", since: { java: "1.19" } },
      { id: "minecraft:sentry_armor_trim_smithing_template", since: { java: "1.20" } },
      "minecraft:iron_ingot", "minecraft:experience_bottle", "minecraft:arrow"],
  },
  "ruined-portal": {
    mobs: [],
    loot: ["minecraft:enchanted_golden_apple", "minecraft:golden_apple", "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:golden_carrot", "minecraft:flint_and_steel"],
  },
  "ruined-portal-nether": {
    mobs: [],
    loot: ["minecraft:enchanted_golden_apple", "minecraft:golden_apple", "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:golden_carrot", "minecraft:flint_and_steel"],
  },
  "ancient-city": {
    mobs: ["minecraft:warden"],
    loot: ["minecraft:echo_shard", "minecraft:disc_fragment_5", "minecraft:enchanted_golden_apple", "minecraft:enchanted_book", "minecraft:silence_armor_trim_smithing_template", "minecraft:ward_armor_trim_smithing_template"],
  },
  "trail-ruins": {
    mobs: [],
    loot: ["minecraft:music_disc_relic", "minecraft:wayfinder_armor_trim_smithing_template", "minecraft:raiser_armor_trim_smithing_template", "minecraft:shaper_armor_trim_smithing_template", "minecraft:host_armor_trim_smithing_template", "minecraft:burn_pottery_sherd"],
  },
  "trial-chambers": {
    mobs: ["minecraft:breeze", "minecraft:bogged", "minecraft:stray", "minecraft:husk", "minecraft:cave_spider", "minecraft:silverfish"],
    loot: ["minecraft:heavy_core", "minecraft:breeze_rod", "minecraft:trial_key", "minecraft:ominous_trial_key", "minecraft:flow_armor_trim_smithing_template", "minecraft:bolt_armor_trim_smithing_template", "minecraft:music_disc_precipice"],
  },
  fortress: {
    mobs: ["minecraft:blaze", "minecraft:wither_skeleton", "minecraft:zombified_piglin", "minecraft:skeleton"],
    loot: ["minecraft:blaze_rod", "minecraft:wither_skeleton_skull", "minecraft:nether_wart", "minecraft:diamond", "minecraft:gold_ingot", "minecraft:saddle"],
  },
  bastion: {
    mobs: ["minecraft:piglin", "minecraft:piglin_brute", "minecraft:hoglin", "minecraft:magma_cube"],
    loot: [{ id: "minecraft:netherite_upgrade_smithing_template", since: { java: "1.20" } }, "minecraft:netherite_scrap",
      "minecraft:ancient_debris", "minecraft:music_disc_pigstep",
      { id: "minecraft:snout_armor_trim_smithing_template", since: { java: "1.20" } }, "minecraft:diamond"],
  },
  "end-city": {
    mobs: ["minecraft:shulker"],
    loot: ["minecraft:elytra", "minecraft:dragon_head", "minecraft:shulker_shell", "minecraft:diamond", "minecraft:diamond_sword",
      { id: "minecraft:spire_armor_trim_smithing_template", since: { java: "1.20" } }],
  },
  stronghold: {
    mobs: ["minecraft:silverfish"],
    loot: ["minecraft:ender_pearl", "minecraft:enchanted_book", "minecraft:diamond", "minecraft:iron_ingot", "minecraft:golden_apple", "minecraft:iron_pickaxe"],
  },
  mineshaft: {
    mobs: ["minecraft:cave_spider"],
    loot: ["minecraft:enchanted_golden_apple", "minecraft:name_tag", "minecraft:saddle", "minecraft:diamond", "minecraft:iron_ingot", "minecraft:melon_seeds"],
  },
  "buried-treasure": {
    mobs: [],
    loot: ["minecraft:heart_of_the_sea", "minecraft:diamond", "minecraft:emerald", "minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:prismarine_crystals"],
  },
  "abandoned-camp": {
    mobs: [],
    loot: ["minecraft:map", "minecraft:straw_bed", "minecraft:white_cushion", "minecraft:bundle",
      "minecraft:spyglass", "minecraft:saddle", "minecraft:diamond"],
  },
} as const satisfies Record<typeof GAME_STRUCTURE_TYPES[number]["id"], {
  readonly mobs: readonly (string | GameStructureDiscoverySubject)[];
  readonly loot: readonly (string | GameStructureDiscoverySubject)[];
}>;

/** Additive filter migrations expose newly introduced structure types once without overriding later user choices. */
export const GAME_STRUCTURE_FILTER_REVISION = 2;
export const GAME_STRUCTURE_FILTER_MIGRATIONS = [
  { revision: 1, added: ["stronghold", "mineshaft", "buried-treasure"] },
  { revision: 2, added: ["abandoned-camp"] },
] as const;

/** Exact Java structure registry aliases observed in the pinned official server artifacts. */
const javaSavedStructureVersions = ["1.18.2", "1.20.6", "1.21.3"] as const;
const javaSavedOverworld = ["overworld"] as const, javaSavedNether = ["nether"] as const, javaSavedEnd = ["end"] as const;
export const GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS = [
  { type: "village", ids: ["minecraft:village", "minecraft:village_plains", "minecraft:village_desert",
    "minecraft:village_savanna", "minecraft:village_snowy", "minecraft:village_taiga"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "desert-pyramid", ids: ["minecraft:desert_pyramid"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "jungle-temple", ids: ["minecraft:jungle_pyramid"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "swamp-hut", ids: ["minecraft:swamp_hut"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "igloo", ids: ["minecraft:igloo"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "ocean-ruin", ids: ["minecraft:ocean_ruin", "minecraft:ocean_ruin_cold", "minecraft:ocean_ruin_warm"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "shipwreck", ids: ["minecraft:shipwreck", "minecraft:shipwreck_beached"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "monument", ids: ["minecraft:monument"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "mansion", ids: ["minecraft:mansion"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "outpost", ids: ["minecraft:pillager_outpost"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "stronghold", ids: ["minecraft:stronghold"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "ruined-portal", ids: ["minecraft:ruined_portal", "minecraft:ruined_portal_desert",
    "minecraft:ruined_portal_jungle", "minecraft:ruined_portal_mountain", "minecraft:ruined_portal_ocean",
    "minecraft:ruined_portal_swamp"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "ruined-portal-nether", ids: ["minecraft:ruined_portal_nether"], versions: javaSavedStructureVersions, dimensions: javaSavedNether },
  { type: "ancient-city", ids: ["minecraft:ancient_city"], versions: ["1.20.6", "1.21.3"], dimensions: javaSavedOverworld },
  { type: "trail-ruins", ids: ["minecraft:trail_ruins"], versions: ["1.20.6", "1.21.3"], dimensions: javaSavedOverworld },
  { type: "trial-chambers", ids: ["minecraft:trial_chambers"], versions: ["1.21.3"], dimensions: javaSavedOverworld },
  { type: "mineshaft", ids: ["minecraft:mineshaft", "minecraft:mineshaft_mesa"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "buried-treasure", ids: ["minecraft:buried_treasure"], versions: javaSavedStructureVersions, dimensions: javaSavedOverworld },
  { type: "fortress", ids: ["minecraft:fortress"], versions: javaSavedStructureVersions, dimensions: javaSavedNether },
  { type: "bastion", ids: ["minecraft:bastion_remnant"], versions: javaSavedStructureVersions, dimensions: javaSavedNether },
  { type: "end-city", ids: ["minecraft:end_city"], versions: javaSavedStructureVersions, dimensions: javaSavedEnd },
] as const;

export const GAME_STRUCTURE_GROUPS = [
  { id: "settlements", icon: "home", artwork: "/guide-artwork/bell.png" },
  { id: "exploration", icon: "landmark", artwork: "/guide-artwork/compass.png" },
  { id: "ocean", icon: "waves", artwork: "/guide-artwork/heart_of_the_sea.png" },
  { id: "portals", icon: "portal", artwork: "/guide-artwork/crying_obsidian.png", darkArtwork: true },
  { id: "nether", icon: "castle", artwork: "/guide-artwork/nether_bricks.png", darkArtwork: true },
  { id: "end", icon: "castle", artwork: "/guide-artwork/ender_eye.png" },
] as const;

/** Structure guide availability follows the selected edition and release. */
export const GAME_GUIDE_STRUCTURE_RELEASES: Readonly<Record<string, Readonly<Partial<Record<"java" | "bedrock", string>>>>> = {
  "ancient-city": { java: "1.19", bedrock: "1.19" },
  "trail-ruins": { java: "1.20", bedrock: "1.20" },
  "trial-chambers": { java: "1.21", bedrock: "1.21" },
  "abandoned-camp": { java: "26.3", bedrock: "26.50" },
};

export const GAME_GUIDE_STRUCTURE_DIMENSIONS: Readonly<Record<string, "overworld" | "nether" | "end">> = {
  fortress: "nether", bastion: "nether", "ruined-portal-nether": "nether", "end-city": "end",
};

/** Seed discovery profiles query verified structure placement around coordinate origin, never player spawn. */
export const GAME_SEED_SEARCH_PROFILES = [
  { id: "village-origin", labelKey: "worlds.seedSearch.profiles.villageOrigin", descriptionKey: "worlds.seedSearch.profileDescriptions.villageOrigin",
    editions: ["java", "bedrock"], dimension: "overworld", attempts: 128, requirements: [{ type: "village", radius: 1024 }] },
  { id: "village-portal", labelKey: "worlds.seedSearch.profiles.villagePortal", descriptionKey: "worlds.seedSearch.profileDescriptions.villagePortal",
    editions: ["java", "bedrock"], dimension: "overworld", attempts: 192,
    requirements: [{ type: "village", radius: 1536 }, { type: "ruined-portal", radius: 1536 }] },
  { id: "ocean-adventure", labelKey: "worlds.seedSearch.profiles.oceanAdventure", descriptionKey: "worlds.seedSearch.profileDescriptions.oceanAdventure",
    editions: ["java", "bedrock"], dimension: "overworld", attempts: 192,
    requirements: [{ type: "shipwreck", radius: 1536 }, { type: "ocean-ruin", radius: 1536 }] },
  { id: "nether-fortress", labelKey: "worlds.seedSearch.profiles.netherFortress", descriptionKey: "worlds.seedSearch.profileDescriptions.netherFortress",
    editions: ["java", "bedrock"], dimension: "nether", attempts: 128, requirements: [{ type: "fortress", radius: 1536 }] },
  { id: "snowy-cherry-village", labelKey: "worlds.seedSearch.profiles.snowyCherryVillage",
    descriptionKey: "worlds.seedSearch.profileDescriptions.snowyCherryVillage", editions: ["java", "bedrock"], dimension: "overworld", attempts: 128,
    versions: [
      { edition: "java", values: ["1.20.6", "1.21.3"] },
      { edition: "bedrock", values: ["1.21.50", "1.21.60"] },
    ],
    requirements: [
      { kind: "structure", type: "village", radius: 1536 },
      { kind: "biome", type: "snowy-mountains", biomeIds: [179, 180, 181], radius: 2048, innerRadius: 512,
        scale: 256, blockY: 96, minSectors: 3 },
      { kind: "biome", type: "cherry-grove", biomeIds: [185], radius: 1536, innerRadius: 0,
        scale: 256, blockY: 96, minSectors: 1 },
    ] },
] as const;

/**
 * Hand-picked, exact-context seed candidates. Each pick is rechecked against
 * the pinned packaged engine during validation. These are origin-based
 * structure/biome candidates, not spawn, terrain-height or loot guarantees.
 */
export const GAME_CURATED_WORLD_PICKS = [
  {
    id: "snowy-cherry-village",
    labelKey: "worlds.curated.entries.snowyCherryVillage.name",
    descriptionKey: "worlds.curated.entries.snowyCherryVillage.description",
    seed: "35",
    preset: "default",
    profileId: "snowy-cherry-village",
    tagKeys: ["worlds.curated.tags.village", "worlds.curated.tags.cherryGrove", "worlds.curated.tags.snowyMountains"],
    contexts: [
      { edition: "java", versions: ["1.20.6", "1.21.3"] },
      { edition: "bedrock", versions: ["1.21.50", "1.21.60"] },
    ],
  },
  {
    id: "village-portal-route",
    labelKey: "worlds.curated.entries.villagePortalRoute.name",
    descriptionKey: "worlds.curated.entries.villagePortalRoute.description",
    seed: "8675309",
    preset: "default",
    profileId: "village-portal",
    tagKeys: ["worlds.curated.tags.village", "worlds.curated.tags.ruinedPortal"],
    contexts: [
      { edition: "java", versions: ["1.18.2", "1.20.6", "1.21.3"] },
      { edition: "bedrock", versions: ["1.21.50", "1.21.60"] },
    ],
  },
  {
    id: "ocean-expedition",
    labelKey: "worlds.curated.entries.oceanExpedition.name",
    descriptionKey: "worlds.curated.entries.oceanExpedition.description",
    seed: "123456789",
    preset: "default",
    profileId: "ocean-adventure",
    tagKeys: ["worlds.curated.tags.shipwreck", "worlds.curated.tags.oceanRuin"],
    contexts: [
      { edition: "java", versions: ["1.18.2", "1.20.6", "1.21.3"] },
      { edition: "bedrock", versions: ["1.21.50", "1.21.60"] },
    ],
  },
] as const;

/** Editorial seed discoveries. Facts and coordinates are attributed to their source; these are not app-verified world claims. */
export const GAME_SEED_DISCOVERIES = [
  { id: "dappled-canopy-island", seed: "988802989140", edition: "java", version: "26.3",
    rank: 1, titleKey: "seeds.entries.dappledCanopy.title", descriptionKey: "seeds.entries.dappledCanopy.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "forest" },
  { id: "blacksmith-cherry-villages", seed: "-4506168367535048101", edition: "java", version: "26.2",
    rank: 2, titleKey: "seeds.entries.blacksmithCherry.title", descriptionKey: "seeds.entries.blacksmithCherry.description",
    locationKey: "seeds.locations.village", x: 144, z: 221, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "cherry" },
  { id: "five-blacksmith-dappled", seed: "-4719577674963485983", edition: "bedrock", version: "26.51",
    rank: 3, titleKey: "seeds.entries.fiveBlacksmith.title", descriptionKey: "seeds.entries.fiveBlacksmith.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/ultimate-dappled-forest-five-blacksmith-god-seed-26-3", theme: "forest" },
  { id: "cave-mansion", seed: "3969050895776678404", edition: "bedrock", version: "26.51",
    rank: 4, titleKey: "seeds.entries.caveMansion.title", descriptionKey: "seeds.entries.caveMansion.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "cave" },
  { id: "dual-mountain-bowls", seed: "2048000000907840929", edition: "bedrock", version: "26.51",
    rank: 5, titleKey: "seeds.entries.dualMountainBowls.title", descriptionKey: "seeds.entries.dualMountainBowls.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "mountain" },
  { id: "dappled-double-village", seed: "-2071092601429184301", edition: "java", version: "26.3",
    rank: 6, titleKey: "seeds.entries.dappledVillages.title", descriptionKey: "seeds.entries.dappledVillages.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/massive-dappled-forest-double-village-26-3", theme: "forest" },
  { id: "burning-mountain-mansion", seed: "241193819876643765", edition: "java", version: "26.2",
    rank: 7, titleKey: "seeds.entries.burningMansion.title", descriptionKey: "seeds.entries.burningMansion.description",
    locationKey: "seeds.locations.mansion", x: 65, z: 702, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "mountain" },
  { id: "pale-forest-mansion", seed: "-572978719754796183", edition: "bedrock", version: "1.21.60",
    rank: 8, titleKey: "seeds.entries.paleMansion.title", descriptionKey: "seeds.entries.paleMansion.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/1.21.60/huge-pale-forest-woodland-mansion-bedrock", theme: "pale" },
  { id: "village-sinkhole", seed: "-3718163677266042063", edition: "bedrock", version: "26.51",
    rank: 9, titleKey: "seeds.entries.villageSinkhole.title", descriptionKey: "seeds.entries.villageSinkhole.description",
    locationKey: "seeds.locations.village", x: 117, z: 666, source: "dexerto",
    sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "cave" },
  { id: "structures-everywhere", seed: "-6164242300824111422", edition: "bedrock", version: "26.51",
    rank: 10, titleKey: "seeds.entries.structuresEverywhere.title", descriptionKey: "seeds.entries.structuresEverywhere.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "forest" },
  { id: "sulfur-spring-village", seed: "-7458262136197577737", edition: "java", version: "26.2",
    rank: 11, titleKey: "seeds.entries.sulfurVillage.title", descriptionKey: "seeds.entries.sulfurVillage.description",
    locationKey: "seeds.locations.sulfurSpring", x: 77, z: 84, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "cave" },
  { id: "dappled-ice-city", seed: "6306952185402203104", edition: "java", version: "26.3",
    rank: 12, titleKey: "seeds.entries.dappledIce.title", descriptionKey: "seeds.entries.dappledIce.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/dappled-forest-ice-spikes-ancient-city-starter-26-3", theme: "ice" },
  { id: "desert-mansion", seed: "1004652368143890613", edition: "bedrock", version: "1.21.60",
    rank: 13, titleKey: "seeds.entries.desertMansion.title", descriptionKey: "seeds.entries.desertMansion.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/1.21.60/tall-desert-mansion-spawn-bedrock", theme: "desert" },
  { id: "cherry-blossom-island", seed: "2048005618087379093", edition: "bedrock", version: "26.51",
    rank: 14, titleKey: "seeds.entries.cherryBlossomIsland.title", descriptionKey: "seeds.entries.cherryBlossomIsland.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "cherry" },
  { id: "outpost-spire", seed: "5086370485496795542", edition: "bedrock", version: "26.51",
    rank: 15, titleKey: "seeds.entries.outpostSpire.title", descriptionKey: "seeds.entries.outpostSpire.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "desert" },
  { id: "six-plains-villages", seed: "-1676721387842471871", edition: "java", version: "26.2",
    rank: 16, titleKey: "seeds.entries.sixVillages.title", descriptionKey: "seeds.entries.sixVillages.description",
    locationKey: "seeds.locations.village", x: -179, z: 94, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "plains" },
  { id: "icy-lake-village", seed: "-8887135362805734363", edition: "bedrock", version: "26.51",
    rank: 17, titleKey: "seeds.entries.icyLakeVillage.title", descriptionKey: "seeds.entries.icyLakeVillage.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "ice" },
  { id: "dark-forest-camp", seed: "4374896627388464667", edition: "java", version: "26.3",
    rank: 18, titleKey: "seeds.entries.darkForestCamp.title", descriptionKey: "seeds.entries.darkForestCamp.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/dark-forest-mansion-campsite-thumbnail-26-3", theme: "forest" },
  { id: "desert-landmarks", seed: "3546842701776989958", edition: "bedrock", version: "26.51",
    rank: 19, titleKey: "seeds.entries.desertLandmarks.title", descriptionKey: "seeds.entries.desertLandmarks.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "desert" },
  { id: "frozen-mushroom-island", seed: "5162907878268619027", edition: "java", version: "26.2",
    rank: 20, titleKey: "seeds.entries.frozenMushroom.title", descriptionKey: "seeds.entries.frozenMushroom.description",
    locationKey: "seeds.locations.mushroomIsland", x: 342, z: 283, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "ice" },
  { id: "farms-galore", seed: "9174124339225557307", edition: "bedrock", version: "26.51",
    rank: 21, titleKey: "seeds.entries.farmsGalore.title", descriptionKey: "seeds.entries.farmsGalore.description",
    locationKey: "seeds.locations.village", x: 193, z: 1325, source: "dexerto",
    sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "plains" },
  { id: "ancient-cities-mountains", seed: "-2355559329761530615", edition: "java", version: "26.2",
    rank: 22, titleKey: "seeds.entries.ancientCities.title", descriptionKey: "seeds.entries.ancientCities.description",
    locationKey: "seeds.locations.ancientCity", x: 89, z: 64, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "mountain" },
  { id: "pale-garden-campsite", seed: "-4696916708035556965", edition: "java", version: "26.3",
    rank: 23, titleKey: "seeds.entries.paleGardenCamp.title", descriptionKey: "seeds.entries.paleGardenCamp.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/pale-garden-campsite-dappled-forest-showcase-26-3", theme: "pale" },
  { id: "triple-dappled-forest", seed: "-4227634870293935746", edition: "java", version: "26.3",
    rank: 24, titleKey: "seeds.entries.tripleDappled.title", descriptionKey: "seeds.entries.tripleDappled.description",
    source: "craftmc", sourceUrl: "https://www.craftmc.net/minecraft-seeds/26.3/triple-dappled-forest-trial-ancient-city-26-3", theme: "forest" },
  { id: "desert-woodland-mansion", seed: "4861365923586916118", edition: "bedrock", version: "1.21.60",
    rank: 25, titleKey: "seeds.entries.desertWoodland.title", descriptionKey: "seeds.entries.desertWoodland.description",
    locationKey: "seeds.locations.mansion", x: 2915, z: -755, source: "craftmc",
    sourceUrl: "https://www.craftmc.net/minecraft-seeds/1.21.60/woodland-mansion-desert-bedrock", theme: "desert" },
  { id: "mansion-outpost-village", seed: "-5059790467397305529", edition: "bedrock", version: "26.51",
    rank: 26, titleKey: "seeds.entries.mansionOutpostVillage.title", descriptionKey: "seeds.entries.mansionOutpostVillage.description",
    locationKey: "seeds.locations.mansion", x: 635, z: 575, source: "dexerto",
    sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "desert" },
  { id: "giant-sulfur-cave", seed: "-1530640707674521107", edition: "java", version: "26.2",
    rank: 27, titleKey: "seeds.entries.giantSulfur.title", descriptionKey: "seeds.entries.giantSulfur.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "cave" },
  { id: "beach-sulfur-cave", seed: "110000004609178390", edition: "bedrock", version: "26.51",
    rank: 28, titleKey: "seeds.entries.beachSulfurCave.title", descriptionKey: "seeds.entries.beachSulfurCave.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "cave" },
  { id: "jungle-ruins", seed: "-2913691805926859289", edition: "java", version: "26.2",
    rank: 29, titleKey: "seeds.entries.jungleRuins.title", descriptionKey: "seeds.entries.jungleRuins.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "forest" },
  { id: "towering-cherry-grove", seed: "-5357730734904388219", edition: "java", version: "26.2",
    rank: 30, titleKey: "seeds.entries.toweringCherry.title", descriptionKey: "seeds.entries.toweringCherry.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "cherry" },
  { id: "lakeside-taiga-village", seed: "-3475255402429661292", edition: "java", version: "26.2",
    rank: 31, titleKey: "seeds.entries.lakesideTaiga.title", descriptionKey: "seeds.entries.lakesideTaiga.description",
    locationKey: "seeds.locations.village", x: 14, z: 60, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "forest" },
  { id: "island-cave", seed: "2803331009535028100", edition: "java", version: "26.2",
    rank: 32, titleKey: "seeds.entries.islandCave.title", descriptionKey: "seeds.entries.islandCave.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "plains" },
  { id: "coral-reef-village", seed: "-8939727187100402137", edition: "java", version: "26.2",
    rank: 33, titleKey: "seeds.entries.coralVillage.title", descriptionKey: "seeds.entries.coralVillage.description",
    locationKey: "seeds.locations.village", x: 42, z: -195, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "desert" },
  { id: "pale-garden-mountain-village", seed: "-1605004654521765584", edition: "java", version: "26.2",
    rank: 34, titleKey: "seeds.entries.paleMountainVillage.title", descriptionKey: "seeds.entries.paleMountainVillage.description",
    locationKey: "seeds.locations.village", x: 214, z: 89, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "pale" },
  { id: "desert-sulfur-village", seed: "-8394952921809917630", edition: "java", version: "26.2",
    rank: 35, titleKey: "seeds.entries.desertSulfurVillage.title", descriptionKey: "seeds.entries.desertSulfurVillage.description",
    locationKey: "seeds.locations.village", x: 68, z: -378, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "desert" },
  { id: "floating-savanna-village", seed: "-6656210799395337004", edition: "java", version: "26.2",
    rank: 36, titleKey: "seeds.entries.floatingSavanna.title", descriptionKey: "seeds.entries.floatingSavanna.description",
    locationKey: "seeds.locations.village", x: 156, z: 166, source: "gameskinny",
    sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "plains" },
  { id: "pale-mountain-valley", seed: "-4815228680549827820", edition: "java", version: "26.2",
    rank: 37, titleKey: "seeds.entries.paleMountainValley.title", descriptionKey: "seeds.entries.paleMountainValley.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "pale" },
  { id: "sulfur-mineshafts", seed: "-1679061930708508284", edition: "java", version: "26.2",
    rank: 38, titleKey: "seeds.entries.sulfurMineshafts.title", descriptionKey: "seeds.entries.sulfurMineshafts.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "cave" },
  { id: "mangrove-island", seed: "8333718681500713232", edition: "java", version: "26.2",
    rank: 39, titleKey: "seeds.entries.mangroveIsland.title", descriptionKey: "seeds.entries.mangroveIsland.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "forest" },
  { id: "taiga-trail-ruins", seed: "2758357117648231365", edition: "java", version: "26.2",
    rank: 40, titleKey: "seeds.entries.taigaTrailRuins.title", descriptionKey: "seeds.entries.taigaTrailRuins.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "forest" },
  { id: "cold-ocean-shipwreck", seed: "2363585944145083458", edition: "java", version: "26.2",
    rank: 41, titleKey: "seeds.entries.coldOceanShipwreck.title", descriptionKey: "seeds.entries.coldOceanShipwreck.description",
    source: "gameskinny", sourceUrl: "https://www.gameskinny.com/tips/top-20-best-minecraft-26-2-seeds/", theme: "ice" },
  { id: "quad-taiga-villages", seed: "302304127329527063", edition: "java", version: "26.3",
    rank: 42, titleKey: "seeds.entries.quadTaigaVillages.title", descriptionKey: "seeds.entries.quadTaigaVillages.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "forest" },
  { id: "dual-snowy-villages", seed: "6969000000015129972", edition: "java", version: "26.3",
    rank: 43, titleKey: "seeds.entries.dualSnowyVillages.title", descriptionKey: "seeds.entries.dualSnowyVillages.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "ice" },
  { id: "dappled-river-island", seed: "888881380494245676", edition: "java", version: "26.3",
    rank: 44, titleKey: "seeds.entries.dappledRiverIsland.title", descriptionKey: "seeds.entries.dappledRiverIsland.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "forest" },
  { id: "glacial-autumn-island", seed: "1728186647319", edition: "java", version: "26.3",
    rank: 45, titleKey: "seeds.entries.glacialAutumn.title", descriptionKey: "seeds.entries.glacialAutumn.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "mountain" },
  { id: "scattered-seasons", seed: "6889192652397090698", edition: "java", version: "26.3",
    rank: 46, titleKey: "seeds.entries.scatteredSeasons.title", descriptionKey: "seeds.entries.scatteredSeasons.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "cherry" },
  { id: "dappled-forest-range", seed: "2582740", edition: "java", version: "26.3",
    rank: 47, titleKey: "seeds.entries.dappledRange.title", descriptionKey: "seeds.entries.dappledRange.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "mountain" },
  { id: "cherry-lake-village", seed: "6246468738900744", edition: "java", version: "26.3",
    rank: 48, titleKey: "seeds.entries.cherryLakeVillage.title", descriptionKey: "seeds.entries.cherryLakeVillage.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "cherry" },
  { id: "cherry-grove-village-spawn", seed: "712262452098460", edition: "java", version: "26.3",
    rank: 49, titleKey: "seeds.entries.cherryGroveVillage.title", descriptionKey: "seeds.entries.cherryGroveVillage.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "cherry" },
  { id: "mesa-crater", seed: "8888947383120075748", edition: "java", version: "26.3",
    rank: 50, titleKey: "seeds.entries.mesaCrater.title", descriptionKey: "seeds.entries.mesaCrater.description",
    source: "beebom", sourceUrl: "https://beebom.com/best-minecraft-seeds/", theme: "desert" },
  { id: "three-biome-village", seed: "3352005318418358678", edition: "bedrock", version: "26.51",
    rank: 51, titleKey: "seeds.entries.threeBiomeVillage.title", descriptionKey: "seeds.entries.threeBiomeVillage.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "cherry" },
  { id: "perfect-mountain", seed: "869159556220025427", edition: "bedrock", version: "26.51",
    rank: 52, titleKey: "seeds.entries.perfectMountain.title", descriptionKey: "seeds.entries.perfectMountain.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "mountain" },
  { id: "mountain-bowl", seed: "100000108020204029", edition: "bedrock", version: "26.51",
    rank: 53, titleKey: "seeds.entries.mountainBowl.title", descriptionKey: "seeds.entries.mountainBowl.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "mountain" },
  { id: "water-sinkhole", seed: "4209176801731150281", edition: "bedrock", version: "26.51",
    rank: 54, titleKey: "seeds.entries.waterSinkhole.title", descriptionKey: "seeds.entries.waterSinkhole.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "ice" },
  { id: "coral-reef-desert", seed: "2730736955036560709", edition: "bedrock", version: "26.51",
    rank: 55, titleKey: "seeds.entries.coralReefDesert.title", descriptionKey: "seeds.entries.coralReefDesert.description",
    source: "dexerto", sourceUrl: "https://www.dexerto.com/minecraft/best-minecraft-seeds-codes-1494121/", theme: "desert" },
] as const;

/** Pinned engine evaluation profiles. These are not yet advertised game compatibility. */
export const GAME_SEED_ENGINE_SOURCES = [
  { edition: "java", repository: "Cubitect/cubiomes", revision: "e61f90580cbdd883214a8054670dacae655e59c0",
    archiveSha256: "bc75f5d1343b5dcd53ced53fe0ca61f3ef6424b67b93ecfcae7c9609d08e76c7",
    directory: "cubiomes-e61f90580cbdd883214a8054670dacae655e59c0",
    files: ["noise.c", "biomes.c", "layers.c", "biomenoise.c", "generator.c", "finders.c"],
    profiles: [
      { id: "1.18.2", symbol: "MC_1_18" }, { id: "1.18.2:large-biomes", symbol: "MC_1_18", flags: 1 },
      { id: "1.20.6", symbol: "MC_1_20" }, { id: "1.20.6:large-biomes", symbol: "MC_1_20", flags: 1 },
      { id: "1.21.3", symbol: "MC_1_21_3" }, { id: "1.21.3:large-biomes", symbol: "MC_1_21_3", flags: 1 },
      { id: "1.21.9", symbol: "MC_1_21_WD" }, { id: "1.21.9:large-biomes", symbol: "MC_1_21_WD", flags: 1 },
      { id: "1.21.10", symbol: "MC_1_21_WD" }, { id: "1.21.10:large-biomes", symbol: "MC_1_21_WD", flags: 1 },
      { id: "26.2", symbol: "MC_1_21_WD" }, { id: "26.2:large-biomes", symbol: "MC_1_21_WD", flags: 1 },
      { id: "26.3", symbol: "MC_1_21_WD" }, { id: "26.3:large-biomes", symbol: "MC_1_21_WD", flags: 1 },
    ] },
  { edition: "bedrock", repository: "FragrantResult186/cubiomes-bedrock", revision: "533cbe2a51a3d8cd41547040d50d91a00ac76e43",
    archiveSha256: "a62b7e1e0571c77b2b32a13dd6d9322b5729ff8548572a802bea1c91fda51302",
    directory: "cubiomes-bedrock-533cbe2a51a3d8cd41547040d50d91a00ac76e43",
    files: ["noise.c", "biomes.c", "layers.c", "biomenoise.c", "generator.c", "mt.c", "cave.c", "finders.c"],
    profiles: [{ id: "1.21.50", symbol: "MC_1_21_50" }, { id: "1.21.60", symbol: "MC_1_21_60" },
      { id: "1.21.120", symbol: "MC_26_20" }, { id: "1.21.121", symbol: "MC_26_20" },
      { id: "26.45", symbol: "MC_26_20" }, { id: "26.51", symbol: "MC_26_50" },
      { id: "26.52", symbol: "MC_26_50" }] },
] as const;

/** Explicit experimental biome/structure-candidate profiles; neither block terrain nor in-game certified compatibility. */
export const GAME_BIOME_PREVIEWS = GAME_SEED_ENGINE_SOURCES.map(source => ({
  kind: "seeded" as const, edition: source.edition, revision: source.revision, profiles: source.profiles.map(profile => profile.id),
  versions: GAME_WORLD_CATALOG[source.edition].versions,
  generationProfiles: Object.fromEntries(GAME_WORLD_CATALOG[source.edition].versions.flatMap(version => source.edition === "java" ? [
    [JSON.stringify([version, "default"]), version], [JSON.stringify([version, "amplified"]), version],
    [JSON.stringify([version, "large-biomes"]), `${version}:large-biomes`],
  ] : [[JSON.stringify([version, "default"]), version]])),
  url: `seed-engines/${source.edition}.wasm`,
  sha256: source.edition === "java" ? "9b18b2d492d540413fab396ea6fc65b96deb405830c5191dca78305b793ba223" : "1001d2ea533506374f399ea999d14f1e8983333da31532526e428b00556568c7",
  bytes: source.edition === "java" ? 506317 : 723182,
  licenseSha256: "894d391566a3bb235b1df6c278960b2083769076b0199a0a367c771b05a74120",
}));

export const GAME_MAP_DIMENSIONS = [
  { id: "overworld", code: 0, labelKey: "biomeMap.overworld", artwork: "/guide-artwork/grass_block.png" },
  { id: "nether", code: -1, labelKey: "biomeMap.nether", artwork: "/guide-artwork/netherrack.png" },
  { id: "end", code: 1, labelKey: "biomeMap.end", artwork: "/guide-artwork/end_stone.png" },
] as const;

/** Version-pinned density data for a seed-only preview, not saved-world reconstruction. */
export const GAME_SEED_TERRAIN = {
  edition: "java", namespace: "minecraft", repository: "misode/mcmeta",
  prefix: "data/minecraft/worldgen/", defaultBiome: "minecraft:plains",
  settings: { overworld: "overworld", nether: "nether", end: "end", amplified: "amplified", "large-biomes": "large_biomes" } as Readonly<Record<string, string>>,
  sources: [
    { version: "26.2", revision: "4d12c0553e21e461085d08dcb2c5d412398c494e" },
    { version: "1.21.10", revision: "afb6ac210373b06a564d1a79f13e030e425a1a54" },
    { version: "1.21.9", revision: "6f6f9210d90f4ec07b5738fa44704631a3207ec1" },
    { version: "1.21.3", revision: "01d29eb3fbe000efd47e55b8c813b1ba83a3ff18" },
    { version: "1.20.6", revision: "211174d69ecba5e4dc8f31466dfa006225223812" },
  ],
};

/** Explicit vanilla horizontal coordinate transforms; portal search/linking is intentionally outside this model. */
export const GAME_PORTAL_PROJECTIONS = [
  { edition: "java", versions: GAME_WORLD_CATALOG.java.versions, sourceDimension: "overworld", targetDimension: "nether", horizontalScale: 1 / 8 },
  { edition: "java", versions: GAME_WORLD_CATALOG.java.versions, sourceDimension: "nether", targetDimension: "overworld", horizontalScale: 8 },
  { edition: "bedrock", versions: GAME_WORLD_CATALOG.bedrock.versions, sourceDimension: "overworld", targetDimension: "nether", horizontalScale: 1 / 8 },
  { edition: "bedrock", versions: GAME_WORLD_CATALOG.bedrock.versions, sourceDimension: "nether", targetDimension: "overworld", horizontalScale: 8 },
] as const;

export const GAME_PORTAL_PLAN_APPEARANCE = {
  icon: "portal",
  color: "#cc9de6",
  group: "portal-plans",
  coordinateLimit: 30_000_000,
} as const;

export const GAME_OBSERVED_PORTAL_APPEARANCE = {
  artwork: "/guide-structure-markers/nether-portal.svg",
  group: "travel",
  maxTransitionGapMs: 20_000,
  maxTargetOffset: 32,
  mergeDistance: 8,
} as const;

/** Suffixes below an explicitly selected Java world directory; never used for implicit disk discovery. */
export const GAME_JAVA_REGION_DIRECTORY_SEGMENTS: Readonly<Record<string, readonly string[]>> = {
  overworld: ["region"],
  nether: ["DIM-1", "region"],
  end: ["DIM1", "region"],
};

/** Modern registry identities and original schematic colors keyed to the pinned engines' numeric IDs. */
export const GAME_BIOMES = [
  { id: 0, registryId: "minecraft:ocean", labelKey: "biomeMap.biomes.ocean", color: "#0876e8" },
  { id: 1, registryId: "minecraft:plains", labelKey: "biomeMap.biomes.plains", color: "#69d83a" },
  { id: 2, registryId: "minecraft:desert", labelKey: "biomeMap.biomes.desert", color: "#f2ec7f" },
  { id: 3, registryId: "minecraft:windswept_hills", labelKey: "biomeMap.biomes.windsweptHills", color: "#747d89" },
  { id: 4, registryId: "minecraft:forest", labelKey: "biomeMap.biomes.forest", color: "#009423" },
  { id: 5, registryId: "minecraft:taiga", labelKey: "biomeMap.biomes.taiga", color: "#3eaa58" },
  { id: 6, registryId: "minecraft:swamp", labelKey: "biomeMap.biomes.swamp", color: "#3f6428" },
  { id: 7, registryId: "minecraft:river", labelKey: "biomeMap.biomes.river", color: "#238cf0" },
  { id: 8, registryId: "minecraft:nether_wastes", labelKey: "biomeMap.biomes.netherWastes", color: "#b7473f" },
  { id: 9, registryId: "minecraft:the_end", labelKey: "biomeMap.biomes.theEnd", color: "#d0ce70" },
  { id: 10, registryId: "minecraft:frozen_ocean", labelKey: "biomeMap.biomes.frozenOcean", color: "#4d80f3" },
  { id: 11, registryId: "minecraft:frozen_river", labelKey: "biomeMap.biomes.frozenRiver", color: "#76adfb" },
  { id: 12, registryId: "minecraft:snowy_plains", labelKey: "biomeMap.biomes.snowyPlains", color: "#e9f1f3" },
  { id: 14, registryId: "minecraft:mushroom_fields", labelKey: "biomeMap.biomes.mushroomFields", color: "#812fc4" },
  { id: 16, registryId: "minecraft:beach", labelKey: "biomeMap.biomes.beach", color: "#f3ee81" },
  { id: 21, registryId: "minecraft:jungle", labelKey: "biomeMap.biomes.jungle", color: "#00851d" },
  { id: 23, registryId: "minecraft:sparse_jungle", labelKey: "biomeMap.biomes.sparseJungle", color: "#4dc84c" },
  { id: 24, registryId: "minecraft:deep_ocean", labelKey: "biomeMap.biomes.deepOcean", color: "#0900c7" },
  { id: 25, registryId: "minecraft:stony_shore", labelKey: "biomeMap.biomes.stonyShore", color: "#626873" },
  { id: 26, registryId: "minecraft:snowy_beach", labelKey: "biomeMap.biomes.snowyBeach", color: "#d7e8ec" },
  { id: 27, registryId: "minecraft:birch_forest", labelKey: "biomeMap.biomes.birchForest", color: "#89e34d" },
  { id: 29, registryId: "minecraft:dark_forest", labelKey: "biomeMap.biomes.darkForest", color: "#006d18" },
  { id: 30, registryId: "minecraft:snowy_taiga", labelKey: "biomeMap.biomes.snowyTaiga", color: "#4e9f7c" },
  { id: 32, registryId: "minecraft:old_growth_pine_taiga", labelKey: "biomeMap.biomes.oldGrowthPineTaiga", color: "#17783a" },
  { id: 34, registryId: "minecraft:windswept_forest", labelKey: "biomeMap.biomes.windsweptForest", color: "#2c8a45" },
  { id: 35, registryId: "minecraft:savanna", labelKey: "biomeMap.biomes.savanna", color: "#a3ed05" },
  { id: 36, registryId: "minecraft:savanna_plateau", labelKey: "biomeMap.biomes.savannaPlateau", color: "#72b600" },
  { id: 37, registryId: "minecraft:badlands", labelKey: "biomeMap.biomes.badlands", color: "#db7434" },
  { id: 38, registryId: "minecraft:wooded_badlands", labelKey: "biomeMap.biomes.woodedBadlands", color: "#a86d3d" },
  { id: 40, registryId: "minecraft:small_end_islands", labelKey: "biomeMap.biomes.smallEndIslands", color: "#989c52" },
  { id: 41, registryId: "minecraft:end_midlands", labelKey: "biomeMap.biomes.endMidlands", color: "#b6b95e" },
  { id: 42, registryId: "minecraft:end_highlands", labelKey: "biomeMap.biomes.endHighlands", color: "#d7d978" },
  { id: 43, registryId: "minecraft:end_barrens", labelKey: "biomeMap.biomes.endBarrens", color: "#777b3e" },
  { id: 44, registryId: "minecraft:warm_ocean", labelKey: "biomeMap.biomes.warmOcean", color: "#00a6e8" },
  { id: 45, registryId: "minecraft:lukewarm_ocean", labelKey: "biomeMap.biomes.lukewarmOcean", color: "#006eee" },
  { id: 46, registryId: "minecraft:cold_ocean", labelKey: "biomeMap.biomes.coldOcean", color: "#315fd4" },
  { id: 48, registryId: "minecraft:deep_lukewarm_ocean", labelKey: "biomeMap.biomes.deepLukewarmOcean", color: "#1300ed" },
  { id: 49, registryId: "minecraft:deep_cold_ocean", labelKey: "biomeMap.biomes.deepColdOcean", color: "#13009c" },
  { id: 50, registryId: "minecraft:deep_frozen_ocean", labelKey: "biomeMap.biomes.deepFrozenOcean", color: "#294db0" },
  { id: 129, registryId: "minecraft:sunflower_plains", labelKey: "biomeMap.biomes.sunflowerPlains", color: "#a2ef08" },
  { id: 131, registryId: "minecraft:windswept_gravelly_hills", labelKey: "biomeMap.biomes.windsweptGravellyHills", color: "#62666c" },
  { id: 132, registryId: "minecraft:flower_forest", labelKey: "biomeMap.biomes.flowerForest", color: "#72dc42" },
  { id: 140, registryId: "minecraft:ice_spikes", labelKey: "biomeMap.biomes.iceSpikes", color: "#b8d8fa" },
  { id: 155, registryId: "minecraft:old_growth_birch_forest", labelKey: "biomeMap.biomes.oldGrowthBirchForest", color: "#70d24b" },
  { id: 160, registryId: "minecraft:old_growth_spruce_taiga", labelKey: "biomeMap.biomes.oldGrowthSpruceTaiga", color: "#216c42" },
  { id: 163, registryId: "minecraft:windswept_savanna", labelKey: "biomeMap.biomes.windsweptSavanna", color: "#83c600" },
  { id: 165, registryId: "minecraft:eroded_badlands", labelKey: "biomeMap.biomes.erodedBadlands", color: "#d65c2f" },
  { id: 168, registryId: "minecraft:bamboo_jungle", labelKey: "biomeMap.biomes.bambooJungle", color: "#00aa2d" },
  { id: 170, registryId: "minecraft:soul_sand_valley", labelKey: "biomeMap.biomes.soulSandValley", color: "#775b48" },
  { id: 171, registryId: "minecraft:crimson_forest", labelKey: "biomeMap.biomes.crimsonForest", color: "#b21e42" },
  { id: 172, registryId: "minecraft:warped_forest", labelKey: "biomeMap.biomes.warpedForest", color: "#008c82" },
  { id: 173, registryId: "minecraft:basalt_deltas", labelKey: "biomeMap.biomes.basaltDeltas", color: "#4e4b54" },
  { id: 174, registryId: "minecraft:dripstone_caves", labelKey: "biomeMap.biomes.dripstoneCaves", color: "#8c684c" },
  { id: 175, registryId: "minecraft:lush_caves", labelKey: "biomeMap.biomes.lushCaves", color: "#2fab61" },
  { id: 177, registryId: "minecraft:meadow", labelKey: "biomeMap.biomes.meadow", color: "#a7e95e" },
  { id: 178, registryId: "minecraft:grove", labelKey: "biomeMap.biomes.grove", color: "#9ec4a5" },
  { id: 179, registryId: "minecraft:snowy_slopes", labelKey: "biomeMap.biomes.snowySlopes", color: "#e2ecef" },
  { id: 180, registryId: "minecraft:jagged_peaks", labelKey: "biomeMap.biomes.jaggedPeaks", color: "#aab6c4" },
  { id: 181, registryId: "minecraft:frozen_peaks", labelKey: "biomeMap.biomes.frozenPeaks", color: "#dcecf4" },
  { id: 182, registryId: "minecraft:stony_peaks", labelKey: "biomeMap.biomes.stonyPeaks", color: "#8f9497" },
  { id: 183, registryId: "minecraft:deep_dark", labelKey: "biomeMap.biomes.deepDark", color: "#182438" },
  { id: 184, registryId: "minecraft:mangrove_swamp", labelKey: "biomeMap.biomes.mangroveSwamp", color: "#315f31" },
  { id: 185, registryId: "minecraft:cherry_grove", labelKey: "biomeMap.biomes.cherryGrove", color: "#e99bd7" },
  { id: 186, registryId: "minecraft:pale_garden", labelKey: "biomeMap.biomes.paleGarden", color: "#aab8a7" },
  { id: 187, registryId: "minecraft:sulfur_caves", labelKey: "biomeMap.biomes.sulfurCaves", color: "#d9c43e" },
  { id: 188, registryId: "minecraft:dappled_forest", labelKey: "biomeMap.biomes.dappledForest", color: "#b28a45" },
] as const;

export const GAME_BIOME_COLORS: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(GAME_BIOMES.map(biome => [biome.id, biome.color])),
);

/** Muted cartographic colors for the raster; guide and legend swatches retain their semantic palette. */
export const GAME_BIOME_RASTER_COLORS: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(GAME_BIOMES.map(biome => {
    const rgb = Number.parseInt(biome.color.slice(1), 16);
    const channels = [rgb >> 16, (rgb >> 8) & 255, rgb & 255];
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    const graded = channels.map(channel => Math.round((channel * 0.72 + luminance * 0.28) * 0.9)
      .toString(16).padStart(2, "0")).join("");
    return [biome.id, `#${graded}`];
  })),
);

/** Decorative canopy patterns for the seed preview; these do not locate generated trees. */
const GAME_BIOME_CANOPY_BY_NAME: Readonly<Record<string, { density: number; spacing: number; radius: number }>> = {
  forest: { density: 0.72, spacing: 9, radius: 4.1 },
  flower_forest: { density: 0.58, spacing: 10, radius: 4 },
  birch_forest: { density: 0.65, spacing: 9, radius: 3.8 },
  old_growth_birch_forest: { density: 0.72, spacing: 10, radius: 4.4 },
  dark_forest: { density: 0.94, spacing: 8, radius: 4.8 },
  windswept_forest: { density: 0.48, spacing: 11, radius: 4 },
  dappled_forest: { density: 0.68, spacing: 9, radius: 4.1 },
  taiga: { density: 0.64, spacing: 10, radius: 3.8 },
  snowy_taiga: { density: 0.66, spacing: 10, radius: 3.8 },
  old_growth_pine_taiga: { density: 0.78, spacing: 10, radius: 4.5 },
  old_growth_spruce_taiga: { density: 0.82, spacing: 10, radius: 4.5 },
  jungle: { density: 0.85, spacing: 9, radius: 4.5 },
  sparse_jungle: { density: 0.38, spacing: 11, radius: 4.2 },
  bamboo_jungle: { density: 0.76, spacing: 8, radius: 3.6 },
  swamp: { density: 0.45, spacing: 11, radius: 4 },
  mangrove_swamp: { density: 0.72, spacing: 9, radius: 4.2 },
  cherry_grove: { density: 0.53, spacing: 11, radius: 4.6 },
  pale_garden: { density: 0.71, spacing: 9, radius: 4.2 },
  grove: { density: 0.48, spacing: 11, radius: 3.8 },
  wooded_badlands: { density: 0.27, spacing: 13, radius: 3.3 },
};
export const GAME_BIOME_CANOPY_STYLES = Object.freeze(Object.fromEntries(GAME_BIOMES.flatMap(biome => {
  const style = GAME_BIOME_CANOPY_BY_NAME[biome.registryId.slice("minecraft:".length)];
  return style ? [[biome.id, style]] : [];
})));

/** Game-specific traversal preferences consumed by the reusable generated-map route finder. */
export const GAME_ROUTE_PROFILE = Object.freeze({
  defaultCost: 1,
  biomeCosts: Object.freeze(Object.fromEntries(GAME_BIOMES.map(biome => {
    const id = biome.registryId;
    const cost = /ocean|river/.test(id) ? 7
      : /peaks|windswept|ice_spikes|basalt_deltas|soul_sand_valley/.test(id) ? 2.6
        : /swamp|jungle|dark_forest|old_growth|pale_garden/.test(id) ? 1.65
          : /badlands|stony_shore|grove|snowy_slopes/.test(id) ? 1.35 : 1;
    return [biome.id, cost];
  }))),
});

const configuredBiomeIds = Object.freeze(Object.fromEntries(GAME_BIOMES.map(biome => [biome.registryId, biome.id])));
/** Flat and single-biome worlds have a truthful uniform 2D biome surface and no fabricated structure candidates. */
export const GAME_UNIFORM_BIOME_PREVIEWS = [
  { kind: "uniform" as const, edition: "java", versions: GAME_WORLD_CATALOG.java.versions, preset: "flat",
    biomeIds: configuredBiomeIds, defaultBiomeId: 1 },
  { kind: "uniform" as const, edition: "java", versions: GAME_WORLD_CATALOG.java.versions, preset: "single-biome",
    biomeIds: configuredBiomeIds, defaultBiomeId: 1 },
  { kind: "uniform" as const, edition: "bedrock", versions: GAME_WORLD_CATALOG.bedrock.versions, preset: "flat",
    biomeIds: configuredBiomeIds, defaultBiomeId: 1 },
] as const;

export const GAME_WORLD_MAP_PREVIEWS = [...GAME_BIOME_PREVIEWS, ...GAME_UNIFORM_BIOME_PREVIEWS] as const;

/** Broad guide-only biome families keep spawn relationships readable without discarding exact biome records. */
export const GAME_GUIDE_BIOME_FAMILIES = [
  { id: "forests", labelKey: "inspector.biomeFamilies.forests", biomeIds: ["bamboo_jungle", "birch_forest", "cherry_grove", "dappled_forest", "dark_forest",
    "flower_forest", "forest", "jungle", "mangrove_swamp", "old_growth_birch_forest", "old_growth_pine_taiga",
    "old_growth_spruce_taiga", "pale_garden", "snowy_taiga", "sparse_jungle", "swamp", "taiga", "windswept_forest"] },
  { id: "meadows", labelKey: "inspector.biomeFamilies.meadows", biomeIds: ["ice_spikes", "meadow", "mushroom_fields", "plains", "savanna",
    "savanna_plateau", "snowy_plains", "sunflower_plains", "windswept_savanna"] },
  { id: "oceans", labelKey: "inspector.biomeFamilies.oceans", biomeIds: ["beach", "cold_ocean", "deep_cold_ocean", "deep_frozen_ocean",
    "deep_lukewarm_ocean", "deep_ocean", "frozen_ocean", "frozen_river", "lukewarm_ocean", "ocean", "river", "snowy_beach",
    "stony_shore", "warm_ocean"] },
  { id: "mountains", labelKey: "inspector.biomeFamilies.mountains", biomeIds: ["deep_dark", "dripstone_caves", "frozen_peaks", "grove",
    "jagged_peaks", "lush_caves", "snowy_slopes", "stony_peaks", "sulfur_caves", "windswept_gravelly_hills", "windswept_hills"] },
  { id: "deserts", labelKey: "inspector.biomeFamilies.deserts", biomeIds: ["badlands", "desert", "eroded_badlands", "wooded_badlands"] },
  { id: "nether", labelKey: "inspector.biomeFamilies.nether", biomeIds: ["basalt_deltas", "crimson_forest", "nether_wastes", "soul_sand_valley",
    "warped_forest"] },
  { id: "end", labelKey: "inspector.biomeFamilies.end", biomeIds: ["end_barrens", "end_highlands", "end_midlands", "small_end_islands", "the_end", "the_void"] },
] as const;

/** Bedrock's published biome samples retain legacy registry filenames. */
export const GAME_GUIDE_BEDROCK_BIOME_ALIASES: Readonly<Record<string, string>> = {
  windswept_hills: "extreme_hills", swamp: "swampland", nether_wastes: "hell", snowy_plains: "ice_plains",
  mushroom_fields: "mushroom_island", sparse_jungle: "jungle_edge", stony_shore: "stone_beach",
  snowy_beach: "cold_beach", dark_forest: "roofed_forest", snowy_taiga: "cold_taiga",
  old_growth_pine_taiga: "mega_taiga", windswept_forest: "extreme_hills_plus_trees",
  badlands: "mesa", wooded_badlands: "mesa_plateau_stone",
  windswept_gravelly_hills: "extreme_hills_mutated", ice_spikes: "ice_plains_spikes",
  old_growth_birch_forest: "birch_forest_mutated", old_growth_spruce_taiga: "redwood_taiga_mutated",
  windswept_savanna: "savanna_mutated", eroded_badlands: "mesa_bryce", soul_sand_valley: "soulsand_valley",
};

export const GAME_GUIDE_BEDROCK_BIOME_SOURCE = {
  edition: "bedrock", version: "26.52", repository: "Mojang/bedrock-samples",
  revision: "46ba6ea985fb5a92d79a9419198f10dda14c199d",
  tag: "v1.26.50.4", prefix: "behavior_pack/biomes/",
} as const;
export const GAME_GUIDE_BEDROCK_BIOME_UNAVAILABLE = new Set([
  "small_end_islands", "end_midlands", "end_highlands", "end_barrens",
]);

/** Biome landmarks presented as navigable guide relationships. */
const baseBiomeLandmarks: Record<string, readonly string[]> = {
  plains: ["minecraft:village", "minecraft:pillager_outpost"],
  desert: ["minecraft:desert_pyramid", "minecraft:village"],
  jungle: ["minecraft:jungle_pyramid"],
  swamp: ["minecraft:swamp_hut"],
  snowy_plains: ["minecraft:igloo", "minecraft:village"],
  deep_dark: ["minecraft:ancient_city"],
  badlands: ["minecraft:mineshaft"],
  dark_forest: ["minecraft:mansion"],
  deep_ocean: ["minecraft:monument", "minecraft:ocean_ruin", "minecraft:shipwreck"],
  ocean: ["minecraft:ocean_ruin", "minecraft:shipwreck"],
  warm_ocean: ["minecraft:ocean_ruin", "minecraft:shipwreck"],
  end_highlands: ["minecraft:end_city"],
  nether_wastes: ["minecraft:fortress", "minecraft:bastion_remnant"],
};
const abandonedCampBiomes = ["meadow", "cherry_grove", "forest", "birch_forest", "old_growth_birch_forest",
  "flower_forest", "windswept_forest", "dappled_forest", "taiga", "snowy_taiga", "old_growth_spruce_taiga",
  "old_growth_pine_taiga", "sparse_jungle", "bamboo_jungle", "swamp", "savanna", "wooded_badlands",
  "pale_garden"] as const;
export const GAME_GUIDE_BIOME_LANDMARKS: Readonly<Record<string, readonly string[]>> = {
  ...baseBiomeLandmarks,
  ...Object.fromEntries(abandonedCampBiomes.map(biome => [biome,
    [...(baseBiomeLandmarks[biome] ?? []), "minecraft:abandoned_camp"]])),
};
export const GAME_GUIDE_BIOME_RESOURCES: Readonly<Record<string, readonly string[]>> = {
  badlands: ["minecraft:red_sand", "minecraft:terracotta", "minecraft:gold_ore"],
  deep_dark: ["minecraft:sculk", "minecraft:sculk_sensor"],
  dappled_forest: ["minecraft:poplar_log", "minecraft:poplar_sapling", "minecraft:red_shrub",
    "minecraft:shelf_mushroom"],
};

export const GAME_GUIDE_BIOME_ICON_ITEMS: Readonly<Record<string, string>> = {
  forests: "minecraft:grass_block", meadows: "minecraft:grass_block", oceans: "minecraft:water_bucket",
  mountains: "minecraft:stone", deserts: "minecraft:sand", nether: "minecraft:netherrack", end: "minecraft:end_stone",
  badlands: "minecraft:red_sand", eroded_badlands: "minecraft:red_sand", wooded_badlands: "minecraft:terracotta",
  bamboo_jungle: "minecraft:bamboo_block", cherry_grove: "minecraft:cherry_log", dark_forest: "minecraft:dark_oak_log",
  dappled_forest: "minecraft:poplar_log",
  pale_garden: "minecraft:pale_moss_block", mangrove_swamp: "minecraft:mud", swamp: "minecraft:mud",
  mushroom_fields: "minecraft:mycelium", snowy_plains: "minecraft:snow_block", ice_spikes: "minecraft:packed_ice",
  frozen_ocean: "minecraft:ice", deep_frozen_ocean: "minecraft:packed_ice", snowy_beach: "minecraft:snow_block",
  snowy_slopes: "minecraft:snow_block", jagged_peaks: "minecraft:stone", frozen_peaks: "minecraft:packed_ice",
  deep_dark: "minecraft:deepslate", lush_caves: "minecraft:moss_block", sulfur_caves: "minecraft:sulfur",
  dripstone_caves: "minecraft:dripstone_block", basalt_deltas: "minecraft:basalt",
  crimson_forest: "minecraft:crimson_nylium", warped_forest: "minecraft:warped_nylium",
  soul_sand_valley: "minecraft:soul_sand", nether_wastes: "minecraft:netherrack",
};
export const GAME_GUIDE_BIOME_OMIT_MATERIALS = new Set(["minecraft:water"]);

/** Stable terrain relationships for editions whose packaged biome data has no surface field. */
export const GAME_GUIDE_BLOCK_BIOMES: Readonly<Record<string, readonly string[]>> = {
  "minecraft:grass_block": ["plains", "sunflower_plains", "meadow", "forest", "savanna"],
  "minecraft:sand": ["desert", "beach", "warm_ocean"],
  "minecraft:red_sand": ["badlands", "eroded_badlands", "wooded_badlands"],
  "minecraft:mycelium": ["mushroom_fields"],
  "minecraft:mud": ["mangrove_swamp"],
  "minecraft:sculk": ["deep_dark"],
  "minecraft:sculk_sensor": ["deep_dark"],
  "minecraft:moss_block": ["lush_caves"],
  "minecraft:pale_moss_block": ["pale_garden"],
  "minecraft:snow_block": ["snowy_plains", "grove", "snowy_slopes"],
  "minecraft:ice": ["frozen_ocean", "frozen_river"],
  "minecraft:packed_ice": ["ice_spikes", "frozen_ocean"],
  "minecraft:basalt": ["basalt_deltas"],
  "minecraft:soul_sand": ["soul_sand_valley"],
  "minecraft:end_stone": ["the_end", "end_highlands"],
};
export const GAME_GUIDE_BLOCK_HIGHLIGHTS = new Set([
  "minecraft:grass_block", "minecraft:sand", "minecraft:red_sand", "minecraft:mycelium",
  "minecraft:sculk", "minecraft:crafting_table", "minecraft:furnace", "minecraft:smithing_table",
  "minecraft:brewing_stand", "minecraft:enchanting_table", "minecraft:obsidian", "minecraft:ancient_debris",
  "minecraft:bedrock", "minecraft:end_portal_frame", "minecraft:budding_amethyst",
]);
/** Verified behavior for blocks that have no useful recipe or drop relationship. */
export const GAME_GUIDE_BLOCK_PROFILES = {
  "minecraft:bedrock": [
    { key: "location", links: [] },
    { key: "survival", links: [] },
  ],
  "minecraft:end_portal_frame": [
    { key: "location", links: [{ kind: "poi", id: "minecraft:stronghold" }] },
    { key: "use", links: [{ kind: "item", id: "minecraft:ender_eye" }] },
  ],
  "minecraft:budding_amethyst": [
    { key: "location", links: [] },
    { key: "use", links: [
      { kind: "item", id: "minecraft:amethyst_cluster" },
      { kind: "item", id: "minecraft:amethyst_shard" },
    ] },
  ],
} as const;

/** Bedrock's packaged cherry recipes and the Minecraft Wiki confirm these shared wood patterns. */
const GUIDE_WOOD_VARIANTS = [
  "acacia", "bamboo", "birch", "cherry", "crimson", "dark_oak", "jungle", "mangrove",
  "oak", "pale_oak", "poplar", "spruce", "warped",
] as const;
const GUIDE_WOOD_BLOCK_PATTERNS = [
  { suffix: "button", family: "button", width: 1, height: 1, outputCount: 1 },
  { suffix: "pressure_plate", family: "pressurePlate", width: 2, height: 1, outputCount: 1 },
  { suffix: "trapdoor", family: "trapdoor", width: 3, height: 2, outputCount: 2 },
] as const;
export const GAME_GUIDE_WOOD_BLOCK_PATTERNS: Readonly<Record<string, {
  family: (typeof GUIDE_WOOD_BLOCK_PATTERNS)[number]["family"];
  material: string; width: number; height: number; outputCount: number;
}>> = Object.fromEntries(GUIDE_WOOD_VARIANTS.flatMap(wood =>
  GUIDE_WOOD_BLOCK_PATTERNS.map(pattern => [`minecraft:${wood}_${pattern.suffix}`, {
    family: pattern.family, material: `minecraft:${wood}_planks`, width: pattern.width,
    height: pattern.height, outputCount: pattern.outputCount,
  }])));

/** Stable ore yields and minimum pickaxe tiers; exact generation heights vary by version. */
const GUIDE_OVERWORLD_ORES = [
  { name: "coal", resource: "coal", tool: "wood", location: "underground" },
  { name: "copper", resource: "raw_copper", tool: "stone", location: "underground" },
  { name: "iron", resource: "raw_iron", tool: "stone", location: "underground" },
  { name: "gold", resource: "raw_gold", tool: "iron", location: "underground" },
  { name: "lapis", resource: "lapis_lazuli", tool: "stone", location: "underground" },
  { name: "redstone", resource: "redstone", tool: "iron", location: "underground" },
  { name: "diamond", resource: "diamond", tool: "iron", location: "underground" },
  { name: "emerald", resource: "emerald", tool: "iron", location: "mountains" },
] as const;
export const GAME_GUIDE_ORE_BLOCKS: Readonly<Record<string, {
  resource: string; tool: "wood" | "stone" | "iron" | "diamond";
  location: "underground" | "mountains" | "nether"; deepslate: boolean; smelted?: boolean;
}>> = Object.fromEntries([
  ...GUIDE_OVERWORLD_ORES.flatMap(ore => [
    [`minecraft:${ore.name}_ore`, { resource: `minecraft:${ore.resource}`, tool: ore.tool,
      location: ore.location, deepslate: false }],
    [`minecraft:deepslate_${ore.name}_ore`, { resource: `minecraft:${ore.resource}`, tool: ore.tool,
      location: ore.location, deepslate: true }],
  ]),
  ["minecraft:nether_quartz_ore", { resource: "minecraft:quartz", tool: "wood", location: "nether", deepslate: false }],
  ["minecraft:quartz_ore", { resource: "minecraft:quartz", tool: "wood", location: "nether", deepslate: false }],
  ["minecraft:nether_gold_ore", { resource: "minecraft:gold_nugget", tool: "wood", location: "nether", deepslate: false }],
  ["minecraft:ancient_debris", { resource: "minecraft:netherite_scrap", tool: "diamond",
    location: "nether", deepslate: false, smelted: true }],
]);

export const GAME_GUIDE_TRADE_CURRENCY_ITEM = "minecraft:emerald";
export const GAME_GUIDE_TRADE_WANDERING_ID = "minecraft:trade/wandering_trader";
export const GAME_GUIDE_TRADE_VILLAGER_ENTITY = "minecraft:villager";
export const GAME_GUIDE_TRADE_VILLAGER_ENTITY_BEDROCK = "minecraft:villager_v2";
export const GAME_GUIDE_TRADE_WANDERING_ENTITY = "minecraft:wandering_trader";
export const GAME_GUIDE_TRADE_SHARED_POOLS: Readonly<Record<string, readonly string[]>> = {
  "minecraft:trade/smith": ["minecraft:trade/armorer", "minecraft:trade/toolsmith", "minecraft:trade/weaponsmith"],
};
export const GAME_GUIDE_TRADE_WORKSTATIONS: Readonly<Record<string, string>> = {
  "minecraft:trade/armorer": "minecraft:blast_furnace",
  "minecraft:trade/butcher": "minecraft:smoker",
  "minecraft:trade/cartographer": "minecraft:cartography_table",
  "minecraft:trade/cleric": "minecraft:brewing_stand",
  "minecraft:trade/farmer": "minecraft:composter",
  "minecraft:trade/fisherman": "minecraft:barrel",
  "minecraft:trade/fletcher": "minecraft:fletching_table",
  "minecraft:trade/leatherworker": "minecraft:cauldron",
  "minecraft:trade/leather_worker": "minecraft:cauldron",
  "minecraft:trade/librarian": "minecraft:lectern",
  "minecraft:trade/mason": "minecraft:stonecutter",
  "minecraft:trade/stone_mason": "minecraft:stonecutter",
  "minecraft:trade/shepherd": "minecraft:loom",
  "minecraft:trade/toolsmith": "minecraft:smithing_table",
  "minecraft:trade/tool_smith": "minecraft:smithing_table",
  "minecraft:trade/weaponsmith": "minecraft:grindstone",
  "minecraft:trade/weapon_smith": "minecraft:grindstone",
};

/** Curated progression routes. Link prefixes identify existing guide subjects. */
export const GAME_GUIDE_TUTORIALS = [
  { id: "first-night", iconItemId: "minecraft:crafting_table", steps: [
    { id: "wood", links: ["item|minecraft:oak_log", "item|minecraft:oak_planks", "item|minecraft:crafting_table"] },
    { id: "tools", links: ["item|minecraft:wooden_pickaxe", "item|minecraft:cobblestone", "item|minecraft:stone_pickaxe"] },
    { id: "shelter", links: ["item|minecraft:torch", "item|minecraft:white_bed", "item|minecraft:bed"] },
    { id: "food", links: ["item|minecraft:furnace", "item|minecraft:bread", "item|minecraft:cooked_beef"] },
  ] },
  { id: "mining", iconItemId: "minecraft:iron_pickaxe", steps: [
    { id: "prepare", links: ["item|minecraft:stone_pickaxe", "item|minecraft:torch", "item|minecraft:bread"] },
    { id: "iron", links: ["item|minecraft:raw_iron", "item|minecraft:furnace", "item|minecraft:iron_ingot"] },
    { id: "upgrade", links: ["item|minecraft:iron_pickaxe", "item|minecraft:diamond", "item|minecraft:diamond_pickaxe"] },
    { id: "obsidian", links: ["item|minecraft:obsidian", "item|minecraft:water_bucket"] },
  ] },
  { id: "nether", iconItemId: "minecraft:obsidian", steps: [
    { id: "portal", links: ["item|minecraft:obsidian", "item|minecraft:flint_and_steel"] },
    { id: "prepare", links: ["item|minecraft:golden_boots", "item|minecraft:potion/fire_resistance", "item|minecraft:bread"] },
    { id: "fortress", links: ["poi|minecraft:fortress", "entity|minecraft:blaze", "item|minecraft:blaze_rod"] },
    { id: "wart", links: ["item|minecraft:nether_wart", "item|minecraft:soul_sand"] },
  ] },
  { id: "brewing", iconItemId: "minecraft:brewing_stand", steps: [
    { id: "stand", links: ["item|minecraft:brewing_stand", "item|minecraft:blaze_powder"] },
    { id: "base", links: ["item|minecraft:potion/water", "item|minecraft:nether_wart", "item|minecraft:potion/awkward"] },
    { id: "effect", links: ["item|minecraft:glistering_melon_slice", "item|minecraft:potion/healing"] },
    { id: "modify", links: ["item|minecraft:gunpowder", "item|minecraft:redstone", "item|minecraft:glowstone_dust"] },
  ] },
  { id: "enchanting", iconItemId: "minecraft:enchanting_table", steps: [
    { id: "table", links: ["item|minecraft:enchanting_table", "item|minecraft:lapis_lazuli"] },
    { id: "bookshelves", links: ["item|minecraft:bookshelf", "item|minecraft:book"] },
    { id: "enchant", links: ["item|minecraft:diamond_pickaxe", "enchantment|minecraft:efficiency", "enchantment|minecraft:unbreaking"] },
    { id: "combine", links: ["item|minecraft:anvil", "item|minecraft:enchanted_book"] },
  ] },
  { id: "trading", iconItemId: "minecraft:emerald", steps: [
    { id: "village", links: ["poi|minecraft:village", "entity|minecraft:villager", "entity|minecraft:villager_v2"] },
    { id: "profession", links: ["item|minecraft:lectern", "trade|minecraft:trade/librarian"] },
    { id: "emeralds", links: ["item|minecraft:emerald", "trade|minecraft:trade/farmer"] },
    { id: "advance", links: ["trade|minecraft:trade/armorer", "item|minecraft:blast_furnace"] },
  ] },
  { id: "redstone", iconItemId: "minecraft:redstone", steps: [
    { id: "power", links: ["item|minecraft:lever", "item|minecraft:redstone"] },
    { id: "output", links: ["item|minecraft:redstone_lamp", "item|minecraft:piston"] },
    { id: "timing", links: ["item|minecraft:repeater", "item|minecraft:comparator"] },
    { id: "automation", links: ["item|minecraft:hopper", "item|minecraft:chest", "item|minecraft:dispenser"] },
  ] },
  { id: "the-end", iconItemId: "minecraft:ender_eye", steps: [
    { id: "pearls", links: ["entity|minecraft:enderman", "item|minecraft:ender_pearl"] },
    { id: "powder", links: ["poi|minecraft:fortress", "entity|minecraft:blaze", "item|minecraft:blaze_powder"] },
    { id: "stronghold", links: ["item|minecraft:ender_eye", "poi|minecraft:stronghold"] },
    { id: "dragon", links: ["entity|minecraft:ender_dragon", "item|minecraft:bow", "item|minecraft:water_bucket"] },
  ] },
  { id: "wither", iconItemId: "minecraft:nether_star", steps: [
    { id: "skulls", links: ["poi|minecraft:fortress", "entity|minecraft:wither_skeleton", "item|minecraft:wither_skeleton_skull"] },
    { id: "summon", links: ["item|minecraft:soul_sand", "entity|minecraft:wither"] },
    { id: "fight", links: ["item|minecraft:bow", "item|minecraft:milk_bucket", "entity|minecraft:wither"] },
    { id: "beacon", links: ["item|minecraft:nether_star", "item|minecraft:beacon"] },
  ] },
] as const;

/** Immutable recipe research sources; this is not a redistribution grant or full catalog support matrix. */
const javaRecipeSource = (version: string, revision: string, legacyPaths = false) =>
  ({ edition: "java", version, repository: "misode/mcmeta", revision,
    includePackagedInventory: true,
    recipePrefix: `data/minecraft/${legacyPaths ? "recipes" : "recipe"}/`,
    tagPrefix: `data/minecraft/tags/${legacyPaths ? "items" : "item"}/`,
    defaultNamespace: "minecraft", dialect: "flat" as const, fetchMode: "archive" as const,
    recipeTypes: { "minecraft:crafting_shaped": "shaped", "minecraft:crafting_shapeless": "shapeless", "minecraft:smelting": "cooking",
      "minecraft:blasting": "cooking", "minecraft:smoking": "cooking", "minecraft:campfire_cooking": "cooking", "minecraft:stonecutting": "cutting",
      "minecraft:smithing_transform": "smithing",
      ...(version.startsWith("1.18") || version.startsWith("1.19") ? { "minecraft:smithing": "smithing_legacy" } : {}),
      ...(!version.startsWith("1.18") && !version.startsWith("1.19") ? { "minecraft:smithing_trim": "smithing_trim" } : {}),
      "minecraft:crafting_transmute": "transmute" },
    stations: { "minecraft:crafting_shaped": ["minecraft:crafting_table"], "minecraft:crafting_shapeless": ["minecraft:crafting_table"],
      "minecraft:smelting": ["minecraft:furnace"], "minecraft:blasting": ["minecraft:blast_furnace"], "minecraft:smoking": ["minecraft:smoker"],
      "minecraft:campfire_cooking": ["minecraft:campfire"], "minecraft:stonecutting": ["minecraft:stonecutter"],
      "minecraft:smithing_transform": ["minecraft:smithing_table"],
      ...(version.startsWith("1.18") || version.startsWith("1.19") ? { "minecraft:smithing": ["minecraft:smithing_table"] } : {}),
      ...(!version.startsWith("1.18") && !version.startsWith("1.19")
        ? { "minecraft:smithing_trim": ["minecraft:smithing_table"] } : {}),
      "minecraft:crafting_transmute": ["minecraft:crafting_table"] } });

const bedrockRecipeSource = (version: string, packageVersion: string, sampleRevision?: string) =>
  ({ edition: "bedrock", version, repository: sampleRevision ? "Mojang/bedrock-samples" : "Microsoft/Minecraft-for-Windows",
    revision: sampleRevision ?? packageVersion,
    includePackagedInventory: false,
    sourceUrl: sampleRevision ? undefined : `https://apps.microsoft.com/detail/9nblggh2jhxj?version=${packageVersion}`,
    packageVersion: sampleRevision ? undefined : packageVersion,
    targetPackVersion: sampleRevision ? undefined : `1.${version}`,
    recipePrefix: "behavior_pack/recipes/", tagPrefix: null,
    defaultNamespace: "minecraft", dialect: "wrapped", fetchMode: sampleRevision ? "files" : "installed", inactiveTags: ["deprecated"],
    recipeTypes: { "minecraft:recipe_shaped": "shaped", "minecraft:recipe_shapeless": "shapeless", "minecraft:recipe_furnace": "cooking", "minecraft:recipe_smithing_transform": "smithing" },
    stationMethodOverrides: { stonecutter: "cutting" },
    stations: { crafting_table: ["minecraft:crafting_table"], furnace: ["minecraft:furnace"], blast_furnace: ["minecraft:blast_furnace"],
      smoker: ["minecraft:smoker"], campfire: ["minecraft:campfire"], soul_campfire: ["minecraft:soul_campfire"], stonecutter: ["minecraft:stonecutter"],
      cartography_table: ["minecraft:cartography_table"], smithing_table: ["minecraft:smithing_table"] } } as const);

export const GAME_RECIPE_SOURCES = [
  javaRecipeSource("26.2", "4d12c0553e21e461085d08dcb2c5d412398c494e"),
  bedrockRecipeSource("26.52", "1.26.5203.0", "46ba6ea985fb5a92d79a9419198f10dda14c199d"),
  bedrockRecipeSource("26.45", "1.26.4501.0"),
] as const;

/**
 * Pinned item registries for every stable Java release from 1.18 onward.
 * The revisions identify generated registry snapshots derived from the
 * corresponding official Mojang release jars; guide code never infers item
 * availability from names or release-note heuristics.
 */
export const GAME_JAVA_GUIDE_RELEASES = [
  { version: "26.3", registryRevision: "2240df2376509bfaf12becbb36e156e29f8ecb4d" },
  { version: "26.2", registryRevision: "8caaf4ecc9bc86cb0cfdbc2142caa1772e2e4b9d" },
  { version: "26.1.2", registryRevision: "66aea3ad4de5a4b78d2809bea3c5e00b20ceac73" },
  { version: "26.1.1", registryRevision: "6c64bbd4d9f35d167ca3ee05d515121043921aa4" },
  { version: "26.1", registryRevision: "61e438d29bd0df39de73ef018e7a08030e27bb14" },
  { version: "1.21.11", registryRevision: "208aa83038851414dfe235068fe36650b068384b" },
  { version: "1.21.10", registryRevision: "5d11cc7de721da7f8f5a2bed5407274e00acb212" },
  { version: "1.21.9", registryRevision: "ae08fbefe8f1bbcf4fe3b5388e7e12b7bc88825b" },
  { version: "1.21.8", registryRevision: "6b439c652da3af9d99455de19645fc3902a983af" },
  { version: "1.21.7", registryRevision: "1527b8a4d21c16512529d39ce42cec25d806783e" },
  { version: "1.21.6", registryRevision: "e68fe4892449e124f60a9e81e5dbeff271221623" },
  { version: "1.21.5", registryRevision: "e40a505e3da46c82732471c3c8a8ee59153b1f73" },
  { version: "1.21.4", registryRevision: "a19699b8ea5ed91792989332af5c38a5aece3d04" },
  { version: "1.21.3", registryRevision: "fe21a5c0a0ba61cccd9c17719cec9f16ec643a5c" },
  { version: "1.21.2", registryRevision: "cd413ff6633a120627dae9396a43ffca7e2edaa6" },
  { version: "1.21.1", registryRevision: "0eaeabd259d09369c6fc45b810cc5a675c3c1af4" },
  { version: "1.21", registryRevision: "5c5179802385e13fe3b4122851852981bb27f34c" },
  { version: "1.20.6", registryRevision: "553c40ce9481236e536cb72a2b2decce31554408" },
  { version: "1.20.5", registryRevision: "85fc4d28596e508f3c5fb7b64784bbac6b65eb0c" },
  { version: "1.20.4", registryRevision: "87d27e74f45fa333fefd4f0675ba94f6478908db" },
  { version: "1.20.3", registryRevision: "168c04e4deef5aa4318468d2e5668a8b2c78143e" },
  { version: "1.20.2", registryRevision: "05739feaec7978ae005afac3f66648a0355a710e" },
  { version: "1.20.1", registryRevision: "ad677da645054d09b09c031ae73be033474824ba" },
  { version: "1.20", registryRevision: "606ae923d5d7f738831eae41e9ddf661a53a9d10" },
  { version: "1.19.4", registryRevision: "3cda09890f7bf25fed9968b20539f152ff688932" },
  { version: "1.19.3", registryRevision: "509927d6bd6977c33a3b192441b9de79849aa356" },
  { version: "1.19.2", registryRevision: "ffff8aefe99263045a6ff7ad57e4745d30ab42c6" },
  { version: "1.19.1", registryRevision: "a76bc1ab7af65e24af508a5f25a3867f840eff39" },
  { version: "1.19", registryRevision: "4cb904fa9fab8efcf8d48bf78d4f83bd37b2e66b" },
  { version: "1.18.2", registryRevision: "e4f92f00d53de7b9a00c359f16c2c45b3eff6660" },
  { version: "1.18.1", registryRevision: "298b2aaf9df14722d510d5c22cae73e72a39b2d4" },
  { version: "1.18", registryRevision: "4d819d83fe9176563f23144ca80f28d76951de21" },
] as const;

type GameKnowledgeSubjectKind = "item" | "entity" | "block" | "poi" | "biome" | "loot" | "trade" | "enchantment" | "advancement";
interface GameKnowledgeReferenceTemplate {
  readonly kind: GameKnowledgeSubjectKind;
  readonly id: string;
  readonly count?: Readonly<{ min: number; max: number }>;
  readonly noteKey?: string;
}
interface GameKnowledgeMechanicTemplate {
  readonly id: string;
  readonly kind: "drop" | "loot" | "trade" | "barter" | "interaction" | "equipment" | "taming" | "breeding" | "breaking" | "harvesting" | "use" | "enchanting" | "generation" | "progression";
  readonly subject: Readonly<{ kind: GameKnowledgeSubjectKind; id: string }>;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly requirements: readonly GameKnowledgeReferenceTemplate[];
  readonly inputs: readonly GameKnowledgeReferenceTemplate[];
  readonly outputs: readonly GameKnowledgeReferenceTemplate[];
  readonly related: readonly GameKnowledgeReferenceTemplate[];
  readonly provenanceKey: "horseArticle" | "horseLoot" | "farmerTrades";
}
interface GameKnowledgeRecipeTemplate {
  readonly id: string;
  readonly method: "shaped" | "shapeless";
  readonly sourceType: string;
  readonly stations: readonly string[];
  readonly ingredients: readonly Readonly<{ choices: readonly Readonly<{ kind: "item"; id: string }>[]; count: number }>[];
  readonly outputs: readonly Readonly<{ id: string; count: number; data?: number }>[];
  readonly grid?: Readonly<{ width: number; height: number; slots: readonly (number | null)[] }>;
}

const knowledgeArtwork = (column: number, row: number, scale = 1.08) => ({
  kind: "sprite" as const,
  src: "/poi-artwork/knowledge-horse-v1.png",
  columns: 4,
  rows: 3,
  column,
  row,
  scale,
});
const recipeKnowledgeArtwork = (column: number, row: number, scale = 1.08) => ({
  kind: "sprite" as const,
  src: "/poi-artwork/knowledge-recipes-v1.png",
  columns: 3,
  rows: 2,
  column,
  row,
  scale,
});

/** Game identities and original artwork stay here; the generic inspector does not know Minecraft IDs. */
export const GAME_GUIDE_ITEM_ALIASES: Readonly<Record<string, string>> = {
  normal_stone_stairs: "stone_stairs", stonecutter_block: "stonecutter", turtle_shell_piece: "turtle_scute",
  grass: "short_grass", scute: "turtle_scute", pottery_shard_archer: "archer_pottery_sherd",
  pottery_shard_arms_up: "arms_up_pottery_sherd", pottery_shard_prize: "prize_pottery_sherd",
  pottery_shard_skull: "skull_pottery_sherd",
  lodestone_compass: "compass", chest_boat: "oak_chest_boat", chain: "iron_chain",
  banner_pattern: "flower_banner_pattern", brick_block: "bricks", skull: "skeleton_skull", appleenchanted: "enchanted_golden_apple",
  appleEnchanted: "enchanted_golden_apple", empty_map: "map", emptymap: "map", netherStar: "nether_star", netherstar: "nether_star",
  banner: "white_banner", waxed_copper: "waxed_copper_block", wood: "oak_wood", grass_path: "dirt_path",
  dirt_with_roots: "rooted_dirt", waterlily: "lily_pad", deadbush: "dead_bush", small_dripleaf_block: "small_dripleaf",
  mob_spawner: "spawner", frog_spawn: "frogspawn", zombie_pigman_spawn_egg: "zombified_piglin_spawn_egg",
  carrotonastick: "carrot_on_a_stick", web: "cobweb", end_brick_stairs: "end_stone_brick_stairs", end_bricks: "end_stone_bricks",
  chorus_fruit_popped: "popped_chorus_fruit", fence_gate: "oak_fence_gate", azalea_leaves_flowered: "flowering_azalea_leaves",
  horsearmordiamond: "diamond_horse_armor", horsearmorgold: "golden_horse_armor", horsearmoriron: "iron_horse_armor",
  muttonCooked: "cooked_mutton", muttonRaw: "mutton",
  quartz_ore: "nether_quartz_ore", silver_glazed_terracotta: "light_gray_glazed_terracotta", glow_frame: "glow_item_frame", frame: "item_frame",
  golden_rail: "powered_rail", normal_stone_slab: "stone_slab", horsearmorleather: "leather_horse_armor", lit_pumpkin: "jack_o_lantern",
  magma: "magma_block", melon_block: "melon", noteblock: "note_block", prismarine_bricks_stairs: "prismarine_brick_stairs",
  record_5: "music_disc_5", record_11: "music_disc_11", record_13: "music_disc_13", record_blocks: "music_disc_blocks",
  record_cat: "music_disc_cat", record_chirp: "music_disc_chirp", record_far: "music_disc_far", record_mall: "music_disc_mall",
  record_mellohi: "music_disc_mellohi", record_otherside: "music_disc_otherside", record_pigstep: "music_disc_pigstep",
  record_stal: "music_disc_stal", record_strad: "music_disc_strad", record_wait: "music_disc_wait", record_ward: "music_disc_ward",
  red_nether_brick: "red_nether_bricks", sealantern: "sea_lantern", undyed_shulker_box: "shulker_box",
  darkoak_sign: "dark_oak_sign", sign: "oak_sign", slime: "slime_block", snow_layer: "snow", tallgrass: "short_grass",
  trapdoor: "oak_trapdoor", wooden_pressure_plate: "oak_pressure_plate", wooden_button: "oak_button",
  wooden_door: "oak_door", planks: "oak_planks", log: "oak_log", log2: "acacia_log", boat: "oak_boat", sapling: "oak_sapling",
  wooden_slab: "oak_slab", stone_slab: "smooth_stone_slab", stone_block_slab: "smooth_stone_slab",
  stone_block_slab2: "red_sandstone_slab", stone_block_slab3: "end_stone_brick_slab", stone_block_slab4: "mossy_stone_brick_slab",
  wool: "white_wool", carpet: "white_carpet", bed: "red_bed", concrete: "white_concrete",
  concrete_powder: "white_concrete_powder", stained_glass: "white_stained_glass", stained_glass_pane: "white_stained_glass_pane",
  stained_hardened_clay: "white_terracotta", hardened_clay: "terracotta", dye: "black_dye", reeds: "sugar_cane",
  melon: "melon_slice", speckled_melon: "glistering_melon_slice", netherbrick: "nether_brick", brick: "brick",
  cooked_fish: "cooked_cod", fish: "cod", clownfish: "tropical_fish", sweet_berries: "sweet_berries",
  rabbit_foot: "rabbit_foot", dragon_breath: "dragon_breath", redstone: "redstone", gunpowder: "gunpowder",
  totem: "totem_of_undying", fireball: "fire_charge",
};

/** Catalog imports can use legacy or generated names for these item identities. */
export const GAME_GUIDE_CANONICAL_ITEM_NAMES = new Set([
  "minecraft:golden_rail", "minecraft:noteblock", "minecraft:tnt",
]);

export type GameGuideItemType = "all" | "blocks" | "equipment" | "food" | "brewing" | "spawnEggs" | "other";
export const GAME_GUIDE_ITEM_TYPES: readonly GameGuideItemType[] = [
  "all", "blocks", "equipment", "food", "brewing", "spawnEggs", "other",
];

/** Authored entry points for common progression items; all links remain version-filtered. */
export const GAME_GUIDE_ITEM_HIGHLIGHTS: Readonly<Record<string,
  readonly (string | Readonly<{ kind: "entity"; id: string }>)[]>> = {
  "minecraft:ancient_debris": ["minecraft:netherite_scrap", "minecraft:netherite_ingot"],
  "minecraft:netherite_scrap": ["minecraft:ancient_debris", "minecraft:netherite_ingot"],
  "minecraft:netherite_ingot": ["minecraft:ancient_debris", "minecraft:netherite_scrap",
    "minecraft:netherite_upgrade_smithing_template", "minecraft:netherite_block"],
  "minecraft:diamond": ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore", "minecraft:diamond_pickaxe",
    "minecraft:enchanting_table"],
  "minecraft:emerald": ["minecraft:emerald_ore", "minecraft:emerald_block"],
  "minecraft:iron_ingot": ["minecraft:raw_iron", "minecraft:iron_block", "minecraft:iron_pickaxe", "minecraft:bucket"],
  "minecraft:gold_ingot": ["minecraft:raw_gold", "minecraft:gold_block", "minecraft:golden_apple",
    "minecraft:netherite_ingot"],
  "minecraft:redstone": ["minecraft:redstone_ore", "minecraft:repeater", "minecraft:comparator",
    "minecraft:redstone_lamp"],
  "minecraft:blaze_rod": [{ kind: "entity", id: "minecraft:blaze" }, "minecraft:blaze_powder", "minecraft:brewing_stand"],
  "minecraft:ender_pearl": [{ kind: "entity", id: "minecraft:enderman" }, "minecraft:ender_eye"],
  "minecraft:elytra": ["minecraft:firework_rocket", "minecraft:phantom_membrane"],
  "minecraft:totem_of_undying": [{ kind: "entity", id: "minecraft:evoker" }],
  "minecraft:shulker_shell": [{ kind: "entity", id: "minecraft:shulker" }, "minecraft:shulker_box"],
  "minecraft:nether_star": [{ kind: "entity", id: "minecraft:wither" }, "minecraft:beacon"],
};

const wildernessColors = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"] as const;
const coloredItemDescriptions = (suffix: string, key: string) => Object.fromEntries(
  wildernessColors.map(color => [`minecraft:${color}_${suffix}`, `inspector.itemGuide.highlights.${key}`]));
const poplarWoodItems = ["poplar_log", "stripped_poplar_log", "poplar_wood", "stripped_poplar_wood",
  "poplar_planks", "poplar_stairs", "poplar_slab", "poplar_fence", "poplar_fence_gate", "poplar_door",
  "poplar_trapdoor", "poplar_button", "poplar_pressure_plate", "poplar_sign", "poplar_hanging_sign",
  "poplar_shelf", "poplar_boat", "poplar_chest_boat"] as const;
/** Shared descriptions cover every color and wood variant without duplicating locale strings. */
export const GAME_GUIDE_ITEM_DESCRIPTION_KEYS: Readonly<Record<string, string>> = {
  ...coloredItemDescriptions("cushion", "cushion"),
  ...coloredItemDescriptions("wool_stairs", "woolStairs"),
  ...coloredItemDescriptions("wool_slab", "woolSlab"),
  ...coloredItemDescriptions("concrete_stairs", "concreteStairs"),
  ...coloredItemDescriptions("concrete_slab", "concreteSlab"),
  ...Object.fromEntries(poplarWoodItems.map(item => [`minecraft:${item}`, "inspector.itemGuide.highlights.poplarWood"])),
  "minecraft:poplar_sapling": "inspector.itemGuide.highlights.poplarSapling",
  "minecraft:straw_bed": "inspector.itemGuide.highlights.strawBed",
  "minecraft:red_shrub": "inspector.itemGuide.highlights.redShrub",
  "minecraft:shelf_mushroom": "inspector.itemGuide.highlights.shelfMushroom",
};

/** Official Hindi game names are incomplete for these Wilderness Bound items. */
export const GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS: ReadonlySet<string> = new Set([
  "poplar_trapdoor", "poplar_pressure_plate", "poplar_sign", "poplar_hanging_sign", "poplar_shelf",
  "poplar_sapling", "shelf_mushroom", "magenta_concrete_stairs", "magenta_concrete_slab",
  "lime_cushion", "lime_wool_stairs", "lime_wool_slab", "lime_concrete_stairs", "lime_concrete_slab",
  "gray_concrete_stairs", "gray_concrete_slab", "light_gray_concrete_stairs", "light_gray_concrete_slab",
  "cyan_concrete_stairs", "cyan_concrete_slab",
]);
export const GAME_GUIDE_BIOME_NAME_KEYS: Readonly<Record<string, string>> = {
  dappled_forest: "biomeMap.biomes.dappledForest",
};

export const GAME_GUIDE_SMITHING = {
  trimTemplateSuffix: "_armor_trim_smithing_template",
  upgradeTemplateSuffix: "_upgrade_smithing_template",
  preferredUpgradeOutputSuffix: "_chestplate",
  exampleArmor: "minecraft:diamond_chestplate",
  exampleMaterial: "minecraft:gold_ingot",
} as const;

export const GAME_GUIDE_COOKING_STATIONS = [
  { id: "furnace", itemId: "minecraft:furnace", stationIds: ["minecraft:furnace"] },
  { id: "blast", itemId: "minecraft:blast_furnace", stationIds: ["minecraft:blast_furnace"] },
  { id: "smoker", itemId: "minecraft:smoker", stationIds: ["minecraft:smoker"] },
  { id: "campfire", itemId: "minecraft:campfire", stationIds: ["minecraft:campfire", "minecraft:soul_campfire"] },
] as const;

/** In 26.3, vanilla recipes store base ticks; default fuel supplies the fast station speed. */
export const GAME_GUIDE_COOKING_TIME_RULES = [
  { edition: "java", version: "26.3", sourceTypes: ["minecraft:blasting", "minecraft:smoking"], speedMultiplier: 2 },
] as const;

/** Core circuit parts shown in the connected redstone guide. Bedrock retains two older registry IDs. */
export const GAME_GUIDE_REDSTONE_COMPONENTS = [
  { key: "redstone", id: "minecraft:redstone", group: "fundamentals", related: ["lever", "repeater", "redstone_lamp"] },
  { key: "redstone_block", id: "minecraft:redstone_block", group: "fundamentals", related: ["piston", "powered_rail", "redstone_lamp"] },
  { key: "redstone_torch", id: "minecraft:redstone_torch", group: "fundamentals", related: ["repeater", "redstone_lamp", "piston"] },
  { key: "repeater", id: "minecraft:repeater", group: "fundamentals", related: ["redstone", "comparator", "piston"] },
  { key: "comparator", id: "minecraft:comparator", group: "fundamentals", related: ["hopper", "repeater", "redstone_lamp"] },
  { key: "lever", id: "minecraft:lever", group: "inputs", related: ["redstone", "redstone_lamp", "piston"] },
  { key: "stone_button", id: "minecraft:stone_button", group: "inputs", related: ["redstone", "dispenser", "crafter"] },
  { key: "stone_pressure_plate", id: "minecraft:stone_pressure_plate", group: "inputs", related: ["redstone", "redstone_lamp", "piston"] },
  { key: "daylight_detector", id: "minecraft:daylight_detector", group: "inputs", related: ["redstone_lamp", "redstone"] },
  { key: "target", id: "minecraft:target", group: "inputs", related: ["redstone", "dispenser"] },
  { key: "observer", id: "minecraft:observer", group: "inputs", related: ["piston", "crafter", "redstone"] },
  { key: "sculk_sensor", id: "minecraft:sculk_sensor", group: "inputs", related: ["redstone_lamp", "calibrated_sculk_sensor"] },
  { key: "calibrated_sculk_sensor", id: "minecraft:calibrated_sculk_sensor", group: "inputs", related: ["sculk_sensor", "comparator"] },
  { key: "tripwire_hook", id: "minecraft:tripwire_hook", group: "inputs", related: ["dispenser", "redstone_lamp"] },
  { key: "detector_rail", id: "minecraft:detector_rail", group: "inputs", related: ["powered_rail", "activator_rail"] },
  { key: "piston", id: "minecraft:piston", group: "outputs", related: ["observer", "sticky_piston", "redstone_block"] },
  { key: "sticky_piston", id: "minecraft:sticky_piston", group: "outputs", related: ["piston", "observer"] },
  { key: "redstone_lamp", id: "minecraft:redstone_lamp", group: "outputs", related: ["lever", "daylight_detector", "redstone"] },
  { key: "dispenser", id: "minecraft:dispenser", group: "outputs", related: ["tripwire_hook", "stone_button", "hopper"] },
  { key: "dropper", id: "minecraft:dropper", group: "outputs", related: ["hopper", "comparator"] },
  { key: "note_block", id: "minecraft:note_block", bedrockId: "minecraft:noteblock", group: "outputs", related: ["repeater", "observer"] },
  { key: "tnt", id: "minecraft:tnt", group: "outputs", related: ["lever", "stone_button"] },
  { key: "powered_rail", id: "minecraft:powered_rail", bedrockId: "minecraft:golden_rail", group: "outputs", related: ["detector_rail", "redstone_block"] },
  { key: "activator_rail", id: "minecraft:activator_rail", group: "outputs", related: ["detector_rail", "powered_rail"] },
  { key: "hopper", id: "minecraft:hopper", group: "automation", related: ["comparator", "dropper", "crafter"] },
  { key: "crafter", id: "minecraft:crafter", group: "automation", related: ["hopper", "observer", "stone_button"] },
] as const;

export const GAME_GUIDE_REDSTONE_GROUPS = ["fundamentals", "inputs", "outputs", "automation"] as const;

/** Parts and distances used by the introductory signal-line example. */
export const GAME_GUIDE_REDSTONE_SIGNAL_LINE = {
  source: "lever", wire: "redstone", repeater: "repeater", output: "redstone_lamp",
  repeaterAfter: 15, maxDistance: 30,
} as const;

/** Effect identities, guide groups and direct in-game sources stay game-specific. */
export const GAME_GUIDE_EFFECT_GROUPS = [
  "movement", "health", "combat", "food", "mining", "spawns", "underwater", "visibility", "omens", "other",
] as const;
export const GAME_GUIDE_EFFECT_NAME_KEYS: Readonly<Record<string, string>> = {
  fatal_poison: "inspector.effectGuide.fatalPoisonName",
};
export const GAME_GUIDE_EFFECTS = [
  { key: "speed", group: "movement", potion: "swiftness", sourceItems: ["beacon"] },
  { key: "slowness", group: "movement", potion: "slowness", sourceEntities: ["stray"] },
  { key: "jump_boost", group: "movement", potion: "leaping", sourceItems: ["beacon"] },
  { key: "slow_falling", group: "movement", potion: "slow_falling" },
  { key: "levitation", group: "movement", sourceEntities: ["shulker"] },
  { key: "dolphins_grace", group: "movement", javaOnly: true, sourceEntities: ["dolphin"] },
  { key: "absorption", group: "health", sourceItems: ["golden_apple", "enchanted_golden_apple"] },
  { key: "regeneration", group: "health", potion: "regeneration", sourceItems: ["golden_apple", "beacon"] },
  { key: "instant_health", group: "health", potion: "healing" },
  { key: "instant_damage", group: "health", potion: "harming" },
  { key: "poison", group: "health", potion: "poison", sourceItems: ["pufferfish", "spider_eye"], sourceEntities: ["cave_spider"] },
  { key: "wither", group: "health", sourceItems: ["wither_rose"], sourceEntities: ["wither_skeleton", "wither"] },
  { key: "resistance", group: "health", potion: "turtle_master", sourceItems: ["beacon", "enchanted_golden_apple"] },
  { key: "fire_resistance", group: "health", potion: "fire_resistance", sourceItems: ["enchanted_golden_apple"] },
  { key: "health_boost", group: "health" },
  { key: "fatal_poison", group: "health", bedrockOnly: true },
  { key: "strength", group: "combat", potion: "strength", sourceItems: ["beacon"] },
  { key: "weakness", group: "combat", potion: "weakness" },
  { key: "hunger", group: "food", sourceItems: ["rotten_flesh", "pufferfish", "chicken"] },
  { key: "saturation", group: "food", sourceItems: ["suspicious_stew"] },
  { key: "haste", group: "mining", sourceItems: ["beacon"] },
  { key: "mining_fatigue", group: "mining", sourceEntities: ["elder_guardian"] },
  { key: "infested", group: "spawns", potion: "infested", sinceJava: "1.21" },
  { key: "oozing", group: "spawns", potion: "oozing", sinceJava: "1.21" },
  { key: "weaving", group: "spawns", potion: "weaving", sinceJava: "1.21" },
  { key: "wind_charged", group: "spawns", potion: "wind_charged", sinceJava: "1.21" },
  { key: "water_breathing", group: "underwater", potion: "water_breathing", sourceItems: ["turtle_helmet"] },
  { key: "conduit_power", group: "underwater", sourceItems: ["conduit"] },
  { key: "breath_of_the_nautilus", group: "underwater", sinceJava: "1.21.11", sourceEntities: ["nautilus"] },
  { key: "night_vision", group: "visibility", potion: "night_vision" },
  { key: "invisibility", group: "visibility", potion: "invisibility" },
  { key: "blindness", group: "visibility", sourceItems: ["suspicious_stew"] },
  { key: "darkness", group: "visibility", sinceJava: "1.19", sourceItems: ["sculk_shrieker"], sourceEntities: ["warden"] },
  { key: "nausea", group: "visibility", sourceItems: ["pufferfish"] },
  { key: "glowing", group: "visibility", javaOnly: true, sourceItems: ["spectral_arrow"] },
  { key: "bad_omen", group: "omens", sourceItems: ["ominous_bottle"] },
  { key: "raid_omen", group: "omens", sinceJava: "1.21", sourceItems: ["ominous_bottle"] },
  { key: "trial_omen", group: "omens", sinceJava: "1.21", sourceItems: ["ominous_bottle"] },
  { key: "hero_of_the_village", group: "omens" },
  { key: "luck", group: "other", javaOnly: true },
  { key: "unluck", group: "other", javaOnly: true },
] as const;

/** Bedrock's packaged dynamic trim recipe does not enumerate choices. Java choices come from versioned item tags. */
export const GAME_GUIDE_SMITHING_TRIM_FALLBACK = {
  materials: ["amethyst_shard", "copper_ingot", "diamond", "emerald", "gold_ingot", "iron_ingot",
    "lapis_lazuli", "netherite_ingot", "quartz", "redstone", "resin_brick"],
  armor: ["chainmail", "copper", "diamond", "golden", "iron", "leather", "netherite"]
    .flatMap(material => ["boots", "chestplate", "helmet", "leggings"].map(slot => `${material}_${slot}`))
    .concat("turtle_helmet"),
} as const;

const GAME_GUIDE_FOOD_ITEMS = new Set([
  "apple", "baked_potato", "beef", "beetroot", "beetroot_soup", "bread", "cake", "carrot", "chicken",
  "chorus_fruit", "cod", "cooked_beef", "cooked_chicken", "cooked_cod", "cooked_mutton", "cooked_porkchop",
  "cooked_rabbit", "cooked_salmon", "cookie", "dried_kelp", "enchanted_golden_apple", "glow_berries", "golden_apple",
  "golden_carrot", "honey_bottle", "melon_slice", "mushroom_stew", "mutton", "poisonous_potato", "porkchop",
  "potato", "pufferfish", "pumpkin_pie", "rabbit", "rabbit_stew", "rotten_flesh", "salmon", "spider_eye",
  "suspicious_stew", "sweet_berries", "tropical_fish",
]);
const GAME_GUIDE_EQUIPMENT_ITEMS = new Set([
  "arrow", "bow", "brush", "carrot_on_a_stick", "clock", "compass", "crossbow", "elytra", "fishing_rod",
  "flint_and_steel", "lead", "mace", "recovery_compass", "saddle", "shears", "shield", "spectral_arrow", "spyglass",
  "tipped_arrow", "trident", "warped_fungus_on_a_stick", "wolf_armor",
]);
const GAME_GUIDE_BREWING_ITEMS = new Set([
  "blaze_powder", "dragon_breath", "fermented_spider_eye", "ghast_tear", "glass_bottle", "glistering_melon_slice",
  "gunpowder", "magma_cream", "nether_wart", "phantom_membrane", "rabbit_foot",
]);

/** Minecraft-specific grouping for the guide's secondary item filter. */
export const gameGuideItemType = (id: string, placeable: boolean): Exclude<GameGuideItemType, "all"> => {
  const rawPath = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const path = GAME_GUIDE_ITEM_ALIASES[rawPath] ?? rawPath;
  if (path.endsWith("_spawn_egg") || path === "spawn_egg") return "spawnEggs";
  if (/^(?:splash_|lingering_)?potion(?:\/|$)/.test(path)
    || GAME_GUIDE_BREWING_ITEMS.has(path) || GAME_GUIDE_BREWING_ITEMS.has(rawPath)) return "brewing";
  if (GAME_GUIDE_FOOD_ITEMS.has(path) || GAME_GUIDE_FOOD_ITEMS.has(rawPath)) return "food";
  if (GAME_GUIDE_EQUIPMENT_ITEMS.has(path) || GAME_GUIDE_EQUIPMENT_ITEMS.has(rawPath)
    || /_(?:axe|boots|chestplate|helmet|hoe|horse_armor|leggings|pickaxe|shovel|spear|sword)$/.test(path)) return "equipment";
  if (placeable) return "blocks";
  return "other";
};

export const GAME_GUIDE_BREWING = {
  fuel: "minecraft:blaze_powder", station: "minecraft:brewing_stand", seconds: 20,
  java: { version: "26.2", revision: "2dc72797acbc1b63fc16a11c4ac393605f453754",
    url: "https://piston-data.mojang.com/v1/objects/2dc72797acbc1b63fc16a11c4ac393605f453754/client.jar",
    className: "net.minecraft.world.item.alchemy.PotionBrewing", namespace: "minecraft", water: "water", awkward: "awkward", mundane: "mundane" },
  potionPrefix: "minecraft:potion/", legacyPotionPrefix: "minecraft:potion_type:",
  containers: ["potion", "splash_potion", "lingering_potion"],
  bottle: "minecraft:potion", namespace: "minecraft",
  effectClass: "net.minecraft.world.effect.MobEffects", potionClass: "net.minecraft.world.item.alchemy.Potions",
  baseColor: -13083194, overlayTexture: "item/potion_overlay",
  variantAliases: { nightvision: "night_vision", long_nightvision: "long_night_vision", long_mundane: "mundane", Thick: "thick", Awkward: "awkward" } as Readonly<Record<string, string>>,
  guiTexture: "gui/container/brewing_stand", guiImage: "/guide-artwork/brewing-gui.png",
  guiLayout: { width: 176, height: 82, slots: [
    { role: "fuel", x: 17, y: 17 }, { role: "reagent", x: 79, y: 17 },
    { role: "bottle", x: 56, y: 51 }, { role: "bottle", x: 79, y: 58 }, { role: "bottle", x: 102, y: 51 },
  ] },
};

/** Official client used for current inventory models, names, textures and data-driven brewing recipes. */
export const GAME_GUIDE_CLIENT_SOURCE = {
  namespace: "minecraft", version: "26.3", revision: "e877b6a07acd633fb3bb475002175cec036e7b87",
  url: "https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar",
};

const javaGuideRecipeRevisions: Readonly<Record<(typeof GAME_JAVA_GUIDE_RELEASES)[number]["version"], string>> = Object.freeze({
  "26.3": "538b2b167248c648b2198f2c0d56eced10dfc0cf",
  "26.2": "4d12c0553e21e461085d08dcb2c5d412398c494e",
  "26.1.2": "deb1b597b08e0ad7bffff4b7d38410109d03fbe5",
  "26.1.1": "bcc39a4e931ee0ee14b27579c562a289d54f6369",
  "26.1": "f3dbd1bb8cf6697de78c1e0e8ee6d404f0982dd7",
  "1.21.11": "3458455b4b4537db37d6251a6ace1eed98d025a9",
  "1.21.10": "afb6ac210373b06a564d1a79f13e030e425a1a54",
  "1.21.9": "6f6f9210d90f4ec07b5738fa44704631a3207ec1",
  "1.21.8": "89c7054bcae0bcb1640d7c4a1462c69995f83b34",
  "1.21.7": "0cf46a773e941afde9062cac2412096e40c6343b",
  "1.21.6": "3dd3b32d2a13f3c5576c2a6f8c71014433e36be4",
  "1.21.5": "cc1b743e8f26957d1fa3fcf81c80c6665a29b68c",
  "1.21.4": "277751c76153ac1a084813188ac7ceea2028b625",
  "1.21.3": "01d29eb3fbe000efd47e55b8c813b1ba83a3ff18",
  "1.21.2": "5418efd08297d7d934d4cccf74db4672887adc78",
  "1.21.1": "aacd2a457333b258d044a642f38270c8cddbc628",
  "1.21": "b174903c237b713b518b3a7dc29aba96c7210315",
  "1.20.6": "211174d69ecba5e4dc8f31466dfa006225223812",
  "1.20.5": "29fd83e6c55cfdc305d559108371946af8a68f92",
  "1.20.4": "16d9f1b62461b12992e32236e46333d6036a40e7",
  "1.20.3": "4f9568cf6e18fde2d42f4df5e3f474ffb4555990",
  "1.20.2": "c6fffa5e58ec7ffb7607ca500519295eeb68fa68",
  "1.20.1": "2dedcb96cc58788e8b0206c93ae5e61faea2ed19",
  "1.20": "af873338891dd67772ae15a4b337b48ec6830125",
  "1.19.4": "8252860f9beb6696824161b8b4b04ada5ae939dd",
  "1.19.3": "e7034dbd1f202250fbae9e6e155a5d76e3d30450",
  "1.19.2": "73c7fd2e80a9f4a97798e461556611187ab29d39",
  "1.19.1": "73b6012ef9b6edfbe76f87cbcb3c6347a72bed9f",
  "1.19": "9abbdac952158c32423ced46302c663b805783fb",
  "1.18.2": "75a6d3494c336401429531ab0967f46e2b0f1e59",
  "1.18.1": "337e44a358c3420f5d751b35c4fc562cbf433cd2",
  "1.18": "cf5ae66744ba6643b80ac48504ad54feb64a7882",
});

/** Exact recipe sources for every Java release exposed by the guide. */
export const GAME_JAVA_GUIDE_RECIPE_SOURCES = GAME_JAVA_GUIDE_RELEASES.map(release => javaRecipeSource(
  release.version,
  javaGuideRecipeRevisions[release.version],
  release.version.startsWith("1.18") || release.version.startsWith("1.19") || release.version.startsWith("1.20"),
));

/** Guide navigation is game-aware even though recipe extraction remains edition-specific. */
export const GAME_GUIDE_SOURCES = [
  ...GAME_JAVA_GUIDE_RELEASES.map(release => {
    const recipeRevision = javaGuideRecipeRevisions[release.version];
    return Object.freeze({ gameId: "minecraft" as const, edition: "java" as const, version: release.version,
      includePackagedInventory: true,
      itemIdentity: Object.freeze({ edition: "java" as const, version: release.version, revision: release.registryRevision }),
      recipeIdentity: Object.freeze({ edition: "java" as const, version: release.version, revision: recipeRevision }),
      brewingRevision: release.version === GAME_GUIDE_CLIENT_SOURCE.version ? GAME_GUIDE_CLIENT_SOURCE.revision
        : release.version === GAME_GUIDE_BREWING.java.version ? GAME_GUIDE_BREWING.java.revision : null });
  }),
  ...GAME_RECIPE_SOURCES.filter(source => source.edition === "bedrock").map(source => Object.freeze({ ...source,
    gameId: "minecraft" as const, itemIdentity: null, recipeIdentity: source,
    brewingRevision: source.revision })),
] as const;

export const GAME_GUIDE_ARTWORK_SOURCE = {
  namespace: "minecraft", version: "26.3", repository: "Owen1212055/mc-assets",
  revision: "bc96011714c0eb3770bd641a3b86459ad5f860c7", directory: "item-assets",
  url: "https://codeload.github.com/Owen1212055/mc-assets/zip/bc96011714c0eb3770bd641a3b86459ad5f860c7",
};

/** Java client asset index and the game's locale codes used by this build. */
export const GAME_GUIDE_LANGUAGE_SOURCE = {
  version: "26.3",
  assetIndexSha1: "d8492bc61d32a4874c77daa03c0cba9201e9b83b",
  assetIndexUrl: "https://piston-meta.mojang.com/v1/packages/d8492bc61d32a4874c77daa03c0cba9201e9b83b/34.json",
  localeCodes: {
    en: "en_us",
    "zh-Hans": "zh_cn",
    "hi-IN": "hi_in",
    es: "es_es",
    fr: "fr_fr",
    "pt-BR": "pt_br",
  },
} as const;

/** App labels whose meaning exactly matches a Minecraft client translation key. */
export const GAME_APP_LOCALE_TERMS: Readonly<Record<string, string>> = {
  "language.label": "options.language.title",
  "biomeMap.overworld": "flat_world_preset.minecraft.overworld",
  "biomeMap.nether": "advancements.nether.root.title",
  "biomeMap.end": "advancements.end.root.title",
  "chrome.map": "item.minecraft.filled_map",
  "chrome.close": "mco.selectServer.close",
  "worlds.title": "mco.configure.worlds.title",
  "worlds.back": "gui.back",
  "worlds.seed": "mco.backup.entry.seed",
  "worlds.enabled": "addServer.resourcePack.enabled",
  "worlds.disabled": "addServer.resourcePack.disabled",
  "settings.title": "mco.configure.world.settings.title",
  "settings.hotkeyCancel": "gui.cancel",
  "onboarding.btn_back": "gui.back",
  "onboarding.btn_done": "gui.done",
  "account.cancel": "gui.cancel",
  "crafting.title": "container.crafting",
  "crafting.enderItems": "block.minecraft.ender_chest",
  "inspector.effectGuide.entities": "gamerule.category.mobs",
  "inspector.subjectKinds.entity": "gamerule.category.mobs",
  "inspector.tradeLevels.1": "merchant.level.1",
  "inspector.tradeLevels.2": "merchant.level.2",
  "inspector.tradeLevels.3": "merchant.level.3",
  "inspector.tradeLevels.4": "merchant.level.4",
  "inspector.tradeLevels.5": "merchant.level.5",
  "knowledge.horse.subjects.horse.name": "entity.minecraft.horse",
  "knowledge.horse.subjects.saddle.name": "item.minecraft.saddle",
  "knowledge.horse.subjects.leather.name": "item.minecraft.leather",
  "knowledge.horse.subjects.goldenApple.name": "item.minecraft.golden_apple",
  "knowledge.horse.subjects.goldenCarrot.name": "item.minecraft.golden_carrot",
  "knowledge.horse.subjects.sugar.name": "item.minecraft.sugar",
  "knowledge.horse.subjects.wheat.name": "item.minecraft.wheat",
  "knowledge.horse.subjects.apple.name": "item.minecraft.apple",
  "knowledge.horse.subjects.plains.name": "biome.minecraft.plains",
  "knowledge.horse.subjects.savanna.name": "biome.minecraft.savanna",
  "knowledge.horse.subjects.goldIngot.name": "item.minecraft.gold_ingot",
  "knowledge.horse.subjects.goldNugget.name": "item.minecraft.gold_nugget",
  "knowledge.horse.subjects.carrot.name": "item.minecraft.carrot",
  "knowledge.horse.subjects.sugarCane.name": "block.minecraft.sugar_cane",
  "knowledge.horse.subjects.honeyBottle.name": "item.minecraft.honey_bottle",
  "knowledge.horse.subjects.craftingTable.name": "block.minecraft.crafting_table",
  "knowledge.horse.subjects.ironIngot.name": "item.minecraft.iron_ingot",
  "knowledge.horse.subjects.villager.name": "entity.minecraft.villager",
  "knowledge.horse.subjects.emerald.name": "item.minecraft.emerald",
};

export const GAME_GUIDE_BLOCK_ARTWORK_SOURCE = {
  namespace: "minecraft", version: "26.1", repository: "PrismarineJS/minecraft-assets",
  revision: "67c9b138b00a6b67c29ba68dae74c41faef4889d",
  url: "https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/67c9b138b00a6b67c29ba68dae74c41faef4889d/data/26.1/texture_content.json",
};

export const GAME_GUIDE_EDITION_ARTWORK = [
  { id: "minecraft:camera", repository: "ZtechNetwork/MCBVanillaResourcePack",
    revision: "b6bdfc80f0b218c0119002967df2479299642be0", path: "textures/blocks/camera_front.png" },
] as const;

export const GAME_GUIDE_ENTITY_ARTWORK_SOURCE = {
  namespace: "minecraft", version: "26.2", rendererRepository: "minecraft-library/asset-renderer",
  rendererRevision: "e237f4f06990441a6ceaa081d1f07ea319d81831",
  clientSha256: "40896ee9f1e2bec3c934daac7e93d41e9e3d9c2f8ae0ca366d52ffbfd1afa290",
};

export const GAME_KNOWLEDGE_ENTITY_ALIASES: Readonly<Record<string, string>> = {
  "minecraft:evocation_illager": "minecraft:evoker",
  "minecraft:tropicalfish": "minecraft:tropical_fish",
  "minecraft:zombie_pigman": "minecraft:zombified_piglin",
  "minecraft:zombie_villager_v2": "minecraft:zombie_villager",
  "minecraft:villager_v2": "minecraft:villager",
};

const GAME_KNOWLEDGE_ENTITY_ITEM_ARTWORK: Readonly<Record<string, string>> = {
  "minecraft:sulfur_cube": "/guide-artwork/sulfur_cube_bucket.png",
  "minecraft:mannequin": "/guide-artwork/armor_stand.png",
  "minecraft:player": "/guide-artwork/player_head.png",
  "minecraft:breeze_wind_charge": "/guide-artwork/wind_charge.png",
  "minecraft:wind_charge": "/guide-artwork/wind_charge.png",
  "minecraft:trident": "/guide-artwork/trident.png",
  "minecraft:boat": "/guide-artwork/oak_boat.png",
  "minecraft:fireball": "/guide-artwork/fire_charge.png",
  "minecraft:arrow": "/guide-artwork/arrow.png",
  "minecraft:spectral_arrow": "/guide-artwork/spectral_arrow.png",
  "minecraft:oak_boat": "/guide-artwork/oak_boat.png",
  "minecraft:spruce_boat": "/guide-artwork/spruce_boat.png",
  "minecraft:birch_boat": "/guide-artwork/birch_boat.png",
  "minecraft:jungle_boat": "/guide-artwork/jungle_boat.png",
  "minecraft:acacia_boat": "/guide-artwork/acacia_boat.png",
  "minecraft:cherry_boat": "/guide-artwork/cherry_boat.png",
  "minecraft:dark_oak_boat": "/guide-artwork/dark_oak_boat.png",
  "minecraft:pale_oak_boat": "/guide-artwork/pale_oak_boat.png",
  "minecraft:mangrove_boat": "/guide-artwork/mangrove_boat.png",
  "minecraft:bamboo_raft": "/guide-artwork/bamboo_raft.png",
};

/** Technical entities represented by inventory items must not appear in the guide's mob category. */
export const GAME_GUIDE_ITEM_ENTITY_ALIASES: Readonly<Record<string, string>> = {
  "minecraft:armor_stand": "minecraft:armor_stand",
  "minecraft:mannequin": "minecraft:armor_stand",
  "minecraft:player": "minecraft:player_head",
  "minecraft:breeze_wind_charge": "minecraft:wind_charge",
  "minecraft:wind_charge": "minecraft:wind_charge",
  "minecraft:trident": "minecraft:trident",
  "minecraft:boat": "minecraft:oak_boat",
  "minecraft:fireball": "minecraft:fire_charge",
  "minecraft:arrow": "minecraft:arrow",
  "minecraft:spectral_arrow": "minecraft:spectral_arrow",
  "minecraft:oak_boat": "minecraft:oak_boat",
  "minecraft:spruce_boat": "minecraft:spruce_boat",
  "minecraft:birch_boat": "minecraft:birch_boat",
  "minecraft:jungle_boat": "minecraft:jungle_boat",
  "minecraft:acacia_boat": "minecraft:acacia_boat",
  "minecraft:cherry_boat": "minecraft:cherry_boat",
  "minecraft:dark_oak_boat": "minecraft:dark_oak_boat",
  "minecraft:pale_oak_boat": "minecraft:pale_oak_boat",
  "minecraft:mangrove_boat": "minecraft:mangrove_boat",
  "minecraft:bamboo_raft": "minecraft:bamboo_raft",
  "minecraft:poplar_boat": "minecraft:poplar_boat",
};

/** Bedrock catalog entries that are entities but not mobs in the guide. */
export const GAME_GUIDE_NON_MOB_ENTITIES: ReadonlySet<string> = new Set([
  "minecraft:agent", "minecraft:npc", "minecraft:area_effect_cloud", "minecraft:breeze_wind_charge_projectile",
  "minecraft:chest_boat", "minecraft:chest_minecart", "minecraft:command_block_minecart", "minecraft:cushion",
  "minecraft:dragon_fireball", "minecraft:egg", "minecraft:ender_crystal", "minecraft:ender_pearl",
  "minecraft:eye_of_ender_signal", "minecraft:fireworks_rocket", "minecraft:fishing_hook",
  "minecraft:hopper_minecart", "minecraft:lightning_bolt", "minecraft:lingering_potion", "minecraft:llama_spit",
  "minecraft:minecart", "minecraft:ominous_item_spawner", "minecraft:shulker_bullet",
  "minecraft:small_fireball", "minecraft:snowball", "minecraft:splash_potion", "minecraft:thrown_trident",
  "minecraft:tnt_minecart", "minecraft:tnt", "minecraft:tripod_camera", "minecraft:wind_charge_projectile",
  "minecraft:wither_skull_dangerous", "minecraft:wither_skull", "minecraft:xp_bottle", "minecraft:xp_orb",
]);

/** Legacy Bedrock identities superseded by the current v2 villager records. */
export const GAME_GUIDE_LEGACY_BEDROCK_ENTITIES: ReadonlySet<string> = new Set([
  "minecraft:villager", "minecraft:zombie_villager",
]);

/** Loot tables for entity actions outside the ordinary death-drop tables. */
export const GAME_GUIDE_ENTITY_LOOT_ACTIONS = [
  { path: "brush/armadillo", entity: "minecraft:armadillo", kind: "harvesting", labelKey: "brush" },
  { path: "gameplay/armadillo_shed", entity: "minecraft:armadillo", kind: "harvesting", labelKey: "shed" },
  { path: "gameplay/cat_morning_gift", entity: "minecraft:cat", kind: "interaction", labelKey: "catGift" },
  { path: "gameplay/chicken_lay", entity: "minecraft:chicken", kind: "harvesting", labelKey: "chickenLay" },
  { path: "gameplay/panda_sneeze", entity: "minecraft:panda", kind: "harvesting", labelKey: "pandaSneeze" },
  { path: "gameplay/piglin_bartering", entity: "minecraft:piglin", kind: "barter", input: "minecraft:gold_ingot", labelKey: "piglinBarter" },
  { path: "gameplay/sniffer_digging", entity: "minecraft:sniffer", kind: "harvesting", labelKey: "snifferDig" },
  { path: "gameplay/turtle_grow", entity: "minecraft:turtle", kind: "harvesting", labelKey: "turtleGrow" },
  { path: "shearing/bogged", entity: "minecraft:bogged", kind: "harvesting" },
  { path: "shearing/mooshroom", entity: "minecraft:mooshroom", kind: "harvesting" },
  { path: "shearing/sheep", entity: "minecraft:sheep", kind: "harvesting" },
  { path: "shearing/snow_golem", entity: "minecraft:snow_golem", kind: "harvesting" },
  { path: "charged_creeper/creeper", entity: "minecraft:creeper", kind: "interaction", labelKey: "chargedCreeper" },
  { path: "charged_creeper/piglin", entity: "minecraft:piglin", kind: "interaction", labelKey: "chargedCreeper" },
  { path: "charged_creeper/skeleton", entity: "minecraft:skeleton", kind: "interaction", labelKey: "chargedCreeper" },
  { path: "charged_creeper/wither_skeleton", entity: "minecraft:wither_skeleton", kind: "interaction", labelKey: "chargedCreeper" },
  { path: "charged_creeper/zombie", entity: "minecraft:zombie", kind: "interaction", labelKey: "chargedCreeper" },
] as const;

/** Game rewards implemented outside entity loot tables, with primary-source evidence. */
export const GAME_GUIDE_ENTITY_SPECIAL_REWARDS = [
  { entity: "minecraft:wither", item: "minecraft:nether_star", method: "defeat",
    source: "https://www.minecraft.net/en-us/article/taking-inventory--nether-star" },
  { entity: "minecraft:ender_dragon", item: "minecraft:dragon_egg", method: "firstDragonDefeat",
    source: "https://www.minecraft.net/en-us/article/dragon-egg" },
  { entity: "minecraft:goat", item: "minecraft:goat_horn", method: "ram",
    source: "https://www.minecraft.net/en-us/article/minecraft-snapshot-22w17a" },
  { entity: "minecraft:wolf", item: "minecraft:wolf_armor", method: "recoverWolfArmor",
    source: "https://feedback.minecraft.net/hc/en-us/articles/22483937701517-Minecraft-Java-Edition-Snapshot-23w51b" },
  { entity: "minecraft:frog", item: "minecraft:slime_ball", method: "eatSlime",
    source: "https://www.minecraft.net/en-us/article/the-wild-update-out-today-java" },
  ...(["ochre_froglight", "verdant_froglight", "pearlescent_froglight"] as const).map(item => ({
    entity: "minecraft:frog", item: `minecraft:${item}`, method: "eatMagmaCube" as const,
    source: "https://www.minecraft.net/en-us/article/meet-frog",
  })),
] as const;

/** Verified mob interactions and behavior labels; omitted fields are unknown for a given release. */
export const GAME_GUIDE_ENTITY_ENTRY_STRUCTURES: Readonly<Record<string, string>> = {
  "minecraft:ender_dragon": "minecraft:stronghold",
};

export const GAME_GUIDE_ENTITY_PROFILES = [
  { entity: "minecraft:cow", behavior: "passive", breeding: ["minecraft:wheat"],
    source: "https://www.minecraft.net/en-us/article/minecraft-mobs" },
  { entity: "minecraft:sheep", behavior: "passive", breeding: ["minecraft:wheat"],
    source: "https://www.minecraft.net/en-us/article/taking-inventory--wheat" },
  { entity: "minecraft:mooshroom", behavior: "passive", breeding: ["minecraft:wheat"],
    source: "https://www.minecraft.net/en-us/article/taking-inventory--wheat" },
  { entity: "minecraft:creeper", behavior: "hostile", attack: "explosion",
    source: "https://www.minecraft.net/en-us/article/minecraft-mobs" },
  { entity: "minecraft:skeleton", behavior: "hostile", attack: "ranged",
    source: "https://www.minecraft.net/en-us/article/minecraft-mobs" },
  { entity: "minecraft:enderman", behavior: "neutral", trigger: "endermanStare",
    source: "https://www.minecraft.net/en-us/article/minecraft-mobs" },
  { entity: "minecraft:wolf", behavior: "neutral", trigger: "retaliates", taming: ["minecraft:bone"],
    source: "https://www.minecraft.net/en-us/article/wolf" },
  { entity: "minecraft:cat", behavior: "passive", taming: ["minecraft:cod", "minecraft:salmon"],
    source: "https://www.minecraft.net/en-us/article/cat" },
  { entity: "minecraft:sniffer", behavior: "passive", breeding: ["minecraft:torchflower_seeds"],
    access: "hatched", source: "https://www.minecraft.net/en-us/article/trails---tales-update-now-available-bedrock" },
  { entity: "minecraft:wither", behavior: "hostile", access: "summoned",
    source: "https://www.minecraft.net/en-us/article/meet-wither" },
  { entity: "minecraft:ender_dragon", access: "bossEncounter",
    source: "https://www.minecraft.net/en-us/article/dragon-egg" },
  { entity: "minecraft:giant", access: "commandSummon", version: "26.3",
    source: "https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar" },
  { entity: "minecraft:illusioner", access: "commandSummon", version: "26.3",
    source: "https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar" },
] as const;

/** Browsable mob overviews shared by editions. A null behavior marks command-only mobs without normal AI. */
export const GAME_GUIDE_ENTITY_OVERVIEWS: Readonly<Record<string, "passive" | "neutral" | "hostile" | null>> = {
  "minecraft:allay": "passive",
  "minecraft:armadillo": "passive",
  "minecraft:axolotl": "passive",
  "minecraft:bat": "passive",
  "minecraft:bee": "neutral",
  "minecraft:blaze": "hostile",
  "minecraft:bogged": "hostile",
  "minecraft:breeze": "hostile",
  "minecraft:camel_husk": "passive",
  "minecraft:camel": "passive",
  "minecraft:cat": "passive",
  "minecraft:cave_spider": "hostile",
  "minecraft:chicken": "passive",
  "minecraft:cod": "passive",
  "minecraft:copper_golem": "passive",
  "minecraft:cow": "passive",
  "minecraft:creaking": "hostile",
  "minecraft:creeper": "hostile",
  "minecraft:dolphin": "neutral",
  "minecraft:donkey": "passive",
  "minecraft:drowned": "hostile",
  "minecraft:elder_guardian": "hostile",
  "minecraft:ender_dragon": "hostile",
  "minecraft:enderman": "neutral",
  "minecraft:endermite": "hostile",
  "minecraft:evoker": "hostile",
  "minecraft:fox": "passive",
  "minecraft:frog": "passive",
  "minecraft:ghast": "hostile",
  "minecraft:giant": null,
  "minecraft:glow_squid": "passive",
  "minecraft:goat": "neutral",
  "minecraft:guardian": "hostile",
  "minecraft:happy_ghast": "passive",
  "minecraft:hoglin": "hostile",
  "minecraft:horse": "passive",
  "minecraft:husk": "hostile",
  "minecraft:illusioner": "hostile",
  "minecraft:iron_golem": "neutral",
  "minecraft:llama": "neutral",
  "minecraft:magma_cube": "hostile",
  "minecraft:mooshroom": "passive",
  "minecraft:mule": "passive",
  "minecraft:nautilus": "neutral",
  "minecraft:ocelot": "passive",
  "minecraft:panda": "neutral",
  "minecraft:parched": "hostile",
  "minecraft:parrot": "passive",
  "minecraft:phantom": "hostile",
  "minecraft:pig": "passive",
  "minecraft:piglin_brute": "hostile",
  "minecraft:piglin": "neutral",
  "minecraft:pillager": "hostile",
  "minecraft:polar_bear": "neutral",
  "minecraft:pufferfish": "passive",
  "minecraft:rabbit": "passive",
  "minecraft:ravager": "hostile",
  "minecraft:salmon": "passive",
  "minecraft:sheep": "passive",
  "minecraft:shulker": "hostile",
  "minecraft:silverfish": "hostile",
  "minecraft:skeleton_horse": "passive",
  "minecraft:skeleton": "hostile",
  "minecraft:slime": "hostile",
  "minecraft:sniffer": "passive",
  "minecraft:snow_golem": "passive",
  "minecraft:spider": "neutral",
  "minecraft:squid": "passive",
  "minecraft:stray": "hostile",
  "minecraft:strider": "passive",
  "minecraft:sulfur_cube": "passive",
  "minecraft:tadpole": "passive",
  "minecraft:trader_llama": "neutral",
  "minecraft:tropical_fish": "passive",
  "minecraft:turtle": "passive",
  "minecraft:vex": "hostile",
  "minecraft:villager": "passive",
  "minecraft:vindicator": "hostile",
  "minecraft:wandering_trader": "passive",
  "minecraft:warden": "hostile",
  "minecraft:witch": "hostile",
  "minecraft:wither_skeleton": "hostile",
  "minecraft:wither": "hostile",
  "minecraft:wolf": "neutral",
  "minecraft:zoglin": "hostile",
  "minecraft:zombie_horse": "passive",
  "minecraft:zombie_nautilus": "neutral",
  "minecraft:zombie_villager": "hostile",
  "minecraft:zombie": "hostile",
  "minecraft:zombified_piglin": "neutral",
};

/** Max-health attributes checked against the hash-pinned official 26.3 Java client. */
export const GAME_GUIDE_ENTITY_HEALTH_26_3: Readonly<Record<string, number>> = {
  "minecraft:cow": 10,
  "minecraft:creeper": 20,
  "minecraft:skeleton": 20,
  "minecraft:enderman": 40,
  "minecraft:wither": 300,
  "minecraft:ender_dragon": 200,
};

/** Boss combat values and phase notes checked against the linked Minecraft Wiki pages. Damage is raw HP before armor and effects. */
export const GAME_GUIDE_BOSS_COMBAT = [
  { entity: "minecraft:wither", key: "wither", edition: "java", version: "26.3",
    health: [300, 300, 300], attacks: [
      { key: "witherSkull", damage: [5, 8, 12], unit: "hit" },
      { key: "witherSkullExplosion", damage: [5, 5, 5], unit: "hit" },
    ], preparation: ["rangedWeapon", "meleeWeapon", "healing", "milk"], steps: 3,
    source: "https://minecraft.wiki/w/Wither", tutorial: "https://minecraft.wiki/w/Tutorial:Defeating_the_wither" },
  { entity: "minecraft:wither", key: "wither", edition: "bedrock", version: "26.45",
    health: [300, 450, 600], attacks: [
      { key: "witherSkull", damage: ["3–4", "5–6", "8–9"], unit: "hit" },
    ], preparation: ["rangedWeapon", "meleeWeapon", "healing", "milk"], steps: 3,
    source: "https://minecraft.wiki/w/Wither", tutorial: "https://minecraft.wiki/w/Tutorial:Defeating_the_wither" },
  { entity: "minecraft:ender_dragon", key: "enderDragon", edition: "java", version: "26.3",
    health: [200, 200, 200], attacks: [
      { key: "dragonMelee", damage: [6, 10, 15], unit: "hit" },
      { key: "dragonWing", damage: [3.5, 5, 7.5], unit: "hit" },
      { key: "dragonBreath", damage: [3, 3, 3], unit: "second" },
    ], preparation: ["rangedWeapon", "meleeWeapon", "healing", "slowFalling"], steps: 3,
    source: "https://minecraft.wiki/w/Ender_Dragon", tutorial: "https://minecraft.wiki/w/Tutorial:Defeating_the_ender_dragon" },
  { entity: "minecraft:ender_dragon", key: "enderDragon", edition: "bedrock", version: "26.45",
    health: [200, 200, 200], attacks: [
      { key: "dragonMelee", damage: [6, 10, 15], unit: "hit" },
      { key: "dragonWing", damage: [3.5, 5, 7.5], unit: "hit" },
      { key: "dragonBreath", damage: [3, 3, 3], unit: "second" },
    ], preparation: ["rangedWeapon", "meleeWeapon", "healing", "slowFalling"], steps: 3,
    source: "https://minecraft.wiki/w/Ender_Dragon", tutorial: "https://minecraft.wiki/w/Tutorial:Defeating_the_ender_dragon" },
] as const;

/** Resolves exact game entity identities to locally packaged, client-derived 3D portraits. */
export const gameKnowledgeEntityArtwork = (id: string): string | undefined => {
  const itemArtwork = GAME_KNOWLEDGE_ENTITY_ITEM_ARTWORK[id]; if (itemArtwork) return itemArtwork;
  const resolved = GAME_KNOWLEDGE_ENTITY_ALIASES[id] ?? id;
  const match = resolved.match(/^minecraft:([a-z0-9_]+)$/);
  return match ? `/guide-entities/minecraft_${match[1]}.png` : undefined;
};

export const GAME_KNOWLEDGE_TRADE_ARTWORK: Readonly<Record<string, string>> = {
  "minecraft:trade/armorer": "/guide-entities/minecraft_trade_armorer.png",
  "minecraft:trade/butcher": "/guide-entities/minecraft_trade_butcher.png",
  "minecraft:trade/cartographer": "/guide-entities/minecraft_trade_cartographer.png",
  "minecraft:trade/cleric": "/guide-entities/minecraft_trade_cleric.png",
  "minecraft:trade/farmer": "/guide-entities/minecraft_trade_farmer.png",
  "minecraft:trade/fisherman": "/guide-entities/minecraft_trade_fisherman.png",
  "minecraft:trade/fletcher": "/guide-entities/minecraft_trade_fletcher.png",
  "minecraft:trade/leatherworker": "/guide-entities/minecraft_trade_leatherworker.png",
  "minecraft:trade/librarian": "/guide-entities/minecraft_trade_librarian.png",
  "minecraft:trade/mason": "/guide-entities/minecraft_trade_mason.png",
  "minecraft:trade/shepherd": "/guide-entities/minecraft_trade_shepherd.png",
  "minecraft:trade/smith": "/guide-entities/minecraft_villager.png",
  "minecraft:trade/toolsmith": "/guide-entities/minecraft_trade_toolsmith.png",
  "minecraft:trade/wandering_trader": "/guide-entities/minecraft_wandering_trader.png",
  "minecraft:trade/weaponsmith": "/guide-entities/minecraft_trade_weaponsmith.png",
};

/** Representative artwork for groups whose Bedrock member list is absent from the packaged source. */
export const GAME_KNOWLEDGE_TAG_ARTWORK = [
  { kind: "tag", id: "minecraft:metal_nuggets", artwork: "/guide-artwork/iron_nugget.png" },
] as const;

export const GAME_KNOWLEDGE_SUBJECTS = [
  { kind: "entity", id: "minecraft:horse", nameKey: "knowledge.horse.subjects.horse.name",
    descriptionKey: "knowledge.horse.subjects.horse.description", artwork: knowledgeArtwork(0, 0, 1.04) },
  { kind: "item", id: "minecraft:saddle", nameKey: "knowledge.horse.subjects.saddle.name",
    descriptionKey: "knowledge.horse.subjects.saddle.description", artwork: knowledgeArtwork(1, 0) },
  { kind: "item", id: "minecraft:leather", nameKey: "knowledge.horse.subjects.leather.name",
    descriptionKey: "knowledge.horse.subjects.leather.description", artwork: knowledgeArtwork(2, 0) },
  { kind: "item", id: "minecraft:golden_apple", nameKey: "knowledge.horse.subjects.goldenApple.name",
    descriptionKey: "knowledge.horse.subjects.goldenApple.description", artwork: knowledgeArtwork(3, 0) },
  { kind: "item", id: "minecraft:golden_carrot", nameKey: "knowledge.horse.subjects.goldenCarrot.name",
    descriptionKey: "knowledge.horse.subjects.goldenCarrot.description", artwork: knowledgeArtwork(0, 1) },
  { kind: "item", id: "minecraft:sugar", nameKey: "knowledge.horse.subjects.sugar.name",
    descriptionKey: "knowledge.horse.subjects.sugar.description", artwork: knowledgeArtwork(1, 1) },
  { kind: "item", id: "minecraft:wheat", nameKey: "knowledge.horse.subjects.wheat.name",
    descriptionKey: "knowledge.horse.subjects.wheat.description", artwork: knowledgeArtwork(2, 1) },
  { kind: "item", id: "minecraft:apple", nameKey: "knowledge.horse.subjects.apple.name",
    descriptionKey: "knowledge.horse.subjects.apple.description", artwork: knowledgeArtwork(3, 1) },
  { kind: "poi", id: "minecraft:plains", nameKey: "knowledge.horse.subjects.plains.name",
    descriptionKey: "knowledge.horse.subjects.plains.description", artwork: knowledgeArtwork(0, 2) },
  { kind: "poi", id: "minecraft:savanna", nameKey: "knowledge.horse.subjects.savanna.name",
    descriptionKey: "knowledge.horse.subjects.savanna.description", artwork: knowledgeArtwork(1, 2) },
  { kind: "poi", id: "minecraft:village", nameKey: "knowledge.horse.subjects.village.name",
    descriptionKey: "knowledge.horse.subjects.village.description", artwork: knowledgeArtwork(2, 2, 1.04) },
  { kind: "item", id: "minecraft:gold_ingot", nameKey: "knowledge.horse.subjects.goldIngot.name",
    descriptionKey: "knowledge.horse.subjects.goldIngot.description", artwork: recipeKnowledgeArtwork(0, 0) },
  { kind: "item", id: "minecraft:gold_nugget", nameKey: "knowledge.horse.subjects.goldNugget.name",
    descriptionKey: "knowledge.horse.subjects.goldNugget.description", artwork: recipeKnowledgeArtwork(1, 0) },
  { kind: "item", id: "minecraft:carrot", nameKey: "knowledge.horse.subjects.carrot.name",
    descriptionKey: "knowledge.horse.subjects.carrot.description", artwork: recipeKnowledgeArtwork(2, 0) },
  { kind: "item", id: "minecraft:sugar_cane", nameKey: "knowledge.horse.subjects.sugarCane.name",
    descriptionKey: "knowledge.horse.subjects.sugarCane.description", artwork: recipeKnowledgeArtwork(0, 1) },
  { kind: "item", id: "minecraft:honey_bottle", nameKey: "knowledge.horse.subjects.honeyBottle.name",
    descriptionKey: "knowledge.horse.subjects.honeyBottle.description", artwork: recipeKnowledgeArtwork(1, 1) },
  { kind: "item", id: "minecraft:crafting_table", nameKey: "knowledge.horse.subjects.craftingTable.name",
    descriptionKey: "knowledge.horse.subjects.craftingTable.description", artwork: recipeKnowledgeArtwork(2, 1) },
  { kind: "item", id: "minecraft:iron_ingot", nameKey: "knowledge.horse.subjects.ironIngot.name",
    descriptionKey: "knowledge.horse.subjects.ironIngot.description", artwork: recipeKnowledgeArtwork(0, 0) },
  { kind: "entity", id: "minecraft:villager", nameKey: "knowledge.horse.subjects.villager.name",
    descriptionKey: "knowledge.horse.subjects.villager.description", artwork: knowledgeArtwork(2, 0, 1.04) },
  { kind: "item", id: "minecraft:emerald", nameKey: "knowledge.horse.subjects.emerald.name",
    descriptionKey: "knowledge.horse.subjects.emerald.description", artwork: recipeKnowledgeArtwork(1, 0) },
] as const;

const itemIngredient = (id: string) => ({ choices: [{ kind: "item" as const, id }], count: 1 });
const ringRecipe = (id: string, ring: string, center: string): GameKnowledgeRecipeTemplate => ({
  id,
  method: "shaped",
  sourceType: "minecraft:crafting_shaped",
  stations: ["minecraft:crafting_table"],
  ingredients: [ring, ring, ring, ring, center, ring, ring, ring, ring].map(itemIngredient),
  outputs: [{ id, count: 1 }],
  grid: { width: 3, height: 3, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
});

export const GAME_KNOWLEDGE_RECIPES: readonly GameKnowledgeRecipeTemplate[] = [
  ringRecipe("minecraft:golden_apple", "minecraft:gold_ingot", "minecraft:apple"),
  ringRecipe("minecraft:golden_carrot", "minecraft:gold_nugget", "minecraft:carrot"),
  { id: "minecraft:sugar_from_sugar_cane", method: "shapeless", sourceType: "minecraft:crafting_shapeless",
    stations: ["minecraft:crafting_table"], ingredients: [itemIngredient("minecraft:sugar_cane")],
    outputs: [{ id: "minecraft:sugar", count: 1 }] },
  { id: "minecraft:sugar_from_honey_bottle", method: "shapeless", sourceType: "minecraft:crafting_shapeless",
    stations: ["minecraft:crafting_table"], ingredients: [itemIngredient("minecraft:honey_bottle")],
    outputs: [{ id: "minecraft:sugar", count: 3 }] },
  { id: "minecraft:saddle", method: "shaped", sourceType: "minecraft:recipe_shaped",
    stations: ["minecraft:crafting_table"], ingredients: [
      itemIngredient("minecraft:leather"), itemIngredient("minecraft:leather"), itemIngredient("minecraft:iron_ingot"),
      itemIngredient("minecraft:leather"),
    ], outputs: [{ id: "minecraft:saddle", count: 1 }],
    grid: { width: 3, height: 2, slots: [null, 0, null, 1, 2, 3] } },
];

export const GAME_KNOWLEDGE_RECIPE_ARTWORK = [
  { kind: "recipe", id: "minecraft:golden_apple", artwork: knowledgeArtwork(3, 0) },
  { kind: "recipe", id: "minecraft:golden_carrot", artwork: knowledgeArtwork(0, 1) },
  { kind: "recipe", id: "minecraft:sugar_from_sugar_cane", artwork: knowledgeArtwork(1, 1) },
  { kind: "recipe", id: "minecraft:sugar_from_honey_bottle", artwork: knowledgeArtwork(1, 1) },
  { kind: "recipe", id: "minecraft:saddle", artwork: knowledgeArtwork(1, 0) },
] as const;

/** A deliberately small first-party slice. Missing mechanics are never presented as proof of absence. */
export const GAME_KNOWLEDGE_MECHANICS: readonly GameKnowledgeMechanicTemplate[] = [
  { id: "minecraft:horse/find", kind: "interaction", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.find.name", descriptionKey: "knowledge.horse.mechanics.find.description",
    requirements: [], inputs: [], outputs: [], related: [
      { kind: "poi", id: "minecraft:plains" }, { kind: "poi", id: "minecraft:savanna" }, { kind: "poi", id: "minecraft:village" },
    ], provenanceKey: "horseArticle" },
  { id: "minecraft:horse/tame", kind: "taming", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.tame.name", descriptionKey: "knowledge.horse.mechanics.tame.description",
    requirements: [], inputs: [], outputs: [], related: [
      { kind: "item", id: "minecraft:sugar", noteKey: "knowledge.horse.notes.tamingFood" },
      { kind: "item", id: "minecraft:wheat", noteKey: "knowledge.horse.notes.tamingFood" },
      { kind: "item", id: "minecraft:apple", noteKey: "knowledge.horse.notes.tamingFood" },
      { kind: "item", id: "minecraft:golden_carrot", noteKey: "knowledge.horse.notes.tamingFood" },
      { kind: "item", id: "minecraft:golden_apple", noteKey: "knowledge.horse.notes.tamingFood" },
    ], provenanceKey: "horseArticle" },
  { id: "minecraft:horse/equip_saddle", kind: "equipment", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.equip.name", descriptionKey: "knowledge.horse.mechanics.equip.description",
    requirements: [{ kind: "entity", id: "minecraft:horse", noteKey: "knowledge.horse.notes.tamedHorse" }],
    inputs: [{ kind: "item", id: "minecraft:saddle", count: { min: 1, max: 1 } }], outputs: [], related: [], provenanceKey: "horseArticle" },
  { id: "minecraft:horse/breed_golden_apple", kind: "breeding", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.breedApple.name", descriptionKey: "knowledge.horse.mechanics.breedApple.description",
    requirements: [{ kind: "entity", id: "minecraft:horse", count: { min: 2, max: 2 } }],
    inputs: [{ kind: "item", id: "minecraft:golden_apple", count: { min: 2, max: 2 }, noteKey: "knowledge.horse.notes.onePerHorse" }],
    outputs: [], related: [], provenanceKey: "horseArticle" },
  { id: "minecraft:horse/breed_golden_carrot", kind: "breeding", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.breedCarrot.name", descriptionKey: "knowledge.horse.mechanics.breedCarrot.description",
    requirements: [{ kind: "entity", id: "minecraft:horse", count: { min: 2, max: 2 } }],
    inputs: [{ kind: "item", id: "minecraft:golden_carrot", count: { min: 2, max: 2 }, noteKey: "knowledge.horse.notes.onePerHorse" }],
    outputs: [], related: [], provenanceKey: "horseArticle" },
  ...(["sugar", "wheat", "apple"] as const).map(item => ({
    id: `minecraft:horse/feed_${item}`,
    kind: "use" as const,
    subject: { kind: "item" as const, id: `minecraft:${item}` },
    nameKey: `knowledge.horse.mechanics.feed.${item}.name`,
    descriptionKey: `knowledge.horse.mechanics.feed.${item}.description`,
    requirements: [] as const,
    inputs: [{ kind: "item" as const, id: `minecraft:${item}`, count: { min: 1, max: 1 } }],
    outputs: [] as const,
    related: [{ kind: "entity" as const, id: "minecraft:horse" }],
    provenanceKey: "horseArticle" as const,
  })),
  { id: "minecraft:horse/drop_leather", kind: "drop", subject: { kind: "entity", id: "minecraft:horse" },
    nameKey: "knowledge.horse.mechanics.drop.name", descriptionKey: "knowledge.horse.mechanics.drop.description",
    requirements: [], inputs: [], outputs: [{ kind: "item", id: "minecraft:leather", count: { min: 0, max: 2 },
      noteKey: "knowledge.horse.notes.looting" }], related: [], provenanceKey: "horseLoot" },
  { id: "minecraft:saddle/use_horse", kind: "use", subject: { kind: "item", id: "minecraft:saddle" },
    nameKey: "knowledge.horse.mechanics.saddle.name", descriptionKey: "knowledge.horse.mechanics.saddle.description",
    requirements: [{ kind: "entity", id: "minecraft:horse", noteKey: "knowledge.horse.notes.tamedHorse" }],
    inputs: [], outputs: [], related: [{ kind: "entity", id: "minecraft:horse" }], provenanceKey: "horseArticle" },
  { id: "minecraft:villager/farmer_buy_wheat", kind: "trade", subject: { kind: "entity", id: "minecraft:villager" },
    nameKey: "knowledge.horse.mechanics.farmerTrade.name", descriptionKey: "knowledge.horse.mechanics.farmerTrade.description",
    requirements: [], inputs: [{ kind: "item", id: "minecraft:wheat", count: { min: 20, max: 20 },
      noteKey: "knowledge.horse.notes.noviceFarmerOffer" }],
    outputs: [{ kind: "item", id: "minecraft:emerald", count: { min: 1, max: 1 } }],
    related: [{ kind: "poi", id: "minecraft:village" }], provenanceKey: "farmerTrades" },
];

export const GAME_KNOWLEDGE_MECHANIC_ARTWORK = GAME_KNOWLEDGE_MECHANICS.map(mechanic => ({
  kind: "mechanic",
  id: mechanic.id,
  artwork: knowledgeArtwork(3, 2, 1.04),
}));

const horseArticleProvenance = {
  path: "minecraft.net/en-us/article/mob-menagerie--horse",
  revision: "mob-menagerie--horse",
  sha256: "a7b3ab948ce3c671d572747ab9d23f3c694ab9733aac700575dbfcef4c7e0739",
  url: "https://www.minecraft.net/en-us/article/mob-menagerie--horse",
} as const;

/** Exact Java profiles whose official server data was inspected for this slice. */
export const GAME_KNOWLEDGE_PROFILES = [
  { edition: "java", version: "1.20.6", titleKey: "knowledge.horse.catalogTitle",
    revision: "145ff0858209bcfc164859ba735d4199aafa1eea",
    url: "https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar",
    provenance: { horseArticle: horseArticleProvenance, horseLoot: {
      path: "data/minecraft/loot_tables/entities/horse.json", revision: "145ff0858209bcfc164859ba735d4199aafa1eea",
      sha256: "13ab80c2f547eb78109ffe99d56f4d96b46c226683e2be9f65772bece87fca26",
      url: "https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar",
    } } },
  { edition: "java", version: "1.21.3", titleKey: "knowledge.horse.catalogTitle",
    revision: "45810d238246d90e811d896f87b14695b7fb6839",
    url: "https://piston-data.mojang.com/v1/objects/45810d238246d90e811d896f87b14695b7fb6839/server.jar",
    provenance: { horseArticle: horseArticleProvenance, horseLoot: {
      path: "data/minecraft/loot_table/entities/horse.json", revision: "45810d238246d90e811d896f87b14695b7fb6839",
      sha256: "ec75aaecbfa0191ae31463e83b857674d184697ce1bff38996a83bc915b80e3c",
      url: "https://piston-data.mojang.com/v1/objects/45810d238246d90e811d896f87b14695b7fb6839/server.jar",
    } } },
  { edition: "bedrock", version: "1.21.120", titleKey: "knowledge.horse.catalogTitle",
    revision: "091dbd3ff9cf3c4205eb3c53ba4a673374b08472",
    url: "https://github.com/Mojang/bedrock-samples/tree/091dbd3ff9cf3c4205eb3c53ba4a673374b08472/behavior_pack",
    provenance: {
      horseArticle: {
        path: "behavior_pack/entities/horse.json", revision: "091dbd3ff9cf3c4205eb3c53ba4a673374b08472",
        sha256: "f2067356755ff5a5612f2af10b527ebe0eb049fc3aca8cc85004167d3e9f84ac",
        url: "https://github.com/Mojang/bedrock-samples/blob/091dbd3ff9cf3c4205eb3c53ba4a673374b08472/behavior_pack/entities/horse.json",
      },
      horseLoot: {
        path: "behavior_pack/loot_tables/entities/horse.json", revision: "091dbd3ff9cf3c4205eb3c53ba4a673374b08472",
        sha256: "64f18d4dc5826d043fd626d056bd7c299220a840e65f92e6f6fdd7354d3b98e6",
        url: "https://github.com/Mojang/bedrock-samples/blob/091dbd3ff9cf3c4205eb3c53ba4a673374b08472/behavior_pack/loot_tables/entities/horse.json",
      },
      farmerTrades: {
        path: "behavior_pack/trading/economy_trades/farmer_trades.json", revision: "091dbd3ff9cf3c4205eb3c53ba4a673374b08472",
        sha256: "4ca2c74b9e6d625b8f85d7a29d8d2b09e0584318e96582766f1d63678a659f98",
        url: "https://github.com/Mojang/bedrock-samples/blob/091dbd3ff9cf3c4205eb3c53ba4a673374b08472/behavior_pack/trading/economy_trades/farmer_trades.json",
      },
    } },
] as const;

/** Exact official-data profiles for the bounded built-in recipe slice. */
export const GAME_KNOWLEDGE_RECIPE_PROFILES = [
  { edition: "java", version: "1.20.6", revision: "145ff0858209bcfc164859ba735d4199aafa1eea",
    url: "https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar", files: [
      { id: "minecraft:golden_apple", path: "data/minecraft/recipes/golden_apple.json",
        sha256: "1e9300ee9c3528357fa36a7aa1a859ddac2e898454a2bdb89404f4e0606a5b7b" },
      { id: "minecraft:golden_carrot", path: "data/minecraft/recipes/golden_carrot.json",
        sha256: "47759c2a741722a4576022b4bc3e67db062d3dd748109945ba4e6d7249c1158e" },
      { id: "minecraft:sugar_from_sugar_cane", path: "data/minecraft/recipes/sugar_from_sugar_cane.json",
        sha256: "dc3f5de48d8ec39df2112ddbe267de6ba0f524ffed9a356ed2a8c6d1c7eeedf6" },
      { id: "minecraft:sugar_from_honey_bottle", path: "data/minecraft/recipes/sugar_from_honey_bottle.json",
        sha256: "ec2815f0b396111c05320ca8397a1f58ab6ff1993bf633b9514ceba4b6e3a9b3" },
    ] },
  { edition: "java", version: "1.21.3", revision: "45810d238246d90e811d896f87b14695b7fb6839",
    url: "https://piston-data.mojang.com/v1/objects/45810d238246d90e811d896f87b14695b7fb6839/server.jar", files: [
      { id: "minecraft:golden_apple", path: "data/minecraft/recipe/golden_apple.json",
        sha256: "469401a796bac8972b8253e1cbb4d466cc2a5bd96ac297451ef53caa4e186f9c" },
      { id: "minecraft:golden_carrot", path: "data/minecraft/recipe/golden_carrot.json",
        sha256: "4562fe0836ae1b7358ea9aceebc5f263191a9f680fefc4b4bbb3e887a6754492" },
      { id: "minecraft:sugar_from_sugar_cane", path: "data/minecraft/recipe/sugar_from_sugar_cane.json",
        sha256: "c3b46e04d99e5802d119eca66fcb5d14d9f72492b55d53aa00c11061f3001183" },
      { id: "minecraft:sugar_from_honey_bottle", path: "data/minecraft/recipe/sugar_from_honey_bottle.json",
        sha256: "45fe0f055a4e21f160a8085b8823690d9194be3e444e351683e7a77aa2c1c569" },
    ] },
  { edition: "bedrock", version: "1.21.120", revision: "091dbd3ff9cf3c4205eb3c53ba4a673374b08472",
    url: "https://github.com/Mojang/bedrock-samples/tree/091dbd3ff9cf3c4205eb3c53ba4a673374b08472/behavior_pack/recipes", files: [
      { id: "minecraft:golden_apple", sourceType: "minecraft:recipe_shaped", path: "behavior_pack/recipes/golden_apple.json",
        sha256: "0cd8ac1ea092a7e052d9287e1a0a8db41a77af17f51cafe96f2a2b7616def42a" },
      { id: "minecraft:golden_carrot", sourceType: "minecraft:recipe_shaped", path: "behavior_pack/recipes/golden_carrot.json",
        sha256: "7b86393653134b6a06f8e51728db62d5543d9a86460d27c7df0a63d28b929d87" },
      { id: "minecraft:saddle", sourceType: "minecraft:recipe_shaped", path: "behavior_pack/recipes/saddle.json",
        sha256: "ecb501560ddace3b4938f13b03b305cdbccf05d32fab48e4334cf40132c4fbac" },
    ] },
] as const;

/** Extracted storage-word layouts, NOT verified save adapters or version support. */
export const GAME_SECTION_LAYOUTS = {
  javaPadded: { wordBits: 64, littleEndian: false, axisOrder: "yzx", allowedBits: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  bedrockPadded: { wordBits: 32, littleEndian: true, axisOrder: "xzy", allowedBits: [0, 1, 2, 3, 4, 5, 6, 8, 16] },
} as const;

/** Modern Java column schema. A validated release/data-version mapping is still required. */
export const GAME_COLUMN_TAG_SCHEMA = {
  version: "DataVersion", x: "xPos", z: "zPos", status: "Status", fullStatuses: ["full", "minecraft:full"],
  sections: "sections", sectionY: "Y", storage: "block_states", palette: "palette",
  stateName: "Name", properties: "Properties", data: "data", minBits: 4,
  layout: GAME_SECTION_LAYOUTS.javaPadded,
  structureStarts: {
    root: "structures", starts: "starts", id: "id", chunkX: "ChunkX", chunkZ: "ChunkZ", boundingBox: "BB",
    invalidIds: ["INVALID", "minecraft:invalid"],
  },
} as const;

export const GAME_NBT_FORMATS = {
  java: { littleEndian: false, stringEncoding: "modified-utf-8" },
  bedrock: { littleEndian: true, stringEncoding: "utf-8" },
} as const;

export const GAME_REGION_COMPRESSION = { 1: "gzip", 2: "deflate", 3: "none" } as const;

/** Exact save DataVersion values read from the pinned official Mojang server artifacts. */
export const GAME_JAVA_REGION_PROFILES = [
  { edition: "java", version: "1.18.2", dataVersion: 2975, minSectionY: -4, maxSectionY: 19,
    artifactSha1: "c8f83c5655308435b3dcf03c06d9fe8740a77469" },
  { edition: "java", version: "1.20.6", dataVersion: 3839, minSectionY: -4, maxSectionY: 19,
    artifactSha1: "145ff0858209bcfc164859ba735d4199aafa1eea" },
  { edition: "java", version: "1.21.3", dataVersion: 4082, minSectionY: -4, maxSectionY: 19,
    artifactSha1: "45810d238246d90e811d896f87b14695b7fb6839" },
] as const;

/**
 * Read-only Bedrock LevelDB terrain profiles. Block-state versions are a
 * separate compatibility identity from the marketed game release. The list
 * covers the reviewed modern upgrade chain through the current 1.21.60.33
 * state format; unknown state versions fail closed in the decoder.
 */
const modernBedrockPaletteVersions = [
  18_108_440, // 1.20.80.24 beta
  18_153_497, // 1.21.0.25 beta
  18_158_616, // 1.21.20.24 beta
  18_161_176, // 1.21.30.24 beta
  18_163_737, // 1.21.40.25 beta
  18_166_301, // 1.21.50.29 beta
  18_168_860, // 1.21.60.28 beta
  18_168_865, // 1.21.60.33
] as const;

export const GAME_BEDROCK_LEVELDB_PROFILES = GAME_WORLD_CATALOG.bedrock.versions.map(version => ({
  edition: "bedrock" as const,
  version,
  expectedComparator: "leveldb.BytewiseComparator",
  paletteVersions: modernBedrockPaletteVersions,
  minSectionY: -4,
  maxSectionY: 19,
}));

/** Bedrock persistent-key dimension ids; Java's Nether id is intentionally different. */
export const GAME_BEDROCK_DIMENSION_CODES: Readonly<Record<string, number>> = {
  overworld: 0,
  nether: 1,
  end: 2,
};

/** Schematic 3D preview classification; these are authored colors, not redistributed game textures. */
export const GAME_TERRAIN_PREVIEW_MATERIALS = {
  faceVariants: true,
  emptyIds: ["minecraft:air", "minecraft:cave_air", "minecraft:void_air"],
  deferredTokens: ["water", "lava", "leaves", "glass", "ice", "slab", "stairs", "fence", "wall", "door", "trapdoor",
    "pane", "torch", "rail", "button", "pressure_plate", "carpet", "bed", "chest", "sign", "banner", "flower", "sapling",
    "mushroom", "vine", "cactus", "sugar_cane", "kelp", "seagrass", "coral", "candle", "chain", "lantern"],
  groups: [
    { id: "grass", color: [103, 143, 74], accent: [133, 166, 88], pattern: "layered", tokens: ["grass", "moss"] },
    { id: "earth", color: [120, 86, 59], accent: [92, 64, 45], pattern: "granular", tokens: ["dirt", "mud", "clay", "soul_soil"] },
    { id: "sand", color: [205, 188, 126], accent: [225, 211, 154], pattern: "granular", tokens: ["sand", "end_stone", "sandstone"] },
    { id: "wood", color: [139, 101, 63], accent: [103, 72, 43], pattern: "grain", tokens: ["log", "wood", "planks", "stem", "hyphae"] },
    { id: "nether", color: [119, 58, 55], accent: [151, 70, 62], pattern: "porous", tokens: ["netherrack", "nether", "crimson", "warped"] },
    { id: "dark-stone", color: [69, 68, 72], accent: [100, 96, 107], pattern: "veined", tokens: ["deepslate", "blackstone", "basalt", "obsidian"] },
    { id: "light", color: [210, 212, 205], accent: [239, 242, 235], pattern: "crystalline", tokens: ["snow", "quartz", "calcite", "bone_block"] },
    { id: "stone", color: [126, 126, 121], accent: [151, 148, 139], pattern: "mottle", tokens: ["stone", "ore", "tuff", "brick"] },
    { id: "other", color: [143, 112, 139], accent: [170, 137, 166], pattern: "neutral", tokens: [] },
  ],
} as const;

/** Bedrock persistent storage values; LevelDB access and release coverage are separate. */
export const GAME_SUBCHUNK_SCHEMA = {
  versions: { 8: { altitudeByte: false }, 9: { altitudeByte: true } },
  stateName: "name", properties: "states", paletteVersion: "version",
  layout: GAME_SECTION_LAYOUTS.bedrockPadded,
} as const;

/** Persistent chunk-key bytes; values are decoded independently by GAME_SUBCHUNK_SCHEMA. */
export const GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA = {
  tag: 0x2f,
  omittedDimension: 0,
  dimensions: [0, 1, 2],
} as const;

export const GAME_TELEMETRY = {
  features: ["game_info", "match_info", "gep_internal", "mods"],
  requiredFeatures: ["game_info", "match_info", "gep_internal"],
  storageKey: `${GAME_CONFIG.storageNamespace}:game-session:v1`,
  staleAfterMs: 3_000,
  positionWarmupEditions: ["bedrock"],
  coordinateLimit: 30_000_000,
  facingAxes: {
    java: { yaw: "x", pitch: "y" },
    bedrock: { yaw: "y", pitch: "x" },
  } as Record<string, { yaw: "x" | "y"; pitch: "x" | "y" }>,
  dimensions: {
    "minecraft:overworld": "overworld",
    "minecraft:the_nether": "nether",
    "minecraft:the_end": "end",
    overworld: "overworld",
    nether: "nether",
    the_nether: "nether",
    end: "end",
    the_end: "end",
  } as Record<string, string>,
  deathSceneKeys: [
    "deathScreen.title",
    "deathScreen.title.hardcore",
    "deathScreen",
    "/gameplay/death",
  ] as readonly string[],
};

/** Journey capture policy; samples are normalized GEP positions, never raw provider payloads. */
export const GAME_JOURNEY = {
  storagePrefix: `${GAME_CONFIG.storageNamespace}:journey:v1`,
  sampleIntervalMs: 1_000,
  gapAfterMs: 5_000,
  minimumDistance: 0.75,
  teleportDistance: 128,
  teleportSpeed: 96,
  maxPoints: 4_096,
  maxSegments: 256,
  maxJourneys: 100,
  maxStoredBytes: 4 * 1024 * 1024,
} as const;
