import { bindDragMoveElement } from "../../overwolf-utils/window-manager";

const interactive = "button, a, input, textarea, select, label, summary, [contenteditable], [role='button'], [role='tab'], [role='search'], [data-ow-no-drag], [data-map-ui], .leaflet-interactive, .leaflet-marker-icon";

export function bindMapItWindowDrag(surface: HTMLElement, strip: HTMLElement, frame?: HTMLIFrameElement) {
  const containsDragStart = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target?.closest || target.closest(interactive)) return false;
    const bounds = strip.getBoundingClientRect();
    const offset = frame?.getBoundingClientRect();
    const x = event.clientX + (offset?.left ?? 0);
    const y = event.clientY + (offset?.top ?? 0);
    return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
  };

  const initialCursor = surface.style.cursor;
  const resetCursor = () => { surface.style.cursor = initialCursor; };
  const showCursor = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const cursor = containsDragStart(event) ? (event.buttons & 1 ? "grabbing" : "grab") : initialCursor;
    if (surface.style.cursor !== cursor) surface.style.cursor = cursor;
  };
  const unbindDrag = bindDragMoveElement(surface, { containsDragStart });
  surface.addEventListener("pointermove", showCursor, true);
  surface.addEventListener("pointerleave", resetCursor);
  return () => {
    unbindDrag();
    surface.removeEventListener("pointermove", showCursor, true);
    surface.removeEventListener("pointerleave", resetCursor);
    resetCursor();
  };
}
