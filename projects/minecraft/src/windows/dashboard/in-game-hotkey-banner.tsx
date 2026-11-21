import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { consumeInGameAutoOpened } from "../../features/overlay/in-game-auto-open";

/** Fallback when the Overwolf hotkeys API is unavailable or still loading. */
const DEFAULT_TOGGLE_APP_BINDING = "Ctrl+Shift+A";

/** How long the hint stays up before dismissing itself. */
const AUTO_DISMISS_MS = 12_000;

/**
 * Placeholder sentinel for splitting the translated sentence around the hotkey
 * chip. U+241F never occurs in real copy, so the split is unambiguous and the
 * chip lands wherever the language puts {{hotkey}}.
 */
const HOTKEY_TOKEN = "␟";

/**
 * One-shot hint shown when the background window auto-opened this overlay for a
 * single-monitor player: a small bottom-center banner naming the hotkey that
 * toggles it. Renders nothing when the window was opened by the user's own
 * hotkey press — they already know the key.
 */
const InGameHotkeyBanner = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(consumeInGameAutoOpened);
  const [binding, setBinding] = useState(DEFAULT_TOGGLE_APP_BINDING);

  // Show the user's actual binding, not the manifest default they may have
  // rebound. Read once — the banner is too short-lived to track changes.
  useEffect(() => {
    if (!visible) return;
    if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.get) return;
    overwolf.settings.hotkeys.get((result) => {
      if (!result.success || !result.globals) return;
      const hotkey = result.globals.find((entry) => entry.name === "toggle_app");
      if (hotkey && !hotkey.IsUnassigned && hotkey.binding) setBinding(hotkey.binding);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const [before, after = ""] = t("overlay.autoOpenHint", { hotkey: HOTKEY_TOKEN }).split(
    HOTKEY_TOKEN,
  );

  return (
    <div className="pointer-events-none fixed left-0 right-[440px] bottom-6 z-[2000] flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-border bg-surface/95 py-2.5 pl-4 pr-2 text-[13px] text-white/90 shadow-lg backdrop-blur">
        <span>
          {before}
          <kbd className="mx-1 rounded-[var(--radius-sm)] border border-border bg-white/8 px-1.5 py-0.5 font-sans text-[12px] font-semibold text-white">
            {binding}
          </kbd>
          {after}
        </span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={t("chrome.close")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/60 transition-colors hover:bg-white/8 hover:text-white"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default InGameHotkeyBanner;
