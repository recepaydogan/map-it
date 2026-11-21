import { Info, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHotkeyRebind } from "../../features/settings/use-hotkey-rebind";
import {
  bindDragMoveElement,
  expandOverlayMap,
  getGameMonitorBounds,
  hideOverlayWindows,
  OVERLAY_DISMISS_HINT_MSG,
  OVERLAY_WIDGET_WINDOW,
} from "../../overwolf-utils/window-manager";
import { isOverwolf, resizeAndMoveCurrentWindow, withCurrentWindow } from "../../utils/overwolf";

/** Widget window footprint (px) — mirrors the manifest size. It is wider than the
 * circle so a hint panel / toast can sit to the LEFT of the docked corner circle. */
const WIDGET_W = 380;
const WIDGET_H = 168;
/** Gap from the game-monitor edge when docking the widget. */
const EDGE_MARGIN = 28;
/** Extra lift off the bottom edge so the docked widget sits higher by default. */
const BOTTOM_LIFT = 120;
/** How long the "press … to reopen" toast stays up before the widget hides itself. */
const DISMISS_HINT_MS = 10000;
/** How long the first-run intro lingers before auto-dismissing if untouched. */
const INTRO_AUTO_DISMISS_MS = 10000;

/** localStorage flag so the first-run hotkey intro appears exactly once. */
const INTRO_SEEN_KEY = "elden-ring-atlas:overlay-hotkeys-seen-v1";
const hasSeenIntro = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const markIntroSeen = (): void => {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* private mode / disabled storage — the intro just shows again next launch */
  }
};

/**
 * Toggle mouse/keyboard click-through for the current window. With passthrough
 * on, input falls through to the game; off makes the widget itself clickable.
 */
const setClickthrough = (passThrough: boolean) => {
  if (!isOverwolf()) return;
  const INPUT_PASS_THROUGH =
    "InputPassThrough" as overwolf.windows.enums.WindowStyle;
  withCurrentWindow((windowId) => {
    if (passThrough) {
      overwolf.windows.setWindowStyle(windowId, INPUT_PASS_THROUGH, () => {});
    } else {
      overwolf.windows.removeWindowStyle(windowId, INPUT_PASS_THROUGH, () => {});
    }
  });
};

/** Render a "Ctrl+Shift+M" binding string as individual key chips. */
const KbdCombo = ({ combo, highlight }: { combo: string; highlight?: boolean }) => {
  const keys = combo.split("+").map((k) => k.trim()).filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && <span className={highlight ? "text-accent/60" : "text-zinc-500"}>+</span>}
          <kbd
            className={`rounded border px-1.5 py-0.5 font-mono text-[11px] leading-tight ${
              highlight
                ? "border-accent/50 bg-accent/20 text-accent font-bold"
                : "border-border bg-black/40 text-white"
            }`}
          >
            {k}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
};

/**
 * The always-on collapsed widget (manifest `overlay` window: in_game_only,
 * transparent). It docks to the game monitor's corner and stays out of the way:
 * passthrough is on so the game keeps mouse/keyboard input, and only flips off
 * while the pointer is over an interactive element so those stay clickable.
 *
 * Clicking (or the toggle_overlay hotkey) opens the separate `overlay_map`
 * window, which carries `focus_game_takeover` so it grabs game input (exclusive
 * mode) for a fully interactive map. expandOverlayMap() also hides this widget,
 * so exactly one of the two overlay windows is visible at a time.
 *
 * Two teaching moments live here, both to the LEFT of the circle:
 *  - a first-run intro that names the hotkeys (which one opens the map, which one
 *    hides the widget), shown once and then remembered;
 *  - a dismiss toast: when the player hides the widget (X button or the
 *    Ctrl+Shift+M hotkey routed from the background), it flashes a "press … to
 *    reopen" hint for a few seconds, THEN hides itself — so hiding is never a
 *    dead end.
 */
