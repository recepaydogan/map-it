import { useTranslation } from "react-i18next";
import { withCurrentWindow } from "../../utils/overwolf";

const RESIZE_CORNERS = [
  { edge: "TopLeft", position: "top-left" },
  { edge: "TopRight", position: "top-right" },
  { edge: "BottomLeft", position: "bottom-left" },
  { edge: "BottomRight", position: "bottom-right" },
] as const;

type ResizeCorner = typeof RESIZE_CORNERS[number];

const startResize = (corner: ResizeCorner) => {
  if (typeof overwolf === "undefined") return;
  withCurrentWindow((windowId) => {
    overwolf.windows.dragResize(
      windowId,
      corner.edge as Parameters<typeof overwolf.windows.dragResize>[1],
    );
  });
};

const OverlayResizeHandle = () => {
  const { t } = useTranslation();

  return <>{RESIZE_CORNERS.map(corner => (
    <button
      key={corner.edge}
      type="button"
      onMouseDown={event => {
        event.preventDefault();
        event.stopPropagation();
        startResize(corner);
      }}
      className="overlay-minimap-resize-handle"
      aria-label={t("overlay.minimap.resize")}
      title={t("overlay.minimap.resize")}
      data-resize-corner={corner.position}
      data-ow-no-drag
    />
  ))}</>;
};

export default OverlayResizeHandle;
