import { useEffect, type RefObject } from 'react';

/** High-resolution wheel input shares one camera update per animation frame. */
export function useMapWheelZoom(containerRef: RefObject<HTMLDivElement | null>,
  zoom: (multiplier: number, x: number, y: number, width: number, height: number) => void,
  settle: () => void) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let logarithm = 0, clientX = 0, clientY = 0;
    let frame: number | null = null, timer: number | null = null;
    const flush = () => {
      frame = null;
      const delta = logarithm;
      logarithm = 0;
      if (!delta) return;
      const bounds = container.getBoundingClientRect();
      zoom(Math.exp(delta), clientX - bounds.left, clientY - bounds.top, bounds.width, bounds.height);
    };
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest('[data-map-ui]')) return;
      event.preventDefault();
      if (!event.deltaY) return;
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 100 : 1;
      logarithm += Math.log(event.deltaY > 0 ? 0.82 : 1.22) * Math.abs(event.deltaY * unit) / 100;
      clientX = event.clientX; clientY = event.clientY;
      frame ??= requestAnimationFrame(flush);
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (frame !== null) { cancelAnimationFrame(frame); flush(); }
        settle();
      }, 90);
    };
    container.addEventListener('wheel', wheel, {passive:false});
    return () => {
      container.removeEventListener('wheel', wheel);
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [containerRef, settle, zoom]);
}
