import { useEffect } from "react";
import {
  noteInGameAutoOpen,
  reportGameRunning,
  startBackgroundAnalytics,
} from "./background-analytics";
import { isTargetGame } from "../game-config";
import { clearLivePosition, subscribeLivePosition } from "../features/live-position/live-position-store";
import { clearDesktopMapFollow, startDesktopMapFollow } from "../features/live-position/desktop-map-follow";
import { startGameEventController } from "../features/game-events/game-event-controller";
import { markInGameAutoOpened } from "../features/overlay/in-game-auto-open";
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import { destroyTray, initTray } from "../overwolf-utils/tray-manager";
import {
  collapseInGameApp,
  collapseOverlayMap,
  expandInGameApp,
  expandOverlayMap,
  getMonitorsList,
  hideOverlayWindows,
  isInGameAppVisible,
  isOverlayMapVisible,
  restoreWindowPreservingPlacement,
  revealMainWindowToFront,
  surfaceWindowOverExternalApp,
  toggleWindow,
} from "../overwolf-utils/window-manager";

// Both surfaces are opt-out in Settings, so the preferences are read at launch
// time (never cached) — a toggle flipped mid-session applies to the next launch.
const showGameWindows = () => {
  const preferences = getLaunchPreferences();
  if (preferences.autoOpenAppWithGame) void revealMainWindowToFront("main");
  // The minimap comes up with every game launch (opt-out in Settings); the
  // toggle hotkey named in its header hides it again.
  if (preferences.showOverlayWidgetWithGame) void expandOverlayMap();
};

/**
 * Single-monitor players can't see the desktop window once the game is up, so
 * a short while after the game launches the full-app overlay is opened for
 * them, with a one-shot banner naming the toggle hotkey (see
 * in-game-auto-open.ts). Multi-monitor setups keep the desktop window instead.
 * The delay lets the game finish loading before an overlay pops over it.
 */
const IN_GAME_AUTO_OPEN_DELAY_MS = 15_000;

/**
 * The invisible "brain" window: alive for the whole app session, it owns the
 * tray, the hotkeys, the game start/stop reactions.
 *
 * A game-specific live-position reader belongs here too: start it when the
 * game is running, stop it (and `clearLivePosition()`) when it exits — see
 * `setGameRunning` below and docs/branching-guide.md.
 */
export const BackgroundController = () => {
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    initTray();
    clearDesktopMapFollow();
    const stopDesktopFollow = subscribeLivePosition((position) => {
      if (position) startDesktopMapFollow();
    });
    // Overlay show/hide can only be observed from here (see background-analytics).
    const stopBackgroundAnalytics = startBackgroundAnalytics();

    let inGameAutoOpenTimer: number | null = null;
    let stopGameEvents: (() => void) | null = null;
    const cancelInGameAutoOpen = () => {
      if (inGameAutoOpenTimer !== null) {
        window.clearTimeout(inGameAutoOpenTimer);
        inGameAutoOpenTimer = null;
      }
    };
    const scheduleInGameAutoOpen = () => {
      cancelInGameAutoOpen();
      inGameAutoOpenTimer = window.setTimeout(() => {
        inGameAutoOpenTimer = null;
        void (async () => {
          // Preference read at fire time, so a Settings toggle applies at once.
          if (!getLaunchPreferences().autoOpenInGameOverlay) return;
          const monitors = await getMonitorsList().catch(() => []);
          if (monitors.length !== 1) return;
          // Already on screen (the user beat us to the hotkey) — leave it be.
          if (await isInGameAppVisible()) return;
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (!info?.isRunning || !isTargetGame(info)) return;
            markInGameAutoOpened();
            noteInGameAutoOpen(); // so the open below is reported as "auto"
            void expandInGameApp();
          });
        })();
      }, IN_GAME_AUTO_OPEN_DELAY_MS);
    };

    /** Every game start/stop transition funnels through here. */
    const setGameRunning = (running: boolean, title?: string | null) => {
      reportGameRunning(running, title);
      if (running) {
        if (!stopGameEvents) stopGameEvents = startGameEventController();
        showGameWindows();
        scheduleInGameAutoOpen();
        return;
      }
      cancelInGameAutoOpen();
      stopGameEvents?.();
      stopGameEvents = null;
      clearLivePosition();
      clearDesktopMapFollow();
      void hideOverlayWindows();
    };

    const source = new URLSearchParams(window.location.search).get("source");
    if (source !== "gamelaunchevent") {
      void revealMainWindowToFront("main");
    }

    const onAppLaunchTriggered = () => {
      void revealMainWindowToFront("main");
    };
    overwolf.extensions?.onAppLaunchTriggered?.addListener(onAppLaunchTriggered);

    const toggleMainWindow = () => toggleWindow("main", async () => {
      await restoreWindowPreservingPlacement("main");
      await surfaceWindowOverExternalApp("main");
    });

    const onHotkey = (event: { name: string }) => {
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
      if (event.name === "toggle_overlay") {
        void isOverlayMapVisible().then(async (visible) => {
          if (visible) {
            await collapseOverlayMap();
            return;
          }
          // Without the game the minimap would float on the bare desktop, so
          // the hotkey only opens it while the game runs.
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (info?.isRunning && isTargetGame(info)) void expandOverlayMap();
          });
        });
      }
    };
    overwolf.settings?.hotkeys?.onPressed.addListener(onHotkey);

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.gameInfo || !isTargetGame(event.gameInfo)) return;
      if (!event.runningChanged) return;
      setGameRunning(event.gameInfo.isRunning, event.gameInfo.title);
    };
    overwolf.games?.onGameInfoUpdated.addListener(onGameInfoUpdated);

    overwolf.games?.getRunningGameInfo?.((info) => {
      const isRunning = Boolean(info?.isRunning && isTargetGame(info));
      // The app can be started BY the game (manifest launch_events) or opened
      // mid-session, so the boot probe is a real session transition too.
      reportGameRunning(isRunning, info?.title);
      if (isRunning) {
        if (!stopGameEvents) stopGameEvents = startGameEventController();
        showGameWindows();
        scheduleInGameAutoOpen();
      }
    });

    const onMessageReceived = (message: { id: string }) => {
      if (message.id === "show_main") void revealMainWindowToFront("main");
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      cancelInGameAutoOpen();
      stopGameEvents?.();
      stopGameEvents = null;
      stopBackgroundAnalytics();
      stopDesktopFollow();
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
