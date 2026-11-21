import { PRIMARY_GAME_CLASS_ID, isTargetGame } from "../game-config";

const POLL_INTERVAL_MS = 15_000;
const CALLBACK_TIMEOUT_MS = 5_000;
const bootId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type GameInfo = Partial<overwolf.games.GetRunningGameInfoResult2GameInfo>;

const describeGameInfo = (info: GameInfo | null | undefined) => {
  if (!info) return null;
  return {
    target: isTargetGame(info),
    classId: info.classId,
    id: info.id,
    processId: info.processId,
    sessionId: info.sessionId,
    title: info.title,
    isRunning: info.isRunning,
    isInFocus: info.isInFocus,
    gameIsInFocus: info.gameIsInFocus,
    width: info.width,
    height: info.height,
    renderers: info.renderers,
    detectedRenderer: info.detectedRenderer,
    isOverlaySupported: info.isOverlaySupported,
    isOverlayEnabled: info.isOverlayEnabled,
    overlayInfo: info.overlayInfo && {
      hadInGameRender: info.overlayInfo.hadInGameRender,
      inputFailure: info.overlayInfo.inputFailure,
      exclusiveModeDisabled: info.overlayInfo.exclusiveModeDisabled,
      isCursorVisible: info.overlayInfo.isCursorVisible,
      oopOverlay: info.overlayInfo.oopOverlay,
      coexistingApps: info.overlayInfo.coexistingApps,
      isFullScreenOptimizationDisabled: info.overlayInfo.isFullScreenOptimizationDisabled,
    },
  };
};

/** One searchable, timestamped line in Overwolf's background.html.log. */
export const logGameDetection = (event: string, details: Record<string, unknown> = {}): void => {
  console.info(`[GameDetection] ${JSON.stringify({
    at: new Date().toISOString(),
    bootId,
    event,
    ...details,
  })}`);
};

