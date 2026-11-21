import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Gamepad2, X } from "lucide-react";
import { IS_OVERWOLF } from "../../utils/platform";
import { useUiStore } from "../../store/ui-store";
import { useLaunchPreferences } from "../../state/use-launch-preferences";
import { useGameRunning } from "./use-game-running";

/**
 * A one-time reminder shown INSIDE the in-game overlay window: "this in-game map
 * opened automatically because you launched the game — you can turn that off in
 * Settings (the desktop app still opens either way)."
 *
 * It appears only when it is actually true and actionable — inside Overwolf, while
 * a targeted game is running, and while the in-game-app setting is still ON (no
 * point offering to disable something already off; when off, the overlay window
 * this lives in never even opens). "Got it" dismisses it for good (persisted);
 * flipping the setting off from here (or from Settings) also retires it. The
 * desktop app is separate and unaffected — it always opens with the game.
 *
 * Self-gating: renders null whenever it should not appear, so callers can drop it
 * in unconditionally.
 */

/** localStorage flag so the reminder is acknowledged exactly once. */
const SEEN_KEY = "elden-ring-atlas:game-auto-open-seen-v1";
const hasSeen = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const markSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode / disabled storage — it just shows again next launch */
  }
};

const GameAutoOpenBanner = () => {
  const { t } = useTranslation();
  const openOverlay = useUiStore((s) => s.openOverlay);
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const { preferences } = useLaunchPreferences();
  const gameRunning = useGameRunning();
  const [dismissed, setDismissed] = useState(hasSeen);

  // Only in the native app, only in-game, only while the behaviour is on, only
  // over the live map (a full-window surface like Settings hides it), and only
  // until acknowledged.
  if (
    !IS_OVERWOLF ||
    !gameRunning ||
    !preferences.autoOpenInGameApp ||
    dismissed ||
    activeOverlay !== null
  ) {
    return null;
  }

  const dismiss = () => {
    markSeen();
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1150] flex justify-center px-24">
      <div className="pointer-events-auto flex max-w-xl items-center gap-4 rounded-[var(--radius-lg)] border border-accent/40 bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Gamepad2 size={17} className="text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white">{t("gameAutoOpen.title")}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
            {t("gameAutoOpen.body")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            data-ow-no-drag
            onClick={() => openOverlay("settings")}
            className="whitespace-nowrap rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent/15 cursor-pointer"
          >
            {t("gameAutoOpen.openSettings")}
          </button>
          <button
            data-ow-no-drag
            onClick={dismiss}
            className="whitespace-nowrap rounded-[var(--radius-md)] px-3 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
          >
            {t("gameAutoOpen.gotIt")}
          </button>
          <button
            data-ow-no-drag
            onClick={dismiss}
            aria-label={t("gameAutoOpen.gotIt")}
            className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] text-muted transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameAutoOpenBanner;
