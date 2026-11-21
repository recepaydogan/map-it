import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ToggleSwitch from "../../components/toggle-switch";
import { useLaunchPreferences } from "../../features/settings/use-launch-preferences";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import { track } from "../../services/optional-usage";

const DISMISS_AFTER_TOGGLE_MS = 30_000;
const VISIBLE_WINDOW_STATES = new Set(["normal", "maximized"]);
const HIDDEN_WINDOW_STATES = new Set(["hidden", "minimized", "closed"]);

/** Shown on every open while automatic in-game opening is enabled. */
const InGameAutoOpenBanner = () => {
  const { t } = useTranslation();
  const { preferences, update } = useLaunchPreferences();
  const [dismissed, setDismissed] = useState(false);
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
      setDismissed(false);
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
  }, []);

  if (dismissed || (!preferences.autoOpenInGameOverlay && !toggleGraceVisible)) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-6 z-[1501] flex justify-center">
      <div className="pointer-events-auto relative w-fit max-w-full rounded-[var(--radius-lg)] border border-border bg-surface/95 px-4 py-3 text-[13px] text-white/90 shadow-lg backdrop-blur">
        <p className="pr-6">{t("overlay.autoOpenPreferenceHint")}</p>
        <div className="mt-2.5 flex items-center justify-center gap-2.5">
          <ToggleSwitch
            checked={preferences.autoOpenInGameOverlay}
            onChange={(next) => {
              clearDismissTimer();
              setToggleGraceVisible(!next);
              if (!next) {
                dismissTimer.current = window.setTimeout(() => {
                  dismissTimer.current = null;
                  setToggleGraceVisible(false);
                }, DISMISS_AFTER_TOGGLE_MS);
              }
              update({ autoOpenInGameOverlay: next });
              track("SETTING_CHANGED", { setting: "auto_open_in_game_overlay", value: next });
            }}
            label={t("settings.autoOpenInGame")}
          />
          <span role="status" aria-live="polite" className="text-white/75">
            {t(preferences.autoOpenInGameOverlay ? "overlay.autoOpenActive" : "overlay.autoOpenInactive")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            clearDismissTimer();
            setToggleGraceVisible(false);
            setDismissed(true);
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
