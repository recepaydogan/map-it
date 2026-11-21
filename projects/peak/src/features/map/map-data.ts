import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export type MarkerCategory =
  | "luggage"
  | "campfire"
  | "scout"
  | "nest"
  | "forage"
  | "guidebook"
  | "respawn"
  | "portal"
  | "belltower"
  | "creature"
  | "environment"
  | "trap"
  | "bridge"
  | "rope"
  | "vine"
  | "secret";

export type MarkerSourceKind = "exact" | "exact-zone" | "spawn-point";

export interface MarkerSource {
  kind: MarkerSourceKind;
  component: string;
  gameObject: string;
  sceneAsset: string;
  pathId: number;
}

export interface MapMarker {
  id: string;
  category: MarkerCategory;
  name: string;
  regionKey: string;
  x: number;
  y: number;
  elevation: number;
  group: string;
  aggregateKey: string | null;
  exact: boolean;
  biomeSlot: number | null;
  source: MarkerSource;
  sequence: number;
  content: PeakMarkerContent;
}

export type PeakItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic"
  | "ridiculously-rare";

export interface PeakItem {
  id: number;
  displayId: number;
  name: string;
  icon: string | null;
  weight: number;
  mass: number;
  uses: number | null;
  tags: string[];
  primaryAction: string | null;
  secondaryAction: string | null;
  canPocket: boolean;
  canBackpack: boolean;
  canThrow: boolean;
  cookable: boolean;
  effects: Array<{
    type: string;
    amount: number;
    status?: string;
  }>;
  baseRarity: PeakItemRarity | null;
  spawnPools: string[];
  rarityOverrides: Record<string, PeakItemRarity>;
  banInSolo: boolean;
}

export interface PeakLootPoolEntry {
  itemId: number;
  rarity: PeakItemRarity;
  weight: number;
  chance: number;
}

export interface PeakLootPool {
  id: string;
  name: string;
  items: PeakLootPoolEntry[];
}

export interface PeakMarkerContent {
  variant: string;
  name: string;
  lootPoolId?: string | null;
  items?: Array<{
    itemId: number;
    kind: "contains" | "reward" | "possible";
    quantityMin?: number;
    quantityMax?: number;
  }>;
  facts?: Array<{
    key: string;
    value: string | number;
    unit?: string | null;
  }>;
  instances?: number;
  relatedAchievementIds?: string[];
  guidebookPageId?: string;
}

export interface PeakAchievement {
  id: string;
  name: string;
  description: string;
}

export interface PeakGuidebookPage {
  id: string;
  title: string;
  body: string;
}

export interface MarkerCategoryDefinition {
  id: MarkerCategory;
  labelKey: string;
  available: number;
  color: string;
  iconSource: string | null;
}

interface PeakCatalogMarker {
  id: string;
  category: MarkerCategory;
  map: { x: number; y: number };
  elevation: number;
  region: string;
  group: string;
  aggregateKey: string | null;
  exact: boolean;
  biomeSlot: number | null;
  source: MarkerSource;
  sequence: number;
  content: PeakMarkerContent;
}

export interface PeakDailyLevel {
  index: number | null;
  number: number | null;
  kind?: "daily" | "final";
  scene: string;
  title: string;
  seed: number;
  biomes: string[];
  variants: string[];
  mapImage: string;
  projection: {
    worldXMin: number;
    worldXMax: number;
    worldZMin: number;
    worldZMax: number;
    mapXMin: number;
    mapXMax: number;
    mapYMin: number;
    mapYMax: number;
  };
  markerCounts: Partial<Record<MarkerCategory, number>>;
  hazardSummary: Array<{ variant: string; count: number }>;
  markers: PeakCatalogMarker[];
}

interface PeakCatalog {
  schemaVersion?: number;
  source: {
    buildId: string;
    gameVersion: string;
    revision: string;
  };
  rotation: {
    anchorUtc: string;
    durationHours: number;
    levelCount: number;
  };
  markerIcons?: Partial<Record<MarkerCategory, string>>;
  items: PeakItem[];
  lootPools: PeakLootPool[];
  achievements: PeakAchievement[];
  guidebook: PeakGuidebookPage[];
  levels: PeakDailyLevel[];
  specialLevels?: PeakDailyLevel[];
}

