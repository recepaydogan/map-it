/**
 * Cloud save — the Supabase layer over supabase/user-data.sql.
 *
 * This module is the DATA half of syncing: what counts as progress, how to
 * compare two copies of it, how to merge them, and the two requests that move it
 * over the wire. The engine that decides WHEN to do any of that (and owns the
 * store) is store/cloud-sync.ts.
 *
 * What syncs is what the PLAYER made — found markers, bookmarks, favourited
 * Nightreign patterns, custom pins, the character build. What does not is
 * anything describing the screen: zoom, centre, category filters, clustering,
 * the "you are here" pin. Those belong to a device, not an account (and the
 * desktop window and the in-game overlay deliberately keep separate cameras).
 *
 * Merging is only ever needed when two devices edited from the same revision.
 * Then the rule is UNION for everything set-shaped: a marker one device cleared
 * and the other did not stays cleared, because losing an evening of progress is
 * a far worse failure than a stale tick the player can undo in one click. Straight
 * saves — the overwhelmingly common case — go through untouched, deletes and all;
 * see the `rev` discussion in user-data.sql for why that is safe.
 */

import { getSupabaseClient } from "../../data/supabase-client";
import type { CustomMarker } from "../../data/custom-markers";
import type { Game, MapLayer } from "../../data/types";

/** Bumped only if the payload shape changes incompatibly. */
const PAYLOAD_VERSION = 1;

/** The player-owned slice of the map store, in wire form (Sets as arrays). */
export interface SyncedProgress {
  found: string[];
  bookmarks: string[];
  favoritePatterns: string[];
  customMarkers: CustomMarker[];
  playerStats: Record<string, number>;
}

/** A copy of the save plus the revision it is. */
export interface CloudSave {
  rev: number;
  progress: SyncedProgress;
}

export type SyncResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EMPTY_PROGRESS: SyncedProgress = {
  found: [],
  bookmarks: [],
  favoritePatterns: [],
  customMarkers: [],
  playerStats: {},
};

/** False when the build has no Supabase credentials — then nothing syncs and the
 *  app stays exactly as it was: local-only, and working. */
export const isSyncAvailable = (): boolean => getSupabaseClient() !== null;

/* ── Shape guards ──────────────────────────────────────────────────────────── */
// The blob comes back from a server as `unknown` and is written straight into
// the store, so it is validated like any other foreign input. Anything that
// doesn't look right is dropped rather than allowed to crash a render.

const GAMES = new Set<string>(["elden-ring", "nightreign"]);
const LAYERS = new Set<string>([
  "overworld",
  "underground",
  "dlc-realm-of-shadow",
  "limveld",
]);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const asPixel = (value: unknown): { x: number; y: number } | null => {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && Number.isFinite(x) &&
    typeof y === "number" && Number.isFinite(y)
    ? { x, y }
    : null;
};

const asCustomMarker = (value: unknown): CustomMarker | null => {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  const pixel = asPixel(m.pixel);
  if (
    typeof m.id !== "string" ||
    typeof m.name !== "string" ||
    typeof m.category !== "string" ||
    typeof m.game !== "string" || !GAMES.has(m.game) ||
    typeof m.layer !== "string" || !LAYERS.has(m.layer) ||
    !pixel
  ) {
    return null;
  }
  return {
    id: m.id,
    game: m.game as Game,
    layer: m.layer as MapLayer,
    category: m.category,
    name: m.name,
    description: typeof m.description === "string" ? m.description : undefined,
    pixel,
    icon: typeof m.icon === "string" ? m.icon : undefined,
    createdAt: typeof m.createdAt === "number" ? m.createdAt : 0,
  };
};

const asPlayerStats = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [stat, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[stat] = Math.min(99, Math.max(1, Math.round(raw)));
    }
  }
  return out;
};

/** Read a stored blob into a progress object, keeping only what is well-formed. */
export const parseProgress = (value: unknown): SyncedProgress => {
  if (!value || typeof value !== "object") return { ...EMPTY_PROGRESS };
  const raw = value as Record<string, unknown>;
  return {
    found: asStringArray(raw.found),
    bookmarks: asStringArray(raw.bookmarks),
    favoritePatterns: asStringArray(raw.favoritePatterns),
    customMarkers: Array.isArray(raw.customMarkers)
      ? raw.customMarkers
          .map(asCustomMarker)
          .filter((marker): marker is CustomMarker => marker !== null)
      : [],
    playerStats: asPlayerStats(raw.playerStats),
  };
};

/* ── Comparison ────────────────────────────────────────────────────────────── */

/**
 * A stable serialisation: id lists sorted, custom markers ordered by id, object
 * keys emitted in a fixed order. Two copies of the same progress must produce the
 * same string no matter what order the user clicked things in — otherwise every
 * comparison below reports a difference and the app pushes on a loop.
 */
