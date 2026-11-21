import { useSyncExternalStore } from "react";
import {
  isDeathWarp,
  localPlayerOf,
  readLiveInventorySnapshot,
  readLiveStateSnapshot,
  type LiveInventoryEntry,
  type LiveState,
  type LiveTeammate,
} from "./live-state";
import { getPeakSession, updatePeakSession } from "../../state/peak-session-store";
import { getSupabaseClient } from "../../auth/supabase-client";

// Records expedition telemetry (elevation samples, deaths) into a local-first
// cache. The background window samples; signed-in history syncs to Supabase.

export interface ExpeditionRecord {
  scene: string;
  date: string;
  startedAt: number;
  updatedAt: number;
  // Seconds between stored samples. Starts at the recorder's cadence and
  // doubles whenever the sample budget fills; absent on records written
  // before the record spanned a whole island day.
  stride?: number;
  // [secondsSinceStart, worldX, worldY, worldZ]
  samples: Array<[number, number, number, number]>;
  deaths: Array<{ x: number; y: number; z: number; at: number }>;
  campfires?: Array<{ x: number; z: number; state: string; advanceTo: string; at: number }>;
  inventory?: Array<{ itemId: number; delta: number; at: number }>;
}

const STORAGE_KEY = "peak-map:expeditions";
const MAX_RECORDS = 30;
const MAX_SAMPLES = 3_600;
const SYNC_INTERVAL_MS = 30_000;
export const SAMPLE_INTERVAL_MS = 2_000;
const BASE_STRIDE_SECONDS = SAMPLE_INTERVAL_MS / 1_000;
// One record covers one island. The island turns over at the catalog's
// rotation anchor — 17:00 UTC, not midnight — so a calendar date would cut an
// evening session in half. A level only comes back around after a full cycle
// of the rotation instead, which makes "recorded on this scene within a day"
// an unambiguous stand-in for "this island", and one that needs no catalog in
// the background window.
const ISLAND_WINDOW_MS = 24 * 60 * 60_000;

export const strideOf = (record: ExpeditionRecord): number =>
  record.stride ?? BASE_STRIDE_SECONDS;

// Samples only accumulate while the scout is alive on the island, so a hole in
// the sample clock marks a jump the route never took. Three missed samples is
// long enough to ride out a stale bridge read and short enough to catch every
// teleport the trail must not bridge; a thinned record carries a wider stride,
// so the tolerance grows with it.
export const trailBreakSeconds = (record: ExpeditionRecord): number => strideOf(record) * 3;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedRecords: ExpeditionRecord[] = [];
let syncUserId: string | null = null;
let syncTimer: number | null = null;
let syncGeneration = 0;
let localRevision = 0;
let remoteClearUserId: string | null = null;

// Runs recorded before the death warp was understood carry limbo samples and
// graves pinned to limbo. Repairing them on read fixes their trail, chart and
// death layer, and the next ingest persists the repair.
const repairDeathWarps = (records: ExpeditionRecord[]): ExpeditionRecord[] =>
  records.map((record) => {
    const samples = record.samples.filter(
      (sample) => !isDeathWarp({ x: sample[1], y: sample[2], z: sample[3] }),
    );
    if (samples.length === record.samples.length) return record;
    const deaths = record.deaths.flatMap((death) => {
      if (!isDeathWarp(death)) return [death];
      const seconds = (death.at - record.startedAt) / 1_000;
      const grave = samples.filter((sample) => sample[0] <= seconds).at(-1);
      return grave ? [{ x: grave[1], y: grave[2], z: grave[3], at: death.at }] : [];
    });
    return { ...record, samples, deaths };
  });

// Thins a record until it fits the sample budget, widening its stride to match
// so the trail keeps its full extent instead of stopping at the cap.
const fitSampleBudget = (record: ExpeditionRecord): void => {
  while (record.samples.length > MAX_SAMPLES) {
    record.samples = record.samples.filter((_, index) => index % 2 === 0);
    record.stride = strideOf(record) * 2;
  }
};

