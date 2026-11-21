import type { MapView } from "./types";

/** Animate from the current camera pose; callers cancel before retargeting or dragging. */
export const animateMapCamera = (start: MapView, target: MapView, showView: (view: MapView, settled: boolean) => void) => {
  let frame: number | null = null;
  const distance = Math.hypot((target.centerX - start.centerX) * start.zoom, (target.centerY - start.centerY) * start.zoom);
  const duration = Math.min(620, 360 + distance * 0.12);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let startedAt: number | undefined;
  const tick = (time: number) => {
    startedAt ??= time;
    const progress = reducedMotion ? 1 : Math.min(1, (time - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    showView({
      centerX: start.centerX + (target.centerX - start.centerX) * eased,
      centerY: start.centerY + (target.centerY - start.centerY) * eased,
      zoom: start.zoom + (target.zoom - start.zoom) * eased,
    }, progress === 1);
    frame = progress < 1 ? window.requestAnimationFrame(tick) : null;
  };
  frame = window.requestAnimationFrame(tick);
  return () => { if (frame !== null) window.cancelAnimationFrame(frame); frame = null; };
};