const OverlayWindow = () => {
  const { t } = useTranslation();
  const circleRef = useRef<HTMLDivElement | null>(null);
  const { bindings } = useHotkeyRebind();

  // Live hotkey combos, falling back to the manifest defaults (also the web build,
  // where the Overwolf hotkeys API is absent so `bindings` never populates).
  const toggleCombo = bindings.toggle_overlay || "Ctrl+M";
  const dismissCombo = bindings.dismiss_overlay || "Ctrl+Shift+M";

  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());
  const [dismissing, setDismissing] = useState(false);
  // Auto-dismiss timer for the first-run intro; cleared once the player engages
  // (hovers the panel) so it never vanishes mid-read.
  const introTimerRef = useRef<number | null>(null);
  // Pending "hide the widget after the toast" timer, plus a live mirror of
  // `dismissing` so the (stable, mount-once) background-message listener can read
  // the current phase without going stale.
  const dismissTimerRef = useRef<number | null>(null);
  const dismissingRef = useRef(false);
  useEffect(() => {
    dismissingRef.current = dismissing;
  }, [dismissing]);

  const clearIntroTimer = () => {
    if (introTimerRef.current !== null) {
      window.clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  };

  const dockWindow = async (position: "bottom-right" | "right-center") => {
    const mon = await getGameMonitorBounds();
    if (!mon) return;
    const top = position === "bottom-right"
      ? mon.bottom - WIDGET_H - EDGE_MARGIN - BOTTOM_LIFT
      : mon.top + mon.height / 2 - WIDGET_H / 2;
    
    const rightMargin = position === "right-center" ? EDGE_MARGIN + 16 : EDGE_MARGIN;

    resizeAndMoveCurrentWindow(
      WIDGET_W,
      WIDGET_H,
      mon.right - WIDGET_W - rightMargin,
      top
    );
  };

  const dismissIntro = () => {
    clearIntroTimer();
    markIntroSeen();
    setShowIntro(false);
  };

  // The intro auto-hides after 10s if the player never touches it. Kept as
  // one-shot: hovering the panel cancels it (see onMouseEnter) so reading it
  // through can't be interrupted, and clicking "Got it" clears it too.
  useEffect(() => {
    if (!showIntro) return;
    introTimerRef.current = window.setTimeout(dismissIntro, INTRO_AUTO_DISMISS_MS);
    return clearIntroTimer;
  }, [showIntro]);

  // Show the reopen hint at right-center, then hide the whole overlay. Passthrough
  // goes back on so the non-interactive toast never steals input.
  const [hintCombo, setHintCombo] = useState(dismissCombo);
  const clearDismissTimer = () => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };
  const beginDismiss = (comboToSuggest = dismissCombo) => {
    setShowIntro(false);
    setHintCombo(comboToSuggest);
    setDismissing(true);
    setClickthrough(true);
    void dockWindow("right-center");
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => void hideOverlayWindows(), DISMISS_HINT_MS);
  };
  // Cancel an in-progress dismiss and bring the circle straight back — for when the
  // player presses the dismiss hotkey WHILE the "press … to get it back" toast is
  // still up. The toast literally invites that press, so it must restore the widget
  // immediately, not restart the toast (or do nothing until it times out).
  const cancelDismiss = () => {
    clearDismissTimer();
    setDismissing(false);
    setClickthrough(true);
    void dockWindow("bottom-right");
  };

  useEffect(() => {
    setClickthrough(true);
    void dockWindow("bottom-right");
  }, []);

  // Let the user drag the circle to reposition the whole window. Re-bind whenever
  // the circle remounts: it's swapped out for the dismiss toast, so a single
  // mount-time bind would leave the returned-from-dismiss circle un-draggable.
  useEffect(() => {
    if (dismissing) return;
    return bindDragMoveElement(circleRef.current);
  }, [dismissing]);

  // The dismiss hotkey (Ctrl+Shift+M) is handled in the background window; when it
  // fires while only the widget is up, the background asks us to run the toast-then-
  // hide dismiss flow. Reset back to the circle whenever the window is shown again
  // (a hidden window keeps its React state, so a re-show after a dismiss would
  // otherwise still render the toast).
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    const onMessage = (message: { id: string }) => {
      if (message.id === OVERLAY_DISMISS_HINT_MSG) {
        // Toggle: first press flashes the reopen toast; a second press while it's
        // still up cancels the dismiss and restores the circle right away (that's
        // exactly what the toast asks the player to do).
        if (dismissingRef.current) cancelDismiss();
        else beginDismiss(dismissCombo);
      }
    };
    const onState = (e: { window_name?: string; window_state_ex?: string; window_state?: string }) => {
      if (e.window_name !== OVERLAY_WIDGET_WINDOW) return;
      const s = e.window_state_ex ?? e.window_state ?? "";
      if (s === "hidden" || s === "minimized" || s === "closed") {
        // Reset state after the window is safely hidden, so it's a circle next time.
        // A small timeout prevents any 1-frame flicker before the window disappears.
        window.setTimeout(() => {
          setDismissing(false);
          void dockWindow("bottom-right");
        }, 100);
      }
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessage);
    overwolf.windows?.onStateChanged?.addListener(onState);
    return () => {
      overwolf.windows?.onMessageReceived?.removeListener(onMessage);
      overwolf.windows?.onStateChanged?.removeListener(onState);
    };
  }, []);

  return (
    // Circle docks to the right edge (the monitor corner); the intro panel / toast
    // grow to its LEFT, so the circle never moves as they come and go.
    <div className="flex h-screen w-screen items-center justify-end gap-2 bg-transparent">
      {dismissing ? (
        // Reopen hint — replaces the circle for a few seconds, then the window hides.
        <div className="pointer-events-none max-w-[300px] rounded-[var(--radius-lg)] border border-border bg-background/95 px-3.5 py-3 shadow-2xl">
          <p className="text-xs font-semibold text-white">{t("overlayHints.dismissedTitle")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
            {t("overlayHints.dismissedBody")} <KbdCombo combo={hintCombo} highlight />
          </p>
        </div>
      ) : (
        <>
          {/* First-run intro: names both hotkeys in full sentences. */}
          {showIntro && (
            <div
              className="pointer-events-auto relative w-[260px] shrink-0 rounded-[var(--radius-lg)] border border-border bg-background/95 p-3 shadow-2xl"
              onMouseEnter={() => {
                clearIntroTimer();
                setClickthrough(false);
              }}
              onMouseLeave={() => setClickthrough(true)}
            >
              {/* Info glyph pinned to the corner (absolute) so the text below can
                  use the panel's full width instead of being indented beside it. */}
              <Info
                size={14}
                className="absolute right-3 top-3 text-accent"
                aria-hidden="true"
              />
              <p className="pr-5 text-xs font-semibold text-white">
                {t("overlayHints.introTitle")}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
                <KbdCombo combo={toggleCombo} /> {t("overlayHints.introToggleMap")}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
                <KbdCombo combo={dismissCombo} /> {t("overlayHints.introDismiss")}
              </p>
              <button
                data-ow-no-drag
                onClick={dismissIntro}
                className="mt-2.5 rounded-[var(--radius-md)] bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent transition-colors hover:bg-accent/90 active:scale-95"
              >
                {t("overlayHints.introGotIt")}
              </button>
            </div>
          )}

          {/* Circle + dismiss X + Ctrl+M hint — the collapsed widget itself. */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* Circle + dismiss X share one hover region so passthrough is off (i.e.
                both are clickable) whenever the pointer is over either of them. */}
            {/* Padding gives the dismiss badge room to sit at the circle's corner
                while staying INSIDE this hover region. The badge must not poke past
                this box: in the transparent overlay, passthrough (game gets input)
                is toggled off only over this region, so any pixel outside it — even
                an opaque badge — lands on passed-through pixels and never registers
                hover. It also keeps the badge clear of the window's right edge,
                which would otherwise clip it. */}
            <div
              className="relative p-1.5"
              onMouseEnter={() => setClickthrough(false)}
              onMouseLeave={() => setClickthrough(true)}
            >
              <div
                ref={circleRef}
                onClick={() => void expandOverlayMap()}
                className="grid h-[84px] w-[84px] cursor-pointer place-items-center rounded-full border-2 border-accent/60 bg-background shadow-2xl transition-all hover:border-accent hover:bg-surface active:scale-95"
                aria-label={t("chrome.openMapOverlay")}
              >
                <img
                  src="/icons/_fallback/map-fragment.png"
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-14 w-14 select-none object-contain"
                />
              </div>

              {/* Fully dismiss the overlay (mirrors the dismiss hotkey): flash the
                  reopen hint, then hide. Anchored to the padded box's top-right so it
                  overlaps the circle's corner without escaping the hover region. */}
              <button
                data-ow-no-drag
                onClick={() => beginDismiss(dismissCombo)}
                className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full border border-border bg-background text-zinc-300 shadow-lg transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95"
                aria-label={t("chrome.dismissOverlay")}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>

            {/* Hint that the map also toggles with the toggle hotkey. Non-interactive. */}
            <div className="pointer-events-none flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-medium text-zinc-300 shadow-lg">
              <KbdCombo combo={toggleCombo} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OverlayWindow;