// Runs recorded before one record covered a whole island were cut at every
// re-entry, so a day already climbed reads back as several short expeditions.
// Folding them together on read makes stored history match how it is recorded
// now, and the next ingest persists the fold. Each record clocks its samples
// from its own start, so the later ones are rebased onto the one they join.
const mergeIslandRuns = (records: ExpeditionRecord[]): ExpeditionRecord[] => {
  const merged: ExpeditionRecord[] = [];
  records.forEach((record) => {
    const open = merged.find(
      (candidate) =>
        candidate.scene === record.scene
        && Math.abs(record.updatedAt - candidate.updatedAt) < ISLAND_WINDOW_MS,
    );
    if (!open) {
      merged.push({ ...record });
      return;
    }
    const offset = Math.round((record.startedAt - open.startedAt) / 1_000);
    open.samples = [...open.samples, ...record.samples.map(
      (sample): typeof sample => [sample[0] + offset, sample[1], sample[2], sample[3]],
    )].sort((a, b) => a[0] - b[0]);
    open.deaths = [...open.deaths, ...record.deaths];
    open.campfires = [...(open.campfires ?? []), ...(record.campfires ?? [])];
    open.inventory = [...(open.inventory ?? []), ...(record.inventory ?? [])];
    open.updatedAt = Math.max(open.updatedAt, record.updatedAt);
    open.stride = Math.max(strideOf(open), strideOf(record));
    fitSampleBudget(open);
  });
  return merged;
};

const readRecords = (): ExpeditionRecord[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedRecords;
  cachedRaw = raw;
  try {
    cachedRecords = raw
      ? mergeIslandRuns(repairDeathWarps(JSON.parse(raw) as ExpeditionRecord[]))
      : [];
  } catch {
    cachedRecords = [];
  }
  return cachedRecords;
};

const writeRecords = (records: ExpeditionRecord[], scheduleSync = true): void => {
  cachedRecords = records.slice(-MAX_RECORDS);
  cachedRaw = JSON.stringify(cachedRecords);
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  listeners.forEach((listener) => listener());
  if (scheduleSync) {
    localRevision += 1;
    scheduleExpeditionSync();
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    listeners.forEach((listener) => listener());
    localRevision += 1;
    scheduleExpeditionSync();
  });
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useExpeditions = (): ExpeditionRecord[] =>
  useSyncExternalStore(subscribe, readRecords, () => []);

/** Drops every recorded run. Offered in Settings; there is no undo. */
export const clearExpeditions = (): void => {
  if (typeof window === "undefined") return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = null;
  syncGeneration += 1;
  remoteClearUserId = syncUserId;
  writeRecords([], false);
  if (remoteClearUserId) scheduleExpeditionSync(true);
};

interface ExpeditionRow {
  record: ExpeditionRecord;
}

const recordKey = (record: ExpeditionRecord): string => `${record.scene}:${record.startedAt}`;

const mergeSyncedRecords = (records: ExpeditionRecord[]): ExpeditionRecord[] => {
  const byKey = new Map<string, ExpeditionRecord>();
  records.forEach((record) => {
    const key = recordKey(record);
    const current = byKey.get(key);
    if (!current || record.updatedAt > current.updatedAt) byKey.set(key, record);
  });
  return [...byKey.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-MAX_RECORDS);
};

const sessionBelongsTo = async (userId: string): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data } = await client.auth.getSession();
  return data.session?.user.id === userId;
};

const syncExpeditions = async (userId: string, generation: number): Promise<void> => {
  const client = getSupabaseClient();
  if (!client || syncUserId !== userId || generation !== syncGeneration) return;
  const startingRevision = localRevision;

  if (remoteClearUserId === userId) {
    const { error } = await client.from("expeditions").delete().eq("user_id", userId);
    if (error) throw error;
    if (syncUserId !== userId || generation !== syncGeneration) return;
    remoteClearUserId = null;
  }

  const { data, error } = await client
    .from("expeditions")
    .select("record")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_RECORDS);
  if (error) throw error;

  const remoteRecords = (data as ExpeditionRow[] | null)?.map((row) => row.record) ?? [];
  const merged = mergeSyncedRecords([...remoteRecords, ...readRecords()]);
  const remoteByKey = new Map(remoteRecords.map((record) => [recordKey(record), record]));
  const recordsToUpload = merged.filter((record) => {
    const remote = remoteByKey.get(recordKey(record));
    return !remote || record.updatedAt > remote.updatedAt;
  });
  if (recordsToUpload.length > 0) {
    const { error: upsertError } = await client.from("expeditions").upsert(
      recordsToUpload.map((record) => ({
        user_id: userId,
        scene: record.scene,
        started_at: record.startedAt,
        updated_at: record.updatedAt,
        record,
      })),
      { onConflict: "user_id,scene,started_at" },
    );
    if (upsertError) throw upsertError;
  }

  // Do not let a request that started before sign-out restore private history
  // after the auth session and the local journal have been cleared.
  if (
    syncUserId !== userId
    || generation !== syncGeneration
    || !(await sessionBelongsTo(userId))
  ) return;

  writeRecords(mergeSyncedRecords([...merged, ...readRecords()]), false);
  if (localRevision !== startingRevision) scheduleExpeditionSync();
};

