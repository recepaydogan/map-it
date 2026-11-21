import { useEffect } from "react";
import { startBackgroundAnalytics } from "./background-analytics";
import { setGameRunning } from "../services/analytics/analytics";
import { startNightreignGep, stopNightreignGep } from "../overwolf-utils/gep";
import { destroyTray, initTray } from "../overwolf-utils/tray-manager";
import {
  closeWindow,
  collapseOverlayMap,
  ensureWindowFitsVisibleBounds,
  expandOverlayMap,
  getOpenWindow,
  hideOverlayWindows,
  isOverlayMapVisible,
  isOverlayWidgetVisible,
  OVERLAY_DISMISS_HINT_MSG,
  OVERLAY_MAP_WINDOW,
  OVERLAY_WIDGET_WINDOW,
  parkWindowBesideAnchor,
  restoreWindow,
  restoreWindowPreservingPlacement,
  restoreWindowWithDefaultBounds,
  revealMainWindowToFront,
  surfaceWindowOverExternalApp,
  toggleWindow,
} from "../overwolf-utils/window-manager";
import {
  closeCompanion,
  COMPANION_WINDOW_NAME,
  openCompanion,
} from "../windows/companion/open-companion";
import {
  isOAuthLaunch,
  OAUTH_LAUNCH_MESSAGE_ID,
  OAUTH_LAUNCH_STORAGE_KEY,
} from "../services/auth/oauth-deeplink";
import { getLaunchPreferences } from "../services/system/launch-preferences";

/* ──────────────────────────────────────────────────────────────────────────
 * Launch-source handling
 *
 * Overwolf passes a `source` to the background page (via URL params on cold
 * start, and via the onAppLaunchTriggered event on relaunch). We use it to
 * decide whether to show the main window or stay quietly in the background.
 *
 *  - GameLaunch auto-start  → stay in background (don't interrupt the player)
 *  - user-visible sources   → reveal the main window
 * ──────────────────────────────────────────────────────────────────────── */

const GAME_AUTO_LAUNCH_SOURCES = new Set(["gamelaunchevent"]);

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

/**
 * Allow-list of game titles the app may react to. Defense-in-depth: the manifest
 * `game_targeting` + `launch_events` already lock the app to Elden Ring
 * (game id 21866) and Elden Ring Nightreign (25918), so Overwolf only delivers
 * game events for those two. Re-checking the title here guarantees that even if
 * targeting were ever broadened by accident, we never relocate the window for —
 * or start tracking — any other game.
 */
const ELDEN_RING_TITLE_RE = /elden ring|nightreign/i;

/** True if a game-info-update `reason` array reports an exclusive-mode change.
 * The enum ships both the correct and a typo'd spelling. */
const reasonHasExclusiveChange = (reasons: readonly unknown[]): boolean =>
  reasons.some((r) => {
    const s = String(r).toLowerCase();
    return s.includes("exclusivemode") || s.includes("exlusivemode");
  });

const getLaunchSourceFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("source");
};

/** Cold-start protocol launches arrive as ?source=urlscheme&parameter=<url>. */
const getLaunchParameterFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("parameter");
};

/* ──────────────────────────────────────────────────────────────────────────
 * OAuth deep-link relay
 *
 * Google sign-in redirects to eldenringatlas://auth/callback?code=…; the OS
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

const extractLaunchSource = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).searchParams.get("source");
  } catch {
    const match = value.match(/[?&]source=([^&#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
};

const isGameAutoLaunchSource = (source: string | null) =>
  source !== null && GAME_AUTO_LAUNCH_SOURCES.has(source);

const shouldRevealMainWindow = (source: string | null) =>
  // No source (manual launch from the dock) or an explicitly user-visible one.
  source === null || USER_VISIBLE_LAUNCH_SOURCES.has(source);

/* On game launch — or when the app opens with the game already running — the
 * background's only job is making sure the main window is OPEN. The positioning
 * (move OFF the game's monitor, then surface) lives in
 * game-launch-monitor-switch.ts and runs inside the MAIN window: a robust
 * probe-based engine ported from BF6 that retries until the game's late-arriving
 * monitorHandle is known. Opening main hands off to that engine; the in-game
 * overlay widget is surfaced separately by the game-detection logic. */
