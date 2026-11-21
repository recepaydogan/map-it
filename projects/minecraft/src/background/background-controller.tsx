import { useEffect } from "react";
import {
  noteInGameAutoOpen,
  reportGameRunning,
  startBackgroundAnalytics,
} from "./background-analytics";
import { isTargetGame } from "../game-config";
import { startGameSession } from "../features/game-session/start-game-session";
import type { GameSession } from "../features/game-session/session-types";
import { startBackgroundJourneyRecorder } from "../features/journey/background-journey-recorder";
import { clearLivePosition } from "../features/live-position/live-position-store";
import { markInGameAutoOpened } from "../features/overlay/in-game-auto-open";
import { layoutOverlayMinimap } from "../features/overlay/overlay-preferences";
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import { saveCurrentPositionPin } from "../features/worlds/world-current-position-pin";
import { createDeathPinObserver } from "../features/worlds/world-death-pin";
import { worldRepository } from "../features/worlds/use-world-library";
import { WORLD_HOTKEY_FEEDBACK_MESSAGE_ID, type WorldHotkeyFeedback } from "../features/worlds/world-hotkey-feedback";
import { createLiveWorldConnector } from "../features/worlds/live-world-connector";
import { MAP_WINDOW_COMMAND_MESSAGE_ID } from "../features/map/map-window-command";
import { closeOverlayMarkerDetails } from "../features/overlay/overlay-marker-details";
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
import i18n from "../i18n";

