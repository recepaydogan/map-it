import DashboardWindowChrome from "./dashboard-window-chrome";
import { Copy, Minus, Square, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import {
  bindDragMoveElement,
  closeCurrentWindow,
  isWindowMaximizedState,
  minimizeCurrentWindow,
  subscribeToCurrentWindowState,
  toggleCurrentWindowMaximize,
} from "../../overwolf-utils/window-manager";
import { IS_OVERWOLF, openExternalUrl } from "../../utils/platform";

/**
 * Discord wordmark glyph. lucide-react dropped brand icons, so the official
 * logo path is inlined here.
 */
const DiscordIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
  </svg>
);

interface WindowHeaderProps {
  standaloneDashboard?: boolean;
  /** An authenticated subscription removes the ad rail and frees its header space. */
  adFree?: boolean;
  title?: string;
  /** Optional navigation strip rendered next to the title (e.g. the app tab bar). */
  nav?: React.ReactNode;
  /** Right-side controls (account / settings), pinned flush with the
   *  ad-rail edge so they sit at the right edge of the map content — never over ads. */
  controls?: React.ReactNode;
  /** Header control shown above the ad rail in Overwolf, or after controls in a browser. */
  adRailControl?: React.ReactNode;
  /** Optional control positioned along the lower edge of the header. */
  centerControl?: React.ReactNode;
  /** Returns the app to its primary surface when the brand is clicked. */
  onHome?: () => void;
  /** Custom handler for the native Close (X) button, overriding the default close action. */
  onCloseOverride?: (e: React.MouseEvent) => void;
}

/**
 * Custom title bar for the frameless (native_window + transparent) main window.
 *
 * The whole header is a drag handle (bindDragMoveElement wires it to Overwolf's
 * dragMove). Interactive controls opt out of dragging via [data-ow-no-drag] so
 * clicks reach the buttons instead of starting a window move.
 */
const WindowHeader: React.FC<WindowHeaderProps> = ({
  standaloneDashboard = false,
  adFree = false,
  title = "",
  nav,
  controls,
  adRailControl,
  centerControl,
  onHome,
  onCloseOverride,
}) => {
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

  const handleDiscord = (e: React.MouseEvent) => {
    e.stopPropagation();
    openExternalUrl(GAME_CONFIG.discordInviteUrl);
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
      className={cn("window-chrome relative z-[1600] flex shrink-0 select-none px-3 sm:px-5", !IS_OVERWOLF && Boolean(controls) ? "flex-col sm:flex-row" : "h-10 items-center")}
    >
      <div className="flex h-10 min-h-10 min-w-0 flex-1 items-center">
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 sm:gap-3">
      {onHome ? (
        <button
          type="button"
          data-ow-no-drag
          onClick={onHome}
          aria-label={t("chrome.map")}
          className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <img src="/icon.png" alt="" draggable={false} className="pointer-events-none h-7 w-7" />
          {title && <span className="window-chrome-title">{title}</span>}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2.5">
          <img src="/icon.png" alt="" draggable={false} className="pointer-events-none h-7 w-7" />
          {title && <span className="window-chrome-title">{title}</span>}
        </div>
      )}

      {nav && <div className="ml-1 flex h-full min-w-0 flex-1 items-center overflow-hidden sm:ml-3">{nav}</div>}

      {/* Navigation measures the space left after the controls' actual width. */}
      {IS_OVERWOLF && controls && (
        <div data-ow-no-drag className="flex h-full shrink-0 items-center">
          {controls}
        </div>
      )}
      </div>

      <div className={cn("ml-auto flex h-full shrink-0 items-center gap-0.5", IS_OVERWOLF && !adFree && "w-[calc(var(--ow-ads-width)-20px)] justify-end")}>
        {IS_OVERWOLF && adRailControl && <div className="flex shrink-0 items-center">{adRailControl}</div>}
        {GAME_CONFIG.discordInviteUrl && (
          <button
            data-ow-no-drag
            onClick={handleDiscord}
            className="flex h-full w-10 shrink-0 cursor-pointer items-center justify-center p-1.5 text-white/70 transition-colors duration-150 hover:bg-[#5865f2]/15 hover:text-[#8b93f7]"
            aria-label={t("chrome.discord")}
            title={t("chrome.discord")}
          >
            <DiscordIcon className="h-4 w-4" />
          </button>
        )}
        {/* Native window controls — Overwolf only. The web/mobile build runs in a
            real browser tab, so minimize/maximize/close have no meaning there and
            are dropped entirely (the browser provides its own chrome). */}
        {IS_OVERWOLF && (
          <>
            <button
              data-ow-no-drag
              onClick={handleMinimize}
              className="flex h-full w-10 shrink-0 cursor-default items-center justify-center p-1.5 text-white/70 transition-colors duration-150 hover:bg-white/8 hover:text-white/80"
              aria-label={t("chrome.minimize")}
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <button
              data-ow-no-drag
              onClick={handleMaximize}
              className="flex h-full w-10 shrink-0 cursor-default items-center justify-center p-1.5 text-white/70 transition-colors duration-150 hover:bg-white/8 hover:text-white/80"
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
              className="flex h-full w-10 shrink-0 cursor-default items-center justify-center p-1.5 text-white/70 transition-colors duration-150 hover:bg-rose-500/20 hover:text-rose-300"
              aria-label={t("chrome.close")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      </div>
      {/* Browser controls can wrap onto a second row on small screens. */}
      {controls && !IS_OVERWOLF && (
        <div
          data-ow-no-drag
          className="flex shrink-0 flex-wrap items-center sm:flex-nowrap [&>*]:h-10"
        >
          {controls}
          {!IS_OVERWOLF && adRailControl && <div className="flex items-center">{adRailControl}</div>}
        </div>
      )}
      {centerControl}
    </header>
  );
};

export default WindowHeader;