interface PeakServerRotation {
  levelIndex: number;
  resetAt: number;
}

interface PeakLoginResponse {
  VersionOkay?: boolean;
  HoursUntilLevel?: number;
  MinutesUntilLevel?: number;
  SecondsUntilLevel?: number;
  LevelIndex?: number;
}

const PEAK_ROTATION_ENDPOINT = "https://peaklogin3.azurewebsites.net/api/VersionCheck";
const CATALOG_REFRESH_INTERVAL_MS = 5 * 60_000;

const CATEGORY_BASE: Omit<MarkerCategoryDefinition, "available" | "iconSource">[] = [
  { id: "campfire", labelKey: "map.categories.campfire", color: "#e29a6f" },
  { id: "scout", labelKey: "map.categories.scout", color: "#a9c6da" },
  { id: "respawn", labelKey: "map.categories.respawn", color: "#91c9bd" },
  { id: "portal", labelKey: "map.categories.portal", color: "#bda6e8" },
  { id: "belltower", labelKey: "map.categories.belltower", color: "#d6c279" },
  { id: "luggage", labelKey: "map.categories.luggage", color: "#c9b98e" },
  { id: "nest", labelKey: "map.categories.nest", color: "#c6b996" },
  { id: "forage", labelKey: "map.categories.forage", color: "#87b987" },
  { id: "guidebook", labelKey: "map.categories.guidebook", color: "#d5b37a" },
  { id: "bridge", labelKey: "map.categories.bridge", color: "#b5a48b" },
  { id: "rope", labelKey: "map.categories.rope", color: "#c19a71" },
  { id: "vine", labelKey: "map.categories.vine", color: "#72a96f" },
  { id: "creature", labelKey: "map.categories.creature", color: "#d98278" },
  { id: "environment", labelKey: "map.categories.environment", color: "#e19c68" },
  { id: "trap", labelKey: "map.categories.trap", color: "#d46f6f" },
  { id: "secret", labelKey: "map.categories.secret", color: "#b7a1cb" },
];

export const MARKER_CATEGORY_IDS = CATEGORY_BASE.map((category) => category.id);

// High-resolution zoom tiles captured by tools/map-capture with -TileGrid.
// Tiles are optional: the map falls back to the overview image when absent.
export const MAP_TILE_GRID = 4;

const PEAK_DATA_PATH_PREFIX = "./data/peak/";
const peakCdnBaseUrl = (import.meta.env.VITE_PEAK_CDN_BASE_URL ?? "").replace(/\/+$/u, "");

const getPeakAssetUrl = (assetPath: string): string => {
  if (!peakCdnBaseUrl || !assetPath.startsWith(PEAK_DATA_PATH_PREFIX)) return assetPath;
  return `${peakCdnBaseUrl}/${assetPath.slice(PEAK_DATA_PATH_PREFIX.length)}`;
};

const normalizeCatalogAssetPaths = (catalog: PeakCatalog): PeakCatalog => ({
  ...catalog,
  markerIcons: Object.fromEntries(
    Object.entries(catalog.markerIcons ?? {}).map(([category, path]) => [category, getPeakAssetUrl(path)]),
  ),
  items: catalog.items.map((item) => ({
    ...item,
    icon: item.icon ? getPeakAssetUrl(item.icon) : item.icon,
  })),
  levels: catalog.levels.map((level) => ({ ...level, mapImage: getPeakAssetUrl(level.mapImage) })),
  specialLevels: catalog.specialLevels?.map((level) => ({
    ...level,
    mapImage: getPeakAssetUrl(level.mapImage),
  })),
});

export const getMapSlug = (mapImage: string): string => {
  const fileName = mapImage.split("/").at(-1) ?? mapImage;
  return fileName.replace(/\.webp$/, "");
};

export const getMapTileSource = (mapSlug: string, column: number, row: number): string =>
  peakCdnBaseUrl
    ? `${peakCdnBaseUrl}/maps/tiles/${mapSlug}/${column}-${row}.webp`
    : `./data/peak/maps/tiles/${mapSlug}/${column}-${row}.webp`;

