import { useEffect, useState } from "react";

/**
 * Whether a targeted FromSoftware game (Elden Ring / Nightreign) is currently
 * running, observed from a UI window. Game events fire reliably in the desktop
 * `main` window (the same place game-launch-monitor-switch listens), so we can
 * track running state here without a background round-trip.
 *
 * Always `false` outside Overwolf (the plain-web build has no game feed), so
 * callers can branch on it freely. The allow-list regex matches the background
 * controller's, so we never react to any other game.
 */
const ELDEN_RING_TITLE_RE = /elden ring|nightreign/i;

const isTargetedGame = (title?: string | null): boolean =>
  ELDEN_RING_TITLE_RE.test(title ?? "");

export interface RunningGame {
  running: boolean;
  /** Which targeted game it is ("Elden Ring" / "Elden Ring Nightreign"), or null
   *  when nothing is running. Analytics splits its numbers on this. */
  title: string | null;
}

const NOT_RUNNING: RunningGame = { running: false, title: null };

/** The running targeted game, title included. */
export const useRunningGame = (): RunningGame => {
  const [game, setGame] = useState<RunningGame>(NOT_RUNNING);

  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    // onGameInfoUpdated only fires on CHANGES, so seed from a direct poll — this
    // covers the app opening while the game is already running (the auto-open case).
    overwolf.games?.getRunningGameInfo?.((info) => {
      if (info?.isRunning && isTargetedGame(info.title)) {
        setGame({ running: true, title: info.title ?? null });
      }
    });

    const onUpdate = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.gameInfo || !event.runningChanged) return;
      if (!isTargetedGame(event.gameInfo.title)) return;
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
