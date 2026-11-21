import { startPositionReader } from "../features/live-position/position-reader";
import { startMinimapLifecycle } from "../features/overlay/minimap-lifecycle";
import { useEffect } from "react";
import { startSubscriptionCallbackRelay } from "../features/subscriptions/subscription-callback";
import { startEmailHashSync } from "../services/auth/email-hashes";
import {
  noteInGameAutoOpen,
  reportGameRunning,
  startBackgroundAnalytics,
} from "./background-analytics";
import { isTargetGame } from "../game-config";
import { logGameDetection, startGameDetectionDiagnostics } from "./game-detection-diagnostics";
import { markInGameAutoOpened } from "../features/overlay/in-game-auto-open";
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import { destroyTray, initTray } from "../overwolf-utils/tray-manager";
import { toggleDesktopWindow } from "../overwolf-utils/desktop-window-hotkey";
import {
  collapseInGameApp,
  expandInGameApp,
  getMainWindowPresentationGeneration,
  getMonitorsList,
  isMainWindowBehindGame,
  isInGameAppVisible,
  restoreMainWindowBehindGame,
  restoreWindowPreservingPlacement,
  revealMainWindowToFront,
} from "../overwolf-utils/window-manager";
/**
 * Give the game time to load before opening the full-app overlay on one monitor.
 */
const IN_GAME_AUTO_OPEN_DELAY_MS = 40_000;
/** A source-less cold start may receive game info just after its first probe. */
const BOOT_GAME_INFO_RETRY_DELAY_MS = 3_000;

/**
 * The invisible "brain" window: alive for the whole app session, it owns the
 * tray, the hotkeys and the game start/stop reactions.
 */