const REGION_KEYS: Record<string, string> = {
  Shore: "map.regions.shore",
  Tropics: "map.regions.tropics",
  Alpine: "map.regions.alpine",
  Roots: "map.regions.roots",
  Mesa: "map.regions.mesa",
  Volcano: "map.regions.caldera",
  Caldera: "map.regions.caldera",
  Swamp: "map.regions.gloom",
  Gloom: "map.regions.gloom",
  "The Kiln": "map.regions.theKiln",
  "The Citadel": "map.regions.theCitadel",
  Temple: "map.regions.temple",
  Summit: "map.regions.summit",
  WilIsland: "map.regions.wilIsland",
  Void: "map.regions.void",
};

const BIOME_TRANSLATION_KEYS: Record<string, string> = {
  Shore: "beach",
  Tropics: "tropics",
  Roots: "roots",
  Alpine: "alpine",
  Mesa: "mesa",
  Caldera: "caldera",
  Gloom: "gloom",
  "The Kiln": "thekiln",
  "The Citadel": "thecitadel",
};

const canonicalBiomeKey = (biome: string, slot: number): string => {
  if (biome === "Volcano") return slot === 4 ? "thekiln" : "caldera";
  if (biome === "Swamp") return slot === 4 ? "thecitadel" : "gloom";
  return BIOME_TRANSLATION_KEYS[biome]
    ?? biome.toLowerCase().replace(/[^a-z0-9]+/gu, "");
};

// Older CDN catalogs contain only the four randomized biome enum values. The
// fifth segment reuses the fourth segment's internal enum, so its official name
// must be resolved by position instead of exposing Volcano/Swamp or scene names.
export const getRouteBiomeTranslationKeys = (biomes: string[]): string[] => {
  const keys = biomes.slice(0, 5).map((biome, slot) => canonicalBiomeKey(biome, slot));
  if (keys.length === 4) {
    if (keys[3] === "caldera") keys.push("thekiln");
    if (keys[3] === "gloom") keys.push("thecitadel");
  }
  return keys;
};

const LIVE_SEGMENT_ROUTE_SLOTS: Record<string, number> = {
  Beach: 0,
  Tropics: 1,
  Alpine: 2,
  Caldera: 3,
  TheKiln: 4,
};

export const getLiveBiomeTranslationKey = (biomes: string[], segment: string): string => {
  const routeSlot = LIVE_SEGMENT_ROUTE_SLOTS[segment];
  if (routeSlot !== undefined) {
    const routeKey = getRouteBiomeTranslationKeys(biomes)[routeSlot];
    if (routeKey) return routeKey;
  }
  return segment.toLowerCase().replace(/[^a-z0-9]+/gu, "");
};

