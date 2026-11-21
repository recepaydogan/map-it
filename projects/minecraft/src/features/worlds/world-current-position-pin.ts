import { GAME_TELEMETRY } from "../../game-config.ts";
import { createRuntimeId } from "../../lib/runtime-id.ts";
import type { GameSession } from "../game-session/session-types.ts";
import { WorldBindingChangedError, type WorldRepository } from "./world-repository.ts";
import { resolveBoundSession } from "./world-session-binding.ts";
import type { TrackedDestination, WorldPin } from "./world-types.ts";
import { putWorldPin, setTrackedDestination, TrackedDestinationLimitError } from "./world-personal-actions.ts";

export type CurrentPositionPinResult =
  | Readonly<{ status: "saved"; x: number; y: number; z: number; dimension: string }>
  | Readonly<{ status: "unavailable" | "limit" }>;

export const createCurrentPositionPinRecords = ({ id, name, dimension, x, y, z }: {
  id: string; name: string; dimension: string; x: number; y: number; z: number;
}): Readonly<{ pin: Readonly<WorldPin>; destination: Readonly<TrackedDestination> }> => {
  if (![id, name, dimension].every(value => typeof value === "string" && value.trim() && value.length <= 1024)
    || ![x, y, z].every(value => Number.isFinite(value) && Math.abs(value) <= GAME_TELEMETRY.coordinateLimit))
    throw new Error("Invalid current-position pin");
  const pin = Object.freeze({ id, name: name.trim(), dimension, x, y, z, icon: "pin", color: "amber", group: "current-position", note: "" });
  const destination = Object.freeze({ id: JSON.stringify(["pin", id]), dimension, label: pin.name, x, y, z,
    pointId: id, kind: "player-pin" as const });
  return Object.freeze({ pin, destination });
};

/** Saves only a fresh, explicitly bound session coordinate; binding is checked again inside the write transaction. */
export const saveCurrentPositionPin = async ({ repository, session, name, now = Date.now, newId = createRuntimeId,
  currentSession = () => session }: {
  repository: Pick<WorldRepository, "snapshot" | "updateBoundPersonal">; session: GameSession | null; name: string;
  now?: () => number; newId?: () => string;
  currentSession?: () => GameSession | null;
}): Promise<CurrentPositionPinResult> => {
  const library = await repository.snapshot(), binding = library.binding;
  const world = binding ? library.worlds.find(item => item.id === binding.worldId) ?? null : null;
  const resolved = resolveBoundSession(world, session, binding, now(), GAME_TELEMETRY.staleAfterMs);
  const position = resolved.status === "live" ? resolved.session.position : null;
  const dimension = resolved.status === "live" ? resolved.session.dimension : null;
  if (!world || !binding || !position || !dimension) return Object.freeze({ status: "unavailable" });
  const records = createCurrentPositionPinRecords({ id: `player-pin-${newId()}`, name, dimension,
    x: position.x, y: position.y, z: position.z });
  try {
    await repository.updateBoundPersonal(binding, personal =>
      setTrackedDestination(putWorldPin(personal, records.pin), records.destination, true), () => {
        const current = resolveBoundSession(world, currentSession(), binding, now(), GAME_TELEMETRY.staleAfterMs);
        return current.status === "live" && current.session.dimension === dimension;
      });
  } catch (error) {
    if (error instanceof TrackedDestinationLimitError) return Object.freeze({ status: "limit" });
    if (error instanceof WorldBindingChangedError) return Object.freeze({ status: "unavailable" });
    throw error;
  }
  return Object.freeze({ status: "saved", x: position.x, y: position.y, z: position.z, dimension });
};
