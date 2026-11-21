import { GAME_JOURNEY, WORLD_LIBRARY_CONFIG } from "../../game-config";
import { getSupabaseClient } from "../../data/supabase-client";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  SAVED_MAP_CHANGE_EVENT,
} from "../../features/map/saved-map-storage";
import { WORLD_LIBRARY_CHANGE_EVENT } from "../../features/worlds/use-world-library";
import { getBrowserJourneyStorage, JOURNEY_CHANGE_EVENT } from "../../features/journey/journey-storage";
import {
  mergePlayerProgress,
  reconcilePlayerProgress,
  samePlayerProgress,
  type CloudProgress,
  type PlayerProgress,
  type ProgressStamp,
} from "./player-progress";
import {
  clearLocalPlayerProgress,
  readLocalPlayerProgress,
  replaceLocalPlayerProgress,
} from "./player-progress-storage";
import {
  isProgressSyncAvailable,
  pullPlayerProgress,
  pushPlayerProgress,
} from "./player-progress-service";
import { adoptGuestJourneyProgress, mergeJourneyProgress, sameJourneyProgress,
  type JourneyProgress } from "./journey-progress";
import { pullJourneyProgress, pushJourneyProgress,
  type CloudJourneyProgress } from "./journey-progress-service";

type SyncStatus = "off" | "syncing" | "synced" | "error";

const STAMP_KEY = "gm:player-progress-sync";
const SAVE_DEBOUNCE_MS = 2_500;
const JOURNEY_SYNC_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000];
const MAP_STORAGE_KEYS = new Set([
  FAVORITES_STORAGE_KEY,
  COMPLETED_LOCATIONS_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
]);

let status: SyncStatus = "off";
let currentUserId: string | null = null;
let accountInitialized = false;
let accountEpoch = 0;
let lastSaved: PlayerProgress | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let journeyTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let running: Promise<void> | null = null;
let dirty = false;
let pendingPull = false;
let applying = false;
let started = false;
let cleanupPromise: Promise<void> = Promise.resolve();
let cleanupBlocked = false;
let memoryStamp: ProgressStamp | null = null;
let syncedJourneyWorldIds = new Set<string>();

const readStamp = (): ProgressStamp | null => {
  try {
    const raw = localStorage.getItem(STAMP_KEY);
    if (!raw) return memoryStamp;
    const value = JSON.parse(raw) as Partial<ProgressStamp>;
    return typeof value.userId === "string" && typeof value.rev === "number"
      ? { userId: value.userId, rev: value.rev }
      : memoryStamp;
  } catch {
    return memoryStamp;
  }
};

const writeStamp = (stamp: ProgressStamp): void => {
  memoryStamp = stamp;
  try {
    localStorage.setItem(STAMP_KEY, JSON.stringify(stamp));
  } catch (error) {
    console.warn("[Progress sync] Unable to persist the sync revision:", error);
  }
};

const removeStamp = (expectedUserId?: string): void => {
  if (expectedUserId && readStamp()?.userId !== expectedUserId) { memoryStamp = null; return; }
  memoryStamp = null;
  try {
    localStorage.removeItem(STAMP_KEY);
  } catch (error) {
    console.warn("[Progress sync] Unable to clear the sync revision:", error);
    throw error;
  }
};

const clearRetry = (): void => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
};

const isCurrentAccount = (userId: string, epoch: number): boolean =>
  currentUserId === userId && accountEpoch === epoch;

const failPass = (message: string): void => {
  console.warn("[Progress sync] Progress remains local; retry scheduled:", message);
  status = "error";
  if (retryTimer) clearTimeout(retryTimer);
  const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void sync(true);
  }, delay);
};

const readLocalJourney = (worldId: string): { progress: JourneyProgress | null; preferencesStored: boolean } => {
  const storage = getBrowserJourneyStorage();
  const fields = storage.storedFields(worldId);
  if (!fields.preferences && !fields.data) return { progress: null, preferencesStored: false };
  const read = storage.read(worldId);
  if (read.error) throw new Error(`Journey state could not be read for ${worldId}: ${read.error}`);
  return { progress: { preferences: read.preferences, data: read.data },
    preferencesStored: fields.preferences };
};

