import { create } from "zustand";

/**
 * Contextual keyboard coach-marks. Not a tour: each hint fires at the exact
 * moment the shortcut it teaches becomes useful (a panel opens → Esc closes it;
 * the panel goes a level deeper → Esc steps back; the third marker in a row →
 * W A S D hops between them), shows briefly, and retires for good the instant
 * the player actually uses the key.
 *
 * Durable state is a single counter per hint in localStorage, so a hint is shown
 * exactly once across all sessions and never again once learned.
 */

export type KeyHintId = "escClose" | "escBack" | "wasdNav";

const STORAGE_KEY = "elden-ring-atlas:key-hints-v1";

/** Times a hint may appear before it retires on its own (an unused nudge that
 * keeps coming back stops being a nudge and starts being noise). One look is
 * the whole budget: it shows once, ever, and then never again. */
const MAX_SHOWS = 1;

/** Retired marker — `learn` writes this so a learned hint can never re-arm. */
const LEARNED = 99;

/** How long each hint stays on screen. The longer copy gets the longer read.
 * Exported so the toast's countdown bar drains in exact step with the timer. */
export const DURATION_MS: Record<KeyHintId, number> = {
  escClose: 9_000,
  escBack: 10_000,
  wasdNav: 12_000,
};

/** A higher-priority hint takes the screen from a lower one immediately: once
 * the player has drilled a level deeper, "Esc steps back" is the truth and
 * "Esc closes the panel" is stale. Equal priorities queue instead. */
const PRIORITY: Record<KeyHintId, number> = {
  escClose: 0,
  wasdNav: 0,
  escBack: 1,
};

/** Gap before a queued hint takes over, so two never hard-cut into each other. */
const ADVANCE_DELAY_MS = 700;

/** How long the "got it" confirmation lingers after the key is pressed. */
const LEARNED_FLASH_MS = 900;

type SeenCounts = Partial<Record<KeyHintId, number>>;

/** TEST MODE — leave `false` to ship; flip to `true` only to watch the hints
 * fire again while working on them.
 *
 * While true the "already seen / already learned" memory lives in RAM instead of
 * localStorage, so every launch re-arms all three lessons. Everything else
 * behaves exactly as it does in production: a hint still shows at most once per
 * armed memory and still retires the moment you use the key. */
const REARM_EVERY_LAUNCH = false;

let sessionSeen: SeenCounts = {};

const readSeen = (): SeenCounts => {
  if (REARM_EVERY_LAUNCH) return sessionSeen;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenCounts) : {};
  } catch {
    return {};
  }
};

const writeSeen = (seen: SeenCounts): void => {
  if (REARM_EVERY_LAUNCH) {
    sessionSeen = seen;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* private mode / disabled storage — hints just re-arm next launch */
  }
};

const countOf = (id: KeyHintId): number => readSeen()[id] ?? 0;

const bumpCount = (id: KeyHintId): void => {
  const seen = readSeen();
  writeSeen({ ...seen, [id]: (seen[id] ?? 0) + 1 });
};

/**
 * Touch-only device? Every hint here teaches a KEY — Esc closes, Esc steps back,
 * W A S D hops — so on a phone or tablet they are advice about hardware the
 * reader doesn't have, occupying the bottom of the screen where the detail sheet
 * lives. `(hover: none) and (pointer: coarse)` is the touch-device query rather
 * than a width one: an iPad in landscape is 1024px wide and still has no Esc.
 * Overwolf's CEF reports a fine pointer with hover, so the desktop app is
 * untouched.
 */
const isTouchOnly = (): boolean =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/** True while this hint still has shows left (and hasn't been learned). */
export const isKeyHintEligible = (id: KeyHintId): boolean =>
  !isTouchOnly() && countOf(id) < MAX_SHOWS;

interface KeyHintStore {
  /** The hint on screen right now, or null. */
  current: KeyHintId | null;
  /** Set while the confirmation flash plays, just after the player uses the key. */
  learned: boolean;
  /** Hints waiting for the screen (never more than a couple). */
  queue: KeyHintId[];
  /** Ask for a hint. No-ops when it's spent, already showing or already queued. */
  request: (id: KeyHintId) => void;
  /** Take a hint off screen (or out of the queue) without retiring it. */
  dismiss: (id?: KeyHintId) => void;
  /** Retire a hint for good — the player used the key, or waved it away. */
  learn: (id: KeyHintId) => void;
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;

export const useKeyHints = create<KeyHintStore>((set, get) => {
  const show = (id: KeyHintId) => {
    bumpCount(id);
    clearTimeout(hideTimer);
    set({ current: id, learned: false });
    hideTimer = setTimeout(() => get().dismiss(id), DURATION_MS[id]);
  };

  return {
    current: null,
    learned: false,
    queue: [],

    request: (id) => {
      if (!isKeyHintEligible(id)) return;
      const { current, queue } = get();
      if (current === id || queue.includes(id)) return;
      if (!current) {
        show(id);
        return;
      }
      if (PRIORITY[id] > PRIORITY[current]) {
        show(id); // supersede — the older hint is no longer the useful one
        return;
      }
      set({ queue: [...queue, id] });
    },

    dismiss: (id) => {
      const { current, queue } = get();
      if (id && id !== current) {
        // Context died while it was still waiting its turn — drop it silently.
        if (queue.includes(id)) set({ queue: queue.filter((q) => q !== id) });
        return;
      }
      if (!current) return;
      clearTimeout(hideTimer);
      set({ current: null, learned: false });
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => {
        const next = get().queue[0];
        if (!next || get().current) return;
        set({ queue: get().queue.slice(1) });
        if (isKeyHintEligible(next)) show(next);
      }, ADVANCE_DELAY_MS);
    },

    learn: (id) => {
      if (countOf(id) >= LEARNED) return;
      writeSeen({ ...readSeen(), [id]: LEARNED });
      const { current, queue } = get();
      if (queue.includes(id)) set({ queue: queue.filter((q) => q !== id) });
      if (current !== id) return;
      // Confirm on screen before leaving — the nudge should feel answered, not cut off.
      clearTimeout(hideTimer);
      set({ learned: true });
      hideTimer = setTimeout(() => get().dismiss(id), LEARNED_FLASH_MS);
    },
  };
});

/** Number of markers a player opens before W A S D is worth mentioning. */
export const WASD_HINT_AFTER_MARKERS = 3;
