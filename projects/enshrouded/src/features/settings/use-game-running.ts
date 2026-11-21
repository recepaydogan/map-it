import { useEffect, useState } from "react";
import { isTargetGame } from "../../game-config";

/**
 * Whether the targeted game is currently running, observed from a UI window.
 * Game events fire reliably in the desktop `main` window (the same place
 * game-launch-monitor-switch listens), so we can track running state here
 * without a background round-trip.
 *
 * Always `false` outside Overwolf (the plain-web build has no game feed), so
 * callers can branch on it freely. The id + title checks match the background
 * controller's, so we never react to any other game.
 */
export interface RunningGame {
  running: boolean;
  /** The running game's reported title, or null when nothing is running.
   *  Analytics stamps this on every event. */
  title: string | null;
}

const NOT_RUNNING: RunningGame = { running: false, title: null };

/** The running game session, title included. */
export const useRunningGame = (): RunningGame => {
  const [game, setGame] = useState<RunningGame>(NOT_RUNNING);

  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    // onGameInfoUpdated only fires on CHANGES, so seed from a direct poll — this
    // covers the app opening while the game is already running (the auto-open case).
    overwolf.games?.getRunningGameInfo?.((info) => {
      if (info?.isRunning && isTargetGame(info)) {
        setGame({ running: true, title: info.title ?? null });
      }
    });

    const onUpdate = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.gameInfo || !event.runningChanged) return;
      if (!isTargetGame(event.gameInfo)) return;
      setGame(
        event.gameInfo.isRunning
          ? { running: true, title: event.gameInfo.title ?? null }
          : NOT_RUNNING,
      );
    };
    overwolf.games?.onGameInfoUpdated.addListener(onUpdate);
    return () => overwolf.games?.onGameInfoUpdated.removeListener(onUpdate);
  }, []);

  return game;
};

export const useGameRunning = (): boolean => useRunningGame().running;