// Both surfaces are opt-out in Settings, so the preferences are read at launch
// time (never cached) — a toggle flipped mid-session applies to the next launch.
const showGameWindows = () => {
  const preferences = getLaunchPreferences();
  if (preferences.autoOpenAppWithGame) void revealMainWindowToFront("main");
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
 * tray, the hotkeys and the game start/stop reactions.
 *
 * A game-specific live-position reader belongs here too: start it when the
 * game is running, stop it (and `clearLivePosition()`) when it exits — see
 * `setGameRunning` below and docs/branching-guide.md.
 */
export const BackgroundController = () => {
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    const logGepDebug = (message: string, detail: unknown) =>
      console.info(`[GEP Debug] ${message} ${JSON.stringify(detail)}`);

    initTray();
    const journeyRecorder = startBackgroundJourneyRecorder();
    const deathPinObserver = createDeathPinObserver({
      repository: worldRepository,
      t: (key, options) => i18n.t(key, options),
      getLocale: () => i18n.resolvedLanguage ?? i18n.language ?? "en",
      debug: logGepDebug,
      onDeathPinSaved: pin => {
        broadcastFeedback({ type: "pin", status: "saved", x: pin.x, y: pin.y ?? 64, z: pin.z });
      },
    });
    // Overlay show/hide can only be observed from here (see background-analytics).
    const stopBackgroundAnalytics = startBackgroundAnalytics();
    let stopGameSession: (() => void) | null = null;
    let activeGameClassId: number | null = null;
    let latestGameSession: GameSession | null = null;
    const worldConnector = createLiveWorldConnector({ repository: worldRepository });
    let minimapLayoutTimer: number | null = null;
    let pendingGameResolution: overwolf.games.RunningGameInfo | null = null;
    const scheduleMinimapLayout = (gameInfo: overwolf.games.RunningGameInfo) => {
      pendingGameResolution = gameInfo;
      if (minimapLayoutTimer !== null) window.clearTimeout(minimapLayoutTimer);
      minimapLayoutTimer = window.setTimeout(() => {
        minimapLayoutTimer = null;
        const resolution = pendingGameResolution;
        pendingGameResolution = null;
        if (!resolution) return;
        void isOverlayMapVisible().then(visible => {
          if (!visible) return;
          void layoutOverlayMinimap(resolution).catch(error =>
            console.error("[Overlay] Unable to adapt the minimap to the game resolution", error));
        });
      }, 120);
    };
    const broadcastFeedback = (feedback: WorldHotkeyFeedback) => {
      for (const windowName of ["main", "in_game", "overlay_map"])
        overwolf.windows?.sendMessage?.(windowName, WORLD_HOTKEY_FEEDBACK_MESSAGE_ID, feedback, () => {});
    };
    const synchronizeSession = (running: boolean, gameClassId?: number) => {
      const nextClassId = running ? gameClassId ?? null : null;
      logGepDebug("Synchronizing game session", {
        running, gameClassId: gameClassId ?? null, activeGameClassId, nextClassId,
      });
      if (nextClassId === activeGameClassId) return;
      stopGameSession?.();
      stopGameSession = null;
      activeGameClassId = nextClassId;
      latestGameSession = null;
      deathPinObserver.reset();
      clearLivePosition();
      if (nextClassId !== null) stopGameSession = startGameSession(nextClassId, session => {
        const previousSession = latestGameSession;
        latestGameSession = structuredClone(session);
        worldConnector.observe(session);
        journeyRecorder.observe(session);
        void deathPinObserver.observe(session);
        if (!session.inWorld && previousSession?.inWorld !== false) {
          void closeOverlayMarkerDetails();
          void collapseOverlayMap();
        }
        const enteredWorld = session.inWorld
          && (!previousSession?.inWorld || previousSession.generation !== session.generation);
        if (enteredWorld && getLaunchPreferences().showOverlayWidgetWithGame) {
          void expandOverlayMap()
            .then(() => layoutOverlayMinimap())
            .catch(error => console.error("[Overlay] Unable to open the minimap on world entry", error));
        }
      });
    };

    let inGameAutoOpenTimer: number | null = null;
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
    const setGameRunning = (running: boolean, title?: string | null, gameClassId?: number) => {
      synchronizeSession(running, gameClassId);
      reportGameRunning(running, title);
      if (running) {
        showGameWindows();
        scheduleInGameAutoOpen();
        return;
      }
      journeyRecorder.finish();
      deathPinObserver.reset();
      cancelInGameAutoOpen();
      if (minimapLayoutTimer !== null) window.clearTimeout(minimapLayoutTimer);
      minimapLayoutTimer = null;
      pendingGameResolution = null;
      clearLivePosition();
      void closeOverlayMarkerDetails();
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
            ).catch(error => console.error("[Overlay] Unable to toggle the in-game app", error));
            return;
          }
          void toggleMainWindow();
        });
      }
      if (event.name === "toggle_overlay") {
        void isOverlayMapVisible().then(async (visible) => {
          if (visible) {
            await closeOverlayMarkerDetails();
            await collapseOverlayMap();
            return;
          }
          // The minimap represents a live world, so it cannot open from menus.
          if (!latestGameSession?.inWorld) return;
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (info?.isRunning && isTargetGame(info)) void expandOverlayMap();
          });
        });
        return;
      }
      if (event.name === "pin_current_position") {
        void saveCurrentPositionPin({ repository: worldRepository, session: latestGameSession,
          currentSession: () => latestGameSession,
          name: i18n.t("worldHotkeys.currentPositionName") }).then(result => {
          broadcastFeedback(result.status === "saved"
            ? { type: "pin", status: "saved", x: result.x, y: result.y, z: result.z }
            : { type: "pin", status: result.status });
        }, error => {
          console.error("[Hotkeys] Unable to pin the current position", error);
          broadcastFeedback({ type: "pin", status: "failed" });
        });
        return;
      }
      if (event.name === "zoom_minimap_in" || event.name === "zoom_minimap_out") {
        void isOverlayMapVisible().then(visible => {
          if (!visible) { broadcastFeedback({ type: "minimap", status: "unavailable" }); return; }
          overwolf.windows?.sendMessage?.("overlay_map", MAP_WINDOW_COMMAND_MESSAGE_ID,
            { type: "zoom", direction: event.name === "zoom_minimap_in" ? "in" : "out" }, result => {
              if (!result.success) broadcastFeedback({ type: "minimap", status: "unavailable" });
            });
        }, error => {
          console.error("[Hotkeys] Unable to read minimap visibility", error);
          broadcastFeedback({ type: "minimap", status: "unavailable" });
        });
      }
    };
    overwolf.settings?.hotkeys?.onPressed.addListener(onHotkey);

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      logGepDebug("Game info updated", {
        runningChanged: event.runningChanged,
        isRunning: event.gameInfo?.isRunning ?? null,
        classId: event.gameInfo?.classId ?? null,
        title: event.gameInfo?.title ?? null,
      });
      if (!event.gameInfo || !isTargetGame(event.gameInfo)) return;
      if (event.resolutionChanged) scheduleMinimapLayout(event.gameInfo);
      if (!event.runningChanged) return;
      setGameRunning(event.gameInfo.isRunning, event.gameInfo.title, event.gameInfo.classId);
    };
    overwolf.games?.onGameInfoUpdated.addListener(onGameInfoUpdated);

    overwolf.games?.getRunningGameInfo?.((info) => {
      logGepDebug("Initial running-game probe", {
        isRunning: info?.isRunning ?? null,
        classId: info?.classId ?? null,
        title: info?.title ?? null,
      });
      const isRunning = Boolean(info?.isRunning && isTargetGame(info));
      // The app can be started BY the game (manifest launch_events) or opened
      // mid-session, so the boot probe is a real session transition too.
      reportGameRunning(isRunning, info?.title);
      synchronizeSession(isRunning, info?.classId);
      if (isRunning) {
        showGameWindows();
        scheduleInGameAutoOpen();
      } else journeyRecorder.finish();
    });

    const onMessageReceived = (message: { id: string }) => {
      if (message.id === "show_main") void revealMainWindowToFront("main");
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      worldConnector.dispose();
      cancelInGameAutoOpen();
      if (minimapLayoutTimer !== null) window.clearTimeout(minimapLayoutTimer);
      stopGameSession?.();
      journeyRecorder.dispose();
      stopBackgroundAnalytics();
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
