import { useEffect, useState } from "react";

export interface TourBox {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const toBox = (rect: DOMRect): TourBox => ({
  top: rect.top,
  left: rect.left,
  width: rect.width,
  height: rect.height,
  right: rect.right,
  bottom: rect.bottom,
});

const boxesMatch = (current: TourBox | null, next: TourBox | null): boolean => {
  if (!current || !next) return current === next;
  return (
    Math.abs(current.top - next.top) < 0.5
    && Math.abs(current.left - next.left) < 0.5
    && Math.abs(current.width - next.width) < 0.5
    && Math.abs(current.height - next.height) < 0.5
  );
};

interface TourGeometryOptions {
  targetSelector?: string;
  scrollTargetIntoView: boolean;
}

/**
 * Measures tour geometry only when layout can actually change. The previous
 * implementation polled getBoundingClientRect on every animation frame, which
 * forced Chromium to keep doing layout work for the entire tour while the map
 * was also rendering underneath it.
 */
export const useTourGeometry = ({
  targetSelector,
  scrollTargetIntoView,
}: TourGeometryOptions) => {
  const [content, setContent] = useState<TourBox | null>(null);
  const [target, setTarget] = useState<{ selector?: string; box: TourBox | null }>({ box: null });

  useEffect(() => {
    const frameElement = document.querySelector("[data-tour-frame]");
    let targetElement = targetSelector ? document.querySelector(targetSelector) : null;
    let animationFrame = 0;
    let mutationObserver: MutationObserver | null = null;

    const scrollToTarget = (element: Element) => {
      if (scrollTargetIntoView) element.scrollIntoView({ block: "center", behavior: "auto" });
    };

    const measure = () => {
      animationFrame = 0;
      const nextContent = frameElement ? toBox(frameElement.getBoundingClientRect()) : null;
      const nextTarget = targetElement ? toBox(targetElement.getBoundingClientRect()) : null;
      setContent((current) => (boxesMatch(current, nextContent) ? current : nextContent));
      setTarget((current) => current.selector === targetSelector && boxesMatch(current.box, nextTarget)
        ? current : { selector: targetSelector, box: nextTarget });
    };

    const scheduleMeasurement = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    if (frameElement) resizeObserver.observe(frameElement);
    if (targetElement) {
      resizeObserver.observe(targetElement);
      scrollToTarget(targetElement);
    } else if (targetSelector && frameElement) {
      // Catalog controls mount after their data arrives. Watch only until the
      // requested control appears instead of polling for the whole tour.
      mutationObserver = new MutationObserver(() => {
        const found = document.querySelector(targetSelector);
        if (!found) return;
        targetElement = found;
        resizeObserver.observe(found);
        scrollToTarget(found);
        mutationObserver?.disconnect();
        mutationObserver = null;
        scheduleMeasurement();
      });
      mutationObserver.observe(frameElement, { childList: true, subtree: true });
    }

    window.addEventListener("resize", scheduleMeasurement, { passive: true });
    document.addEventListener("scroll", scheduleMeasurement, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", scheduleMeasurement, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleMeasurement, { passive: true });
    scheduleMeasurement();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      document.removeEventListener("scroll", scheduleMeasurement, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasurement);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasurement);
    };
  }, [scrollTargetIntoView, targetSelector]);

  return { content, target: target.selector === targetSelector ? target.box : null };
};
