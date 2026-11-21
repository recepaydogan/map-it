import {
  gameWorldPositionToLivePosition,
  isTrackableGameWorldPosition,
  resolvePrimaryGamePlayerId,
} from "../../game-config";
import {
  clearLivePartyPosition,
  publishLivePartyPosition,
} from "../live-position/live-party-position-store";
import {
  clearLivePosition,
  publishLivePosition,
} from "../live-position/live-position-store";
import type { LivePosition } from "../live-position/live-position-types";
import type { GameWorldPosition } from "./game-event-types";

const facingFromMovement = (
  current: ReturnType<typeof gameWorldPositionToLivePosition>,
  previous?: ReturnType<typeof gameWorldPositionToLivePosition>,
) => {
  if (!previous) return { dx: 0, dy: 0 };
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const length = Math.hypot(dx, dy);
  return length > 0.000_001 ? { dx: dx / length, dy: dy / length } : { dx: 0, dy: 0 };
};

/** Bridges raw GEP world samples into the generic smooth map-position feed. */
export const createGameEventLivePositionPublisher = () => {
  let previousPlayers: Record<string, GameWorldPosition> = {};
  let previousPrimaryPlayerId: string | null = null;

  const publish = (
    players: Record<string, GameWorldPosition>,
    camera: GameWorldPosition | null,
    sequence: number,
    receivedAt: number,
  ) => {
    const validPlayers = Object.fromEntries(
      Object.entries(players).filter(([, position]) => isTrackableGameWorldPosition(position)),
    );
    if (Object.keys(validPlayers).length === 0) return;
    const primaryPlayerId = previousPrimaryPlayerId && validPlayers[previousPrimaryPlayerId]
      ? previousPrimaryPlayerId
      : resolvePrimaryGamePlayerId(validPlayers, camera);
    previousPrimaryPlayerId = primaryPlayerId;
    const livePlayers = Object.fromEntries(Object.entries(validPlayers).map(([id, position]) => {
      const plane = gameWorldPositionToLivePosition(position);
      const previous = previousPlayers[id]
        ? gameWorldPositionToLivePosition(previousPlayers[id]!)
        : undefined;
      const facing = facingFromMovement(plane, previous);
      const livePosition: LivePosition = {
        version: 1,
        sequence,
        x: plane.x,
        y: plane.y,
        z: plane.z,
        ...facing,
        updatedAt: receivedAt,
        receivedAt,
      };
      return [id, livePosition];
    }));
    previousPlayers = { ...previousPlayers, ...validPlayers };

    publishLivePartyPosition({
      version: 1,
      sequence,
      primaryPlayerId,
      players: livePlayers,
      receivedAt,
    });
    if (primaryPlayerId && livePlayers[primaryPlayerId]) {
      publishLivePosition(livePlayers[primaryPlayerId]);
    }
  };

  const clear = () => {
    previousPlayers = {};
    previousPrimaryPlayerId = null;
    clearLivePartyPosition();
    clearLivePosition();
  };

  return { publish, clear };
};