export const formatMarkerName = (name: string): string => name
  .trim()
  .replace(/[_-]+/g, " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .replace(/\s+/g, " ");

let cachedCatalog: PeakCatalog | null = null;
let catalogPromise: Promise<PeakCatalog> | null = null;

const fetchCatalog = async (): Promise<PeakCatalog> => {
  const baseUrl = peakCdnBaseUrl || "./data/peak";
  let response = await fetch(`${baseUrl}/catalog-v4.json`, { cache: "no-store" });
  if (response.status === 404) response = await fetch(`${baseUrl}/catalog.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`PEAK catalog request failed: ${response.status}`);
  const catalog = (await response.json()) as PeakCatalog;
  if (![3, 4].includes(catalog.schemaVersion ?? 3) || !catalog.levels?.length
    || !Number.isInteger(catalog.rotation?.levelCount) || catalog.rotation.levelCount < catalog.levels.length) {
    throw new Error("Unsupported PEAK catalog structure");
  }
  return normalizeCatalogAssetPaths(catalog);
};

const loadCatalog = (): Promise<PeakCatalog> => {
  catalogPromise ??= fetchCatalog()
    .then((catalog) => {
      cachedCatalog = catalog;
      return catalog;
    })
    .finally(() => { catalogPromise = null; });
  return catalogPromise;
};

const positiveModulo = (value: number, modulus: number): number =>
  ((value % modulus) + modulus) % modulus;

export const resolveDailyLevel = (
  catalog: PeakCatalog,
  now: number,
  serverRotation: PeakServerRotation | null = null,
): { level: PeakDailyLevel; resetAt: number } => {
  const anchor = Date.parse(catalog.rotation.anchorUtc);
  const duration = catalog.rotation.durationHours * 60 * 60 * 1_000;
  const rotationIndex = Math.floor((now - anchor) / duration);
  const levelIndex = positiveModulo(
    serverRotation?.levelIndex ?? rotationIndex,
    catalog.rotation.levelCount,
  );
  const level = catalog.levels.find(candidate => candidate.index === levelIndex)
    // Retain the last complete captured map if publication is delayed.
    ?? (catalog.schemaVersion === 4 ? catalog.levels.at(-1) : undefined);
  if (!level) throw new Error(`Missing PEAK level ${levelIndex}`);
  return {
    level,
    resetAt: serverRotation?.resetAt ?? anchor + (rotationIndex + 1) * duration,
  };
};

const fetchServerRotation = async (gameVersion: string): Promise<PeakServerRotation> => {
  const matchmakingVersion = gameVersion.split(".").slice(0, 2).join(".");
  const response = await fetch(
    `${PEAK_ROTATION_ENDPOINT}?version=${encodeURIComponent(matchmakingVersion)}`,
  );
  if (!response.ok) throw new Error(`PEAK rotation request failed: ${response.status}`);
  const data = (await response.json()) as PeakLoginResponse;
  if (!data.VersionOkay || !Number.isInteger(data.LevelIndex)) {
    throw new Error("PEAK rotation response is invalid");
  }
  const secondsLeft =
    (data.HoursUntilLevel ?? 0) * 3600
    + (data.MinutesUntilLevel ?? 0) * 60
    + (data.SecondsUntilLevel ?? 0);
  return {
    levelIndex: data.LevelIndex as number,
    resetAt: Date.now() + Math.max(0, secondsLeft) * 1_000,
  };
};

const adaptMarker = (
  marker: PeakCatalogMarker,
  resolveName: (name: string) => string = formatMarkerName,
): MapMarker => {
  const name = resolveName(marker.content.name);
  return {
    id: marker.id,
    category: marker.category,
    name,
    regionKey: REGION_KEYS[marker.region] ?? "map.regions.unknown",
    x: marker.map.x,
    y: marker.map.y,
    elevation: marker.elevation,
    group: marker.group,
    aggregateKey: marker.aggregateKey,
    exact: marker.exact,
    biomeSlot: marker.biomeSlot,
    source: marker.source,
    sequence: marker.sequence,
    content: { ...marker.content, name },
  };
};

export interface PeakForecastEntry {
  level: PeakDailyLevel;
  startsAt: number;
}

export interface PeakMapData {
  level: PeakDailyLevel | null;
  hasFinalLevel: boolean;
  forecast: PeakForecastEntry[];
  markers: MapMarker[];
  categories: MarkerCategoryDefinition[];
  items: PeakItem[];
  lootPools: PeakLootPool[];
  achievements: PeakAchievement[];
  guidebook: PeakGuidebookPage[];
  secondsUntilReset: number | null;
  loading: boolean;
  error: boolean;
  rotationSource: "server" | "fallback";
}

export const usePeakMapData = (
  view: "daily" | "final" = "daily",
  sceneOverride: string | null = null,
): PeakMapData => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<PeakCatalog | null>(() => cachedCatalog);
  const [serverRotation, setServerRotation] = useState<PeakServerRotation | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const gameVersion = catalog?.source.gameVersion;

  useEffect(() => {
    let mounted = true;
    let refreshing = false;

    const applyCatalog = (nextCatalog: PeakCatalog): void => {
      if (!mounted) return;
      setCatalog(nextCatalog);
      setError(false);
    };

    const refreshCatalog = async (): Promise<void> => {
      if (refreshing) return;
      refreshing = true;
      try {
        applyCatalog(await loadCatalog());
      } catch {
        // A failed background refresh must never replace a working catalog.
        // The currently displayed map remains usable until the next attempt.
      } finally {
        refreshing = false;
      }
    };

    void loadCatalog()
      .then(applyCatalog)
      .catch(() => {
        if (mounted) setError(true);
      });

    const refreshTimer = window.setInterval(
      () => void refreshCatalog(),
      CATALOG_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshCatalog);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCatalog);
    };
  }, []);

  useEffect(() => {
    if (!gameVersion) return;
    let cancelled = false;
    let refreshTimer: number | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const rotation = await fetchServerRotation(gameVersion);
        if (cancelled) return;
        setServerRotation(rotation);
        refreshTimer = window.setTimeout(
          () => void refresh(),
          Math.max(30_000, rotation.resetAt - Date.now() + 2_000),
        );
      } catch {
        if (!cancelled) refreshTimer = window.setTimeout(() => void refresh(), 5 * 60_000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [gameVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const map = useMemo<Omit<PeakMapData, "markers" | "categories">>(() => {
    if (!catalog) {
      return {
        level: null,
        hasFinalLevel: false,
        forecast: [],
        items: [],
        lootPools: [],
        achievements: [],
        guidebook: [],
        secondsUntilReset: null,
        loading: !error,
        error,
        rotationSource: "fallback",
      };
    }
    const { level: dailyLevel, resetAt } = resolveDailyLevel(catalog, now, serverRotation);
    const finalScene = sceneOverride === "WilIsland" || sceneOverride?.startsWith("Level_")
      ? sceneOverride : dailyLevel.scene;
    const finalLevels = catalog.specialLevels?.filter((special) => special.kind === "final") ?? [];
    const finalLevel = finalLevels.find((special) => special.scene === finalScene)
      ?? finalLevels.find((special) => special.scene === "WilIsland") ?? null;
    const sceneLevel = sceneOverride
      ? catalog.levels
          .find((candidate) => candidate.scene === sceneOverride) ?? null
      : null;
    const level = view === "final" && finalLevel ? finalLevel : sceneLevel ?? dailyLevel;
    const rotationDuration = catalog.rotation.durationHours * 60 * 60 * 1_000;
    const currentRotationIndex = serverRotation?.levelIndex
      ?? Math.floor((now - Date.parse(catalog.rotation.anchorUtc)) / rotationDuration);
    const forecast = Array.from({ length: catalog.schemaVersion === 4 ? 6 : catalog.rotation.levelCount }, (_, offset) => {
      const index = positiveModulo(currentRotationIndex + 1 + offset, catalog.rotation.levelCount);
      const nextLevel = catalog.levels.find(candidate => candidate.index === index);
      return nextLevel ? [{ level: nextLevel, startsAt: resetAt + offset * rotationDuration }] : [];
    }).flat();
    return {
      level,
      hasFinalLevel: finalLevel !== null,
      forecast,
      items: catalog.items,
      lootPools: catalog.lootPools,
      achievements: catalog.achievements ?? [],
      guidebook: catalog.guidebook ?? [],
      secondsUntilReset: Math.max(0, Math.floor((resetAt - now) / 1_000)),
      loading: false,
      error: false,
      rotationSource: serverRotation ? "server" : "fallback",
    };
  }, [catalog, error, now, sceneOverride, serverRotation, view]);

  const { level } = map;
  const markerIcons = catalog?.markerIcons;
  // The rotation countdown ticks every second. Marker identities change only
  // when the island, its catalog or its translated labels actually change.
  const markerData = useMemo(() => ({
    markers: level?.markers.map((marker) => adaptMarker(
      marker,
      (rawName) => t(`map.markerNames.${rawName}`, { defaultValue: formatMarkerName(rawName) }),
    )) ?? [],
    categories: CATEGORY_BASE.map((category) => ({
      ...category,
      available: level?.markerCounts[category.id] ?? 0,
      iconSource: markerIcons?.[category.id] ?? null,
    })),
  }), [level, markerIcons, t]);

  return { ...map, ...markerData };
};

export const getMarkerRadius = (marker: MapMarker): number | null => {
  if (!marker.content.facts) return null;
  const radiusFact = marker.content.facts.find(
    (f) =>
      f.key === "moraleBoostRadius" ||
      f.key === "escapeRadiusForAchievement" ||
      f.key === "range" ||
      f.key === "maxDistance" ||
      f.key === "aggroDistance" ||
      f.key === "serenadeDistance"
  );
  return radiusFact ? Number(radiusFact.value) : null;
};
