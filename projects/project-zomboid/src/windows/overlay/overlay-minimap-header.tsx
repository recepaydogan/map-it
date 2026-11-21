import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bindDragMoveElement,
  closeCurrentWindow,
} from "../../overwolf-utils/window-manager";

/** Fallback when the Overwolf hotkeys API is unavailable or still loading. */
const DEFAULT_TOGGLE_OVERLAY_BINDING = "Ctrl+M";

/**
 * Placeholder sentinel for splitting the translated sentence around the hotkey
 * chip, so the chip lands wherever the language puts {{hotkey}}.
 */
const HOTKEY_TOKEN = "␟";

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

  const [before, after = ""] = t("overlay.minimap.toggleHint", {
    hotkey: HOTKEY_TOKEN,
  }).split(HOTKEY_TOKEN);

  return (
    <header ref={headerRef} className="overlay-minimap-header">
      <span className="overlay-minimap-hint">
        {before}
        <kbd className="overlay-minimap-kbd">{binding}</kbd>
        {after}
      </span>
      <button
        type="button"
        className="overlay-minimap-close"
        onClick={closeCurrentWindow}
        aria-label={t("overlay.minimap.close")}
        title={t("overlay.minimap.close")}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </header>
  );
};

export default OverlayMinimapHeader;
