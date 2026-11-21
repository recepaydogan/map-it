import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import { loadEntityArtwork } from "../../lib/entity-artwork";
import { migrateMapMarkerAliases } from "./map-marker-aliases";
import { notifySavedDataChange } from "../../services/saved-data/saved-data-events";
import { getSourceCategory } from "./map-config";
import { GAME_CONFIG } from "../../game-config";
import i18n from "../../i18n";
import { useAppLanguage } from "../../i18n/app-language";
import { getGameText, loadGameText } from "../../i18n/game-text";
import { attachMapCompanions, type MapCompanionCatalog } from "./map-companion-sources";
import { loadCachedMapJson } from "./map-data-cache";
import { hasMapDefinition, REMOVED_MAP_CATEGORY_IDS, type DungeonFloorDefinition, type MapDefinition, type SelectedMapDefinition } from "./map-registry";
import { dungeonDisplayName, dungeonFloorId, dungeonFloorLabel, dungeonNavigation } from "./dungeon-maps";
import { dungeonCreatureName } from "../reference/dungeon-journal";
import type { MapLocation, MapMetadata, MapRegion, MapTerrainLayer } from "./types";

interface MapDataState {
  data: MapMetadata | null;
  loading: boolean;
  error: string | null;
  mapId: string | null;
  language: string;
}

const DEFAULT_TILE_PATTERN = "tiles/{level}/tile{x}x{y}.webp";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBounds = (value: unknown): value is MapMetadata["bounds"] => isRecord(value)
  && isFiniteNumber(value.minX) && isFiniteNumber(value.minY)
  && isFiniteNumber(value.maxX) && isFiniteNumber(value.maxY)
  && value.maxX > value.minX && value.maxY > value.minY;

const isRegion = (value: unknown): value is MapRegion => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y)
  && (value.focusBounds === undefined || isBounds(value.focusBounds));

const isLocation = (value: unknown): value is MapLocation => isRecord(value)
  && typeof value.id === "string"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y);

const parseAdditionalLocations = (
  raw: unknown,
  metadata: MapMetadata,
  existingIds: Set<string>,
): MapLocation[] => {
  if (!isRecord(raw) || !Array.isArray(raw.locations)) {
    throw new Error("Additional map data needs a locations array.");
  }
  return raw.locations.map((location: unknown): MapLocation => {
    const inset = isRecord(location) && typeof location.regionId === "string"
      ? metadata.insets?.find((candidate) => candidate.id === location.regionId)
      : undefined;
    const bounds = inset?.bounds ?? metadata.bounds;
    if (!isLocation(location)
      || existingIds.has(location.id)
      || location.x < bounds.minX || location.x > bounds.maxX
      || location.y < bounds.minY || location.y > bounds.maxY) {
      throw new Error(`Invalid or duplicate additional location in ${metadata.id}.`);
    }
    existingIds.add(location.id);
    return {
      ...location,
      name: typeof location.nameKey === "string" ? i18n.t(location.nameKey) : location.name,
      label: typeof location.labelKey === "string"
        ? i18n.t(location.labelKey)
        : typeof location.label === "string" ? location.label : "",
      subtype: typeof location.subtype === "string" ? location.subtype : location.category,
      regionId: typeof location.regionId === "string" ? location.regionId : "",
      region: typeof location.regionKey === "string" ? i18n.t(location.regionKey) : typeof location.region === "string" ? location.region : "",
      detailLabel: typeof location.detailLabelKey === "string"
        ? i18n.t(location.detailLabelKey)
        : typeof location.detailLabel === "string" ? location.detailLabel : undefined,
      trainerTitle: typeof location.trainerTitleKey === "string"
        ? i18n.t(location.trainerTitleKey)
        : typeof location.trainerTitle === "string" ? location.trainerTitle : undefined,
      trainerClass: typeof location.trainerClassKey === "string"
        ? i18n.t(location.trainerClassKey)
        : typeof location.trainerClass === "string" ? location.trainerClass : undefined,
      description: typeof location.descriptionKey === "string"
        ? i18n.t(location.descriptionKey)
        : typeof location.description === "string" ? location.description : undefined,
    };
  });
};

/**
 * Validates a fetched `metadata.json` and fills in the runtime fields. Loose
 * on purpose about optional text (label, subtype, region) so a minimal file
 * with just names and coordinates still renders.
 */
