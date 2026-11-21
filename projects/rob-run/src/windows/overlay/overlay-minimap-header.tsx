import { Settings, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MinimapOpacitySlider from "../../features/map/minimap-opacity-slider";
import { useDismissable } from "../../features/map/use-dismissable";
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
 * The minimap's top strip shows the hotkey and controls and doubles as the
 * drag handle. It appears on hover or keyboard focus.
 */
const OverlayMinimapHeader = () => {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  const opacityRef = useRef<HTMLDivElement | null>(null);
  const opacityButtonRef = useRef<HTMLButtonElement | null>(null);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const binding = useToggleOverlayBinding();
  const closeOpacity = useCallback(() => {
    if (opacityRef.current?.contains(document.activeElement)) opacityButtonRef.current?.focus();
    setOpacityOpen(false);
  }, []);
  useDismissable(opacityOpen, opacityRef, closeOpacity);

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
      <div className="flex shrink-0 items-center gap-1" data-ow-no-drag>
        <div ref={opacityRef} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpacityOpen(false);
        }}>
          <button
            ref={opacityButtonRef}
            type="button"
            className="overlay-minimap-header-button"
            onClick={() => setOpacityOpen((open) => !open)}
            aria-label={t("settings.minimapOpacity")}
            aria-expanded={opacityOpen}
            aria-controls={opacityOpen ? "overlay-minimap-opacity" : undefined}
            title={t("settings.minimapOpacity")}
          >
            <Settings size={13} aria-hidden="true" />
          </button>
          {opacityOpen && (
            <div id="overlay-minimap-opacity" className="overlay-minimap-opacity-panel">
              <p className="mb-2 text-xs font-medium text-white">{t("settings.minimapOpacity")}</p>
              <MinimapOpacitySlider />
            </div>
          )}
        </div>
        <button
          type="button"
          className="overlay-minimap-header-button"
          onClick={closeCurrentWindow}
          aria-label={t("overlay.minimap.close")}
          title={t("overlay.minimap.close")}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};

export default OverlayMinimapHeader;
