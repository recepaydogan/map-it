import { useEffect } from "react";
import {
  noteInGameAutoOpen,
  reportGameRunning,
  startBackgroundAnalytics,
} from "./background-analytics";
import { startLiveLootReader } from "../features/live-loot/live-loot-reader";
import {
  runBridgeModInstall,
  startBridgeModGameStopRetries,
  startBridgeModSessionRetries,
} from "../features/live-bridge/bridge-mod-install-runner";
import { startLiveBridgeAnalytics } from "../features/live-bridge/live-bridge-analytics";
import { startLiveGameSessionReader } from "../features/live-bridge/live-game-session-reader";
import { clearLiveLoot } from "../features/live-loot/live-loot-store";
import { clearLivePosition, subscribeLivePosition } from "../features/live-position/live-position-store";
import { clearDesktopMapFollow, startDesktopMapFollow } from "../features/live-position/desktop-map-follow";
import { startLivePositionReader } from "../features/live-position/live-position-reader";
import { startNativePositionLauncher } from "../features/live-position/native-position-launcher";
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
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import { markInGameAutoOpened } from "../features/overlay/in-game-auto-open";
import { startOverlayKeyboardMovement } from "../features/overlay/overlay-keyboard-movement";
import {
  isOAuthLaunch,
  OAUTH_LAUNCH_MESSAGE_ID,
  OAUTH_LAUNCH_STORAGE_KEY,
} from "../services/auth/oauth-deeplink";

const PROJECT_ZOMBOID_GAME_ID = 10598;
const PROJECT_ZOMBOID_TITLE = /project zomboid/i;

const isProjectZomboid = (gameInfo?: { classId?: number; title?: string }) =>
  Number(gameInfo?.classId) === PROJECT_ZOMBOID_GAME_ID ||
  PROJECT_ZOMBOID_TITLE.test(gameInfo?.title ?? "");

/** Cold-start protocol launches arrive as ?source=urlscheme&parameter=<url>. */
const getLaunchParameterFromUrl = (): string | null =>
  new URLSearchParams(window.location.search).get("parameter");

/* ──────────────────────────────────────────────────────────────────────────
 * OAuth deep-link relay
 *
 * Google sign-in redirects to pzinteractivemap://auth/callback?code=…; the OS
 * hands that URL to Overwolf, which delivers it to the background window (the
 * start window) — either as a cold-start URL parameter or via
 * onAppLaunchTriggered. The PKCE verifier needed to exchange the code lives in
 * the MAIN window's storage, so we forward the parameter there: drop it in
 * shared localStorage (so a freshly-opened main can pick it up on mount) and
 * also push it as a window message (so an already-open main reacts immediately).
 * ──────────────────────────────────────────────────────────────────────── */
const relayOAuthLaunchToMain = (rawParameter: string): void => {
  if (!isOAuthLaunch(rawParameter)) return;

  try {
    window.localStorage.setItem(
      OAUTH_LAUNCH_STORAGE_KEY,
      JSON.stringify({ rawParameter }),
    );
  } catch {
    // Fall back to the window message below if storage is unavailable.
  }

  restoreWindowPreservingPlacement("main").catch((err) =>
    console.warn("[Background] Failed to open main for OAuth hand-off", err),
  );

  const push = () =>
    overwolf.windows?.sendMessage?.(
      "main",
      OAUTH_LAUNCH_MESSAGE_ID,
      { rawParameter },
      () => {},
    );
  // Send now and once more shortly after, in case main is still mounting.
  push();
  setTimeout(push, 900);
};

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
 * a short while after a Project Zomboid launch the full-app overlay is opened
 * for them, with a one-shot banner naming the toggle hotkey (see
 * in-game-auto-open.ts). Multi-monitor setups keep the desktop window instead.
 * The delay lets the game finish loading before an overlay pops over it.
 */
const IN_GAME_AUTO_OPEN_DELAY_MS = 15_000;

