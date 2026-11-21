import DashboardWindowChrome from "./layout/dashboard-window-chrome";
import {
  Copy,
  Minus,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bindDragMoveElement,
  closeCurrentWindow,
  hideCurrentWindow,
  minimizeCurrentWindow,
  subscribeToCurrentWindowState,
  toggleCurrentWindowMaximize,
} from "../overwolf/window-manager";
import { usePreferences } from "../state/preferences-store";
import { IS_OVERWOLF } from "../utils/platform";
import { version } from "../../package.json";

export type MainScreen =
  | "dashboard"
  | "journal"
  | "items"
  | "account"
  | "support"
  | "updates"
  | "settings";

const WindowHeader = ({ standaloneDashboard = false }: { standaloneDashboard?: boolean }) => {
  const { t } = useTranslation();
  const { minimizeToTray } = usePreferences();
  const headerRef = useRef<HTMLElement | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => bindDragMoveElement(headerRef.current), []);
  useEffect(
    () =>
      subscribeToCurrentWindowState((state) => {
        setMaximized(state === "maximized");
      }),
    [],
  );

  const closeWindow = () => {
    if (minimizeToTray) hideCurrentWindow();
    else closeCurrentWindow();
  };

  if (standaloneDashboard) {
    return (
      <DashboardWindowChrome
        maximized={maximized}
        onMinimize={minimizeCurrentWindow}
        onMaximize={toggleCurrentWindowMaximize}
        onClose={closeWindow}
        bindDrag={bindDragMoveElement}
      />
    );
  }

  return (
    <header
      ref={headerRef}
      className="relative z-40 flex h-10 shrink-0 select-none items-center border-b border-border bg-background px-5"
    >
      <div className="flex shrink-0 items-center gap-2">
        <img src="/icon.png" alt="" draggable={false} className="pointer-events-none h-7 w-7" />
        <span className="font-mono text-[11px] tabular-nums text-subtle">
          {t("app.version", { version })}
        </span>
      </div>

      <div className="flex-1" />

      {IS_OVERWOLF && (
        <div data-ow-no-drag className="flex h-full items-center">
          <button
            type="button"
            onClick={minimizeCurrentWindow}
            className="grid h-full w-10 cursor-pointer place-items-center text-muted transition-colors hover:bg-surface-hover hover:text-primary"
            aria-label={t("chrome.minimize")}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleCurrentWindowMaximize}
            className="grid h-full w-10 cursor-pointer place-items-center text-muted transition-colors hover:bg-surface-hover hover:text-primary"
            aria-label={maximized ? t("chrome.restore") : t("chrome.maximize")}
          >
            {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={closeWindow}
            className="grid h-full w-10 cursor-pointer place-items-center text-muted transition-colors hover:bg-danger/15 hover:text-danger"
            aria-label={t("chrome.close")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </header>
  );
};

export default WindowHeader;
