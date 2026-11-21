import { useEffect, useState } from "react";
import { resolvePeakDirectory } from "../../overwolf/tracking-installer";

// Reads the telemetry files written by the position-bridge mod
// (tools/position-bridge). The app only ever reads these files.

export interface LiveTeammate {
  actorNr: number;
  name: string;
  isLocal: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  dead: boolean;
  passedOut: boolean;
  ghost: boolean;
}

export interface LiveSelfStatus {
  segment: string;
  stamina: number;
  extraStamina: number;
  afflictions: Record<string, number>;
}

export interface LiveCampfire {
  x: number;
  z: number;
  state: string;
  advanceTo: string;
}

export interface LiveState {
  payloadVersion: number;
  updatedAt: number;
  sceneName: string;
  disabled: string[];
  players: LiveTeammate[];
  campfires: LiveCampfire[];
  self: LiveSelfStatus | null;
}

export interface LiveInventoryEntry {
  slot: number;
  itemId: number;
  backpack: boolean;
}

// The map glides pins between samples with a 300 ms linear transition, so the
// poll cadence must stay below that for the motion to look continuous.
const POLL_INTERVAL_MS = 200;
const INVENTORY_POLL_INTERVAL_MS = 1_000;
const STALE_AFTER_MS = 3_000;
// The mod refreshes the inventory file at least every 15 s (heartbeat), so
// anything older than a minute means the session ended.
const INVENTORY_STALE_AFTER_MS = 60_000;
const PLUGIN_DIRECTORY = "BepInEx\\plugins\\PeakMap";

const readJsonFile = <T,>(path: string): Promise<T | null> =>
  new Promise((resolve) => {
    overwolf.io.readFileContents(path, "UTF8" as overwolf.io.enums.eEncoding, (result) => {
      if (!result.success || !result.content) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(result.content) as T);
      } catch {
        resolve(null);
      }
    });
  });

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sanitizePlayers = (players: unknown): LiveTeammate[] => {
  if (!Array.isArray(players)) return [];
  return players.filter(
    (player): player is LiveTeammate =>
      typeof player === "object"
      && player !== null
      && isFiniteNumber((player as LiveTeammate).x)
      && isFiniteNumber((player as LiveTeammate).y)
      && isFiniteNumber((player as LiveTeammate).z)
      && isFiniteNumber((player as LiveTeammate).heading)
      && typeof (player as LiveTeammate).name === "string",
  );
};

const sanitizeCampfires = (campfires: unknown): LiveCampfire[] => {
  if (!Array.isArray(campfires)) return [];
  return campfires.filter(
    (campfire): campfire is LiveCampfire =>
      typeof campfire === "object"
      && campfire !== null
      && isFiniteNumber((campfire as LiveCampfire).x)
      && isFiniteNumber((campfire as LiveCampfire).z)
      && typeof (campfire as LiveCampfire).state === "string",
  );
};

interface LegacyPosition {
  x: number;
  y: number;
  z: number;
  sceneName: string;
  cameraHeading: number;
  dead: boolean;
  passedOut: boolean;
  updatedAt: number;
}

// Older mod builds only write player-position.json; adapt it so every
// consumer sees the same LiveState shape.
const adaptLegacy = (legacy: LegacyPosition): LiveState | null => {
  if (![legacy.x, legacy.y, legacy.z, legacy.updatedAt].every(Number.isFinite)) return null;
  return {
    payloadVersion: 1,
    updatedAt: legacy.updatedAt,
    sceneName: typeof legacy.sceneName === "string" ? legacy.sceneName : "",
    disabled: ["players", "self", "inventory"],
    players: [
      {
        actorNr: 1,
        name: "",
        isLocal: true,
        x: legacy.x,
        y: legacy.y,
        z: legacy.z,
        heading: Number.isFinite(legacy.cameraHeading) ? legacy.cameraHeading : 0,
        dead: Boolean(legacy.dead),
        passedOut: Boolean(legacy.passedOut),
        ghost: false,
      },
    ],
    campfires: [],
    self: null,
  };
};

const readLiveState = async (gameDirectory: string): Promise<LiveState | null> => {
  const raw = await readJsonFile<Partial<LiveState>>(
    `${gameDirectory}\\${PLUGIN_DIRECTORY}\\live-state.json`,
  );
  if (raw && isFiniteNumber(raw.updatedAt)) {
    return {
      payloadVersion: isFiniteNumber(raw.payloadVersion) ? raw.payloadVersion : 2,
      updatedAt: raw.updatedAt,
      sceneName: typeof raw.sceneName === "string" ? raw.sceneName : "",
      disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [],
      players: sanitizePlayers(raw.players),
      campfires: sanitizeCampfires(raw.campfires),
      self: raw.self && typeof raw.self === "object" ? (raw.self as LiveSelfStatus) : null,
    };
  }
  const legacy = await readJsonFile<LegacyPosition>(
    `${gameDirectory}\\${PLUGIN_DIRECTORY}\\player-position.json`,
  );
  return legacy ? adaptLegacy(legacy) : null;
};