const runJourneySync = async (userId: string, epoch: number, worldIds: string[],
  source: "guest" | "same-account" | "different-account"): Promise<boolean> => {
  if (!worldIds.length) return true;
  const pulled = await pullJourneyProgress(new Set(worldIds));
  if (!isCurrentAccount(userId, epoch)) return false;
  if (!pulled.ok) { failPass(pulled.error); return false; }
  const cloudByWorld = new Map(pulled.value.map(item => [item.worldId, item]));
  const storage = getBrowserJourneyStorage();

  for (const worldId of worldIds) {
    const localSnapshot = readLocalJourney(worldId);
    const localBefore = source === "different-account" ? null : localSnapshot.progress;
    let cloud: CloudJourneyProgress | null = cloudByWorld.get(worldId) ?? null;
    const prepare = (local: JourneyProgress, preferencesStored: boolean): JourneyProgress => {
      if (!cloud) return local;
      if (source === "guest") return adoptGuestJourneyProgress(local, cloud.progress, preferencesStored);
      return preferencesStored ? local : { ...local, preferences: cloud.progress.preferences };
    };
    let desired = localBefore && cloud
      ? mergeJourneyProgress(prepare(localBefore, localSnapshot.preferencesStored), cloud.progress)
      : localBefore ?? cloud?.progress ?? null;
    if (!desired) {
      if (source === "different-account" && localSnapshot.progress) {
        applying = true;
        try { storage.remove(worldId); }
        finally { applying = false; }
      }
      continue;
    }

    let stored = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const localNow = readLocalJourney(worldId);
      if (source !== "different-account" && localNow.progress
        && (!localBefore || !sameJourneyProgress(localNow.progress, localBefore))) {
        desired = mergeJourneyProgress(prepare(localNow.progress, localNow.preferencesStored), desired);
      }
      if (cloud && sameJourneyProgress(desired, cloud.progress)) { stored = true; break; }
      const pushed = await pushJourneyProgress(worldId, cloud?.rev ?? null, desired);
      if (!isCurrentAccount(userId, epoch)) return false;
      if (!pushed.ok) { failPass(pushed.error); return false; }
      cloud = pushed.value;
      stored = sameJourneyProgress(desired, cloud.progress);
      if (stored) break;
      desired = mergeJourneyProgress(desired, cloud.progress);
    }
    if (!stored) { failPass(`journey ${worldId} did not converge after repeated concurrent updates`); return false; }

    const localNow = readLocalJourney(worldId);
    if (!isCurrentAccount(userId, epoch)) return false;
    if (source !== "different-account" && localNow.progress
      && (!localBefore || !sameJourneyProgress(localNow.progress, localBefore))) {
      desired = mergeJourneyProgress(prepare(localNow.progress, localNow.preferencesStored), desired);
      dirty = true;
    }
    if (!localNow.progress || !sameJourneyProgress(localNow.progress, desired)) {
      applying = true;
      try { storage.replace(worldId, desired); }
      finally { applying = false; }
    }
  }
  return true;
};

const runSync = async (userId: string, epoch: number, pull: boolean): Promise<void> => {
  status = "syncing";
  if (journeyTimer) clearTimeout(journeyTimer);
  journeyTimer = null;
  const initialStamp = readStamp();
  const localBefore = await readLocalPlayerProgress();
  if (!isCurrentAccount(userId, epoch)) return;

  let desired: PlayerProgress;
  let expectedRevision: number | null;
  let cloud: CloudProgress | null = null;

  if (pull) {
    const pulled = await pullPlayerProgress();
    if (!isCurrentAccount(userId, epoch)) return;
    if (!pulled.ok) {
      failPass(pulled.error);
      return;
    }
    cloud = pulled.value;
    ({ desired, expectedRevision } = reconcilePlayerProgress(
      userId,
      localBefore,
      cloud,
      initialStamp,
    ));
  } else {
    const stamp = readStamp();
    if (!stamp || stamp.userId !== userId) {
      await runSync(userId, epoch, true);
      return;
    }
    desired = localBefore;
    expectedRevision = stamp.rev;
  }

  let stored = cloud !== null && samePlayerProgress(desired, cloud.progress);
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !stored; attempt += 1) {
    const pushed = await pushPlayerProgress(expectedRevision, desired);
    if (!isCurrentAccount(userId, epoch)) return;
    if (!pushed.ok) {
      failPass(pushed.error);
      return;
    }
    cloud = pushed.value;
    expectedRevision = cloud.rev;
    stored = samePlayerProgress(cloud.progress, desired);
    if (!stored) desired = mergePlayerProgress(desired, cloud.progress);
  }
  if (!stored || !cloud) {
    failPass("progress did not converge after repeated concurrent updates");
    return;
  }

  const localNow = await readLocalPlayerProgress();
  if (!isCurrentAccount(userId, epoch)) return;
  if (!samePlayerProgress(localNow, localBefore)) {
    desired = mergePlayerProgress(localNow, desired);
    dirty = true;
  }

  if (!samePlayerProgress(localNow, desired)) {
    applying = true;
    try {
      await replaceLocalPlayerProgress(desired, userId, () => isCurrentAccount(userId, epoch));
    } finally {
      applying = false;
    }
    if (!isCurrentAccount(userId, epoch)) return;
  }
  const worldIds = desired.worlds.map(world => world.id);
  if (pull || worldIds.some(worldId => !syncedJourneyWorldIds.has(worldId))) {
    const journeySource = !initialStamp ? "guest"
      : initialStamp.userId === userId ? "same-account" : "different-account";
    if (!await runJourneySync(userId, epoch, worldIds, journeySource)) return;
    syncedJourneyWorldIds = new Set(worldIds);
  }
  lastSaved = desired;
  writeStamp({ userId, rev: cloud.rev });
  clearRetry();
  status = "synced";
};