/** Observe Overwolf itself even when this app never receives a game transition. */
export const startGameDetectionDiagnostics = (): (() => void) => {
  const games = overwolf.games;
  if (!games) {
    logGameDetection("games-api-unavailable");
    return () => {};
  }
  let disposed = false;
  let probeNumber = 0;
  let lastUpdateSignature = "";
  let lastUpdateAt = 0;
  let suppressedUpdates = 0;
  logGameDetection("background-start", {
    source: new URLSearchParams(window.location.search).get("source"),
    targetClassId: PRIMARY_GAME_CLASS_ID,
    hasGameInfo2: Boolean(games.getRunningGameInfo2),
    hasLegacyGameInfo: Boolean(games.getRunningGameInfo),
    hasTrackedGamesApi: Boolean(games.tracked?.getAnyRunningGamesInfo),
  });

  const probe = () => {
    const sequence = ++probeNumber;
    const recordCallback = <T,>(
      api: string,
      invoke: (callback: (result: T) => void) => void,
      describe: (result: T) => Record<string, unknown>,
    ) => {
      let finished = false;
      const timeout = window.setTimeout(() => {
        if (finished || disposed) return;
        finished = true;
        logGameDetection("probe-timeout", { api, sequence });
      }, CALLBACK_TIMEOUT_MS);
      try {
        invoke((result) => {
          if (finished || disposed) return;
          finished = true;
          window.clearTimeout(timeout);
          logGameDetection("probe", { api, sequence, ...describe(result) });
        });
      } catch (error) {
        if (finished || disposed) return;
        finished = true;
        window.clearTimeout(timeout);
        logGameDetection("probe-error", { api, sequence, error: String(error) });
      }
    };

    if (games.getRunningGameInfo2) {
      recordCallback<overwolf.games.GetRunningGameInfoResult2>(
        "getRunningGameInfo2",
        (callback) => games.getRunningGameInfo2(callback),
        (result) => ({ success: result?.success, error: result?.error, game: describeGameInfo(result?.gameInfo) }),
      );
    }
    if (games.getRunningGameInfo) {
      recordCallback<overwolf.games.GetRunningGameInfoResult>(
        "getRunningGameInfo",
        (callback) => games.getRunningGameInfo(callback),
        (result) => ({ success: result?.success, error: result?.error, game: describeGameInfo(result) }),
      );
    }
    if (games.tracked?.getAnyRunningGamesInfo) {
      recordCallback<overwolf.games.tracked.GetAnyRunningGamesInfoResult>(
        "tracked.getAnyRunningGamesInfo",
        (callback) => games.tracked.getAnyRunningGamesInfo(callback),
        (result) => ({
          success: result?.success,
          error: result?.error,
          targetGames: result?.gameInfos?.filter(isTargetGame).map(describeGameInfo) ?? [],
        }),
      );
    }
  };

  const onGameLaunched = (info: overwolf.games.RunningGameInfo) =>
    logGameDetection("onGameLaunched", { game: describeGameInfo(info) });
  const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
    const details = {
      game: describeGameInfo(event.gameInfo),
      runningChanged: event.runningChanged,
      gameChanged: event.gameChanged,
      focusChanged: event.focusChanged,
      gameOverlayChanged: event.gameOverlayChanged,
      overlayInputHookError: event.overlayInputHookError,
      reason: event.reason,
    };
    const signature = JSON.stringify(details);
    const now = Date.now();
    if (signature === lastUpdateSignature && now - lastUpdateAt < 30_000) {
      suppressedUpdates++;
      return;
    }
    logGameDetection("onGameInfoUpdated", { ...details, repeatsSuppressed: suppressedUpdates });
    lastUpdateSignature = signature;
    lastUpdateAt = now;
    suppressedUpdates = 0;
  };
  const onRendererDetected = (event: overwolf.games.GameRendererDetectedEvent) =>
    logGameDetection("onGameRendererDetected", { renderer: event.detectedRenderer });
  const onWindowStateChanged = (event: { window_name?: string; window_state_ex?: string; window_state?: string }) => {
    if (event.window_name !== "in_game") return;
    logGameDetection("in-game-window-state", { state: event.window_state_ex ?? event.window_state });
  };
  const onOverlaySettingChanged = (event: overwolf.settings.games.OverlayEnablementChangedEvent) => {
    if (Number(event.gameId) !== PRIMARY_GAME_CLASS_ID) return;
    logGameDetection("overlay-setting-changed", { enabled: event.enabled });
  };
  const onAutoLaunchSettingChanged = (event: overwolf.settings.games.AutoLaunchEnablementChangedEvent) => {
    if (Number(event.gameId) !== PRIMARY_GAME_CLASS_ID) return;
    logGameDetection("auto-launch-setting-changed", { enabled: event.enabled });
  };

  games.onGameLaunched?.addListener(onGameLaunched);
  games.onGameInfoUpdated?.addListener(onGameInfoUpdated);
  games.onGameRendererDetected?.addListener(onRendererDetected);
  overwolf.windows?.onStateChanged?.addListener(onWindowStateChanged);
  overwolf.settings?.games?.onOverlayEnablementChanged?.addListener(onOverlaySettingChanged);
  overwolf.settings?.games?.onAutoLaunchEnablementChanged?.addListener(onAutoLaunchSettingChanged);
  overwolf.settings?.games?.getOverlayEnabled?.(PRIMARY_GAME_CLASS_ID, (result) =>
    logGameDetection("overlay-setting", { success: result.success, enabled: result.enabled, error: result.error }),
  );
  overwolf.settings?.games?.getAutoLaunchEnabled?.(PRIMARY_GAME_CLASS_ID, (result) =>
    logGameDetection("auto-launch-setting", { success: result.success, enabled: result.autoLaunchEnabled, error: result.error }),
  );
  probe();
  const interval = window.setInterval(probe, POLL_INTERVAL_MS);
  return () => {
    disposed = true;
    window.clearInterval(interval);
    games.onGameLaunched?.removeListener(onGameLaunched);
    games.onGameInfoUpdated?.removeListener(onGameInfoUpdated);
    games.onGameRendererDetected?.removeListener(onRendererDetected);
    overwolf.windows?.onStateChanged?.removeListener(onWindowStateChanged);
    overwolf.settings?.games?.onOverlayEnablementChanged?.removeListener(onOverlaySettingChanged);
    overwolf.settings?.games?.onAutoLaunchEnablementChanged?.removeListener(onAutoLaunchSettingChanged);
    logGameDetection("background-stop");
  };
};
