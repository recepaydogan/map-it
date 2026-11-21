import {
  EMPTY_PROGRESS,
  isEmptyProgress,
  isSyncAvailable,
  mergeProgress,
  pullProgress,
  pushProgress,
  sameProgress,
  type CloudSave,
  type SyncedProgress,
} from "../services/sync/map-sync-service";
import { getSupabaseClient } from "../data/supabase-client";
import { DEFAULT_PLAYER_STATS, useMapStore } from "./map-store";

/**
 * Cloud save engine — keeps a signed-in player's progress mirrored to their
 * account, so a reinstall or a second PC picks up where they left off.
 *
 * Signed out, this file does nothing at all: the map store persists to
 * localStorage exactly as it always has, and that stays true whether or not the
 * build even has Supabase credentials. Signing in adds a copy; it never takes
 * the local one away.
 *
 * Shape of the thing, in the order it runs:
 *
 *   1. Sign in (or boot with a session) → reconcile once. See `decide()` for the
 *      four cases and why each resolves the way it does.
 *   2. From then on, every change to the tracked slice schedules a debounced
 *      save. It is ONE request: we already know the revision we are replacing,
 *      and a refusal hands back the newer row in the same round trip, so there
 *      is no read-before-write.
 *   3. Anything unexpected (offline, a revision another device moved) settles by
 *      merging and retrying, never by overwriting blind.
 *
 * Why a `stamp` in localStorage rather than a flag in memory: it records WHICH
 * ACCOUNT the data on this device came from and which revision it descends from.
 * Both windows (desktop + in-game overlay) share it, and it survives a restart,
 * which is what lets a plain save keep its deletions instead of unioning them
 * back in on every launch.
 *
 * Two windows both run this engine. They converge rather than coordinate: a save
 * from one is seen by the other through cross-window-sync, whose rehydrate lands
 * a state identical to what was just pushed, and an identical state is never
 * pushed twice (`lastSaved`). A genuine collision is caught by the revision
 * check and merged.
 */

/* ── Status ────────────────────────────────────────────────────────────────── */
// Nothing renders this. Saving is not a thing the player operates, so there is
// no control and no indicator for it — the only reader is the retry logic below,
// plus whoever is looking at the console when something goes wrong.

type CloudSyncStatus =
  /** No account, or no Supabase in this build — local-only, as before. */
  | "off"
  /** Everything on this device is in the account. */
  | "synced"
  | "syncing"
  /** Couldn't reach the server. Local progress is safe; we retry. */
  | "error";

let status: CloudSyncStatus = "off";

const setStatus = (next: CloudSyncStatus): void => {
  status = next;
};

/* ── The map store's player-owned slice ────────────────────────────────────── */

/**
 * An untouched build is written as `{}`, not as eight 10s. It is the difference
 * between "this player has no build" and "this player chose all tens", and the
 * merge needs it: a fresh install must take the account's build rather than
 * flatten it back to the defaults.
 */
const statsToWire = (stats: Record<string, number>): Record<string, number> => {
  const pristine = Object.entries(DEFAULT_PLAYER_STATS).every(
    ([stat, value]) => stats[stat] === value,
  );
  return pristine ? {} : stats;
};

const snapshot = (): SyncedProgress => {
  const s = useMapStore.getState();
  return {
    found: [...s.foundMarkers],
    bookmarks: [...s.bookmarks],
    favoritePatterns: [...s.favoritePatterns],
    customMarkers: s.customMarkers,
    playerStats: statsToWire(s.playerStats),
  };
};

/** Held while we write pulled state into the store, so our own subscriber does
 *  not read that write as a user edit and bounce it straight back to the server. */
let applying = false;

const applyToStore = (progress: SyncedProgress): void => {
  applying = true;
  try {
    useMapStore.setState({
      foundMarkers: new Set(progress.found),
      bookmarks: new Set(progress.bookmarks),
      favoritePatterns: new Set(progress.favoritePatterns),
      customMarkers: progress.customMarkers,
      // A partial build from an older payload still has to leave the store with
      // all eight attributes — readers index them directly.
      playerStats: { ...DEFAULT_PLAYER_STATS, ...progress.playerStats },
    });
  } finally {
    applying = false;
  }
};

/* ── The stamp: which account this device's copy came from, at which rev ────── */

const STAMP_KEY = "elden-ring-atlas:map-sync";

interface SyncStamp {
  userId: string;
  rev: number;
}

