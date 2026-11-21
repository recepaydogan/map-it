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

/** Measure only when layout can change instead of forcing layout every frame. */
export const useTourGeometry = ({
  targetSelector,
  scrollTargetIntoView,
}: TourGeometryOptions) => {
  const [content, setContent] = useState<TourBox | null>(null);
  const [target, setTarget] = useState<{ selector?: string; box: TourBox | null }>({ box: null });

  useEffect(() => {
    const frameElement = document.querySelector("[data-tour-frame]");
    const targetElement = targetSelector ? document.querySelector(targetSelector) : null;
    let animationFrame = 0;

    const measure = () => {
      animationFrame = 0;
      const nextContent = frameElement ? toBox(frameElement.getBoundingClientRect()) : null;
      const nextTarget = targetElement ? toBox(targetElement.getBoundingClientRect()) : null;
      setContent((current) => (boxesMatch(current, nextContent) ? current : nextContent));
      setTarget((current) => (
        current.selector === targetSelector && boxesMatch(current.box, nextTarget)
          ? current
          : { selector: targetSelector, box: nextTarget }
      ));
    };

    const scheduleMeasurement = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(measure);
    };

    if (targetElement && scrollTargetIntoView) {
      targetElement.scrollIntoView({ block: "center", behavior: "auto" });
    }

    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    if (frameElement) resizeObserver.observe(frameElement);
    if (targetElement) resizeObserver.observe(targetElement);

    window.addEventListener("resize", scheduleMeasurement, { passive: true });
    document.addEventListener("scroll", scheduleMeasurement, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", scheduleMeasurement, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleMeasurement, { passive: true });
    scheduleMeasurement();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      document.removeEventListener("scroll", scheduleMeasurement, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasurement);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasurement);
    };
  }, [scrollTargetIntoView, targetSelector]);

  return { content, target: target.selector === targetSelector ? target.box : null };
};
