import { assertWorldRecord } from "./world-validation.ts";
import { emptyPersonalState, generationKey, type WorldLibrarySnapshot, type WorldRecord } from "./world-types.ts";

export interface WorldDeviceState {
  id: string; schemaVersion: 1; selectionId: string | null; worlds: WorldRecord[];
}

export const accountDeviceStateKey = (userId: string) => {
  if (!userId.trim() || userId.length > 512) throw new Error("Invalid device-state account.");
  return `account-device-state:${userId}`;
};

/** Stored in a private metadata entry, never exposed by the signed-out library. */
export const captureWorldDeviceState = (userId: string, snapshot: Pick<WorldLibrarySnapshot, "selection" | "worlds">): WorldDeviceState => ({
  id: accountDeviceStateKey(userId), schemaVersion: 1, selectionId: snapshot.selection.worldId,
  worlds: snapshot.worlds.map(world => ({ ...world, personal: { ...emptyPersonalState(),
    views: world.personal.views, ...(world.personal.resume ? { resume: world.personal.resume } : {}) } })),
});

export const parseWorldDeviceState = (value: unknown, userId: string): WorldDeviceState | null => {
  if (value === undefined) return null;
  if (!value || typeof value !== "object") throw new Error("Invalid account device state.");
  const state = value as WorldDeviceState;
  if (state.id !== accountDeviceStateKey(userId) || state.schemaVersion !== 1 || !Array.isArray(state.worlds)
    || !(state.selectionId === null || typeof state.selectionId === "string")) throw new Error("Invalid account device state.");
  state.worlds.forEach(assertWorldRecord);
  return state;
};

export const restoreWorldDeviceState = (world: WorldRecord, deviceWorld?: WorldRecord): WorldRecord => {
  if (!deviceWorld || world.id !== deviceWorld.id || generationKey(world) !== generationKey(deviceWorld)) return world;
  const restored = { ...world, association: deviceWorld.association,
    personal: { ...world.personal, views: deviceWorld.personal.views,
      ...(deviceWorld.personal.resume ? { resume: deviceWorld.personal.resume } : {}) } };
  assertWorldRecord(restored);
  return restored;
};
