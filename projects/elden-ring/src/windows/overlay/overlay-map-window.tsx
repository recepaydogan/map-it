import { Minimize2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import HeaderControls from "../../components/layout/header-controls";
import HeaderTabs from "../../components/layout/header-tabs";
import WindowHeader from "../../components/layout/window-header";
import { MapExperienceProvider } from "../../features/map-experience/map-experience";
import SecondScreenBanner from "../../features/ads/second-screen-banner";
import GameAutoOpenBanner from "../../features/settings/game-auto-open-banner";
import {
  collapseOverlayMap,
  getGameMonitorBounds,
} from "../../overwolf-utils/window-manager";
import { AuthProvider } from "../../state/auth-provider";
import { useAnalytics } from "../../state/use-analytics";
import { useNotificationWatch } from "../../state/use-notification-watch";
import { useOverlayMapAnalytics } from "./use-overlay-map-analytics";
import { resizeAndMoveCurrentWindow } from "../../utils/overwolf";
import MapShell from "../dashboard/map-shell";

/** Inset kept around the map so it never bleeds to the monitor edge. */
const EXPANDED_INSET = 80;
/** Caps so the map stays a window, not a fullscreen takeover. */
const EXPANDED_MAX = { width: 1280, height: 880 };

/**
 * The expanded in-game map (manifest `overlay_map` window: in_game_only,
 * transparent, `focus_game_takeover: ReleaseOnLostFocus`). Renders the real
 * MapShell — and the same HeaderTabs as the desktop window, so the in-game user
 * can switch between Map / Archive / Nightfarers / Nightlords / Relics / Account /
 * Settings too. Those surfaces are already rendered by MapShell off the (per-window)
 * ui-store `activeOverlay`; the tab strip is just what sets it, which the overlay
 * previously lacked. The tab strip doubles as the window's drag handle.
 *
 * Closing the map when exclusive mode ends (Ctrl+Tab / click-out to the game) is
 * driven from the BACKGROUND controller off inputTracking's `onGame` flag — that
 * fires regardless of which window has focus. The Ctrl+Tab keydown below is just a
 * focus-dependent fast path for when the user has already clicked into the map.
 */
const OverlayMapWindow = () => {
  const { t } = useTranslation();

  // Analytics for the in-game surface: every event from this window is stamped
  // `surface: "in_game"`, and the overlay's own open/close (with how long it
  // stayed up) is reported on top of the tab pageviews.
  useAnalytics("in_game");
  useOverlayMapAnalytics();
  // Same support poll as the desktop window: in-game is exactly where a player
  // notices a reply waiting, and the store is per-window.
  useNotificationWatch();

  // Size + center on the game monitor each time the window mounts (i.e. is shown).
  useEffect(() => {
    void (async () => {
      const mon = await getGameMonitorBounds();
      if (!mon) return;
      const width = Math.min(EXPANDED_MAX.width, mon.width - EXPANDED_INSET);
      const height = Math.min(EXPANDED_MAX.height, mon.height - EXPANDED_INSET);
      resizeAndMoveCurrentWindow(
        width,
        height,
        mon.left + (mon.width - width) / 2,
        mon.top + (mon.height - height) / 2,
      );
    })();
  }, []);

  // Size + center on the game monitor each time the window mounts (i.e. is shown).

  // Fast path: close instantly on Ctrl+Tab when the map already has keyboard focus
  // (i.e. the user clicked into it). The background's inputTracking watcher covers
  // the no-interaction case, where this keydown never reaches us.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "Tab" || e.code === "Tab")) {
        e.preventDefault();
        void collapseOverlayMap();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    // Fully OPAQUE, no backdrop-blur: a semi-transparent surface + backdrop-filter
    // on this transparent in-game window would force Overwolf to re-blur the live
    // game frame every frame — the cause of the heavy in-game stutter.
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-border bg-background text-zinc-100 shadow-2xl">
      {/* Title strip: app nav (same tabs as desktop) + collapse + native window controls. */}
      <WindowHeader
        title=""
        nav={<HeaderTabs />}
        // The native Close (X) collapses the map back to the corner widget rather
        // than dismissing the overlay — the widget must stay on screen while the
        // game runs. Same effect as the minimize button below.
        onCloseOverride={() => void collapseOverlayMap()}
        // No ad rail in-game, so the cluster sits in flow at the far right
        // (just left of the native window buttons) instead of at a rail edge.
        controlsPlacement="inline"
        controls={
          <div className="flex h-full items-center gap-2 mr-2">
            <HeaderControls inline />
            <button
              data-ow-no-drag
              onClick={() => void collapseOverlayMap()}
              className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t("chrome.collapseMap")}
              title={t("chrome.collapseHint", { hotkey: "Ctrl+M" })}
            >
              <Minimize2 size={15} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {/* The map + any full-window surface (Archive / Nightfarers / …) render here. */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <AuthProvider>
            <MapExperienceProvider>
              <MapShell />
            </MapExperienceProvider>
          </AuthProvider>

          {/* One-time reminder, IN-GAME ONLY: the in-game map opened automatically
              with the game — here's how to turn it off (the desktop app is
              unaffected). Self-gating, so it renders null unless it's true,
              actionable and unacknowledged. */}
          <GameAutoOpenBanner />

          {/* The same one-time second-screen thank-you the desktop window shows —
              in-game is exactly where "keep the Atlas on your other screen" is
              worth saying. Dismissing it in either window retires it in both. */}
          <SecondScreenBanner />
        </main>

        {/* No ad rail in-game: the overlay is ad-free by design (ads live only on
            the desktop window + companion). The map region owns the full width. */}
      </div>
    </div>
  );
};

export default OverlayMapWindow;
