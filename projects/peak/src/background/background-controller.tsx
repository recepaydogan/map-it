import { useEffect } from "react";
import {
  OAUTH_LAUNCH_MESSAGE_ID,
  OAUTH_LAUNCH_STORAGE_KEY,
  isOAuthLaunch,
} from "../auth/oauth-deeplink";
import { APP_CONFIG } from "../config/app-config";
import { getPreferences } from "../state/preferences-store";
import { updatePeakSession } from "../state/peak-session-store";
import { startExpeditionRecorder } from "../features/map/expedition-store";
import { startLivePositionAnalytics } from "../features/map/live-position-analytics";
import { startPeakGameEvents } from "../overwolf/game-events";
import { startGameMonitor } from "../overwolf/game-monitor";
import { ensureTrackingBridge } from "../overwolf/tracking-installer";
import { initTray } from "../overwolf/tray-manager";
import { restoreWindow, revealWindow, toggleWindow } from "../overwolf/window-manager";
import { initAnalytics } from "../utils/analytics/analytics";

const GAME_LAUNCH_SOURCE = "gamelaunchevent";

/** Overwolf launch origins that mean the user clicked something — the dock
 * tile, the tray icon, a hotkey — and expects the window in front. */
const USER_VISIBLE_LAUNCH_SOURCES = new Set([
  "after-install",
  "commandline",
  "dock",
  "hotkey",
  "odk",
  "storeapi",
  "tray",
  "urlscheme",
]);

const getLaunchSource = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("source")?.toLowerCase() ?? null;
};

const shouldOpenMainWindow = (source: string | null): boolean =>
  source !== GAME_LAUNCH_SOURCE || getPreferences().openOnGameLaunch;

/** A missing source is a manual launch from the dock. */
const isUserVisibleLaunch = (source: string | null): boolean =>
  source === null || USER_VISIBLE_LAUNCH_SOURCES.has(source);

/** Auto-launch restores quietly; a dock or tray click surfaces over the game. */
const openMainWindow = (source: string | null): void => {
  if (!shouldOpenMainWindow(source)) return;
  const open = isUserVisibleLaunch(source) ? revealWindow : restoreWindow;
  void open(APP_CONFIG.mainWindowName);
};

const getLaunchParameter = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("parameter");
};

/**
 * OAuth deep-link relay.
 *
 * Google sign-in redirects to peakmap://auth/callback?code=...; the OS hands
 * that URL to Overwolf, which delivers it to the background window (the start
 * window) — as a cold-start URL parameter or via onAppLaunchTriggered. The PKCE
 * verifier needed to exchange the code lives in the MAIN window's storage, so
 * we forward the parameter there: drop it in shared localStorage (so a freshly
 * opened main picks it up on mount) and push it as a window message (so an
 * already-open main reacts immediately).
 */
const relayOAuthLaunchToMain = (rawParameter: string): void => {
  if (!isOAuthLaunch(rawParameter)) return;

  try {
    window.localStorage.setItem(OAUTH_LAUNCH_STORAGE_KEY, JSON.stringify({ rawParameter }));
  } catch {
    // Fall back to the window message below if storage is unavailable.
  }

  void restoreWindow(APP_CONFIG.mainWindowName).catch((error) =>
    console.warn("[Background] Failed to open main for OAuth hand-off", error),
  );

  const push = () =>
    overwolf.windows?.sendMessage?.(
      APP_CONFIG.mainWindowName,
      OAUTH_LAUNCH_MESSAGE_ID,
      { rawParameter },
      () => {},
    );
  // Send now and once more shortly after, in case main is still mounting.
  push();
  setTimeout(push, 900);
};

export const BackgroundController = () => {
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    initAnalytics("background");

    initTray();
    const gameEvents = startPeakGameEvents();
    let stopLivePositionAnalytics: (() => void) | null = null;
    const stopGameMonitor = startGameMonitor({
      onRunningChange: (isGameRunning) => {
        updatePeakSession((current) => ({
          isGameRunning,
          gameStartedAt: isGameRunning
            ? current.gameStartedAt ?? Date.now()
            : null,
          ...(!isGameRunning
            ? {
                scene: null, gameMode: null, partySize: null, matchActive: false,
                matchStartedAt: null, climbStartedAt: null,
              }
            : {}),
        }));
        if (isGameRunning) {
          gameEvents.refresh();
          stopLivePositionAnalytics?.();
          stopLivePositionAnalytics = startLivePositionAnalytics();
        } else {
          stopLivePositionAnalytics?.();
          stopLivePositionAnalytics = null;
        }
        // Game start/stop transitions retry any deferred bridge install
        // (files can be locked while the game runs).
        void ensureTrackingBridge();
      },
    });
    void ensureTrackingBridge();
    const stopExpeditionRecorder = startExpeditionRecorder();

    // Re-register the URL protocol handler if it was lost (safe no-op otherwise).
    overwolf.extensions?.current?.repairUrlProtocol?.(() => {});

    // Cold start via the OAuth protocol (peakmap://auth/callback?code=...):
    // the relay opens main and hands it the code, so skip the normal reveal.
    const initialParameter = getLaunchParameter();
    if (isOAuthLaunch(initialParameter) && initialParameter) {
      relayOAuthLaunchToMain(initialParameter);
    } else {
      openMainWindow(getLaunchSource());
    }

    const onHotkey = (event: overwolf.settings.hotkeys.OnPressedEvent) => {
      if (event.name === "toggle_app") void toggleWindow(APP_CONFIG.mainWindowName);
      if (event.name === "toggle_overlay") void toggleWindow(APP_CONFIG.overlayWindowName);
    };

    // Relaunch while the app is already running: Overwolf fires this instead of
    // booting a second background page.
    const onLaunch = (event: overwolf.extensions.AppLaunchTriggeredEvent) => {
      // OAuth deep-link relaunch: forward the auth code to the main window and
      // stop — main surfaces itself once the code is exchanged.
      if (event.parameter && isOAuthLaunch(event.parameter)) {
        relayOAuthLaunchToMain(event.parameter);
        return;
      }
      openMainWindow(event.origin?.toLowerCase() ?? null);
    };

    overwolf.settings.hotkeys.onPressed.addListener(onHotkey);
    overwolf.extensions.onAppLaunchTriggered.addListener(onLaunch);

    return () => {
      gameEvents.stop();
      stopGameMonitor();
      stopLivePositionAnalytics?.();
      stopExpeditionRecorder();
      overwolf.settings.hotkeys.onPressed.removeListener(onHotkey);
      overwolf.extensions.onAppLaunchTriggered.removeListener(onLaunch);
    };
  }, []);

  return null;
};