const parseMapMetadata = (raw: unknown, definition: MapDefinition): MapMetadata => {
  if (!isRecord(raw)) throw new Error("metadata.json is not an object.");
  const bounds = raw.bounds;
  if (!isRecord(bounds)
    || !isFiniteNumber(bounds.minX) || !isFiniteNumber(bounds.minY)
    || !isFiniteNumber(bounds.maxX) || !isFiniteNumber(bounds.maxY)
    || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new Error("metadata.json needs bounds { minX, minY, maxX, maxY }.");
  }
  if (!isFiniteNumber(raw.tileSize) || raw.tileSize <= 0) {
    throw new Error("metadata.json needs a positive tileSize.");
  }
  const detailLevels = Array.isArray(raw.detailLevels)
    ? raw.detailLevels.filter(isFiniteNumber)
    : [];
  if (detailLevels.length === 0) throw new Error("metadata.json needs detailLevels.");
  let tileCoverage: Set<string>[] | undefined;
  if (raw.tileCoverage !== undefined) {
    if (!Array.isArray(raw.tileCoverage) || raw.tileCoverage.length !== detailLevels.length
      || raw.tileCoverage.some((level) => !Array.isArray(level)
        || level.some((coordinate) => typeof coordinate !== "string" || !/^\d+,\d+$/.test(coordinate)))) {
      throw new Error("metadata.json has invalid tileCoverage.");
    }
    tileCoverage = raw.tileCoverage.map((level: string[]) => new Set(level));
  }
  const terrainLayers: MapTerrainLayer[] = Array.isArray(raw.terrainLayers)
    ? raw.terrainLayers.map((layer: unknown): MapTerrainLayer => {
      if (!isRecord(layer) || typeof layer.id !== "string" || typeof layer.basePath !== "string"
        || typeof layer.tilePattern !== "string" || !isBounds(layer.sourceBounds)
        || !isFiniteNumber(layer.tileSize) || layer.tileSize <= 0
        || !isFiniteNumber(layer.originX) || !isFiniteNumber(layer.originY)
        || !isFiniteNumber(layer.scaleX) || layer.scaleX <= 0
        || !isFiniteNumber(layer.scaleY) || layer.scaleY <= 0
        || !Array.isArray(layer.detailLevels) || !layer.detailLevels.length
        || layer.detailLevels.some((level) => !isFiniteNumber(level))
        || !Array.isArray(layer.tileCoverage)
        || layer.tileCoverage.length !== layer.detailLevels.length
        || layer.tileCoverage.some((level) => !Array.isArray(level)
          || level.some((coordinate) => typeof coordinate !== "string" || !/^\d+,\d+$/.test(coordinate)))) {
        throw new Error("metadata.json has an invalid terrain layer.");
      }
      return {
        id: layer.id,
        labelKey: typeof layer.labelKey === "string" ? layer.labelKey : undefined,
        basePath: new URL(`${layer.basePath}/`, new URL(`${definition.dataUrl}/`, window.location.href)).href.replace(/\/$/, ""),
        tilePattern: layer.tilePattern,
        tileSize: layer.tileSize,
        detailLevels: layer.detailLevels as number[],
        tileCoverage: (layer.tileCoverage as string[][]).map((level) => new Set(level)),
        sourceBounds: layer.sourceBounds,
        originX: layer.originX,
        originY: layer.originY,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
      };
    })
    : [];

  const regions = Array.isArray(raw.regions) ? raw.regions.filter(isRegion) : [];
  const insets = Array.isArray(raw.insets) ? raw.insets : [];
  for (const inset of insets) {
    if (!isRecord(inset) || typeof inset.id !== "string" || typeof inset.name !== "string"
      || typeof inset.nameKey !== "string" || typeof inset.image !== "string" || !isFiniteNumber(inset.worldMapId)
      || !isBounds(inset.bounds)) {
      throw new Error("Invalid inset map.");
    }
  }
  const navigationBounds = raw.navigationBounds;
  if (navigationBounds !== undefined && (!isBounds(navigationBounds)
    || navigationBounds.minX > bounds.minX || navigationBounds.minY > bounds.minY
    || navigationBounds.maxX < bounds.maxX || navigationBounds.maxY < bounds.maxY)) {
    throw new Error("Invalid map navigation bounds.");
  }
  const initialBounds = raw.initialBounds;
  if (initialBounds !== undefined && (!isBounds(initialBounds)
    || initialBounds.minX < bounds.minX || initialBounds.minY < bounds.minY
    || initialBounds.maxX > bounds.maxX || initialBounds.maxY > bounds.maxY)) {
    throw new Error("Invalid initial map bounds.");
  }
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  const locations = (Array.isArray(raw.locations) ? raw.locations.filter(isLocation).filter((location) => !location.hiddenFromMap) : [])
    .map((location): MapLocation => ({
      ...location,
      label: typeof location.label === "string" ? location.label : "",
      subtype: typeof location.subtype === "string" ? location.subtype : location.category,
      regionId: typeof location.regionId === "string" ? location.regionId : "",
      region: typeof location.region === "string"
        ? location.region
        : regionNames.get(String(location.regionId)) ?? "",
      ...(isRecord(location.referenceCoordinates)
        && isFiniteNumber(location.referenceCoordinates.x)
        && isFiniteNumber(location.referenceCoordinates.y)
        ? { referenceCoordinates: {
          x: location.referenceCoordinates.x,
          y: location.referenceCoordinates.y,
        } }
        : {}),
    }));

  return {
    id: definition.id,
    displayName: typeof raw.displayName === "string" && raw.displayName ? raw.displayName
      : definition.nameKey ? i18n.t(definition.nameKey) : definition.name,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    schemaVersion: isFiniteNumber(raw.schemaVersion) ? raw.schemaVersion : 1,
    ...(typeof raw.generatedAt === "string" ? { generatedAt: raw.generatedAt } : {}),
    ...(typeof raw.attribution === "string" ? { attribution: raw.attribution } : {}),
    bounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
    tileSize: raw.tileSize,
    insets: insets as MapMetadata["insets"],
    navigationBounds: navigationBounds as MapMetadata["navigationBounds"],
    initialBounds: initialBounds as MapMetadata["initialBounds"],
    hideBaseTiles: raw.hideBaseTiles === true,
    detailLevels,
    tileCoverage,
    terrainLayers,
    backgroundColor: typeof raw.backgroundColor === "string" ? raw.backgroundColor : undefined,
    regions,
    locations,
    tileSource: {
      basePath: definition.dataUrl,
      tilePattern: typeof raw.tilePattern === "string" && raw.tilePattern
        ? raw.tilePattern
        : DEFAULT_TILE_PATTERN,
    },
  };
};