const readStamp = (): SyncStamp | null => {
  try {
    const raw = window.localStorage.getItem(STAMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncStamp>;
    return typeof parsed?.userId === "string" && typeof parsed?.rev === "number"
      ? { userId: parsed.userId, rev: parsed.rev }
      : null;
  } catch {
    return null;
  }
};

const writeStamp = (stamp: SyncStamp): void => {
  try {
    window.localStorage.setItem(STAMP_KEY, JSON.stringify(stamp));
  } catch {
    // Storage disabled: syncing still works this run, it just re-merges on the
    // next launch instead of saving straight through.
  }
};

/* ── Engine ────────────────────────────────────────────────────────────────── */

/** Debounce on a change. Long enough that ticking off a row of markers is one
 *  save, short enough that closing the app right after a click still catches it. */
const SAVE_DEBOUNCE_MS = 2_500;
/** A refused save merges and retries; this bounds a pathological ping-pong. */
const MAX_ATTEMPTS = 4;
/** A pass that couldn't reach the server retries itself on this ladder. Nothing
 *  in here is ever meant to wait on a person pressing something — the progress
 *  is safe locally in the meantime, so the retries can afford to slow down. */
const RETRY_LADDER_MS = [30_000, 60_000, 300_000, 900_000];

let currentUserId: string | null = null;
/** The progress we know the server holds — the guard against pushing a no-op
 *  (which is exactly what a cross-window rehydrate would otherwise trigger). */
let lastSaved: SyncedProgress | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** How far down RETRY_LADDER_MS the current outage has walked. */
let retryStep = 0;
let running: Promise<void> | null = null;
/** Set when a change arrives mid-flight, so the run schedules one more pass. */
let dirty = false;
let started = false;

/**
 * What this device should end up with, and which revision it is replacing.
 *
 *   • no cloud save yet          → adopt what is on this device. This is the
 *     first sign-in: months of local play become the account's first revision.
 *   • the local copy belongs to
 *     ANOTHER account            → take the new account's copy (or an empty one).
 *     The stamp is proof the previous account's progress reached the server, so
 *     nothing is lost — this is the shared-PC case, and inheriting a stranger's
 *     900 cleared markers would be worse than starting clean.
 *   • local descends from the
 *     cloud's current revision   → a plain save. DELETES SURVIVE: nobody else
 *     has written since, so a cleared tick is an edit, not a gap.
 *   • anything else              → two devices edited from the same point (or
 *     this device has never synced). Union them; see mergeProgress.
 */
const decide = (
  userId: string,
  local: SyncedProgress,
  cloud: CloudSave | null,
): { desired: SyncedProgress; expectedRev: number | null } => {
  const stamp = readStamp();

  if (stamp && stamp.userId !== userId) {
    return {
      desired: cloud ? cloud.progress : { ...EMPTY_PROGRESS },
      expectedRev: cloud?.rev ?? null,
    };
  }
  if (!cloud) return { desired: local, expectedRev: null };
  if (stamp && stamp.userId === userId && stamp.rev === cloud.rev) {
    return { desired: local, expectedRev: cloud.rev };
  }
  return {
    desired: isEmptyProgress(local) ? cloud.progress : mergeProgress(local, cloud.progress),
    expectedRev: cloud.rev,
  };
};

const clearRetry = (): void => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
};

/** Couldn't reach the server. Say so, and arm the next attempt — the local copy
 *  is untouched and still authoritative until one of them lands. */
const failPass = (error: string): void => {
  console.warn("[sync] not saved, will retry:", error);
  setStatus("error");
  if (retryTimer) clearTimeout(retryTimer);
  const delay = RETRY_LADDER_MS[Math.min(retryStep, RETRY_LADDER_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void sync(true);
  }, delay);
};

/**
 * One sync pass.
 *
 * `pull` is only needed when we cannot say which revision this device descends
 * from — the first pass after signing in, or after a failure lost track. A
 * routine save skips it: the server refuses a stale write and returns the row
 * that beat us, which is the same information one round trip earlier.
 */
const runSync = async (userId: string, pull: boolean): Promise<void> => {
  setStatus("syncing");

  const localBefore = snapshot();
  let desired: SyncedProgress;
  let expectedRev: number | null;
  let cloud: CloudSave | null = null;

  if (pull) {
    const pulled = await pullProgress();
    if (!pulled.ok) {
      failPass(pulled.error);
      return;
    }
    cloud = pulled.value;
    ({ desired, expectedRev } = decide(userId, localBefore, cloud));
  } else {
    const stamp = readStamp();
    if (!stamp || stamp.userId !== userId) {
      // No revision to write against — fall back to a full pass.
      await runSync(userId, true);
      return;
    }
    desired = localBefore;
    expectedRev = stamp.rev;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (cloud && sameProgress(desired, cloud.progress)) break; // already stored

    const pushed = await pushProgress(expectedRev, desired);
    if (!pushed.ok) {
      failPass(pushed.error);
      return;
    }
    cloud = pushed.value;
    expectedRev = pushed.value.rev;
    if (sameProgress(pushed.value.progress, desired)) break; // accepted

    // Refused: another device saved between our read and our write, and its copy
    // is what came back. Fold the two together and write the result.
    desired = mergeProgress(desired, pushed.value.progress);
  }

  // The user may have clicked something while the request was in flight. Their
  // edit must not be thrown away by the state we are about to write, so it is
  // folded in and saved on the next pass rather than overwritten.
  const localNow = snapshot();
  if (!sameProgress(localNow, localBefore)) {
    desired = mergeProgress(localNow, desired);
    dirty = true;
  }

  if (!sameProgress(localNow, desired)) applyToStore(desired);
  lastSaved = desired;
  if (cloud) writeStamp({ userId, rev: cloud.rev });
  clearRetry();
  setStatus("synced");
};

