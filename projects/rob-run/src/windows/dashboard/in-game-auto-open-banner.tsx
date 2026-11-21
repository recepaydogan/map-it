import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ToggleSwitch from "../../components/toggle-switch";
import { useLaunchPreferences } from "../../features/settings/use-launch-preferences";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import { track } from "../../services/optional-usage";
import { cn } from "../../lib/cn";

const DISMISS_AFTER_TOGGLE_MS = 30_000;
const VISIBLE_WINDOW_STATES = new Set(["normal", "maximized"]);
const HIDDEN_WINDOW_STATES = new Set(["hidden", "minimized", "closed"]);
const MINIMAP_DISMISSED_KEY = "wfm:minimap-auto-open-hint-dismissed:v1";
const readMinimapDismissed = () => {
  try { return localStorage.getItem(MINIMAP_DISMISSED_KEY) === "1"; }
  catch { return false; }
};

/** The minimap hint stays dismissed; the full-app hint returns on each open. */
const InGameAutoOpenBanner = ({ minimap = false }: { minimap?: boolean }) => {
  const { t } = useTranslation();
  const { preferences, update } = useLaunchPreferences();
  const preference = minimap ? "autoOpenMinimap" : "autoOpenInGameOverlay";
  const enabled = preferences[preference];
  const [dismissed, setDismissed] = useState(() => minimap && readMinimapDismissed());
  const [toggleGraceVisible, setToggleGraceVisible] = useState(false);
  const dismissTimer = useRef<number | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  };

  useEffect(() => {
    let windowWasVisible: boolean | null = null;
    const revealOnReopen = () => {
      clearDismissTimer();
      if (!minimap) setDismissed(false);
      setToggleGraceVisible(false);
    };
    const unsubscribe = subscribeToCurrentWindowState((state) => {
      const normalizedState = state.toLowerCase();
      if (VISIBLE_WINDOW_STATES.has(normalizedState)) {
        if (windowWasVisible === false) revealOnReopen();
        windowWasVisible = true;
      } else if (HIDDEN_WINDOW_STATES.has(normalizedState)) {
        windowWasVisible = false;
      }
    });
    let documentWasVisible = document.visibilityState === "visible";
    const onVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible && !documentWasVisible) revealOnReopen();
      documentWasVisible = isVisible;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearDismissTimer();
    };
  }, [minimap]);

  if (dismissed || (!enabled && !toggleGraceVisible)) return null;

  return (
    <div className={cn("pointer-events-none absolute z-[1501] flex",
      minimap ? "bottom-2 left-2 max-w-[calc(100%-3.5rem)]" : "inset-x-4 bottom-6 justify-center")}>
      <div className={cn("pointer-events-auto relative w-fit max-w-full rounded-[var(--radius-lg)] border border-border bg-surface/95 text-white/90 shadow-lg backdrop-blur",
        minimap ? "px-2.5 py-2 text-[11px]" : "px-4 py-3 text-[13px]")}>
        {!minimap && <p className="pr-6">{t("overlay.autoOpenPreferenceHint")}</p>}
        <div className={cn("flex items-center gap-2.5", minimap ? "pr-6" : "mt-2.5 justify-center")}>
          <ToggleSwitch
            checked={enabled}
            onChange={(next) => {
              clearDismissTimer();
              setToggleGraceVisible(!next);
              if (!next) {
                dismissTimer.current = window.setTimeout(() => {
                  dismissTimer.current = null;
                  setToggleGraceVisible(false);
                }, DISMISS_AFTER_TOGGLE_MS);
              }
              update({ [preference]: next });
              track("SETTING_CHANGED", { setting: minimap ? "auto_open_minimap" : "auto_open_in_game_overlay", value: next });
            }}
            label={t(minimap ? "announcements.minimapAutoOpen.title" : "settings.autoOpenInGame")}
          />
          <span role="status" aria-live="polite" className="text-white/75">
            {t(minimap ? "announcements.minimapAutoOpen.title" : enabled ? "overlay.autoOpenActive" : "overlay.autoOpenInactive")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            clearDismissTimer();
            setToggleGraceVisible(false);
            setDismissed(true);
            if (minimap) {
              try { localStorage.setItem(MINIMAP_DISMISSED_KEY, "1"); }
              catch { /* Keep the hint dismissed for this session if storage is unavailable. */ }
            }
          }}
          aria-label={t("chrome.close")}
          className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/60 transition-colors hover:bg-white/8 hover:text-white"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default InGameAutoOpenBanner;
