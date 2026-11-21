import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAppHotkeys } from "../../overwolf/hotkeys";
import {
  bindDragMoveElement,
  closeCurrentWindow,
} from "../../overwolf/window-manager";
import { usePreferences } from "../../state/preferences-store";

const DEFAULT_TOGGLE_OVERLAY_BINDING = "Ctrl+M";
const HOTKEY_TOKEN = "␟";

const useToggleOverlayBinding = (): string => {
  const [binding, setBinding] = useState(DEFAULT_TOGGLE_OVERLAY_BINDING);

  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.get) return;
    const read = () => {
      overwolf.settings.hotkeys.get((result) => {
        if (!result.success) return;
        const hotkey = getAppHotkeys(result).find((entry) => entry.name === "toggle_overlay");
        if (hotkey && !hotkey.IsUnassigned && hotkey.binding) setBinding(hotkey.binding);
      });
    };
    read();
    overwolf.settings.hotkeys.onChanged.addListener(read);
    return () => overwolf.settings.hotkeys.onChanged.removeListener(read);
  }, []);

  return binding;
};

interface OverlayMinimapHeaderProps {
  showInteractionHint: boolean;
}

const OverlayMinimapHeader = ({ showInteractionHint }: OverlayMinimapHeaderProps) => {
  const { t } = useTranslation();
  const { overlayLocked } = usePreferences();
  const headerRef = useRef<HTMLElement | null>(null);
  const binding = useToggleOverlayBinding();

  useEffect(() => {
    if (overlayLocked) return;
    return bindDragMoveElement(headerRef.current, { disableDoubleClickMaximize: true });
  }, [overlayLocked]);

  const [before, after = ""] = t(
    showInteractionHint ? "overlay.minimap.interactionHint" : "overlay.minimap.toggleHint",
    {
      hotkey: HOTKEY_TOKEN,
    },
  ).split(HOTKEY_TOKEN);
  const displayedKey = showInteractionHint ? "Esc" : binding;

  return (
    <header
      ref={headerRef}
      className="overlay-minimap-header"
      data-overlay-locked={overlayLocked || undefined}
    >
      <span className="overlay-minimap-hint">
        {before}
        <kbd className="overlay-minimap-kbd">{displayedKey}</kbd>
        {after}
      </span>
      <button
        type="button"
        className="overlay-minimap-close"
        onClick={closeCurrentWindow}
        aria-label={t("overlay.minimap.close")}
        title={t("overlay.minimap.close")}
        data-ow-no-drag
      >
        <X size={13} aria-hidden="true" />
      </button>
    </header>
  );
};

export default OverlayMinimapHeader;
