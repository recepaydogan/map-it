import { MoveDiagonal2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { withCurrentWindow } from "../../utils/overwolf";

const startResize = () => {
  if (typeof overwolf === "undefined") return;
  withCurrentWindow((windowId) => {
    overwolf.windows.dragResize(
      windowId,
      "TopLeft" as Parameters<typeof overwolf.windows.dragResize>[1],
    );
  });
};

const OverlayResizeHandle = () => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onMouseDown={startResize}
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
