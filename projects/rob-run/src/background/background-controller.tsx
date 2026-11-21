import { useEffect } from "react";
import {
  reportGameRunning,
  startBackgroundAnalytics,
} from "./background-analytics";
import { isTargetGame } from "../game-config";
import { clearLivePosition } from "../features/live-position/live-position-store";
import { setTrackingStatus } from "../features/live-position/tracking-status";
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import { destroyTray, initTray } from "../overwolf-utils/tray-manager";
import {
  collapseInGameApp,
  expandInGameApp,
  expandMinimap,
  toggleMinimap,
  getMainWindowPresentationGeneration,
  getMonitorsList,
  hideOverlayWindows,
  isMainWindowBehindGame,
  isInGameAppVisible,
  restoreMainWindowBehindGame,
  restoreWindowPreservingPlacement,
  revealMainWindowToFront,
  surfaceWindowOverExternalApp,
  toggleWindow,
} from "../overwolf-utils/window-manager";

/** Single-monitor setups open the full map after the game has had time to load. */
const IN_GAME_AUTO_OPEN_DELAY_MS = 15_000;
/** A source-less cold start may receive game info just after its first probe. */
const BOOT_GAME_INFO_RETRY_DELAY_MS = 3_000;

/**
 * The invisible "brain" window: alive for the whole app session, it owns the
 * tray, the hotkeys and the game start/stop reactions.
 *
 * GameInfo supplies session state for the app and minimap windows.
 */