/** Serialise passes: a second request while one is in flight is remembered, not
 *  run alongside (two concurrent pushes would just refuse each other). */
const sync = (pull: boolean): Promise<void> => {
  const userId = currentUserId;
  if (!userId || !isSyncAvailable()) return Promise.resolve();
  if (running) {
    dirty = true;
    return running;
  }
  const run = runSync(userId, pull)
    .catch((cause: unknown) => {
      console.warn("[sync] pass failed:", cause);
      failPass(String(cause));
    })
    .finally(() => {
      running = null;
      if (dirty) {
        dirty = false;
        scheduleSave();
      }
    });
  running = run;
  return run;
};

const scheduleSave = (): void => {
  if (!currentUserId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void sync(false);
  }, SAVE_DEBOUNCE_MS);
};

type MapState = ReturnType<typeof useMapStore.getState>;

/**
 * Did the tracked slice actually move? Everything else in the map store (camera,
 * filters, cluster settings) is a device preference and must not cost a request
 * — and the camera writes on every pan, so this runs constantly. Store actions
 * swap the Set/array reference on a real change, so identity answers it without
 * serialising anything.
 */
const trackedChanged = (a: MapState, b: MapState): boolean =>
  a.foundMarkers !== b.foundMarkers ||
  a.bookmarks !== b.bookmarks ||
  a.favoritePatterns !== b.favoritePatterns ||
  a.customMarkers !== b.customMarkers ||
  a.playerStats !== b.playerStats;

const onStoreChange = (state: MapState, prev: MapState): void => {
  if (applying || !currentUserId) return;
  if (!trackedChanged(state, prev)) return;
  // A rehydrate from the other window swaps every reference while the CONTENT is
  // what we just saved. Identity can't see that; this can, and it's what stops
  // the two windows from echoing a save back and forth.
  if (lastSaved && sameProgress(snapshot(), lastSaved)) return;
  scheduleSave();
};

const onAccount = (userId: string | null): void => {
  if (userId === currentUserId) return;
  currentUserId = userId;
  lastSaved = null;
  dirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearRetry();
  if (!userId) {
    // Signed out: stop talking to the server and leave the map exactly as it is.
    // The progress on screen is still the player's, still persisted locally, and
    // still in their account for the next sign-in.
    setStatus("off");
    return;
  }
  void sync(true);
};

/**
 * Run once the map store has read localStorage.
 *
 * This is not a nicety, it is the guard against the one way this engine could
 * destroy data: an unhydrated store looks EMPTY, and an empty store that still
 * carries a matching revision stamp is a legitimate "the player cleared
 * everything" save — which would push emptiness over a real cloud copy. So
 * nothing here observes the store until it holds the player's actual progress.
 */
const whenStoreReady = (run: () => void): void => {
  if (useMapStore.persist.hasHydrated()) {
    run();
    return;
  }
  const stop = useMapStore.persist.onFinishHydration(() => {
    stop();
    run();
  });
};

const wire = (): void => {
  useMapStore.subscribe(onStoreChange);

  // Auth is read from Supabase directly rather than through the React context —
  // the engine is started from App.tsx, outside every AuthProvider. The listener
  // also fires for the restored session on boot, which is what starts the first
  // pass.
  //
  // The setTimeout is load-bearing, not style: supabase-js runs these callbacks
  // while holding its internal auth lock, and every .from()/.rpc() call reads
  // the session under that same lock. Syncing directly from inside the callback
  // therefore deadlocks — the request never completes and NOTHING is ever
  // written, precisely at the sign-in moment sync exists for. Next tick runs
  // after the lock is released.
  const client = getSupabaseClient();
  client?.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    setTimeout(() => onAccount(userId), 0);
  });
  void client?.auth.getSession().then(({ data }) => {
    onAccount(data.session?.user.id ?? null);
  });

  // A failed pass leaves progress unsaved until something asks again; coming
  // back online is the obvious moment.
  window.addEventListener("online", () => {
    if (status === "error") {
      clearRetry(); // the ladder is for a silent outage; this is a real signal
      void sync(true);
    }
  });

  // A save in flight is lost if the window dies first. This is best-effort (the
  // request may not survive teardown either), but the debounce is short and the
  // next launch reconciles anyway.
  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      void sync(false);
    }
  });
};

/**
 * Start the engine for this window. Idempotent (safe under StrictMode's
 * double-invoke); only the windows that run the map store should call it.
 */
export const startCloudSync = (): void => {
  if (started) return;
  started = true;

  if (!isSyncAvailable()) {
    setStatus("off");
    return;
  }
  whenStoreReady(wire);
};
