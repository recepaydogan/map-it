import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  listInstalledCommunityMaps,
  removeCommunityMap,
} from "./community-map-database";
import type { MapLibraryEntry } from "./community-map-types";
import { BUILTIN_MAP_ENTRY, BUILTIN_MAP_ID } from "./map-library-config";
import { loadPreparedMapModCatalog } from "./prepared-map-mod-catalog";
import {
  createPreparedMapModPackages,
  togglePreparedMapModPackage,
} from "./prepared-map-mod-packages";
import type { PreparedMapMod } from "./prepared-map-mod-types";
import { scanDefaultActiveMods, type ActiveMapModScan } from "./active-map-mods";
import { resolveActiveMapModSource } from "./active-map-mod-source";
import { readLiveGameSession } from "../live-bridge/live-game-session-store";
import type { LiveGameSession } from "../live-bridge/live-game-session-types";
import { readConfiguredZomboidRoot } from "../live-bridge/live-bridge-paths";
import { locateZomboidRoot } from "../live-bridge/locate-zomboid-root";

const SELECTED_MAP_STORAGE_KEY = "pzim:selected-map";
const LIBRARY_REVISION_STORAGE_KEY = "pzim:map-library-revision";
const LIBRARY_CHANGE_EVENT = "pzim:map-library-changed";
const ACTIVE_MOD_SCAN_INTERVAL_MS = 1_500;
const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

const detectionSignature = (
  modIds: string[],
  mapFolders: string[],
  fromLiveSession: boolean,
) => JSON.stringify([
  fromLiveSession,
  modIds.map(normalize),
  mapFolders.map(normalize),
]);

const normalizePathForComparison = (value: string) => normalize(
  value.replace(/\\/g, "/").replace(/\/+$/, ""),
);

type DetectionTrigger = "startup" | "library_refresh" | "poll" | "focus" | "after_folder_selection";

const getDetectionSource = (
  defaultScan: ActiveMapModScan,
  fromLiveSession: boolean,
  configuredRoot: string | null,
) => {
  if (fromLiveSession) return "bridge_heartbeat";
  const rootIsUserSelected = Boolean(defaultScan.rootPath && configuredRoot
    && normalizePathForComparison(defaultScan.rootPath) === normalizePathForComparison(configuredRoot));
  if (defaultScan.sourcePath) {
    return rootIsUserSelected ? "selected_folder_default_txt" : "standard_folder_default_txt";
  }
  if (defaultScan.rootPath) {
    return rootIsUserSelected ? "selected_folder_only" : "standard_folder_only";
  }
  return "not_found";
};

const toPreparedEntry = (
  packageKey: string,
  packageDisplayName: string,
  mods: PreparedMapMod[],
): MapLibraryEntry => {
  const overlays = mods.flatMap(({ overlays: modOverlays }) => modOverlays);
  const includesBuiltinMap = mods.every(({ kind }) => kind === "add-on");
  const renderOverlays = [...overlays].reverse();
  const builds = [...new Set(mods.flatMap(({ builds: modBuilds }) => modBuilds))];
  return {
    key: packageKey,
    displayName: packageDisplayName,
    description: mods.flatMap((mod) => [
      mod.displayName,
      mod.modId,
      ...mod.overlays.map(({ mapFolder }) => mapFolder),
    ]).join(", "),
    creator: "",
    gameBuild: builds.join("/"),
    kind: "mod",
    modId: mods.length === 1 ? mods[0].modId : undefined,
    workshopId: mods[0].workshopId,
    modMapKind: includesBuiltinMap ? "add-on" : "replacement",
    modDataUrl: mods.length === 1 ? mods[0].dataUrl : undefined,
    modCells: overlays.flatMap(({ cells }) => cells),
    modCellSize: overlays[0]?.source.mapInfo.cell_size,
    includesBuiltinMap,
    isometricBaseSource: includesBuiltinMap ? undefined : renderOverlays[0]?.source,
    isometricOverlays: (includesBuiltinMap ? renderOverlays : renderOverlays.slice(1))
      .map(({ source }) => source),
    preparedMods: mods,
  };
};

