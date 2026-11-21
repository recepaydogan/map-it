import { useEffect, type RefObject } from "react";

const wheelResponseMs = 42;
const smallPixelDelta = 40;
const gesturePauseMs = 140;

export function useLibraryScroll(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !active) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let position = element.scrollTop;
    let target = position;
    let velocity = 0;
    let frame = 0;
    let lastFrameAt: number | null = null;
    let nativeGestureUntil = 0;

    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      velocity = 0;
    };

    const animate = (now: number) => {
      // Scroll anchoring, keyboard focus and touch can move the viewport independently.
      if (Math.abs(element.scrollTop - position) > 1) { stop(); return; }

      target = Math.min(target, element.scrollHeight - element.clientHeight);
      const elapsed = lastFrameAt === null ? 1000 / 60 : Math.max(0, Math.min(32, now - lastFrameAt));
      lastFrameAt = now;
      // A critically damped spring eases in and out while running at any refresh rate.
      const offset = position - target;
      const decay = Math.exp(-elapsed / wheelResponseMs);
      const slope = velocity + offset / wheelResponseMs;
      const nextOffset = (offset + slope * elapsed) * decay;
      if (Math.abs(nextOffset) < 0.5 || Math.sign(nextOffset) !== Math.sign(offset)) {
        element.scrollTop = target;
        stop();
        return;
      }
      velocity = (velocity - slope * elapsed / wheelResponseMs) * decay;
      position = target + nextOffset;
      element.scrollTop = position;
      frame = window.requestAnimationFrame(animate);
    };

    const onWheel = (event: WheelEvent) => {
      if (reducedMotion.matches || event.defaultPrevented || !event.cancelable
          || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const mode = event.deltaMode;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      // Keep a precision touchpad gesture native as its deltas grow and settle.
      const now = performance.now();
      if (mode === WheelEvent.DOM_DELTA_PIXEL && (now < nativeGestureUntil || Math.abs(event.deltaY) < smallPixelDelta)) {
        nativeGestureUntil = now + gesturePauseMs;
        stop();
        return;
      }
      const limit = element.scrollHeight - element.clientHeight;
      if (limit <= 0) return;

      const multiplier = mode === WheelEvent.DOM_DELTA_LINE ? 16
        : mode === WheelEvent.DOM_DELTA_PAGE ? element.clientHeight : 1;
      const distance = event.deltaY * multiplier;
      const top = element.scrollTop;
      if (!frame || Math.abs(top - position) > 1 || Math.sign(target - position) !== Math.sign(distance)) {
        position = target = top;
        velocity = 0;
      }
      target = Math.max(0, Math.min(limit, target + distance));
      if (target === top && !frame) return;

      event.preventDefault();
      if (!frame) {
        lastFrameAt = null;
        frame = window.requestAnimationFrame(animate);
      }
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", stop);
    element.addEventListener("keydown", stop);
    reducedMotion.addEventListener("change", stop);
    return () => {
      stop();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", stop);
      element.removeEventListener("keydown", stop);
      reducedMotion.removeEventListener("change", stop);
    };
  }, [ref, active]);
}
