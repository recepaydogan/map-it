import { useRef, type PointerEvent } from "react";
import type { MapPoint } from "./types";
import { isUserMapMarker } from "./types";

export const useMarkerDrag = (onMove?: (point: MapPoint, clientX: number, clientY: number) => void) => {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>, point: MapPoint) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressClick.current = false;
      if (!onMove || !isUserMapMarker(point) || event.button !== 0) return;
      event.stopPropagation();
      drag.current = { x: event.clientX, y: event.clientY, moved: false };
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (!drag.current) return;
      event.stopPropagation();
      const x = event.clientX - drag.current.x;
      const y = event.clientY - drag.current.y;
      if (Math.hypot(x, y) > 4) drag.current.moved = true;
      if (drag.current.moved) event.currentTarget.style.translate = `${x}px ${y}px`;
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>, point: MapPoint) => {
      if (!drag.current) return;
      event.stopPropagation();
      const moved = drag.current.moved;
      drag.current = null;
      event.currentTarget.style.translate = "";
      suppressClick.current = moved;
      if (moved) onMove?.(point, event.clientX, event.clientY);
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      drag.current = null;
      event.currentTarget.style.translate = "";
      suppressClick.current = true;
    },
    shouldSelect: () => !suppressClick.current,
  };
};
