import { withCurrentWindow } from "../../utils/overwolf";

type ResizeEdge = "Top" | "Bottom" | "Left" | "Right" | "TopLeft" | "TopRight" | "BottomLeft" | "BottomRight";
const edges: { edge: ResizeEdge; className: string }[] = [
  { edge: "Top", className: "inset-x-2 top-0 h-1.5 cursor-ns-resize" },
  { edge: "Bottom", className: "inset-x-2 bottom-0 h-1.5 cursor-ns-resize" },
  { edge: "Left", className: "inset-y-2 left-0 w-1.5 cursor-ew-resize" },
  { edge: "Right", className: "inset-y-2 right-0 w-1.5 cursor-ew-resize" },
  { edge: "TopLeft", className: "left-0 top-0 size-3 cursor-nwse-resize" },
  { edge: "TopRight", className: "right-0 top-0 size-3 cursor-nesw-resize" },
  { edge: "BottomLeft", className: "left-0 bottom-0 size-3 cursor-nesw-resize" },
  { edge: "BottomRight", className: "right-0 bottom-0 size-3 cursor-nwse-resize" },
];

const startResize = (edge: ResizeEdge) => {
  if (typeof overwolf === "undefined") return;
  withCurrentWindow((windowId) => {
    overwolf.windows.dragResize(
      windowId,
      edge as Parameters<typeof overwolf.windows.dragResize>[1],
    );
  });
};

const OverlayResizeHandle = () => {
  return (
    <>
      {edges.map(({ edge, className }) => (
        <div key={edge} className={`overlay-minimap-resize-edge absolute z-[90] ${className}`}
          onMouseDown={() => startResize(edge)} aria-hidden="true" />
      ))}
    </>
  );
};

export default OverlayResizeHandle;