function scheduleExpeditionSync(immediate = false): void {
  if (typeof window === "undefined" || !syncUserId || syncTimer !== null) return;
  const userId = syncUserId;
  const generation = syncGeneration;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncExpeditions(userId, generation).catch((error: unknown) => {
      console.warn("[Expeditions] Sync failed; local history is preserved for retry.", error);
      scheduleExpeditionSync();
    });
  }, immediate ? 0 : SYNC_INTERVAL_MS);
}

/** Starts account-owned history sync and immediately migrates anonymous runs. */
export const startExpeditionSync = (userId: string): void => {
  if (syncUserId === userId) return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = null;
  syncUserId = userId;
  remoteClearUserId = null;
  syncGeneration += 1;
  scheduleExpeditionSync(true);
};

/** Stops pending account sync before the local journal is cleared on sign-out. */
export const stopExpeditionSync = (): void => {
  syncUserId = null;
  remoteClearUserId = null;
  syncGeneration += 1;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = null;
};

// Tracks the alive→dead transition across ingests so a player who stays dead
// for minutes produces exactly one death entry.
let lastIngestDead = false;
let lastIngestScene: string | null = null;
let lastIngestGameStartedAt: number | null = null;
let lastCampfireStates = new Map<string, string>();
let lastInventoryCounts: Map<number, number> | null = null;

// `dead` comes from a reflected private field, so a renamed member in a game
// patch makes the mod report `false` forever without any error. The warp into
// limbo is a position, which cannot silently break the same way, so either
// signal counts as a death and the pair is deduped by the transition latch.
const isDead = (player: LiveTeammate): boolean => player.dead || isDeathWarp(player);

const round1 = (value: number): number => Math.round(value * 10) / 10;

// Only island scenes are worth recording; the airport and menus would
// otherwise fill the record cap with junk runs.
const isIslandScene = (sceneName: string): boolean =>
  sceneName.startsWith("Level_") || sceneName === "WilIsland";

// Quitting to the airport and dropping back in resumes the same record, so the
// trail, the graves and the elapsed time all survive the round trip. Only the
// rotation to the next island opens a fresh one.
export const findIslandRecord = (
  records: ExpeditionRecord[],
  scene: string,
  now: number,
): ExpeditionRecord | undefined => {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.scene === scene && now - record.updatedAt < ISLAND_WINDOW_MS) return record;
  }
  return undefined;
};

// Ingests one live snapshot into the record for its island, creating one when
// the island has not been climbed today.
const campfireKey = (campfire: { x: number; z: number }): string =>
  `${Math.round(campfire.x * 10)},${Math.round(campfire.z * 10)}`;

const inventoryCounts = (inventory: LiveInventoryEntry[]): Map<number, number> => {
  const counts = new Map<number, number>();
  inventory.forEach((entry) => counts.set(entry.itemId, (counts.get(entry.itemId) ?? 0) + 1));
  return counts;
};

