import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Move } from "lucide-react";
import { useTranslation } from "react-i18next";

const OverlayKeyboardMoveHint = () => {
  const { t } = useTranslation();
  const label = t("overlay.minimap.moveHint");

  return (
    <aside
      className="overlay-minimap-move-hint"
      data-map-ui
      aria-label={label}
      title={label}
    >
      <div className="overlay-minimap-move-title">
        <Move size={14} aria-hidden="true" />
        <span>{t("overlay.minimap.move")}</span>
      </div>
      <div className="overlay-minimap-move-shortcut" aria-hidden="true">
        <span className="overlay-minimap-shortcut-shift">Shift</span>
        <span className="overlay-minimap-shortcut-plus">+</span>
        <span className="overlay-minimap-arrow-keys">
          <ArrowLeft size={13} strokeWidth={2.75} />
          <ArrowUp size={13} strokeWidth={2.75} />
          <ArrowDown size={13} strokeWidth={2.75} />
          <ArrowRight size={13} strokeWidth={2.75} />
        </span>
      </div>
    </aside>
  );
};

export default OverlayKeyboardMoveHint;