// One-shot fresh snapshot, shared by the polling hook and the background
// expedition recorder. Null when the mod is absent, the sample is stale, or
// the app runs outside Overwolf.
export const readLiveStateSnapshot = async (): Promise<LiveState | null> => {
  if (typeof overwolf === "undefined") return null;
  const gameDirectory = await resolvePeakDirectory();
  if (!gameDirectory) return null;
  const sample = await readLiveState(gameDirectory);
  return sample && Date.now() - sample.updatedAt < STALE_AFTER_MS ? sample : null;
};

// Polls the bridge files while the game runs and exposes the latest fresh
// snapshot.
export const useLiveState = (enabled: boolean): LiveState | null => {
  const [state, setState] = useState<LiveState | null>(null);

  useEffect(() => {
    if (!enabled || typeof overwolf === "undefined") return undefined;

    let cancelled = false;
    let reading = false;

    const poll = async (): Promise<void> => {
      if (reading) return;
      reading = true;
      try {
        const sample = await readLiveStateSnapshot();
        if (cancelled) return;
        setState(sample);
      } finally {
        reading = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  // While disabled the last sample stays in state but is never exposed; the
  // first poll after re-enabling replaces or clears it via the staleness check.
  return enabled ? state : null;
};

export const localPlayerOf = (state: LiveState | null): LiveTeammate | null =>
  state?.players.find((player) => player.isLocal) ?? null;

// `Character.RPCA_Die` warps a corpse to `Character.DeathPos()` — (0, 5000,
// -5000) — and leaves it there until the scout is revived or the run ends.
// That is limbo, not a location: it projects far off the bottom of every map,
// so no consumer may read it as a position.
const DEATH_WARP_TOLERANCE = 50;

export const isDeathWarp = (position: { x: number; y: number; z: number }): boolean =>
  Math.abs(position.x) < DEATH_WARP_TOLERANCE
  && Math.abs(position.y - 5_000) < DEATH_WARP_TOLERANCE
  && Math.abs(position.z + 5_000) < DEATH_WARP_TOLERANCE;

export const useLiveInventory = (enabled: boolean): LiveInventoryEntry[] | null => {
  const [items, setItems] = useState<LiveInventoryEntry[] | null>(null);

  useEffect(() => {
    if (!enabled || typeof overwolf === "undefined") return undefined;

    let cancelled = false;
    let gameDirectory: string | null = null;

    const poll = async (): Promise<void> => {
      gameDirectory ??= await resolvePeakDirectory();
      if (!gameDirectory || cancelled) return;
      const raw = await readJsonFile<{ updatedAt: number; items: LiveInventoryEntry[] }>(
        `${gameDirectory}\\${PLUGIN_DIRECTORY}\\player-inventory.json`,
      );
      if (cancelled) return;
      const valid = raw
        && isFiniteNumber(raw.updatedAt)
        && Date.now() - raw.updatedAt < INVENTORY_STALE_AFTER_MS
        && Array.isArray(raw.items)
        && raw.items.every((entry) => isFiniteNumber(entry.itemId));
      setItems(valid ? raw.items : null);
    };

    void poll();
    const timer = window.setInterval(() => void poll(), INVENTORY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return enabled ? items : null;
};

export const readLiveInventorySnapshot = async (): Promise<LiveInventoryEntry[] | null> => {
  if (typeof overwolf === "undefined") return null;
  const gameDirectory = await resolvePeakDirectory();
  if (!gameDirectory) return null;
  const raw = await readJsonFile<{ updatedAt: number; items: LiveInventoryEntry[] }>(
    `${gameDirectory}\\${PLUGIN_DIRECTORY}\\player-inventory.json`,
  );
  const valid = raw
    && isFiniteNumber(raw.updatedAt)
    && Date.now() - raw.updatedAt < INVENTORY_STALE_AFTER_MS
    && Array.isArray(raw.items)
    && raw.items.every((entry) => isFiniteNumber(entry.itemId));
  return valid ? raw.items : null;
};

export interface MapProjection {
  worldXMin: number;
  worldXMax: number;
  worldZMin: number;
  worldZMax: number;
  mapXMin: number;
  mapXMax: number;
  mapYMin: number;
  mapYMax: number;
}

// Converts a world-space position into map percentage coordinates using the
// same projection the marker extractor bakes into the catalog. North (+Z) is
// the top of the rendered map, so map Y grows as world Z shrinks.
export const projectToMap = (
  projection: MapProjection,
  worldX: number,
  worldZ: number,
): { x: number; y: number } => ({
  x:
    projection.mapXMin
    + ((worldX - projection.worldXMin) / (projection.worldXMax - projection.worldXMin))
      * (projection.mapXMax - projection.mapXMin),
  y:
    projection.mapYMin
    + ((projection.worldZMax - worldZ) / (projection.worldZMax - projection.worldZMin))
      * (projection.mapYMax - projection.mapYMin),
});

// Inverse of projectToMap, used for world-space distance math against
// catalog markers (which only store map percentages).
export const mapToWorld = (
  projection: MapProjection,
  mapX: number,
  mapY: number,
): { x: number; z: number } => ({
  x:
    projection.worldXMin
    + ((mapX - projection.mapXMin) / (projection.mapXMax - projection.mapXMin))
      * (projection.worldXMax - projection.worldXMin),
  z:
    projection.worldZMax
    - ((mapY - projection.mapYMin) / (projection.mapYMax - projection.mapYMin))
      * (projection.worldZMax - projection.worldZMin),
});
