import { APP_CONFIG } from "../config/app-config";
import { getPreferences } from "../state/preferences-store";
import { restoreWindow } from "./window-manager";

const isConfiguredPeakGame = (
  gameInfo: Pick<overwolf.games.RunningGameInfo, "classId" | "id" | "isRunning"> | null,
): boolean => {
  if (!gameInfo?.isRunning || APP_CONFIG.supportedGameId === null) return false;
  const gameId = gameInfo.classId || Math.floor(gameInfo.id / 10);
  return gameId === APP_CONFIG.supportedGameId;
};

const openConfiguredWindows = (): void => {
  const preferences = getPreferences();
  if (preferences.openOnGameLaunch) {
    void restoreWindow(APP_CONFIG.mainWindowName);
  }
  if (preferences.showOverlayOnGameLaunch) {
    void restoreWindow(APP_CONFIG.overlayWindowName);
  }
};

interface GameMonitorHandlers {
  onRunningChange?: (isRunning: boolean) => void;
}

export const startGameMonitor = (handlers: GameMonitorHandlers = {}): (() => void) => {
  if (typeof overwolf === "undefined") return () => undefined;

  let peakWasRunning = false;
  const inspectGame = (
    gameInfo: Pick<overwolf.games.RunningGameInfo, "classId" | "id" | "isRunning"> | null,
  ) => {
    const peakIsRunning = isConfiguredPeakGame(gameInfo);
    if (peakIsRunning && !peakWasRunning) openConfiguredWindows();
    if (peakIsRunning !== peakWasRunning) handlers.onRunningChange?.(peakIsRunning);
    peakWasRunning = peakIsRunning;
  };

  const listener = (event: overwolf.games.GameInfoUpdatedEvent) => {
    inspectGame(event.gameInfo ?? null);
  };

  overwolf.games.onGameInfoUpdated.addListener(listener);
  overwolf.games.getRunningGameInfo((result) => inspectGame(result?.success ? result : null));

  return () => overwolf.games.onGameInfoUpdated.removeListener(listener);
};
