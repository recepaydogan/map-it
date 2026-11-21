import { Copy, Minus, Square, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHotkeyRebind, type HotkeyName } from "../../features/settings/use-hotkey-rebind";
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
import DiscordIcon from "./discord-icon";

interface WindowHeaderProps {
  title?: string;
  /** Optional navigation strip rendered next to the title (e.g. the app tab bar). */
  nav?: React.ReactNode;
  /** Right-side controls (account / settings), pinned flush with the
   *  ad-rail edge so they sit at the right edge of the map content — never over ads. */
  controls?: React.ReactNode;
  /** Header control shown above the ad rail in Overwolf, or after controls in a browser. */
  adRailControl?: React.ReactNode;
  /** Returns the app to its primary surface when the brand is clicked. */
  onHome?: () => void;
  /** Custom handler for the native Close (X) button, overriding the default close action. */
  onCloseOverride?: (e: React.MouseEvent) => void;
  /** Shortcut for toggling this window, shown beside its minimize button. */
  toggleHotkeyName?: HotkeyName;
}

const WindowToggleHint = ({ hotkeyName }: { hotkeyName: HotkeyName }) => {
  const { t } = useTranslation();
  const { bindings } = useHotkeyRebind();
  const binding = bindings[hotkeyName];
  const fallbackKey = hotkeyName === "toggle_desktop_app"
    ? "chrome.desktopHotkeyFallback"
    : "chrome.inGameHotkeyFallback";
  const hotkey = binding === undefined ? t(fallbackKey) : binding || t("settings.hotkeyUnassigned");
  const label = t("chrome.toggleHint", { hotkey });

  return (
    <span className="header-fixed-text mr-1 max-w-[140px] min-w-0 truncate font-medium text-white/55" title={label}>
      {label}
    </span>
  );
};

/**
 * Custom title bar for the frameless (native_window + transparent) main window.
 *
 * The whole header is a drag handle (bindDragMoveElement wires it to Overwolf's
 * dragMove). Interactive controls opt out of dragging via [data-ow-no-drag] so
 * clicks reach the buttons instead of starting a window move.
 */
const WindowHeader: React.FC<WindowHeaderProps> = ({
  title = "",
  nav,
  controls,
  adRailControl,
  onHome,
  onCloseOverride,
  toggleHotkeyName,
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

  return (
    <header
      ref={headerRef}
      className={cn("window-chrome relative z-[1600] flex shrink-0 select-none px-3 sm:px-5", !IS_OVERWOLF && Boolean(controls) ? "flex-col sm:flex-row" : "h-10 items-center")}
    >
      <div className="flex h-10 min-h-10 min-w-0 flex-1 items-center gap-2 sm:gap-3">
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

      {nav && <div className={cn("ml-1 flex h-full min-w-0 flex-1 items-center overflow-hidden sm:ml-3", IS_OVERWOLF && "max-w-[calc(100vw-var(--ow-ads-width)-220px)]")}>{nav}</div>}

      <div className={cn("ml-auto flex h-full shrink-0 items-center gap-0.5", IS_OVERWOLF && "w-[calc(var(--ow-ads-width)-20px)]")}>
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
            {toggleHotkeyName && <WindowToggleHint hotkeyName={toggleHotkeyName} />}
            <button
              data-ow-no-drag
              onClick={handleMinimize}
              className="ml-auto flex h-full w-10 shrink-0 cursor-default items-center justify-center p-1.5 text-white/70 transition-colors duration-150 hover:bg-white/8 hover:text-white/80"
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
      {/* Reserve the ad boundary in Overwolf. Browser previews have no ad rail;
          keep navigation in normal flow so narrow views remain usable. */}
      {controls && (
        <div
          data-ow-no-drag
          className={cn("flex items-center", IS_OVERWOLF ? "absolute right-[440px] top-0 h-full" : "shrink-0 flex-wrap sm:flex-nowrap [&>*]:h-10")}
        >
          {controls}
          {!IS_OVERWOLF && adRailControl && <div className="flex items-center">{adRailControl}</div>}
        </div>
      )}
    </header>
  );
};

export default WindowHeader;
