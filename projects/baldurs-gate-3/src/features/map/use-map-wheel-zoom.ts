import { useEffect, type RefObject } from "react";
import type { MapScreenPoint } from "./map-projection";

const WHEEL_SETTLE_MS = 90;
const ZOOM_PER_NOTCH = 1.2;

/** Coalesces a trackpad or high-resolution wheel to one camera update per frame. */
export const useMapWheelZoom = (
  containerRef: RefObject<HTMLDivElement | null>,
  zoom: (multiplier: number, pointer: MapScreenPoint, width: number, height: number) => void,
  settle: () => void,
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let delta = 0;
    let clientX = 0;
    let clientY = 0;
    let frame: number | null = null;
    let timer: number | null = null;

    const flush = () => {
      frame = null;
      const change = delta;
      delta = 0;
      if (!change) return;
      const bounds = container.getBoundingClientRect();
      const multiplier = ZOOM_PER_NOTCH ** (-change / 100);
      zoom(multiplier, { left: clientX - bounds.left, top: clientY - bounds.top }, bounds.width, bounds.height);
    };

    const handleWheel = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-map-ui]")) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 100 : 1;
      delta += event.deltaY * unit;
      clientX = event.clientX;
      clientY = event.clientY;
      frame ??= window.requestAnimationFrame(flush);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (frame !== null) {
          window.cancelAnimationFrame(frame);
          flush();
        }
        settle();
      }, WHEEL_SETTLE_MS);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [containerRef, settle, zoom]);
};