export const BackgroundController = () => {
  useEffect(() => startSubscriptionCallbackRelay(), []);
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    initTray();
    const stopEmailHashSync = startEmailHashSync();
    const stopGameDetectionDiagnostics = startGameDetectionDiagnostics();
    // Overlay show/hide can only be observed from here (see background-analytics).
    const stopBackgroundAnalytics = startBackgroundAnalytics();
    const stopPositionReader = startPositionReader();
    const minimap = startMinimapLifecycle();

    let inGameAutoOpenTimer: number | null = null;
    let inGameAutoOpenGeneration = 0;
    let bootGameInfoRetryTimer: number | null = null;
    let desktopLaunchGeneration = 0;
    let gameRunning = false;
    let openDesktopAfterGameExit = false;
    let disposed = false;
    const openInGame = (trigger: "auto" | "hotkey") => {
      logGameDetection("in-game-open-request", { trigger });
      void expandInGameApp()
        .then(async () => {
          logGameDetection("in-game-open-result", {
            trigger,
            windowStateVisible: await isInGameAppVisible(),
          });
        })
        .catch((error) => logGameDetection("in-game-open-error", { trigger, error: String(error) }));
    };
    const showGameWindows = () => {
      const generation = ++desktopLaunchGeneration;
      const presentationGeneration = getMainWindowPresentationGeneration();
      openDesktopAfterGameExit = false;
      void getMonitorsList().then((monitors) => {
        if (disposed || generation !== desktopLaunchGeneration ||
            presentationGeneration !== getMainWindowPresentationGeneration() || !gameRunning) return;
        logGameDetection("desktop-launch-monitors", {
          count: monitors.length,
          autoOpenAppWithGame: getLaunchPreferences().autoOpenAppWithGame,
        });
        if (monitors.length === 1) {
          if (getLaunchPreferences().autoOpenAppWithGame) {
            openDesktopAfterGameExit = true;
            void restoreMainWindowBehindGame("main").catch((error) =>
              logGameDetection("desktop-background-open-error", { error: String(error) }),
            );
          }
          return;
        }
        if (monitors.length > 1 && getLaunchPreferences().autoOpenAppWithGame) {
          void restoreWindowPreservingPlacement("main").catch((error) =>
            logGameDetection("desktop-background-open-error", { error: String(error) }),
          );
        }
      }).catch((error) => {
        logGameDetection("desktop-launch-monitor-error", { error: String(error) });
        console.warn("[Launch] Could not determine the monitor count", error);
      });
    };
    const cancelInGameAutoOpen = () => {
      inGameAutoOpenGeneration++;
      if (inGameAutoOpenTimer !== null) {
        window.clearTimeout(inGameAutoOpenTimer);
        inGameAutoOpenTimer = null;
      }
    };
    const scheduleInGameAutoOpen = () => {
      cancelInGameAutoOpen();
      const generation = inGameAutoOpenGeneration;
      logGameDetection("in-game-auto-open-scheduled", { delayMs: IN_GAME_AUTO_OPEN_DELAY_MS, generation });
      inGameAutoOpenTimer = window.setTimeout(() => {
        inGameAutoOpenTimer = null;
        void (async () => {
          if (disposed || generation !== inGameAutoOpenGeneration || !gameRunning) {
            logGameDetection("in-game-auto-open-skipped", { reason: "stale-or-not-running", generation });
            return;
          }
          // Preference read at fire time, so a Settings toggle applies at once.
          if (!getLaunchPreferences().autoOpenInGameOverlay) {
            logGameDetection("in-game-auto-open-skipped", { reason: "preference-disabled" });
            return;
          }
          const monitors = await getMonitorsList().catch((error) => {
            logGameDetection("in-game-auto-open-monitor-error", { error: String(error) });
            return [];
          });
          if (disposed || generation !== inGameAutoOpenGeneration || monitors.length !== 1) {
            logGameDetection("in-game-auto-open-skipped", { reason: "monitor-count-or-stale", monitorCount: monitors.length });
            return;
          }
          // Already on screen (the user beat us to the hotkey) — leave it be.
          if (await isInGameAppVisible()) {
            logGameDetection("in-game-auto-open-skipped", { reason: "window-already-visible" });
            return;
          }
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (disposed || generation !== inGameAutoOpenGeneration || !gameRunning) return;
            logGameDetection("in-game-auto-open-game-check", {
              classId: info?.classId,
              processId: info?.processId,
              isRunning: info?.isRunning,
              target: isTargetGame(info),
              success: info?.success,
              error: info?.error,
            });
            if (!info?.isRunning || !isTargetGame(info)) return;
            markInGameAutoOpened();
            noteInGameAutoOpen(); // so the open below is reported as "auto"
            openInGame("auto");
          });
        })();
      }, IN_GAME_AUTO_OPEN_DELAY_MS);
    };

    /** Every game start/stop transition funnels through here. */
    const setGameRunning = (running: boolean, title?: string | null) => {
      if (disposed) return;
      if (running === gameRunning) return;
      logGameDetection("game-running-transition", { previous: gameRunning, running, title });
      gameRunning = running;
      minimap.setGameRunning(running);
      reportGameRunning(running, title);
      if (running) {
        if (bootGameInfoRetryTimer !== null) {
          window.clearTimeout(bootGameInfoRetryTimer);
          bootGameInfoRetryTimer = null;
        }
        showGameWindows();
        scheduleInGameAutoOpen();
        return;
      }
      const shouldOpenDesktop = openDesktopAfterGameExit;
      openDesktopAfterGameExit = false;
      const generation = ++desktopLaunchGeneration;
      cancelInGameAutoOpen();
      void collapseInGameApp().catch((error) => {
        logGameDetection("in-game-close-error", { error: String(error) });
      }).then(() => {
        if (disposed || generation !== desktopLaunchGeneration || gameRunning) return;
        if (shouldOpenDesktop && isMainWindowBehindGame() && getLaunchPreferences().autoOpenAppWithGame) {
          void revealMainWindowToFront("main");
        }
      });
    };

    const source = new URLSearchParams(window.location.search).get("source")?.toLowerCase();
    const onAppLaunchTriggered = (event: overwolf.extensions.AppLaunchTriggeredEvent) => {
      if (disposed) return;
      logGameDetection("app-launch-triggered", { gameLaunchOrigin: /gamelaunchevent/i.test(event.origin) });
      if (/gamelaunchevent/i.test(event.origin)) {
        overwolf.games?.getRunningGameInfo?.((info) => {
          if (disposed) return;
          logGameDetection("app-launch-game-check", {
            classId: info?.classId,
            processId: info?.processId,
            isRunning: info?.isRunning,
            target: isTargetGame(info),
          });
          if (info?.isRunning && isTargetGame(info)) setGameRunning(true, info.title);
        });
        return;
      }
      void revealMainWindowToFront("main");
    };
    overwolf.extensions?.onAppLaunchTriggered?.addListener(onAppLaunchTriggered);

    const toggleMainWindow = () => {
      void toggleDesktopWindow().catch((error) =>
        logGameDetection("desktop-hotkey-error", { error: String(error) }),
      );
    };

    const onHotkey = (event: { name: string }) => {
      logGameDetection("hotkey-pressed", { name: event.name });
      if (event.name === "toggle_overlay") { void minimap.toggle(); return; }
      if (event.name === "toggle_desktop_app") {
        void toggleMainWindow();
        return;
      }
      if (event.name === "toggle_app") {
        // In-game, the hotkey drives the full-app OVERLAY window instead of the
        // desktop-only main window (which can't paint over the game). On the
        // desktop it keeps toggling main as before.
        overwolf.games?.getRunningGameInfo?.((info) => {
          logGameDetection("hotkey-game-check", {
            classId: info?.classId,
            processId: info?.processId,
            isRunning: info?.isRunning,
            target: isTargetGame(info),
            success: info?.success,
            error: info?.error,
          });
          if (info?.isRunning && isTargetGame(info)) {
            void isInGameAppVisible().then((visible) => {
              logGameDetection("hotkey-window-check", { visible });
              if (visible) {
                void collapseInGameApp().catch((error) =>
                  logGameDetection("in-game-close-error", { error: String(error) }),
                );
              } else {
                openInGame("hotkey");
              }
            });
            return;
          }
          void toggleMainWindow();
        });
      }
    };
    overwolf.settings?.hotkeys?.onPressed.addListener(onHotkey);

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (disposed) return;
      if (!event.gameInfo || !isTargetGame(event.gameInfo)) return;
      if (!event.runningChanged) return;
      setGameRunning(event.gameInfo.isRunning, event.gameInfo.title);
    };
    overwolf.games?.onGameInfoUpdated.addListener(onGameInfoUpdated);

    overwolf.games?.getRunningGameInfo?.((info) => {
      if (disposed) return;
      const isRunning = Boolean(info?.isRunning && isTargetGame(info));
      logGameDetection("boot-game-check", {
        source,
        classId: info?.classId,
        processId: info?.processId,
        isRunning: info?.isRunning,
        target: isTargetGame(info),
        success: info?.success,
        error: info?.error,
      });
      // The app can be started BY the game (manifest launch_events) or opened
      // mid-session, so the boot probe is a real session transition too.
      if (isRunning) {
        setGameRunning(true, info?.title);
      } else {
        if (gameRunning) return;
        reportGameRunning(false, info?.title);
        if (source === "gamelaunchevent") return;
        if (source) {
          void revealMainWindowToFront("main");
          return;
        }
        // The initial GameLaunch probe can beat the game-info update. Retry a
        // source-less boot before opening a desktop window over the game.
        bootGameInfoRetryTimer = window.setTimeout(() => {
          bootGameInfoRetryTimer = null;
          if (disposed || gameRunning) return;
          overwolf.games?.getRunningGameInfo?.((latestInfo) => {
            if (disposed || gameRunning) return;
            logGameDetection("boot-retry-game-check", {
              classId: latestInfo?.classId,
              processId: latestInfo?.processId,
              isRunning: latestInfo?.isRunning,
              target: isTargetGame(latestInfo),
              success: latestInfo?.success,
              error: latestInfo?.error,
            });
            if (latestInfo?.isRunning && isTargetGame(latestInfo)) {
              setGameRunning(true, latestInfo.title);
            } else {
              void revealMainWindowToFront("main");
            }
          });
        }, BOOT_GAME_INFO_RETRY_DELAY_MS);
      }
    });

    const onMessageReceived = (message: { id: string }) => {
      if (message.id === "show_main") void revealMainWindowToFront("main");
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      disposed = true;
      if (bootGameInfoRetryTimer !== null) window.clearTimeout(bootGameInfoRetryTimer);
      desktopLaunchGeneration++;
      cancelInGameAutoOpen();
      stopBackgroundAnalytics();
      stopEmailHashSync();
      stopPositionReader();
      minimap.stop();
      stopGameDetectionDiagnostics();
      destroyTray();
      overwolf.extensions?.onAppLaunchTriggered?.removeListener(onAppLaunchTriggered);
      overwolf.settings?.hotkeys?.onPressed.removeListener(onHotkey);
      overwolf.games?.onGameInfoUpdated.removeListener(onGameInfoUpdated);
      overwolf.windows?.onMessageReceived?.removeListener(onMessageReceived);
    };
  }, []);

  return null;
};

export default BackgroundController;
