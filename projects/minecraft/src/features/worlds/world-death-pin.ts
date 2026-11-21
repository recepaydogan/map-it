import { GAME_TELEMETRY } from "../../game-config.ts";
import { createRuntimeId } from "../../lib/runtime-id.ts";
import type { GameSession, SessionPosition } from "../game-session/session-types.ts";
import { putWorldPin } from "./world-personal-actions.ts";
import type { WorldRepository } from "./world-repository.ts";
import type { WorldPin } from "./world-types.ts";

export const isDeathSceneKey = (
  sceneKey: string | null,
  deathKeys: readonly string[] = GAME_TELEMETRY.deathSceneKeys,
): boolean => {
  if (!sceneKey || typeof sceneKey !== "string") return false;
  const trimmed = sceneKey.trim();
  return deathKeys.includes(trimmed) || trimmed.startsWith("deathScreen");
};

export const formatDeathDate = (timestamp: number, locale = "en"): string => {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(timestamp));
  }
};

export const isDeathPin = (pin: Pick<WorldPin, "id">): boolean => pin.id.startsWith("death-pin-");

export const countDeathPins = (pins: readonly WorldPin[]): number => pins.filter(isDeathPin).length;

export interface CreateDeathPinOptions {
  id: string;
  count: number;
  date: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export const createDeathPinRecords = ({
  id,
  count,
  date,
  dimension,
  x,
  y,
  z,
  t,
}: CreateDeathPinOptions): Readonly<{ pin: Readonly<WorldPin> }> => {
  if (![id, dimension].every(value => typeof value === "string" && value.trim() && value.length <= 1024)
    || ![x, y, z].every(value => Number.isFinite(value) && Math.abs(value) <= GAME_TELEMETRY.coordinateLimit)) {
    throw new Error("Invalid death pin coordinates or identity");
  }
  const name = t("worldDeathPin.name", { count, date });
  const pin: WorldPin = Object.freeze({
    id,
    name: name.trim(),
    dimension,
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
    icon: "danger",
    color: "red",
    group: "danger",
    note: "",
  });
  return Object.freeze({ pin });
};

export interface DeathPinObserverOptions {
  repository: Pick<WorldRepository, "snapshot" | "updateBoundPersonal">;
  t: (key: string, options?: Record<string, unknown>) => string;
  getLocale?: () => string;
  deathSceneKeys?: readonly string[];
  now?: () => number;
  newId?: () => string;
  debug?: (message: string, detail?: unknown) => void;
  onDeathPinSaved?: (pin: WorldPin) => void;
}

export const createDeathPinObserver = ({
  repository,
  t,
  getLocale = () => "en",
  deathSceneKeys = GAME_TELEMETRY.deathSceneKeys,
  now = Date.now,
  newId = createRuntimeId,
  debug = () => {},
  onDeathPinSaved,
}: DeathPinObserverOptions) => {
  let wasDeath = false;
  let lastPosition: SessionPosition | null = null;
  let lastDimension: string | null = null;

  const reset = () => {
    wasDeath = false;
    lastPosition = null;
    lastDimension = null;
  };

  const observe = async (session: GameSession): Promise<WorldPin | null> => {
    if (session.positionReady === false) { reset(); return null; }
    if (session.inWorld && session.position && session.dimension) {
      lastPosition = session.position;
      lastDimension = session.dimension;
    }

    if (!session.inWorld || !session.connected) {
      wasDeath = false;
      return null;
    }

    const isDeath = isDeathSceneKey(session.sceneKey, deathSceneKeys);

    if (isDeath && !wasDeath) {
      wasDeath = true;
      if (!lastPosition || !lastDimension) {
        debug("Death screen detected but position or dimension is unavailable");
        return null;
      }

      const library = await repository.snapshot();
      const binding = library.binding;
      if (!binding || binding.sessionId !== session.id || binding.sessionGeneration !== session.generation) {
        debug("Death screen detected but session is not actively bound to current world");
        return null;
      }

      const world = library.worlds.find(item => item.id === binding.worldId);
      if (!world) {
        debug("Bound world record not found");
        return null;
      }

      const count = countDeathPins(world.personal.pins) + 1;
      const locale = getLocale();
      const date = formatDeathDate(now(), locale);
      const id = `death-pin-${newId()}`;

      const { pin } = createDeathPinRecords({
        id,
        count,
        date,
        dimension: lastDimension,
        x: lastPosition.x,
        y: lastPosition.y,
        z: lastPosition.z,
        t,
      });

      try {
        await repository.updateBoundPersonal(binding, personal => putWorldPin(personal, pin));
        debug("Death pin saved successfully", { id: pin.id, name: pin.name, x: pin.x, y: pin.y, z: pin.z });
        onDeathPinSaved?.(pin);
        return pin;
      } catch (error) {
        debug("Failed to save death pin to repository", error instanceof Error ? error.message : String(error));
        return null;
      }
    } else if (!isDeath && wasDeath) {
      wasDeath = false;
    }

    return null;
  };

  return { observe, reset };
};