const createCurrentWorldEntry = (
  mods: PreparedMapMod[],
  mapFolders: string[],
): MapLibraryEntry | null => {
  if (mods.length === 0) return null;
  const folderPriority = new Map(mapFolders.map((folder, index) => [normalize(folder), index]));
  const priorityOf = (mod: PreparedMapMod) => Math.min(...mod.overlays.map(({ mapFolder }) =>
    folderPriority.get(normalize(mapFolder)) ?? Number.MAX_SAFE_INTEGER));
  const orderedMods = [...mods].sort((left, right) => priorityOf(left) - priorityOf(right));
  const orderedOverlayEntries = orderedMods
    .flatMap((mod) => mod.overlays.map((overlay) => ({ mod, overlay })))
    .sort((left, right) =>
      (folderPriority.get(normalize(left.overlay.mapFolder)) ?? Number.MAX_SAFE_INTEGER)
      - (folderPriority.get(normalize(right.overlay.mapFolder)) ?? Number.MAX_SAFE_INTEGER));
  const orderedOverlays = orderedOverlayEntries.map(({ overlay }) => overlay);
  const builds = [...new Set(orderedMods.flatMap(({ builds: modBuilds }) => modBuilds))];
  const includesBuiltinMap = mapFolders.length === 0
    ? orderedMods.every(({ kind }) => kind === "add-on")
    : mapFolders.some((folder) => normalize(folder) === "muldraugh, ky");
  const renderOverlays = [...orderedOverlays].reverse();
  return {
    key: `world:${orderedMods.map(({ key }) => key).join("+")}`,
    displayName: orderedMods.map(({ displayName }) => displayName).join(" + "),
    description: orderedOverlays.map(({ mapFolder }) => mapFolder).join(", "),
    creator: "",
    gameBuild: builds.join("/"),
    kind: "mod",
    modMapKind: includesBuiltinMap ? "add-on" : "replacement",
    modCells: orderedOverlays.flatMap(({ cells }) => cells),
    modCellSize: orderedOverlays[0]?.source.mapInfo.cell_size,
    includesBuiltinMap,
    currentGameWorld: true,
    isometricBaseSource: includesBuiltinMap ? undefined : renderOverlays[0]?.source,
    // OpenSeadragon paints later layers on top. Project Zomboid does the
    // opposite in Map Order, so render the highest-priority map last.
    isometricOverlays: (includesBuiltinMap ? renderOverlays : renderOverlays.slice(1))
      .map(({ source }) => source),
    preparedMods: orderedMods,
    preparedMapOrder: orderedOverlayEntries.map(({ mod, overlay }) => ({
      modKey: mod.key,
      cells: overlay.cells,
    })),
  };
};

/** Why the rendered world changed — "detected" is the app following the
 *  player's mod list, the rest are the app's own doing. */
type MapSwitchSource = "initial" | "detected" | "manual" | "map_removed";

/** Coarse kind of a library key, so the event says what KIND of world is on
 *  screen without shipping the raw key as the only clue. */
const mapKindOf = (key: string): string => {
  if (key.startsWith("world:")) return "detected_world";
  if (key.startsWith("mod:")) return "prepared_mod";
  if (key === BUILTIN_MAP_ID) return "builtin";
  return "community";
};

const notifyLibraryChange = () => {
  localStorage.setItem(LIBRARY_REVISION_STORAGE_KEY, String(Date.now()));
  window.dispatchEvent(new Event(LIBRARY_CHANGE_EVENT));
};

