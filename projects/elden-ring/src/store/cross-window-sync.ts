import { isOverwolf } from "../utils/overwolf";
import { useMapStore } from "./map-store";

/**
 * Live cross-window sync for the map store.
 *
 * Every Overwolf window (the `main` desktop dashboard and the in-game
 * `overlay_map`) is a SEPARATE browsing context with its own JS heap — so each
 * runs its own copy of the Zustand store. They do share one localStorage (same
 * extension origin), and the store's `persist` middleware already writes every
 * change there, so a window opened LATER picks up the newest state on mount.
 * What's missing is LIVE sync while two windows are open at once: a marker the
 * player clears on the in-game overlay map should appear cleared on the desktop
 * window without reopening it — and vice-versa. (The overlay map is only hidden,
 * not unmounted, between opens, so a mount-time rehydrate alone never catches up.)
 *
 * Approach: localStorage stays the single source of truth — it already
 * round-trips the Sets via the persist replacer/reviver. When a window mutates
 * the store we broadcast a tiny "changed" PING (no payload); every other window
 * answers by re-reading localStorage via `persist.rehydrate()`. Two transports
 * cover both runtimes:
 *   - Overwolf    → overwolf.windows.sendMessage to the sibling UI windows.
 *   - Browser/dev → BroadcastChannel (same-origin tabs/windows).
 *
 * Per-window exception: the map VIEW (zoom + center) is deliberately NOT synced.
 * The desktop window and the in-game overlay map are different sizes and the
 * player looks at different spots, so a pan/zoom in one must not move the other's
 * camera. Both are persisted (for resume-where-you-left-off), so a rehydrate
 * would otherwise pull in the other window's view — we snapshot ours and put it
 * back. Everything else (found markers, bookmarks, custom pins, filters,
 * game/layer…) does sync.
 *
 * Loop guard: `applyingRemote` is held while a rehydrate runs, so the store
 * change it triggers doesn't echo a ping back out (which would ping-pong).
 *
 * Concurrency: this is last-write-wins. If two windows mutate in the SAME tick
 * the later localStorage write wins and the earlier change is dropped — fine for
 * a single user who is only ever interacting with one window at a time.
 */

const SYNC_MESSAGE_ID = "er-atlas:map-store-sync";
const BROADCAST_CHANNEL_NAME = "er-atlas:map-store-sync";

// The sibling windows that actually run the map store. The collapsed `overlay`
// circle widget has no map UI and `background` has no store, so neither needs a
// ping (and sending to a closed/irrelevant window is a silent no-op anyway).
const PEER_WINDOWS = ["main", "overlay_map"] as const;

let applyingRemote = false;
let started = false;
let broadcastPing: () => void = () => {};

/**
 * Re-read the shared localStorage into THIS window's store. Held behind
 * `applyingRemote` so the store update it causes is recognised as remote and
 * doesn't echo a ping back out. localStorage is synchronous, but persist's
 * rehydrate awaits getItem (so the actual `set` lands a microtask later) — the
 * guard is cleared in `finally`, i.e. only after that set has run.
 */
const rehydrateFromStorage = (): void => {
  // Snapshot OUR view first: rehydrate replaces zoom/center with the other
  // window's, so we restore ours afterwards to keep the camera per-window.
  const { zoom, center } = useMapStore.getState();
  applyingRemote = true;
  void Promise.resolve(useMapStore.persist.rehydrate())
    .then(() => {
      const s = useMapStore.getState();
      if (s.zoom !== zoom || s.center !== center) {
        useMapStore.setState({ zoom, center });
      }
    })
    .finally(() => {
      applyingRemote = false;
    });
};

/**
 * True when the only fields that changed between two states are the per-window
 * view (zoom/center). Those are deliberately NOT synced (see header), yet
 * `ViewSync` writes them to the store on every pan/zoom settle — so without this
 * guard every camera move would ping the peer and make it run a full localStorage
 * rehydrate. At in-game framerate that flooded the desktop window with rehydrates
 * on every overlay pan. Store actions swap object/Set references on real changes,
 * so an identity comparison of every non-view, non-function field is enough.
 */
const onlyViewChanged = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean => {
  if (a.zoom === b.zoom && a.center === b.center) return false; // view didn't move → not a view-only change
  for (const k of Object.keys(a)) {
    if (k === "zoom" || k === "center") continue;
    if (typeof a[k] === "function") continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
};

/** A local store change → tell the other windows to re-read (unless this change
 * IS the result of us applying a remote one, or was only a per-window camera move). */
const handleLocalChange = (state: unknown, prevState: unknown): void => {
  if (applyingRemote) return;
  if (
    onlyViewChanged(
      state as Record<string, unknown>,
      prevState as Record<string, unknown>,
    )
  )
    return;
  broadcastPing();
};

const startOverwolfTransport = (currentWindowName: string | null): void => {
  overwolf.windows.onMessageReceived.addListener((message: { id: string }) => {
    if (message?.id === SYNC_MESSAGE_ID) rehydrateFromStorage();
  });

  broadcastPing = () => {
    for (const target of PEER_WINDOWS) {
      if (target === currentWindowName) continue; // don't ping ourselves
      overwolf.windows.sendMessage(target, SYNC_MESSAGE_ID, {}, () => {});
    }
  };
};

const startBroadcastChannelTransport = (): void => {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  // postMessage only reaches OTHER contexts, so no self-exclusion is needed.
  channel.onmessage = () => rehydrateFromStorage();
  broadcastPing = () => channel.postMessage(1);
};

/**
 * Wire up live sync for the current window. Idempotent (safe under React
 * StrictMode's double-invoke and repeat calls) — the first call wins and
 * subscribes the store exactly once for the window's lifetime.
 *
 * Only the windows that render the map (`main`, `overlay_map`) should call this.
 */
export const startCrossWindowSync = (currentWindowName: string | null): void => {
  if (started) return;
  started = true;

  if (isOverwolf()) startOverwolfTransport(currentWindowName);
  else startBroadcastChannelTransport();

  useMapStore.subscribe(handleLocalChange);
};
