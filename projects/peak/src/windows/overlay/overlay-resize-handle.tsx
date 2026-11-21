import { MoveDiagonal2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resizeCurrentWindowFromTopLeft } from "../../overwolf/window-manager";
import { usePreferences } from "../../state/preferences-store";

const OverlayResizeHandle = () => {
  const { t } = useTranslation();
  const { overlayLocked } = usePreferences();

  if (overlayLocked) return null;

  return (
    <button
      type="button"
      onMouseDown={resizeCurrentWindowFromTopLeft}
      className="overlay-minimap-resize-handle"
      aria-label={t("overlay.minimap.resize")}
      title={t("overlay.minimap.resize")}
      data-ow-no-drag
    >
      <MoveDiagonal2 size={13} aria-hidden="true" />
    </button>
  );
};

export default OverlayResizeHandle;