export const useMapLibrary = () => {
  const initialWorldSelectedRef = useRef(false);
  const catalogGeneratedAtRef = useRef<string | null>(null);
  const detectedSignatureRef = useRef("");
  const detectionAnalyticsSignatureRef = useRef("");
  const [preparedMods, setPreparedMods] = useState<PreparedMapMod[]>([]);
  const [communityEntries, setCommunityEntries] = useState<MapLibraryEntry[]>([]);
  const [detectedActiveModIds, setDetectedActiveModIds] = useState<string[]>([]);
  const [detectedMapFolders, setDetectedMapFolders] = useState<string[]>([]);
  const [detectedFromLiveSession, setDetectedFromLiveSession] = useState(false);
  const [manualActiveModKeys, setManualActiveModKeys] = useState<string[] | null>(null);
  const [selectedKey, setSelectedKey] = useState(() => localStorage.getItem(SELECTED_MAP_STORAGE_KEY) ?? BUILTIN_MAP_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zomboidRootMissing, setZomboidRootMissing] = useState(false);
  const [zomboidRootSelectionInvalid, setZomboidRootSelectionInvalid] = useState(false);

  const trackDetectionResult = useCallback((
    defaultScan: ActiveMapModScan,
    liveSession: LiveGameSession | null,
    fromLiveSession: boolean,
    trigger: DetectionTrigger,
  ) => {
    const configuredRoot = readConfiguredZomboidRoot();
    const rootIsUserSelected = Boolean(defaultScan.rootPath && configuredRoot
      && normalizePathForComparison(defaultScan.rootPath) === normalizePathForComparison(configuredRoot));
    const modIds = fromLiveSession ? liveSession?.modIds ?? [] : defaultScan.modIds;
    const mapFolders = fromLiveSession ? liveSession?.mapFolders ?? [] : [];
    const source = getDetectionSource(defaultScan, fromLiveSession, configuredRoot);
    const success = fromLiveSession || Boolean(defaultScan.sourcePath);
    const signature = JSON.stringify({
      source,
      success,
      modIds: modIds.map(normalize),
      mapFolders: mapFolders.map(normalize),
      folderFound: Boolean(defaultScan.rootPath),
      modStateFileFound: Boolean(defaultScan.sourcePath),
      rootIsUserSelected,
    });
    const force = trigger === "after_folder_selection";
    if (!force && signature === detectionAnalyticsSignatureRef.current) return;
    detectionAnalyticsSignatureRef.current = signature;
    track(EVENTS.MAP_MOD_DETECTION_RESULT, {
      success,
      source,
      trigger,
      active_mod_count: modIds.length,
      map_folder_count: mapFolders.length,
      folder_found: fromLiveSession || Boolean(defaultScan.rootPath),
      mod_state_file_found: Boolean(defaultScan.sourcePath),
      root_is_user_selected: rootIsUserSelected,
      configured_folder_saved: Boolean(configuredRoot),
      after_folder_selection: force,
    });
  }, []);

  const selectedKeyRef = useRef(selectedKey);
  const selectMap = useCallback((key: string, source: MapSwitchSource = "manual") => {
    if (key !== selectedKeyRef.current) {
      track(EVENTS.MAP_SWITCHED, { source, map_kind: mapKindOf(key), map_key: key });
    }
    selectedKeyRef.current = key;
    setSelectedKey(key);
    localStorage.setItem(SELECTED_MAP_STORAGE_KEY, key);
  }, []);

  const resolveCurrentWorld = useCallback((
    catalogMods: PreparedMapMod[],
    activeModIds: string[],
    manualKeys: string[] | null,
    mapFolders: string[],
  ) => {
    const detectedSet = new Set(activeModIds.map(normalize));
    const activeKeys = manualKeys
      ? new Set(manualKeys)
      : new Set(catalogMods.filter(({ modId }) => detectedSet.has(normalize(modId))).map(({ key }) => key));
    const activeMods = catalogMods.filter(({ key }) => activeKeys.has(key));
    if (manualKeys) {
      // Toggling a supported mod in the library changes membership, not the
      // player's Map Order. Keep the detected folder order authoritative; a
      // manually enabled map that is absent from it naturally follows the
      // detected entries instead of reshuffling the player's world.
      return createCurrentWorldEntry(
        activeMods.filter(({ kind }) => kind === "add-on"),
        mapFolders,
      );
    }

    const sessionFolderSet = new Set(mapFolders.map(normalize));
    const currentWorldMods = mapFolders.length > 0
      ? activeMods.filter(({ overlays }) => overlays.some(({ mapFolder }) =>
        sessionFolderSet.has(normalize(mapFolder))))
      : activeMods.filter(({ kind }) => kind === "add-on");
    return createCurrentWorldEntry(currentWorldMods, mapFolders);
  }, []);

  const refresh = useCallback(async (trigger: DetectionTrigger = "library_refresh") => {
    try {
      const installedPromise = listInstalledCommunityMaps();
      const preparedCatalogPromise = loadPreparedMapModCatalog();
      const defaultScan = await scanDefaultActiveMods();
      const liveSession = readLiveGameSession();
      // A game exit must not replace the map the player was just using with
      // every mod listed in default.txt. The bridge snapshot is the last known
      // actual save-world configuration and remains authoritative until the
      // next game session publishes a newer one.
      const activeSource = resolveActiveMapModSource(defaultScan, liveSession);
      trackDetectionResult(defaultScan, liveSession, activeSource.fromLiveSession, trigger);
      const [installed, preparedCatalog] = await Promise.all([
        installedPromise,
        preparedCatalogPromise,
      ]);
      const nextCommunityEntries: MapLibraryEntry[] = installed
        .map((record) => ({
          key: record.key,
          displayName: record.manifest.displayName,
          description: record.manifest.description,
          creator: record.manifest.creator.name,
          gameBuild: record.manifest.supportedGameBuilds.join("/"),
          kind: "community" as const,
          metadata: record.metadata,
          license: record.manifest.rights.license,
          licenseUrl: record.manifest.rights.licenseUrl,
          sourceUrl: record.manifest.creator.sourceUrl,
          attribution: record.manifest.rights.attribution,
          permissionStatus: record.manifest.rights.permissionStatus,
          installedAt: record.installedAt,
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      const nextPreparedMods = (preparedCatalog?.mods ?? [])
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      catalogGeneratedAtRef.current = preparedCatalog?.generatedAt ?? null;
      const { modIds: activeModIds, mapFolders } = activeSource;
      detectedSignatureRef.current = detectionSignature(
        activeModIds,
        mapFolders,
        activeSource.fromLiveSession,
      );
      setPreparedMods(nextPreparedMods);
      setCommunityEntries(nextCommunityEntries);
      setDetectedActiveModIds(activeModIds);
      setDetectedMapFolders(mapFolders);
      setDetectedFromLiveSession(activeSource.fromLiveSession);
      setZomboidRootMissing(!activeSource.fromLiveSession && !defaultScan.rootPath);
      setManualActiveModKeys(null);
      if (!initialWorldSelectedRef.current) {
        initialWorldSelectedRef.current = true;
        const currentWorld = resolveCurrentWorld(nextPreparedMods, activeModIds, null, mapFolders);
        const initialKey = currentWorld?.key ?? BUILTIN_MAP_ID;
        selectMap(initialKey, "initial");
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Map library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [resolveCurrentWorld, selectMap, trackDetectionResult]);

  const refreshPreparedCatalog = useCallback(async () => {
    try {
      const catalog = await loadPreparedMapModCatalog();
      if (!catalog || catalog.generatedAt === catalogGeneratedAtRef.current) return;
      catalogGeneratedAtRef.current = catalog.generatedAt;
      setPreparedMods(catalog.mods.sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Map library could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh("startup"), 0);
    const onLibraryChange = () => void refresh("library_refresh");
    const onStorage = (event: StorageEvent) => {
      if (event.key === SELECTED_MAP_STORAGE_KEY && event.newValue) setSelectedKey(event.newValue);
      if (event.key === LIBRARY_REVISION_STORAGE_KEY) void refresh("library_refresh");
    };
    window.addEventListener(LIBRARY_CHANGE_EVENT, onLibraryChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener(LIBRARY_CHANGE_EVENT, onLibraryChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    // A freshly recreated overlay mounts before its prepared-mod catalog has
    // loaded. Scanning with an empty catalog would briefly publish the builtin
    // map to shared storage, making the already-open desktop map tear down and
    // reload all mod layers. Wait until refresh has resolved the catalog.
    if (loading) return;

    let disposed = false;
    const scan = async (trigger: DetectionTrigger) => {
      const defaultScan = await scanDefaultActiveMods();
      if (disposed) return;
      const liveSession = readLiveGameSession();
      const activeSource = resolveActiveMapModSource(defaultScan, liveSession);
      const { modIds: nextIds, mapFolders: nextMapFolders } = activeSource;
      trackDetectionResult(defaultScan, liveSession, activeSource.fromLiveSession, trigger);
      setZomboidRootMissing(!activeSource.fromLiveSession && !defaultScan.rootPath);
      const signature = detectionSignature(
        nextIds,
        nextMapFolders,
        activeSource.fromLiveSession,
      );
      if (signature === detectedSignatureRef.current) return;
      detectedSignatureRef.current = signature;
      setDetectedActiveModIds(nextIds);
      setDetectedMapFolders(nextMapFolders);
      setDetectedFromLiveSession(activeSource.fromLiveSession);
      setManualActiveModKeys(null);
      const currentWorld = resolveCurrentWorld(preparedMods, nextIds, null, nextMapFolders);
      selectMap(currentWorld?.key ?? BUILTIN_MAP_ID, "detected");
    };
    const timer = window.setInterval(() => void scan("poll"), ACTIVE_MOD_SCAN_INTERVAL_MS);
    const onFocus = () => void scan("focus");
    window.addEventListener("focus", onFocus);
    void scan("startup");
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loading, preparedMods, resolveCurrentWorld, selectMap, trackDetectionResult]);

  const detectedModIdSet = useMemo(
    () => new Set(detectedActiveModIds.map(normalize)),
    [detectedActiveModIds],
  );
  const detectedActiveModKeys = useMemo(
    () => preparedMods
      .filter(({ modId }) => detectedModIdSet.has(normalize(modId)))
      .map(({ key }) => key),
    [detectedModIdSet, preparedMods],
  );
  const activeModKeys = manualActiveModKeys ?? detectedActiveModKeys;
  const currentWorld = useMemo(
    () => resolveCurrentWorld(
      preparedMods,
      detectedActiveModIds,
      manualActiveModKeys,
      detectedMapFolders,
    ),
    [detectedActiveModIds, detectedMapFolders, manualActiveModKeys, preparedMods, resolveCurrentWorld],
  );
  const entries = useMemo(() => {
    const preparedEntries = createPreparedMapModPackages(preparedMods)
      .map(({ key, displayName, mods }) => toPreparedEntry(key, displayName, mods));
    return [
      currentWorld ?? BUILTIN_MAP_ENTRY,
      ...(currentWorld ? [BUILTIN_MAP_ENTRY] : []),
      ...preparedEntries,
      ...communityEntries,
    ];
  }, [communityEntries, currentWorld, preparedMods]);

  /* Which world the player's game is actually set up for — the one question the
   * whole prepared-map-mod library exists to answer. Reported once per resolved
   * world (the key guard), so the 1.5s detection scan can't turn it into a
   * stream. */
  const reportedWorldRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const worldKey = currentWorld?.key ?? BUILTIN_MAP_ID;
    if (reportedWorldRef.current === worldKey) return;
    reportedWorldRef.current = worldKey;
    track(EVENTS.MAP_WORLD_DETECTED, {
      mod_count: currentWorld?.preparedMods?.length ?? 0,
      mods: currentWorld?.preparedMods?.map(({ key }) => key) ?? [],
      world_kind: currentWorld ? currentWorld.modMapKind : "vanilla",
      from_live_session: detectedFromLiveSession,
      manual: manualActiveModKeys !== null,
    });
  }, [currentWorld, detectedFromLiveSession, loading, manualActiveModKeys]);

  const togglePreparedMods = useCallback((modKeys: string[]) => {
    if (modKeys.length === 0) return;
    const { activeKeys: next, activating } = togglePreparedMapModPackage(activeModKeys, modKeys);
    track(EVENTS.PREPARED_MAP_MOD_TOGGLED, {
      mod_key: modKeys.join("+"),
      mod_count: modKeys.length,
      active: activating,
    });
    setManualActiveModKeys(next);
    const nextWorld = resolveCurrentWorld(preparedMods, detectedActiveModIds, next, detectedMapFolders);
    selectMap(nextWorld?.key ?? BUILTIN_MAP_ID);
  }, [activeModKeys, detectedActiveModIds, detectedMapFolders, preparedMods, resolveCurrentWorld, selectMap]);

  const locateZomboidRootFromLibrary = useCallback(async () => {
    const result = await locateZomboidRoot("library_banner");
    if (result === "invalid") {
      setZomboidRootSelectionInvalid(true);
      return;
    }
    if (result !== "selected") return;
    setZomboidRootSelectionInvalid(false);
    setZomboidRootMissing(false);
    await refresh("after_folder_selection");
  }, [refresh]);

  const uninstallPackage = useCallback(async (key: string) => {
    await removeCommunityMap(key);
    track(EVENTS.COMMUNITY_MAP_REMOVED, { map_key: key });
    if (selectedKey === key) selectMap(BUILTIN_MAP_ID, "map_removed");
    notifyLibraryChange();
    await refresh();
  }, [refresh, selectMap, selectedKey]);

  const selectedMap = useMemo(
    () => entries.find(({ key }) => key === selectedKey) ?? BUILTIN_MAP_ENTRY,
    [entries, selectedKey],
  );

  return {
    entries,
    selectedKey: selectedMap.key,
    selectedMap,
    loading,
    error,
    zomboidRootMissing,
    zomboidRootSelectionInvalid,
    activeModKeys,
    selectMap,
    togglePreparedMods,
    refreshPreparedCatalog,
    locateZomboidRoot: locateZomboidRootFromLibrary,
    uninstallPackage,
  };
};