export const ingestLiveSample = (state: LiveState, inventory: LiveInventoryEntry[] | null = null): void => {
  const { gameStartedAt, matchStartedAt, climbStartedAt } = getPeakSession();
  if (state.updatedAt < Math.max(gameStartedAt ?? 0, matchStartedAt ?? 0)) return;
  if (gameStartedAt !== lastIngestGameStartedAt) {
    lastIngestGameStartedAt = gameStartedAt;
    lastIngestScene = null;
    lastIngestDead = false;
  }
  if (!isIslandScene(state.sceneName)) {
    if (climbStartedAt !== null) updatePeakSession({ climbStartedAt: null });
    lastIngestDead = false;
    lastIngestScene = null;
    lastCampfireStates = new Map();
    lastInventoryCounts = null;
    return;
  }
  const player = localPlayerOf(state);
  if (!player) return;

  const now = Date.now();
  // The match event resets the route even when the next climb uses the same
  // island. Without a match event, use the bridge's scene transition.
  const changedScene = lastIngestScene !== state.sceneName;
  const startsClimb = matchStartedAt !== null ? climbStartedAt === null : changedScene;
  if (changedScene) {
    lastIngestScene = state.sceneName;
    lastCampfireStates = new Map();
    lastInventoryCounts = null;
  }
  const date = new Date(now).toISOString().slice(0, 10);
  const records = [...readRecords()];
  let record = findIslandRecord(records, state.sceneName, now);
  if (!record) {
    record = {
      scene: state.sceneName,
      date,
      startedAt: now,
      updatedAt: now,
      stride: BASE_STRIDE_SECONDS,
      samples: [],
      deaths: [],
      campfires: [],
      inventory: [],
    };
    records.push(record);
  }

  const seconds = Math.round((now - record.startedAt) / 1_000);
  // A corpse waits out the run in limbo, so those samples are dropped instead
  // of recorded as a 5 km detour; the hole they leave in the sample clock is
  // what tells the map where to break the drawn trail.
  const inLimbo = isDeathWarp(player);
  const stride = strideOf(record);
  const lastSecond = record.samples.at(-1)?.[0] ?? -Infinity;
  if (!inLimbo && seconds - lastSecond >= stride) {
    record.samples.push([seconds, round1(player.x), round1(player.y), round1(player.z)]);
    // A day on one island outlives the sample budget. Rather than truncate the
    // trail at the cap — which froze the route mid-climb — the record halves
    // its resolution, so the whole route survives in the same footprint.
    fitSampleBudget(record);
  }

  const dead = isDead(player);
  if (dead && !lastIngestDead) {
    // The warp happens in the same frame the flag flips, so by the time the
    // recorder sees the death the body is already gone. Pin the grave to the
    // last place the scout actually stood.
    const last = record.samples.at(-1);
    const grave = inLimbo
      ? last && { x: last[1], y: last[2], z: last[3] }
      : { x: round1(player.x), y: round1(player.y), z: round1(player.z) };
    if (grave) record.deaths.push({ ...grave, at: now });
  }
  lastIngestDead = dead;

  record.campfires ??= [];
  state.campfires.forEach((campfire) => {
    const key = campfireKey(campfire);
    const previous = lastCampfireStates.get(key);
    const stateName = campfire.state.toLowerCase();
    const completed = stateName === "lit" || stateName === "spent";
    const alreadyRecorded = record.campfires?.some((event) => campfireKey(event) === key);
    if (completed && previous !== stateName && !alreadyRecorded) {
      record.campfires?.push({ ...campfire, at: now });
    }
    lastCampfireStates.set(key, stateName);
  });

  if (inventory) {
    const currentCounts = inventoryCounts(inventory);
    if (lastInventoryCounts) {
      const itemIds = new Set([...lastInventoryCounts.keys(), ...currentCounts.keys()]);
      record.inventory ??= [];
      itemIds.forEach((itemId) => {
        const delta = (currentCounts.get(itemId) ?? 0) - (lastInventoryCounts?.get(itemId) ?? 0);
        if (delta !== 0) record.inventory?.push({ itemId, delta, at: now });
      });
    }
    lastInventoryCounts = currentCounts;
  }

  record.updatedAt = now;
  writeRecords(records);
  if (startsClimb) updatePeakSession({ climbStartedAt: now });
};

// Driven by the background window on a fixed interval.
export const startExpeditionRecorder = (): (() => void) => {
  if (typeof window === "undefined" || typeof overwolf === "undefined") return () => undefined;
  let reading = false;
  let stopped = false;
  const timer = window.setInterval(async () => {
    const { isGameRunning, gameStartedAt } = getPeakSession();
    if (!isGameRunning || reading) return;
    reading = true;
    try {
      const [state, inventory] = await Promise.all([readLiveStateSnapshot(), readLiveInventorySnapshot()]);
      if (!stopped && state && getPeakSession().gameStartedAt === gameStartedAt) {
        ingestLiveSample(state, inventory);
      }
    } finally {
      reading = false;
    }
  }, SAMPLE_INTERVAL_MS);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
};