const ensureMainWindowOpen = (context: string): void => {
  restoreWindowPreservingPlacement("main").catch((err) =>
    console.warn(`[Background] Failed to open main on ${context}`, err),
  );
};

/* How long / how often the companion tracks the main window after a game launch.
 * The dashboard relocates ITSELF off the game's monitor (game-launch-monitor-
 * switch) and that move races the game window actually spawning — its
 * monitorHandle can arrive several seconds late. A one-shot park would strand the
 * companion on the game's screen, so we FOLLOW main until the two agree on a
 * monitor, then stop. */
const COMPANION_FOLLOW_INTERVAL_MS = 700;
const COMPANION_FOLLOW_DURATION_MS = 12_000;

/* Quit: how long the background lingers after the UI windows are down, so the
 * companion's close report gets out (see the exit_app handler), and the hard
 * ceiling on that wait so a stuck close can never leave the app running headless. */
const EXIT_REPORT_GRACE_MS = 300;
const EXIT_TIMEOUT_MS = 2000;

/* Open the Roundtable companion alongside the game and keep it docked to the
 * dashboard while that dashboard is still moving. We only ever OPEN it — closing
 * is left entirely to the user, so there is deliberately no teardown on game
 * stop: the companion is meant to survive a session. */
const ensureCompanionOpen = (context: string): void => {
  restoreWindowPreservingPlacement(COMPANION_WINDOW_NAME).catch((err) =>
    console.warn(`[Background] Failed to open companion on ${context}`, err),
  );

  let elapsed = 0;
  let parkedOnce = false;
  const followMain = async () => {
    const [anchor, satellite] = await Promise.all([
      getOpenWindow("main").catch(() => null),
      getOpenWindow(COMPANION_WINDOW_NAME).catch(() => null),
    ]);
    if (!anchor || !satellite) return;

    const anchorMonitor = typeof anchor.monitorId === "string" ? anchor.monitorId : null;
    const satelliteMonitor =
      typeof satellite.monitorId === "string" ? satellite.monitorId : null;

    // Once parked, only re-park if the dashboard has since moved to another
    // screen — otherwise we'd fight the user dragging the companion around.
    if (parkedOnce && anchorMonitor != null && anchorMonitor === satelliteMonitor) return;
    if (parkedOnce && anchorMonitor == null) return;

    parkedOnce = true;
    await parkWindowBesideAnchor(COMPANION_WINDOW_NAME, "main").catch((err) =>
      console.warn(`[Background] Failed to position companion on ${context}`, err),
    );
    await surfaceWindowOverExternalApp(COMPANION_WINDOW_NAME).catch((err) =>
      console.warn(`[Background] Failed to surface companion on ${context}`, err),
    );
  };

  const tick = () => {
    void followMain();
    elapsed += COMPANION_FOLLOW_INTERVAL_MS;
    if (elapsed < COMPANION_FOLLOW_DURATION_MS) {
      window.setTimeout(tick, COMPANION_FOLLOW_INTERVAL_MS);
    }
  };
  window.setTimeout(tick, COMPANION_FOLLOW_INTERVAL_MS);
};

/* Whether the Roundtable may open itself when the game starts. Read FRESH at
 * each game event (never cached) so flipping the Settings switch takes effect
 * immediately — the value crosses windows via localStorage + the storage event.
 * Off doesn't disable the companion, it only stops the auto-open: the
 * toggle_companion hotkey still brings it up. */
const mayOpenCompanionWithGame = (): boolean => getLaunchPreferences().openCompanionWithGame;

/* Open the companion for a game-driven launch, honouring the setting. */
const openCompanionForGame = (context: string): void => {
  if (mayOpenCompanionWithGame()) {
    ensureCompanionOpen(context);
  } else {
    console.log(`[Background] Roundtable auto-open is off on ${context} — hotkey only.`);
  }
};

/* Whether the IN-GAME app (the overlay: corner map widget + expanded map) may
 * auto-appear when the game launches. Read FRESH at each game event (never cached)
 * so flipping the Settings switch takes effect immediately — the value crosses
 * windows via localStorage + the storage event. The DESKTOP window ALWAYS opens
 * with the game regardless of this setting; only the in-game overlay is gated.
 * When off, the background brain still runs (and the desktop app still opens); we
 * simply never surface the in-game overlay. */