const createDungeonFloorData = (definition: DungeonFloorDefinition, language: string): MapMetadata => {
  const floor = definition.dungeon.floors[definition.floorIndex]!;
  const gameText = (name: string, key?: string) => getGameText(language, name, key);
  const displayName = dungeonDisplayName(definition.name, gameText);
  const bossLabel = i18n.t("reference.labels.boss", { lng: language });
  const bossNames = [...new Set(definition.dungeon.floors.flatMap((layer) => layer.bosses?.map((boss) => boss.name) ?? []))];
  const navigation = dungeonNavigation[floor.image];
  const project = (x: number, y: number) => ({ x: x * floor.width / 100, y: y * floor.height / 100 });
  const translate = i18n.getFixedT(language);
  const doorLocations: MapLocation[] = (navigation?.doors ?? []).map((door) => {
    const labelKey = `dungeonJournal.mapDoors.${door.kind}`;
    const label = translate(labelKey);
    const target = door.to;
    const targetFloor = target && definition.dungeon.floors[target.floor];
    const targetMapId = target && dungeonFloorId(definition.dungeon.id, target.floor);
    const markerId = target && `${targetMapId}:door:${target.door}`;
    const targetName = target && targetFloor
      ? dungeonFloorLabel(targetFloor, target.floor, translate, gameText) : undefined;
    return {
      id: `${definition.id}:door:${door.id}`,
      name: targetName ? translate("dungeonJournal.mapPassageTo", { floor: targetName }) : label,
      label,
      labelKey,
      category: "dungeon-door",
      subtype: door.kind,
      region: displayName,
      regionId: definition.id,
      ...project(door.x, door.y),
      ...(target && targetMapId && markerId && targetName ? {
        dungeonPassage: { floor: target.floor, markerId },
        linkedMarkersTitleKey: "dungeonJournal.mapPassage",
        linkedMarkers: [{ mapId: targetMapId, markerId, nameKey: targetName }],
      } : {}),
    };
  });
  return {
    id: definition.id,
    displayName,
    schemaVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: floor.width, maxY: floor.height },
    attribution: floor.artist,
    imageLayer: contentUrl(floor.image),
    dungeonRoutes: navigation?.routes?.map(({ points, optional }) => ({
      points: points.map(([x, y]) => project(x, y)), optional,
    })),
    hideBaseTiles: true,
    tileSize: 0,
    detailLevels: [],
    tileSource: { basePath: "", tilePattern: "" },
    regions: [],
    locations: [...(floor.bosses ?? []).map((boss, index) => ({
      id: `${definition.id}:boss:${index + 1}`,
      name: dungeonCreatureName(boss.name, translate, gameText, boss.npcId),
      sourceName: boss.name,
      dungeonBoss: { dungeonId: definition.dungeon.id, index: bossNames.indexOf(boss.name) },
      category: "boss",
      subtype: "dungeon-boss",
      label: bossLabel,
      region: displayName,
      regionId: definition.id,
      ...project(boss.x, boss.y),
    })), ...doorLocations],
  };
};

