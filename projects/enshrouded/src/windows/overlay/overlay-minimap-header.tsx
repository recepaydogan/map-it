import { Keyboard, MousePointer2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bindDragMoveElement,
  collapseMinimap,
} from "../../overwolf-utils/window-manager";
import { blockCurrentMinimapAutoOpen } from "../../features/overlay/minimap-session";

/** Fallback when the Overwolf hotkeys API is unavailable or still loading. */
const DEFAULT_TOGGLE_OVERLAY_BINDING = "Ctrl+M";

/** The player's live `toggle_overlay` binding — they may have rebound it. */
const useToggleOverlayBinding = (): string => {
  const [binding, setBinding] = useState(DEFAULT_TOGGLE_OVERLAY_BINDING);

  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.get) return;
    const read = () => {
      overwolf.settings.hotkeys.get((result) => {
        if (!result.success) return;
        const hotkey = [
          ...Object.values(result.games ?? {}).flat(),
          ...(result.globals ?? []),
        ].find((entry) => entry.name === "toggle_overlay");
        if (hotkey && !hotkey.IsUnassigned && hotkey.binding) setBinding(hotkey.binding);
      });
    };
    read();
    overwolf.settings.hotkeys.onChanged.addListener(read);
    return () => overwolf.settings.hotkeys.onChanged.removeListener(read);
  }, []);

  return binding;
};

/**
 * The minimap's top strip: the toggle hotkey on the left, a close button on the
 * right, and the whole bar doubles as the drag handle. It floats over the map
 * and only fades in while the pointer is on the minimap (see index.css), so the
 * map itself stays unobstructed while the player is just reading it.
 */
const OverlayMinimapHeader = () => {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  const binding = useToggleOverlayBinding();

  useEffect(
    () => bindDragMoveElement(headerRef.current, { disableDoubleClickMaximize: true }),
    [],
  );

  const hideForSession = () => {
    blockCurrentMinimapAutoOpen();
    void collapseMinimap();
  };

  return (
    <header ref={headerRef} className="overlay-minimap-header">
      <span className="overlay-minimap-hint" title={`${t("overlay.minimap.toggleHint", { hotkey: binding })} · ${t("overlay.minimap.cursorShort")}`}>
        <Keyboard size={12} aria-hidden="true" />
        <kbd className="overlay-minimap-kbd">{binding}</kbd>
        <span className="overlay-minimap-hint-divider">·</span>
        <MousePointer2 size={12} aria-hidden="true" />
        <span>{t("overlay.minimap.cursorShort")}</span>
      </span>
      <button
        type="button"
        className="overlay-minimap-close"
        onClick={hideForSession}
        aria-label={t("overlay.minimap.close")}
        title={t("overlay.minimap.close")}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </header>
  );
};

export default OverlayMinimapHeader;