const sync = (pull: boolean): Promise<void> => {
  const userId = currentUserId;
  const epoch = accountEpoch;
  if (!userId || !isProgressSyncAvailable()) return Promise.resolve();
  if (running) {
    dirty = true;
    pendingPull ||= pull;
    return running;
  }
  const pass = runSync(userId, epoch, pull)
    .catch((error: unknown) => {
      if (isCurrentAccount(userId, epoch)) failPass(String(error));
    })
    .finally(() => {
      running = null;
      if (!dirty || !currentUserId) return;
      const nextPull = pendingPull;
      dirty = false;
      pendingPull = false;
      void sync(nextPull);
    });
  running = pass;
  return pass;
};

const scheduleSave = (): void => {
  // Camera/resume writes can continue throughout play. They must not keep
  // postponing an upload of a newly saved pin or note.
  if (!currentUserId || applying || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void readLocalPlayerProgress().then(progress => {
      if (!lastSaved || !samePlayerProgress(progress, lastSaved)) void sync(false);
    }).catch(error => failPass(String(error)));
  }, SAVE_DEBOUNCE_MS);
};

const scheduleJourneySave = (): void => {
  if (!currentUserId || applying || journeyTimer) return;
  journeyTimer = setTimeout(() => {
    journeyTimer = null;
    void sync(true);
  }, JOURNEY_SYNC_INTERVAL_MS);
};

const resetPendingWork = (): void => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (journeyTimer) clearTimeout(journeyTimer);
  journeyTimer = null;
  clearRetry();
  dirty = false;
  pendingPull = false;
  lastSaved = null;
  syncedJourneyWorldIds = new Set();
};

const onAccount = (userId: string | null): void => {
  if (accountInitialized && userId === currentUserId) return;
  const previousUserId = currentUserId;
  accountInitialized = true;
  currentUserId = userId;
  accountEpoch += 1;
  resetPendingWork();

  if (!userId) {
    status = "off";
    if (previousUserId === null && !readStamp()) return;
    // Do not wait for a slow in-flight upload. Its account epoch is obsolete,
    // so it cannot write back locally; clearing immediately prevents a signed-
    // out screen from exposing the previous account's data.
    cleanupBlocked = false;
    const clearedUserId = previousUserId ?? readStamp()?.userId;
    cleanupPromise = clearLocalPlayerProgress(clearedUserId)
      .then(() => {
        removeStamp(clearedUserId);
      });
    void cleanupPromise.catch(error => {
      cleanupBlocked = true;
      status = "error";
      console.error("[Progress sync] Unable to clear signed-out data:", error);
    });
    return;
  }

  cleanupPromise
    .then(() => sync(true))
    .catch(error => {
      cleanupBlocked = true;
      status = "error";
      console.error("[Progress sync] Sync paused because signed-out data could not be cleared:", error);
    });
};

const wire = (): void => {
  window.addEventListener(SAVED_MAP_CHANGE_EVENT, () => scheduleSave());
  window.addEventListener(WORLD_LIBRARY_CHANGE_EVENT, () => scheduleSave());
  window.addEventListener(JOURNEY_CHANGE_EVENT, scheduleJourneySave);
  window.addEventListener("storage", event => {
    if (event.key?.startsWith(`${GAME_JOURNEY.storagePrefix}:`)) {
      scheduleJourneySave();
      return;
    }
    if (event.key === WORLD_LIBRARY_CONFIG.changePulseKey
      || event.key === null
      || (event.key !== null && MAP_STORAGE_KEYS.has(event.key))) scheduleSave();
  });
  window.addEventListener("online", () => {
    if (status === "error" && !cleanupBlocked) {
      clearRetry();
      void sync(true);
    }
  });
  window.addEventListener("beforeunload", () => {
    if (!saveTimer && !journeyTimer) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (journeyTimer) clearTimeout(journeyTimer);
    journeyTimer = null;
    void sync(true);
  });

  const client = getSupabaseClient();
  client?.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    setTimeout(() => onAccount(userId), 0);
  });
  void client?.auth.getSession().then(({ data }) => onAccount(data.session?.user.id ?? null));
};

export const startCloudProgressSync = (): void => {
  if (started) return;
  started = true;
  if (!isProgressSyncAvailable()) return;
  wire();
};

/** Upload locally recorded progress before the signed-out cleanup clears it. */
export const flushCloudProgressSync = async (userId: string): Promise<boolean> => {
  startCloudProgressSync();
  if (currentUserId !== userId) onAccount(userId);
  try { await cleanupPromise; }
  catch { return false; }
  if (currentUserId !== userId) return false;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (journeyTimer) clearTimeout(journeyTimer);
  journeyTimer = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await sync(true);
    for (let pass = 0; pass < MAX_ATTEMPTS && running; pass += 1) await running;
    if (running) return false;
    if (status !== "synced") return false;
    if (!saveTimer && !journeyTimer) return true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (journeyTimer) clearTimeout(journeyTimer);
    journeyTimer = null;
  }
  return false;
};