const mayAutoOpenInGameApp = (): boolean => getLaunchPreferences().autoOpenInGameApp;

/* ──────────────────────────────────────────────────────────────────────────
 * Background controller
 *
 * This component renders nothing. It lives in the invisible background window
 * (background.html) and is the app's long-lived "brain": it owns the tray,
 * global hotkeys, app-launch events, and game detection — i.e. everything that
 * must keep running even when the main window is closed.
 * ──────────────────────────────────────────────────────────────────────── */
export const BackgroundController = () => {
  useEffect(() => {
    if (typeof overwolf === "undefined") {
      // Running in a plain browser (e.g. `npm run dev`) — nothing to wire up.
      console.log("[Background] Not in Overwolf — background controller idle.");
      return;
    }

    initTray();

    // Watches the companion window die from the outside — the only vantage point
    // from which that can be seen at all (see background-analytics).
    const stopAnalytics = startBackgroundAnalytics();

    // Re-register the URL protocol handler if it was lost (safe no-op otherwise).
    overwolf.extensions?.current?.repairUrlProtocol?.(() => {});

    // Cold-start via the OAuth protocol (eldenringatlas://auth/callback?code=…):
    // forward the code to the main window so it can complete the exchange. The
    // relay also opens main and the main window surfaces itself after the
    // exchange, so skip the generic cold-start reveal below for this case.
    const initialParameter = getLaunchParameterFromUrl();
    const isOAuthColdStart = isOAuthLaunch(initialParameter);
    if (isOAuthColdStart && initialParameter) {
      relayOAuthLaunchToMain(initialParameter);
    }

    // 1. Cold-start: decide whether to show the main window based on how we were
    //    launched. On first ever launch we center at the manifest default size.
    const initialSource = getLaunchSourceFromUrl();
    if (isOAuthColdStart) {
      // Handled by the OAuth relay above — nothing else to do here.
    } else if (isGameAutoLaunchSource(initialSource)) {
      // The game auto-started the app (e.g. installed/launched while playing).
      // The desktop window ALWAYS opens with the game now; its monitor-switch
      // engine relocates it onto the second screen. The in-game overlay is
      // surfaced separately (and IS gated by the setting) via the boot-time
      // catch-up below.
      console.log(
        `[Background] Cold start from game auto-launch (${initialSource}) — opening main; it repositions itself.`,
      );
      ensureMainWindowOpen("game auto-launch cold start");
      openCompanionForGame("game auto-launch cold start");
    } else if (shouldRevealMainWindow(initialSource)) {
      restoreWindowWithDefaultBounds("main")
        .then(() => ensureWindowFitsVisibleBounds("main"))
        .catch((err) =>
          console.warn("[Background] Failed to restore main on cold start", err),
        );
    }

    // 2. Relaunch while already running: Overwolf fires onAppLaunchTriggered
    //    instead of booting a new background page.
    const onAppLaunchTriggered = (event?: { origin?: string; parameter?: string }) => {
      // OAuth deep-link relaunch: forward the auth code to the main window and
      // stop — the main window un-minimizes and surfaces itself once the code is
      // exchanged, so we must not also run the default-bounds reveal below.
      if (event?.parameter && isOAuthLaunch(event.parameter)) {
        relayOAuthLaunchToMain(event.parameter);
        return;
      }

      const source = extractLaunchSource(event?.origin);
      if (isGameAutoLaunchSource(source)) {
        // The desktop window ALWAYS opens with the game; its own monitor-switch
        // engine (which also listens for onAppLaunchTriggered) handles the
        // second-screen positioning. The in-game overlay is surfaced (and gated)
        // by the game-start branch below.
        console.log(`[Background] Relaunch from game auto-launch (${source}) — ensuring main is open.`);
        ensureMainWindowOpen("game auto-launch relaunch");
        openCompanionForGame("game auto-launch relaunch");
        return;
      }
      if (shouldRevealMainWindow(source)) {
        // Relaunch from the dock/tray/hotkey while the app is already running:
        // restore AND surface over the foreground (the game, when the click came
        // from the in-game dock). A plain restore leaves the window behind the
        // game, which is why clicking the dock looked like it "did nothing".
        revealMainWindowToFront("main").catch((err) =>
          console.warn("[Background] Failed to reveal main on relaunch", err),
        );
      }
    };
    overwolf.extensions?.onAppLaunchTriggered?.addListener(onAppLaunchTriggered);

    // 3. Global hotkeys (declared in manifest.json under data.hotkeys).
    //
    // Rapid presses of toggle_app used to fire OVERLAPPING toggle sequences: each
    // toggle reads the window state asynchronously, so two in-flight toggles could
    // both read "minimized" and both restore — or interleave a restore inside a
    // minimize — leaving Overwolf mid-transition and the window half-restored.
    // Chain every press behind the previous one so each toggle reads the SETTLED
    // result of the prior toggle; a hotkey mash becomes an orderly sequence.
    let appToggleChain: Promise<void> = Promise.resolve();
    const hotkeyListener = (event: overwolf.settings.hotkeys.OnPressedEvent) => {
      if (event.name === "toggle_app") {
        // Toggle main: restore if hidden/minimized, otherwise minimize. On the
        // restore leg, ALSO raise the window above the game — which owns the
        // foreground while the player is in a match. A plain restore only
        // un-minimizes the window; it leaves it BEHIND the game, so the hotkey
        // would appear to "do nothing". surfaceWindowOverExternalApp lifts it
        // over the external foreground app (setTopmost pulse + release), so the
        // hotkey reliably brings the app forward.
        appToggleChain = appToggleChain
          .then(() =>
            toggleWindow("main", async () => {
              await restoreWindowPreservingPlacement("main");
              await surfaceWindowOverExternalApp("main");
            }),
          )
          .catch((err) => console.warn("[Background] Failed to toggle app", err));
        return;
      }
      if (event.name === "toggle_companion") {
        // Direct open/close (never minimize): close the Roundtable when it's
        // up, open + park it beside the dashboard when it isn't.
        void getOpenWindow(COMPANION_WINDOW_NAME)
          .then((win) =>
            win && (win.stateEx ?? win.state) === "normal"
              ? closeCompanion()
              : openCompanion(),
          )
          .catch((err) => console.warn("[Background] Failed to toggle companion", err));
        return;
      }
      if (event.name === "toggle_overlay") {
        // Toggle the expanded in-game map (Ctrl+M). Both directions go through the
        // overlay helpers, which swap the collapsed circle widget in/out so exactly
        // one overlay window is visible. Showing the map engages exclusive mode
        // (manifest focus_game_takeover: ReleaseOnLostFocus) so it's interactive
        // even in a cursor-less fullscreen game.
        void (async () => {
          if (await isOverlayMapVisible()) await collapseOverlayMap();
          else await expandOverlayMap();
        })().catch((err) =>
          console.warn("[Background] Failed to toggle overlay map", err),
        );
        return;
      }
      if (event.name === "dismiss_overlay") {
        // Toggle the ENTIRE overlay off/on (Ctrl+Shift+M):
        //  - map open        → hide everything immediately (the player is already
        //    in the map, so no corner hint would be seen anyway);
        //  - only the widget → let the widget flash a "press … to reopen" hint and
        //    hide ITSELF, so hiding is never a dead end;
        //  - nothing visible → bring back the unobtrusive corner widget.
        void (async () => {
          const [mapVisible, widgetVisible] = await Promise.all([
            isOverlayMapVisible(),
            isOverlayWidgetVisible(),
          ]);
          if (mapVisible) {
            await hideOverlayWindows();
          } else if (widgetVisible) {
            overwolf.windows?.sendMessage?.(
              OVERLAY_WIDGET_WINDOW,
              OVERLAY_DISMISS_HINT_MSG,
              {},
              () => {},
            );
          } else {
            await restoreWindow(OVERLAY_WIDGET_WINDOW);
          }
        })().catch((err) =>
          console.warn("[Background] Failed to toggle overlay dismiss", err),
        );
      }
    };
    overwolf.settings?.hotkeys?.onPressed.addListener(hotkeyListener);

    // 4. Game detection + in-game-overlay lifecycle.
    // Per Overwolf, game events fire reliably in the BACKGROUND window (not in
    // in-game windows), so the "close the map when exclusive mode ends" detection
    // lives here. Track the map's visibility + show-time so we only close it while
    // it's actually open, and skip the open's own "exclusive on" (grace window).
    let overlayMapVisible = false;
    let overlayMapShownAt = 0;
    const onOverlayMapState = (e: {
      window_name?: string;
      window_state_ex?: string;
      window_state?: string;
    }) => {
      if (e.window_name !== OVERLAY_MAP_WINDOW) return;
      const s = e.window_state_ex ?? e.window_state ?? "";
      if (s === "normal" || s === "maximized") {
        overlayMapVisible = true;
        overlayMapShownAt = Date.now();
      } else {
        overlayMapVisible = false;
      }
    };
    overwolf.windows?.onStateChanged?.addListener(onOverlayMapState);

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.gameInfo) return;
      // Hard allow-list guard (see ELDEN_RING_TITLE_RE): only ever act for Elden
      // Ring / Nightreign — never for any other game.
      if (!ELDEN_RING_TITLE_RE.test(event.gameInfo.title ?? "")) return;
      // Nightreign is the only targeted game with a GEP feed (base Elden Ring has none),
      // so gate the events listener on its title. The boss_fight bridge it drives opens
      // the selected Nightlord's page in the main window.
      const isNightreign = /nightreign/i.test(event.gameInfo.title ?? "");

      if (event.runningChanged) {
        // Context only — the game_started / game_stopped EVENTS belong to the
        // desktop window (use-analytics); reporting them here too would double
        // every game session. This just stamps the split onto what the background
        // itself reports, i.e. whether the companion was closed mid-session.
        setGameRunning(event.gameInfo.isRunning, event.gameInfo.title);

        if (event.gameInfo.isRunning) {
          console.log("[Background] Targeted game started:", event.gameInfo.title);
          if (isNightreign) startNightreignGep();
          // The desktop window ALWAYS opens with the game; it moves ITSELF off the
          // game's monitor onto the second screen (game-launch-monitor-switch,
          // running in the main window). Never gated — the setting governs only
          // the in-game overlay.
          ensureMainWindowOpen("game start");
          // …and the Roundtable docks beside it, unless the player turned that
          // off (the hotkey still opens it).
          openCompanionForGame("game start");
          // Surface the in-game map overlay as a collapsed corner widget — but ONLY
          // when the user keeps the in-game app enabled. It docks itself to the game
          // monitor on mount; the Ctrl+M hotkey (or a click) expands it into the full
          // map. Off means no in-game overlay; the desktop app above still opened.
          if (mayAutoOpenInGameApp()) {
            restoreWindow(OVERLAY_WIDGET_WINDOW).catch((err) =>
              console.warn("[Background] Failed to show overlay on game launch", err),
            );
          } else {
            console.log("[Background] In-game app is off — skipping the overlay; desktop still opened.");
          }
        } else {
          console.log("[Background] Targeted game stopped.");
          if (isNightreign) stopNightreignGep();
          // No game to overlay — dismiss both overlay windows until next session.
          hideOverlayWindows().catch(() => {});
        }
      }

      // Exclusive mode ended (Ctrl+Tab back, or a click out to the game) while the
      // map is open → collapse it. The open's own "exclusive on" lands inside the
      // grace window after the show and is ignored.
      if (
        reasonHasExclusiveChange(event.reason ?? []) &&
        overlayMapVisible &&
        Date.now() - overlayMapShownAt > 700
      ) {
        collapseOverlayMap().catch(() => {});
      }
    };
    overwolf.games?.onGameInfoUpdated.addListener(onGameInfoUpdated);

    // 4b. The real exclusive-mode-exit signal: inputTracking. Every input event
    // carries `onGame` — true when it reached the GAME, false when it reached an
    // Overwolf overlay. While the map is open, the first input that lands on the
    // GAME means the user left exclusive mode (returned to the game), so collapse
    // the map. Focus-independent (global, in the background) — unlike a DOM keydown
    // in the overlay window, which only fires once that window has keyboard focus.
    overwolf.games?.inputTracking?.init?.(() => {});
    const onGameInput = (e: { onGame?: boolean }) => {
      if (
        e.onGame === true &&
        overlayMapVisible &&
        Date.now() - overlayMapShownAt > 700
      ) {
        collapseOverlayMap().catch(() => {});
      }
    };
    // Discrete input events only: each carries `onGame` = whether the input
    // actually reached the GAME (true) vs an Overwolf overlay (false). This
    // reflects input ROUTING (exclusive mode), unlike getMousePosition.onGame,
    // which reflects cursor POSITION (true over the dimmed game even WHILE in
    // exclusive mode) and so wrongly closed the just-opened map.
    overwolf.games?.inputTracking?.onKeyDown?.addListener(onGameInput);
    overwolf.games?.inputTracking?.onKeyUp?.addListener(onGameInput);
    overwolf.games?.inputTracking?.onMouseDown?.addListener(onGameInput);
    overwolf.games?.inputTracking?.onMouseUp?.addListener(onGameInput);

    // 4c. Boot-time catch-up: onGameInfoUpdated only fires on CHANGES, so if a
    // targeted game is ALREADY running when the app (re)launches, the game-start
    // branch above never runs and the corner widget would be missing. Proactively
    // ask for the current game and surface the widget (and start GEP) if so.
    overwolf.games?.getRunningGameInfo?.((info) => {
      if (!info?.isRunning) return;
      if (!ELDEN_RING_TITLE_RE.test(info.title ?? "")) return;
      setGameRunning(true, info.title);
      if (/nightreign/i.test(info.title ?? "")) startNightreignGep();
      // The game was ALREADY running when the app booted, so the game-start
      // branch never fired — bring the companion up here too.
      openCompanionForGame("boot (game already running)");
      // In-game overlay is gated by the setting; the desktop window's own reveal
      // path is handled separately (cold start / shouldRevealMainWindow above).
      if (!mayAutoOpenInGameApp()) return;
      restoreWindow(OVERLAY_WIDGET_WINDOW).catch((err) =>
        console.warn("[Background] Failed to show overlay on boot (game already running)", err),
      );
    });

    // 5. Cross-window messaging hub. UI windows talk to the background via
    //    overwolf.windows.sendMessage("background", id, content). Route them here.
    const onMessageReceived = (message: { id: string; content?: unknown }) => {
      switch (message.id) {
        case "show_main":
          revealMainWindowToFront("main").catch(() => {});
          break;
        case "exit_app": {
          // The background window goes LAST: it is what reports the companion's
          // close (background-analytics), and Overwolf delivers that state change
          // to a window that has to still be alive to hear it. The race is only a
          // safety net — if a close ever hangs, the app still exits.
          const closed = Promise.allSettled([
            closeWindow("main"),
            closeWindow("companion"),
            closeWindow("overlay"),
            closeWindow("overlay_map"),
          ]).then(() => new Promise((r) => setTimeout(r, EXIT_REPORT_GRACE_MS)));
          void Promise.race([
            closed,
            new Promise((r) => setTimeout(r, EXIT_TIMEOUT_MS)),
          ]).then(() => closeWindow("background").catch(() => {}));
          break;
        }
        default:
          break;
      }
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      destroyTray();
      stopAnalytics();
      overwolf.extensions?.onAppLaunchTriggered?.removeListener(onAppLaunchTriggered);
      overwolf.settings?.hotkeys?.onPressed.removeListener(hotkeyListener);
      overwolf.windows?.onStateChanged?.removeListener(onOverlayMapState);
      overwolf.games?.onGameInfoUpdated.removeListener(onGameInfoUpdated);
      overwolf.games?.inputTracking?.onKeyDown?.removeListener(onGameInput);
      overwolf.games?.inputTracking?.onKeyUp?.removeListener(onGameInput);
      overwolf.games?.inputTracking?.onMouseDown?.removeListener(onGameInput);
      overwolf.games?.inputTracking?.onMouseUp?.removeListener(onGameInput);
      overwolf.windows?.onMessageReceived?.removeListener(onMessageReceived);
    };
  }, []);

  return null;
};

export default BackgroundController;
