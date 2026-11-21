import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useRef, type MouseEventHandler } from "react";
import { useTranslation } from "react-i18next";
import AppVersionLabel from "./app-version-label";
import "./dashboard-window-chrome.css";

type DashboardWindowChromeProps = {
  maximized: boolean;
  labelPrefix?: "chrome" | "window";
  onMinimize: MouseEventHandler<HTMLButtonElement>;
  onMaximize: MouseEventHandler<HTMLButtonElement>;
  onClose: MouseEventHandler<HTMLButtonElement>;
  bindDrag: (element: HTMLElement | null) => () => void;
};

export default function DashboardWindowChrome({
  maximized,
  labelPrefix = "chrome",
  onMinimize,
  onMaximize,
  onClose,
  bindDrag,
}: DashboardWindowChromeProps) {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement>(null);
  const dragStripRef = useRef<HTMLDivElement>(null);
  const minimizeLabel = t(`${labelPrefix}.minimize`);
  const maximizeLabel = t(`${labelPrefix}.${maximized ? "restore" : "maximize"}`);
  const closeLabel = t(`${labelPrefix}.close`);

  useEffect(() => {
    const header = headerRef.current;
    const sidebar = header?.parentElement?.querySelector<HTMLElement>(".app-navigation-panel");
    const unbindHeader = bindDrag(header);
    const unbindDragStrip = bindDrag(dragStripRef.current);
    const unbindSidebar = bindDrag(sidebar ?? null);
    return () => {
      unbindHeader();
      unbindDragStrip();
      unbindSidebar();
    };
  }, [bindDrag]);

  return (
    <>
      <div
        aria-hidden="true"
        className="app-dashboard-window-drag-strip"
        ref={dragStripRef}
        onPointerDown={(event) => {
          // Keep tracking a vertical drag once it leaves the thin strip.
          if (event.button === 0 && event.pointerType === "mouse") {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
      />
      <header className="app-dashboard-window-chrome" ref={headerRef}>
        <AppVersionLabel />
        <div className="app-dashboard-window-actions" data-ow-no-drag>
          <button type="button" aria-label={minimizeLabel} title={minimizeLabel} onClick={onMinimize}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label={maximizeLabel} title={maximizeLabel} onClick={onMaximize}>
            {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
          </button>
          <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
    </>
  );
}