export const canonicalise = (progress: SyncedProgress): string =>
  JSON.stringify({
    v: PAYLOAD_VERSION,
    found: [...progress.found].sort(),
    bookmarks: [...progress.bookmarks].sort(),
    favoritePatterns: [...progress.favoritePatterns].sort(),
    customMarkers: [...progress.customMarkers]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((m) => ({
        id: m.id,
        game: m.game,
        layer: m.layer,
        category: m.category,
        name: m.name,
        description: m.description ?? null,
        pixel: { x: m.pixel.x, y: m.pixel.y },
        icon: m.icon ?? null,
        createdAt: m.createdAt,
      })),
    playerStats: Object.fromEntries(
      Object.entries(progress.playerStats).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
  });

export const sameProgress = (a: SyncedProgress, b: SyncedProgress): boolean =>
  canonicalise(a) === canonicalise(b);

/** True when nothing has been tracked yet — a fresh install, or an account whose
 *  cloud save is empty. Used to decide that the other side simply wins. */
export const isEmptyProgress = (progress: SyncedProgress): boolean =>
  progress.found.length === 0 &&
  progress.bookmarks.length === 0 &&
  progress.favoritePatterns.length === 0 &&
  progress.customMarkers.length === 0 &&
  Object.keys(progress.playerStats).length === 0;

/* ── Merge ─────────────────────────────────────────────────────────────────── */

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

/**
 * Reconcile two copies that were both edited from the same starting point.
 *
 * Sets union. Custom markers merge by id, and where both sides have the same id
 * the LOCAL one wins — it is the copy the user is looking at right now, so a
 * rename that hasn't reached the cloud yet is not undone by the merge. The build
 * is not set-shaped, so it takes local unless local is still the untouched
 * default, in which case the remote build is the only real one.
 *
 * The cost of union is that a deletion made on one device while another device
 * was also editing comes back. That is the deliberate trade: this path only runs
 * on a genuine two-device collision, and re-clearing one marker is a click,
 * whereas the alternative silently deletes progress the player earned.
 */
export const mergeProgress = (
  local: SyncedProgress,
  remote: SyncedProgress,
): SyncedProgress => {
  const byId = new Map<string, CustomMarker>();
  for (const marker of remote.customMarkers) byId.set(marker.id, marker);
  for (const marker of local.customMarkers) byId.set(marker.id, marker);

  return {
    found: union(local.found, remote.found),
    bookmarks: union(local.bookmarks, remote.bookmarks),
    favoritePatterns: union(local.favoritePatterns, remote.favoritePatterns),
    customMarkers: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt),
    playerStats:
      Object.keys(local.playerStats).length > 0
        ? local.playerStats
        : remote.playerStats,
  };
};

/* ── Requests ──────────────────────────────────────────────────────────────── */

interface PushRow {
  rev: number | string;
  state: unknown;
}

const asRev = (value: number | string): number =>
  typeof value === "number" ? value : Number.parseInt(value, 10) || 0;

const failed = (raw: string): SyncResult<never> => {
  // The status line the user sees is one short sentence; keep the server's own
  // words in the console or a ceiling and a dropped connection look identical.
  console.warn("[sync] request failed:", raw);
  return { ok: false, error: raw.replace(/^sync:\s*/, "") };
};

/** This account's stored save, or null when it has never synced. */
export const pullProgress = async (): Promise<SyncResult<CloudSave | null>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");

  // No `.eq("user_id", …)`: the RLS policy is `auth.uid() = user_id`, so this
  // select can only ever see the caller's own row (or none).
  const { data, error } = await client
    .from("user")
    .select("rev, state")
    .maybeSingle();

  if (error) return failed(error.message);
  if (!data) return { ok: true, value: null };
  const row = data as PushRow;
  return { ok: true, value: { rev: asRev(row.rev), progress: parseProgress(row.state) } };
};

/**
 * Save, replacing revision `expectedRev` (null = "I have never synced").
 *
 * The row that comes back is whatever is authoritative NOW — which is not always
 * what was just sent. A returned rev that isn't `expectedRev + 1` means another
 * device got there first and this push was refused; the caller merges with the
 * returned progress and pushes again. That is not an error path, it is the
 * ordinary two-device path, so it is reported as a successful result.
 */
export const pushProgress = async (
  expectedRev: number | null,
  progress: SyncedProgress,
): Promise<SyncResult<CloudSave>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");

  const { data, error } = await client.rpc("user_save", {
    p_expected_rev: expectedRev,
    p_state: {
      v: PAYLOAD_VERSION,
      found: progress.found,
      bookmarks: progress.bookmarks,
      favoritePatterns: progress.favoritePatterns,
      customMarkers: progress.customMarkers,
      playerStats: progress.playerStats,
    },
  });

  if (error) return failed(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as PushRow | undefined;
  if (!row) return failed("sync: the server returned nothing");
  return { ok: true, value: { rev: asRev(row.rev), progress: parseProgress(row.state) } };
};
