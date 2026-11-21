import { withCurrentWindow } from "../../utils/overwolf";

const edges = ["Top", "Bottom", "Left", "Right", "TopLeft", "TopRight", "BottomLeft", "BottomRight"] as const;
const OverlayResizeHandle = () => <>{edges.map(edge => <div key={edge}
  className={`minimap-resize-edge minimap-resize-${edge.toLowerCase()}`} aria-hidden="true"
  onMouseDown={() => {
    if (typeof overwolf === "undefined") return;
    withCurrentWindow(id => overwolf.windows.dragResize(id, edge as Parameters<typeof overwolf.windows.dragResize>[1]));
  }} />)}</>;

export default OverlayResizeHandle;
