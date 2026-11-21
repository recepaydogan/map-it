import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  bindDragMoveElement,
} from "../../overwolf-utils/window-manager";
import { hideMinimapForSession } from "../../features/overlay/minimap-lifecycle";
import { useHotkeyRebind } from "../../features/settings/use-hotkey-rebind";

/**
 * The minimap's top strip: interaction and toggle hints on the left, a close button on the
 * right, and the whole bar doubles as the drag handle. It floats over the map
 * and only fades in while the pointer is on the minimap (see index.css), so the
 * map itself stays unobstructed while the player is just reading it.
 */
const OverlayMinimapHeader = () => {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  const { bindings } = useHotkeyRebind();
  const toggleBinding = bindings.toggle_overlay ?? t("overlay.minimap.toggleDefaultHotkey");
  const interactionBinding = t("overlay.minimap.interactHotkey");

  useEffect(
    () => bindDragMoveElement(headerRef.current, { disableDoubleClickMaximize: true }),
    [],
  );

  return (
    <header ref={headerRef} className="overlay-minimap-header">
      <div className="overlay-minimap-hints">
        <span className="overlay-minimap-hint">
          <span>{t("overlay.minimap.cursorShort")}</span>
          <ArrowRight size={12} aria-hidden="true" />
          <kbd className="overlay-minimap-kbd">{interactionBinding}</kbd>
        </span>
        <span className="overlay-minimap-hint overlay-minimap-toggle-hint" title={t("overlay.minimap.toggleHint", { hotkey: toggleBinding || t("overlay.minimap.unassigned") })}>
          <span>{t("overlay.minimap.toggleShort")}</span>
          <kbd className="overlay-minimap-kbd">{toggleBinding || t("overlay.minimap.unassigned")}</kbd>
        </span>
      </div>
      <button
        type="button"
        className="overlay-minimap-close"
        onClick={() => { void hideMinimapForSession().catch(error => console.error("[Minimap] hide", error)); }}
        aria-label={t("overlay.minimap.close")}
        title={t("overlay.minimap.close")}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </header>
  );
};

export default OverlayMinimapHeader;