export const BackgroundController = () => {
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    initTray();
    clearLivePosition();
    setTrackingStatus("disabled");
    startBackgroundAnalytics();

    let inGameAutoOpenTimer: number | null = null;
    let inGameAutoOpenGeneration = 0;
    let bootGameInfoRetryTimer: number | null = null;
    let gameRunning = false;
    let desktopLaunchGeneration = 0;
    let openDesktopAfterGameExit = false;
    let disposed = false;
    const showGameWindows = () => {
      const generation = ++desktopLaunchGeneration;
      const presentationGeneration = getMainWindowPresentationGeneration();
      openDesktopAfterGameExit = false;
      void getMonitorsList().then((monitors) => {
        if (disposed || generation !== desktopLaunchGeneration ||
            presentationGeneration !== getMainWindowPresentationGeneration() || !gameRunning) return;
        if (monitors.length === 1) {
          if (getLaunchPreferences().autoOpenAppWithGame) {
            openDesktopAfterGameExit = true;
            void restoreMainWindowBehindGame("main").catch((error) =>
              console.error("[Launch] Could not open desktop behind the game", error),
            );
          }
          return;
        }
        if (monitors.length > 1 && getLaunchPreferences().autoOpenAppWithGame) {
          // The main window moves itself away from the game's monitor. Let it
          // surface only after that move has landed.
          void restoreWindowPreservingPlacement("main").catch((error) =>
            console.error("[Launch] Could not open desktop for monitor move", error),
          );
        }
      }).catch((error) => {
        console.warn("[Launch] Could not determine the monitor count", error);
      });
    };
    const cancelInGameAutoOpen = () => {
      // Also invalidate a monitor lookup that is already in flight.
      inGameAutoOpenGeneration++;
      if (inGameAutoOpenTimer === null) return;
      window.clearTimeout(inGameAutoOpenTimer);
      inGameAutoOpenTimer = null;
    };
    const scheduleInGameAutoOpen = () => {
      cancelInGameAutoOpen();
      const generation = inGameAutoOpenGeneration;
      inGameAutoOpenTimer = window.setTimeout(() => {
        inGameAutoOpenTimer = null;
        void (async () => {
          if (disposed || generation !== inGameAutoOpenGeneration || !gameRunning ||
              !getLaunchPreferences().autoOpenInGameOverlay) return;
          const monitors = await getMonitorsList().catch(() => []);
          if (disposed || generation !== inGameAutoOpenGeneration || monitors.length !== 1) return;
          if (await isInGameAppVisible()) return;
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (disposed || generation !== inGameAutoOpenGeneration || !gameRunning) return;
            if (!info?.isRunning || !isTargetGame(info)) return;
            if (!getLaunchPreferences().autoOpenInGameOverlay) return;
            void expandInGameApp();
          });
        })();
      }, IN_GAME_AUTO_OPEN_DELAY_MS);
    };

    /** Every game start/stop transition funnels through here. */
    const setGameRunning = (running: boolean, title?: string | null) => {
      if (disposed) return;
      if (running === gameRunning) return;
      gameRunning = running;
      reportGameRunning(running, title);
      if (running) {
        if (bootGameInfoRetryTimer !== null) {
          window.clearTimeout(bootGameInfoRetryTimer);
          bootGameInfoRetryTimer = null;
        }
        showGameWindows();
        if (getLaunchPreferences().autoOpenMinimap) void expandMinimap();
        scheduleInGameAutoOpen();
        return;
      }
      const shouldOpenDesktop = openDesktopAfterGameExit;
      openDesktopAfterGameExit = false;
      const generation = ++desktopLaunchGeneration;
      cancelInGameAutoOpen();
      clearLivePosition();
      void hideOverlayWindows().then(() => {
        if (disposed || generation !== desktopLaunchGeneration || gameRunning) return;
        if (shouldOpenDesktop && isMainWindowBehindGame() && getLaunchPreferences().autoOpenAppWithGame) {
          void revealMainWindowToFront("main");
        }
      });
    };

    // Window state events reach the background even when main's own JS context
    // is destroyed. A close dismisses automatic opening for this game session;
    // the next game start schedules it again using the unchanged preferences.
    const onWindowStateChanged = (event: {
      window_name?: string;
      window_state_ex?: string;
      window_state?: string;
    }) => {
      if (disposed || event.window_name !== "main" ||
          (event.window_state_ex ?? event.window_state) !== "closed") return;
      openDesktopAfterGameExit = false;
      desktopLaunchGeneration++;
      cancelInGameAutoOpen();
    };
    overwolf.windows?.onStateChanged?.addListener(onWindowStateChanged);

    const source = new URLSearchParams(window.location.search).get("source")?.toLowerCase();

    const onAppLaunchTriggered = (event: overwolf.extensions.AppLaunchTriggeredEvent) => {
      if (disposed) return;
      if (/gamelaunchevent/i.test(event.origin)) {
        overwolf.games?.getRunningGameInfo?.((info) => {
          if (disposed) return;
          if (info?.isRunning && isTargetGame(info)) setGameRunning(true, info.title);
        });
        return;
      }
      void revealMainWindowToFront("main");
    };
    overwolf.extensions?.onAppLaunchTriggered?.addListener(onAppLaunchTriggered);

    const toggleMainWindow = () => isMainWindowBehindGame()
      ? revealMainWindowToFront("main")
      : toggleWindow("main", async () => {
        await restoreWindowPreservingPlacement("main");
        await surfaceWindowOverExternalApp("main");
      });

    const onHotkey = (event: { name: string }) => {
      if (event.name === "toggle_overlay") {
        void toggleMinimap();
        return;
      }
      if (event.name === "toggle_desktop_app") {
        void toggleMainWindow();
        return;
      }
      if (event.name === "toggle_app") {
        // In-game, the hotkey drives the full-app OVERLAY window instead of the
        // desktop-only main window (which can't paint over the game). On the
        // desktop it keeps toggling main as before.
        overwolf.games?.getRunningGameInfo?.((info) => {
          if (info?.isRunning && isTargetGame(info)) {
            void isInGameAppVisible().then((visible) =>
              visible ? collapseInGameApp() : expandInGameApp(),
            );
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
      destroyTray();
      overwolf.extensions?.onAppLaunchTriggered?.removeListener(onAppLaunchTriggered);
      overwolf.settings?.hotkeys?.onPressed.removeListener(onHotkey);
      overwolf.games?.onGameInfoUpdated.removeListener(onGameInfoUpdated);
      overwolf.windows?.onMessageReceived?.removeListener(onMessageReceived);
      overwolf.windows?.onStateChanged?.removeListener(onWindowStateChanged);
    };
  }, []);

  return null;
};

export default BackgroundController;
