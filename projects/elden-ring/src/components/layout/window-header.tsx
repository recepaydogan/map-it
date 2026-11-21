import DashboardWindowChrome from "./dashboard-window-chrome";
import { Copy, Minus, Square, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GetAppButton } from "../../features/get-app";
import { cn } from "../../lib/cn";
import {
  bindDragMoveElement,
  closeCurrentWindow,
  isWindowMaximizedState,
  minimizeCurrentWindow,
  subscribeToCurrentWindowState,
  toggleCurrentWindowMaximize,
} from "../../overwolf-utils/window-manager";
import { IS_OVERWOLF } from "../../utils/platform";
import { MobileNav } from "./mobile-nav";

interface WindowHeaderProps {
  standaloneDashboard?: boolean;
  title?: string;
  /** Optional navigation strip rendered next to the title (e.g. the app tab bar). */
  nav?: React.ReactNode;
  /** Right-side controls (language / account / settings). In Overwolf they are
   *  pinned flush with the ad-rail edge by default so they sit at the right edge
   *  of the map content — never over ads. Windows without a rail (the in-game
   *  overlay map) pass `controlsPlacement="inline"` to keep them in the flow. */
  controls?: React.ReactNode;
  /** Where the control cluster sits in Overwolf. `"ad-rail"` (default) pins it
   *  to the content↔ad-rail boundary; `"inline"` renders it in the right-hand
   *  cluster, just before the native window buttons. The web build is always
   *  inline. */
  controlsPlacement?: "ad-rail" | "inline";
  /** Custom handler for the native Close (X) button, overriding the default close action. */
  onCloseOverride?: (e: React.MouseEvent) => void;
}

/**
 * Custom title bar for the frameless (native_window + transparent) main window.
 *
 * The whole header is a drag handle (bindDragMoveElement wires it to Overwolf's
 * dragMove). Interactive controls opt out of dragging via [data-ow-no-drag] so
 * clicks reach the buttons instead of starting a window move.
 *
 * Two layouts, split at `lg`:
 *  • ≥1024px — the desktop bar: brand, tab strip, control cluster. This
 *    is the ONLY layout Overwolf ever sees (its window floor is 1300px).
 *  • <1024px — web/mobile: brand plus a hamburger, everything else inside the
 *    drawer. Below ~1000px the full strip started overlapping its own controls,
 *    so folding is a correctness fix, not just a phone nicety.
 */
const WindowHeader: React.FC<WindowHeaderProps> = ({
  standaloneDashboard = false,
  title = "Elden Ring Atlas",
  nav,
  controls,
  controlsPlacement = "ad-rail",
  onCloseOverride,
}) => {
  const pinControlsToRail = IS_OVERWOLF && controlsPlacement === "ad-rail";
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => bindDragMoveElement(headerRef.current), []);
  useEffect(
    () =>
      subscribeToCurrentWindowState((state) => {
        setIsMaximized(isWindowMaximizedState(state));
      }),
    [],
  );

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    minimizeCurrentWindow();
  };
  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleCurrentWindowMaximize();
  };
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCloseOverride) {
      onCloseOverride(e);
    } else {
      closeCurrentWindow();
    }
  };

  if (standaloneDashboard) {
    return (
      <DashboardWindowChrome
        maximized={isMaximized}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
        bindDrag={bindDragMoveElement}
      />
    );
  }

  return (
    <header
      ref={headerRef}
      // Taller on touch: 40px is a mouse-sized bar. The height GROWS by the
      // safe-area inset while the padding pushes the row down by the same amount,
      // so the content strip stays 3.25rem tall under a notch / status bar. The
      // `lg:` resets restore the exact desktop bar Overwolf has always had.
      className={cn(
        "relative z-20 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 select-none items-center gap-2 border-b border-border bg-background",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]",
        "sm:gap-3 lg:h-10 lg:px-5 lg:pt-0",
      )}
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <img
          src="/icon.png"
          alt=""
          draggable={false}
          className="pointer-events-none h-7 w-7"
        />
        {/* The wordmark is the mobile layout's only anchor once the tabs fold
            away — an unlabelled icon beside a hamburger reads as nothing. The
            desktop bar keeps its existing behaviour (shown only if `title`). */}
        <span
          className={cn(
            "font-display text-[13px] font-semibold tracking-wide text-white/85",
            !title && "lg:hidden",
          )}
        >
          {title || t("app.name")}
        </span>
      </div>

      {nav && <div className="ml-1 hidden h-full min-w-0 items-center lg:ml-3 lg:flex">{nav}</div>}

      <div className="flex-1" />

      <div className="flex h-full items-center gap-0.5">
        {/* Web only: the pitch for the desktop build. First in the right-hand
            cluster so it reads before the utility glyphs, and hidden below `lg`
            where the phone drawer carries the same offer as a card. */}
        {!IS_OVERWOLF && <GetAppButton />}
        {!pinControlsToRail && <div className="hidden h-full items-center lg:flex">{controls}</div>}
        {/* Web/mobile only: below `lg` the tab strip and the control cluster both
            fold into this drawer. Never rendered in Overwolf — its 1300px window
            floor keeps the desktop bar above. */}
        {!IS_OVERWOLF && <MobileNav />}
        {/* Native window controls — Overwolf only. The web/mobile build runs in a
            real browser tab, so minimize/maximize/close have no meaning there and
            are dropped entirely (the browser provides its own chrome). */}
        {IS_OVERWOLF && (
          <>
            <button
              data-ow-no-drag
              onClick={handleMinimize}
              className="flex h-full w-10 cursor-default items-center justify-center p-1.5 text-white/40 transition-colors duration-150 hover:bg-white/8 hover:text-white/80"
              aria-label={t("chrome.minimize")}
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <button
              data-ow-no-drag
              onClick={handleMaximize}
              className="flex h-full w-10 cursor-default items-center justify-center p-1.5 text-white/40 transition-colors duration-150 hover:bg-white/8 hover:text-white/80"
              aria-label={isMaximized ? t("chrome.restore") : t("chrome.maximize")}
            >
              {isMaximized ? (
                <Copy size={13} aria-hidden="true" />
              ) : (
                <Square size={13} aria-hidden="true" />
              )}
            </button>
            <button
              data-ow-no-drag
              onClick={handleClose}
              className="flex h-full w-10 cursor-default items-center justify-center p-1.5 text-white/40 transition-colors duration-150 hover:bg-rose-500/20 hover:text-rose-300"
              aria-label={t("chrome.close")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {/* Overwolf windows with an ad rail: pin language / account / settings to
          the content↔ad-rail boundary. The web build and rail-less windows
          render them in the flex cluster above. */}
      {pinControlsToRail && controls && (
        <div
          data-ow-no-drag
          className="absolute right-[440px] top-0 flex h-full items-center"
        >
          {controls}
        </div>
      )}
    </header>
  );
};

export default WindowHeader;