export const BackgroundController = () => {
  useEffect(() => {
    const stopOverlayKeyboardMovement = startOverlayKeyboardMovement();
    if (typeof overwolf === "undefined") return;

    initTray();
    clearDesktopMapFollow();
    const stopDesktopFollow = subscribeLivePosition((position) => {
      if (position) startDesktopMapFollow();
    });
    // Overlay show/hide can only be observed from here (see background-analytics).
    const stopBackgroundAnalytics = startBackgroundAnalytics();

    // The Zomboid user folder is created by the GAME, so this launch pass can
    // legitimately find nothing on a machine where Project Zomboid has never
    // run; the session retries below pick it up (see bridge-mod-install-runner).
    void runBridgeModInstall("launch");
    let stopLiveBridgeReaders: (() => void) | null = null;
    let stopBridgeModGameStopRetries: (() => void) | null = null;
    const setLiveBridgeReadersRunning = (running: boolean) => {
      if (running && !stopLiveBridgeReaders) {
        stopBridgeModGameStopRetries?.();
        stopBridgeModGameStopRetries = null;
        // Started first, so a fix delivered on the reader's very first tick is
        // still seen as this session's first fix.
        const stopBridgeAnalytics = startLiveBridgeAnalytics();
        const stopPosition = startLivePositionReader();
        const stopNativePosition = startNativePositionLauncher();
        const stopLoot = startLiveLootReader();
        const stopSession = startLiveGameSessionReader();
        // A game session is the one moment the Zomboid folder is guaranteed to
        // exist, so the install gets three more passes while it runs.
        const stopBridgeModRetries = startBridgeModSessionRetries();
        stopLiveBridgeReaders = () => {
          stopBridgeAnalytics();
          stopPosition();
          stopNativePosition();
          stopLoot();
          stopSession();
          stopBridgeModRetries();
        };
      } else if (!running) {
        // Only a real session END gets the extra pass below; the boot probe
        // calls this with the game absent too, and the launch pass covers that.
        const sessionEnded = stopLiveBridgeReaders !== null;
        stopLiveBridgeReaders?.();
        stopLiveBridgeReaders = null;
        clearLivePosition();
        clearDesktopMapFollow();
        clearLiveLoot();
        // The game has just let go of the mod lists, so this is the safe moment
        // to enable the Bridge. A short retry sequence covers handles that are
        // released just after the running-state event arrives.
        if (sessionEnded) {
          stopBridgeModGameStopRetries?.();
          stopBridgeModGameStopRetries = startBridgeModGameStopRetries();
        }
      }
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
            if (!info?.isRunning || !isProjectZomboid(info)) return;
            markInGameAutoOpened();
            noteInGameAutoOpen(); // so the open below is reported as "auto"
            void expandInGameApp();
          });
        })();
      }, IN_GAME_AUTO_OPEN_DELAY_MS);
    };

    // Cold start via the OAuth protocol (pzinteractivemap://auth/callback?code=…):
    // forward the code to the main window so it can complete the exchange. The
    // relay opens main itself, and main surfaces itself once the exchange lands,
    // so the generic cold-start reveal below must not also run for this case.
    const initialParameter = getLaunchParameterFromUrl();
    const isOAuthColdStart = isOAuthLaunch(initialParameter);
    if (isOAuthColdStart && initialParameter) relayOAuthLaunchToMain(initialParameter);

    const source = new URLSearchParams(window.location.search).get("source");
    if (!isOAuthColdStart && source !== "gamelaunchevent") {
      void revealMainWindowToFront("main");
    }

    const onAppLaunchTriggered = (event?: { parameter?: string }) => {
      // OAuth deep-link relaunch: hand the auth code to the main window and
      // stop — main un-minimizes and surfaces itself once the code is exchanged.
      if (event?.parameter && isOAuthLaunch(event.parameter)) {
        relayOAuthLaunchToMain(event.parameter);
        return;
      }
      void revealMainWindowToFront("main");
    };
    overwolf.extensions?.onAppLaunchTriggered?.addListener(onAppLaunchTriggered);

    const onHotkey = (event: { name: string }) => {
      if (event.name === "toggle_desktop_app") {
        void toggleWindow("main", async () => {
          await restoreWindowPreservingPlacement("main");
          await surfaceWindowOverExternalApp("main");
        });
        return;
      }
      if (event.name === "toggle_app") {
        // In-game, the hotkey drives the full-app OVERLAY window instead of the
        // desktop-only main window (which can't paint over the game). On the
        // desktop it keeps toggling main as before.
        overwolf.games?.getRunningGameInfo?.((info) => {
          if (info?.isRunning && isProjectZomboid(info)) {
            void isInGameAppVisible().then((visible) =>
              visible ? collapseInGameApp() : expandInGameApp(),
            );
            return;
          }
          void toggleWindow("main", async () => {
            await restoreWindowPreservingPlacement("main");
            await surfaceWindowOverExternalApp("main");
          });
        });
      }
      if (event.name === "toggle_overlay") {
        void isOverlayMapVisible().then(async (visible) => {
          if (visible) {
            await collapseOverlayMap();
            return;
          }
          // The minimap is a native desktop window (not in_game_only), so
          // gate the hotkey ourselves: without the game it would float on
          // the bare desktop.
          overwolf.games?.getRunningGameInfo?.((info) => {
            if (info?.isRunning && isProjectZomboid(info)) void expandOverlayMap();
          });
        });
      }
    };
    overwolf.settings?.hotkeys?.onPressed.addListener(onHotkey);

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.gameInfo || !isProjectZomboid(event.gameInfo)) return;
      if (!event.runningChanged) return;
      reportGameRunning(event.gameInfo.isRunning, event.gameInfo.title);
      setLiveBridgeReadersRunning(event.gameInfo.isRunning);
      if (event.gameInfo.isRunning) {
        showGameWindows();
        scheduleInGameAutoOpen();
      } else {
        cancelInGameAutoOpen();
        void hideOverlayWindows();
      }
    };
    overwolf.games?.onGameInfoUpdated.addListener(onGameInfoUpdated);

    overwolf.games?.getRunningGameInfo?.((info) => {
      const isRunning = Boolean(info?.isRunning && isProjectZomboid(info));
      // The app can be started BY the game (manifest launch_events) or opened
      // mid-session, so the boot probe is a real session transition too.
      reportGameRunning(isRunning, info?.title);
      setLiveBridgeReadersRunning(isRunning);
      if (isRunning) {
        showGameWindows();
        scheduleInGameAutoOpen();
      }
    });

    const onMessageReceived = (message: { id: string }) => {
      if (message.id === "show_main") void revealMainWindowToFront("main");
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      stopOverlayKeyboardMovement();
      stopDesktopFollow();
      cancelInGameAutoOpen();
      stopLiveBridgeReaders?.();
      stopBridgeModGameStopRetries?.();
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