/** Loads a catalog floor or the published metadata for the selected map. */
export const useMapData = (definition: SelectedMapDefinition): MapDataState => {
  const language = useAppLanguage();
  const [state, setState] = useState<MapDataState>({
    data: null,
    loading: true,
    error: null,
    mapId: null,
    language,
  });

  useEffect(() => {
    let cancelled = false;
    if ("dungeon" in definition) {
      void loadGameText(language).catch((error: unknown) => {
        console.error(`Game text for "${language}" could not be loaded.`, error);
      }).then(() => {
        if (!cancelled) setState({ data: createDungeonFloorData(definition, language),
          loading: false, error: null, mapId: definition.id, language });
      });
      return () => { cancelled = true; };
    }
    void Promise.all([
      loadEntityArtwork(),
      GAME_CONFIG.mapCompanionSourcesPath
        ? loadCachedMapJson<MapCompanionCatalog>(contentUrl(`${GAME_CONFIG.mapCompanionSourcesPath}`))
        : Promise.resolve<MapCompanionCatalog>({ version: 1, sources: {} }),
      loadCachedMapJson<unknown>(`${definition.dataUrl}/metadata.json`),
      loadGameText(language).catch((error: unknown) => {
        console.error(`Game text for "${language}" could not be loaded.`, error);
      }),
      ...(definition.locationFiles ?? []).map((file) =>
        loadCachedMapJson<unknown>(`${definition.dataUrl}/${file}`).catch((error: unknown) => {
          // Older CDN releases do not yet contain this optional layer.
          if (file === "locations-forever-hunter-pets.json" && error instanceof Error
            && error.message === "Map data request failed with status 404.") return { locations: [] };
          throw error;
        })),
    ])
      .then(([artwork, companions, raw, , ...additionalData]) => {
        if (cancelled) return;
        if (companions.version !== 1 || !isRecord(companions.sources)) throw new Error("Invalid map companion catalog.");
        const parsed = parseMapMetadata(raw, definition);
        const ids = new Set(parsed.locations.map(({ id }) => id));
        const locations = additionalData.flatMap((layer) => parseAdditionalLocations(layer, parsed, ids));
        const referenceLayer = additionalData.find((layer) => isRecord(layer) && isRecord(layer.locationFields));
        const locationFields = isRecord(referenceLayer) && isRecord(referenceLayer.locationFields)
          ? referenceLayer.locationFields : {};
        const allCandidates = [...parsed.locations, ...locations].map((point) => {
          const fields = locationFields[point.id];
          if (!isRecord(fields)) return point;
          return {
            ...point,
            name: typeof fields.name === "string" ? fields.name : point.name,
            label: typeof fields.label === "string" ? fields.label : point.label,
            description: typeof fields.descriptionKey === "string" ? i18n.t(fields.descriptionKey) : point.description,
            iconPath: typeof fields.iconPath === "string" ? fields.iconPath : point.iconPath,
            lookupNames: Array.isArray(fields.lookupNames)
              ? fields.lookupNames.filter((name): name is string => typeof name === "string") : point.lookupNames,
            locationContext: typeof fields.locationContext === "string" ? fields.locationContext
              : fields.locationContext === null ? undefined : point.locationContext,
            filterCategoryId: typeof fields.filterCategoryId === "string" ? fields.filterCategoryId : point.filterCategoryId,
            relatedMapId: typeof fields.relatedMapId === "string" && hasMapDefinition(fields.relatedMapId)
              ? fields.relatedMapId : point.relatedMapId,
          };
        });
        const aliases = new Set(allCandidates.flatMap((point) => point.aliasIds ?? []));
        const questGiverLayer = additionalData.find((layer) => isRecord(layer) && isRecord(layer.augmentations));
        const questGiverLinks = isRecord(questGiverLayer) && isRecord(questGiverLayer.augmentations)
          ? questGiverLayer.augmentations : {};
        const allLocations = allCandidates.filter((point) => !aliases.has(point.id)).map((point) => {
          const groups = questGiverLinks[point.id];
          if (!Array.isArray(groups)) return point;
          return { ...point, linkedMarkerGroups: [...(point.linkedMarkerGroups ?? []),
            ...groups.filter((group): group is NonNullable<MapLocation["linkedMarkerGroups"]>[number] =>
              isRecord(group) && typeof group.titleKey === "string" && Array.isArray(group.links))] };
        });
        const removedIds = new Set(allLocations
          .filter((point) => REMOVED_MAP_CATEGORY_IDS.has(point.category)).map((point) => point.id));
        const publishedLocations = allLocations
          .filter((point) => !removedIds.has(point.id))
          .map((point) => ({
            ...point,
            ...(point.linkedMarkers ? { linkedMarkers: point.linkedMarkers.filter((link) =>
              link.mapId !== definition.id || !removedIds.has(link.markerId)) } : {}),
            ...(point.linkedMarkerGroups ? { linkedMarkerGroups: point.linkedMarkerGroups
              .map((group) => ({ ...group, links: group.links.filter((link) =>
                link.mapId !== definition.id || !removedIds.has(link.markerId)) }))
              .filter((group) => group.links.length > 0) } : {}),
          }));
        const questGiversById = new Map(publishedLocations.map((point) => [point.id, point]));
        if (migrateMapMarkerAliases(publishedLocations, localStorage)) {
          window.dispatchEvent(new Event("gm:saved-state-changed"));
          notifySavedDataChange();
        }
        setState({
          data: {
            ...parsed,
            locations: attachMapCompanions(publishedLocations, companions).map((location) => {
              const sourceCategory = getSourceCategory(location.reference?.id, location.category);
              const nameKey = location.questId ? `Quest:${location.questId}:0`
                : location.itemId ? `ItemSparse:${location.itemId}:4`
                : location.entityId ? `Creature:${location.entityId}:0` : undefined;
              const localizedName = getGameText(language, location.name, nameKey);
              const questGiver = location.questGiverMarkerId
                ? questGiversById.get(location.questGiverMarkerId) : undefined;
              const localizedQuestGiverName = location.questGiverName && questGiver?.entityId &&
                questGiver.name === location.questGiverName
                ? getGameText(language, location.questGiverName, `Creature:${questGiver.entityId}:0`)
                : location.questGiverName;
              const iconPath = (location.category.startsWith("gatherable") ? location.iconPath : undefined)
                ?? sourceCategory?.nativeIconPath?.replace(/^\//, "")
                ?? (location.itemId ? artwork.items[location.itemId] : undefined)
                ?? (location.reference ? artwork.icons[location.reference.id] : undefined)
                ?? location.iconPath;
              return { ...location, name: localizedName,
                ...(localizedName !== location.name ? { sourceName: location.name } : {}),
                ...(localizedQuestGiverName ? { questGiverName: localizedQuestGiverName } : {}),
                region: getGameText(language, location.region),
                ...(sourceCategory ? { category: sourceCategory.id } : {}), ...(iconPath ? { iconPath } : {}) };
            }),
          },
          loading: false,
          error: null,
          mapId: definition.id,
          language,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(`Map data for "${definition.id}" could not be loaded.`, error);
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Map data could not be loaded.",
          mapId: definition.id,
          language,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [definition, language]);

  // A switch to another map shows its loading state, never the previous map
  // with the new map's name on it.
  if (state.mapId !== definition.id || state.language !== language) {
    return { data: null, loading: true, error: null, mapId: definition.id, language };
  }
  return state;
};
