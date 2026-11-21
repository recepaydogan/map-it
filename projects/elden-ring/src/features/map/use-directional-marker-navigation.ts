import { useEffect, useRef } from "react";

interface NavigationPoint {
  x: number;
  y: number;
}

interface NavigationBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface DirectionalMarkerNavigationOptions<T> {
  markers: T[];
  selectedId: string | null;
  getId: (marker: T) => string;
  getPoint: (marker: T) => NavigationPoint;
  getViewportCenter: () => NavigationPoint;
  /** Current viewport rectangle in the SAME space as getPoint. When provided, a
   * hop prefers markers that are on screen and only leaves the screen when
   * nothing forward is visible — pressing D should step through what the user
   * is looking at, not launch across the map. */
  getViewportBounds?: () => NavigationBounds;
  onSelect: (id: string) => void;
}

const DIRECTIONS: Record<string, [number, number]> = {
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

/**
 * Candidates live in a ±75° half-cone around the pressed direction. The old
 * ±63° cone (`perp > proj * 2`) EXCLUDED near-diagonal neighbours outright: a
 * pin 20px right but 45px up sits at 66°, got dropped, and D jumped to some
 * aligned pin hundreds of px away — "it skips the close ones". Anything past
 * 75° is more sideways than forward and belongs to the perpendicular key.
 */
const CONE_TAN = Math.tan((75 * Math.PI) / 180);

/**
 * Score = distance × (1 + PENALTY·sinθ): distance dominates, misalignment only
 * scales it (at most ×2.25 at the cone's edge). Nearby-but-diagonal therefore
 * beats far-but-aligned — the exact opposite bias of the old
 * `proj² + 2·perp²`, which also hard-filtered the diagonals.
 */
const ANGLE_PENALTY = 1.25;

/** Held-key auto-repeat fires ~30/s; the camera glide is 0.4s. Pace repeats so
 * holding D steps deliberately instead of spraying selections. Fresh presses
 * are never throttled. */
const REPEAT_INTERVAL_MS = 160;

const useDirectionalMarkerNavigation = <T,>(
  options: DirectionalMarkerNavigationOptions<T>,
) => {
  const optionsRef = useRef(options);
  const lastRepeatHopRef = useRef(0);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        return;
      }

      const {
        markers,
        selectedId,
        getId,
        getPoint,
        getViewportCenter,
        getViewportBounds,
        onSelect,
      } = optionsRef.current;
      const direction = DIRECTIONS[event.key.toLowerCase()];
      if (!direction || markers.length === 0) return;

      event.preventDefault();
      if (
        event.repeat &&
        performance.now() - lastRepeatHopRef.current < REPEAT_INTERVAL_MS
      ) {
        return;
      }

      const [directionX, directionY] = direction;
      const selected = selectedId
        ? markers.find((marker) => getId(marker) === selectedId)
        : undefined;
      const origin = selected ? getPoint(selected) : getViewportCenter();
      const bounds = getViewportBounds?.();

      let bestOnScreen: T | null = null;
      let bestOnScreenScore = Infinity;
      let bestAnywhere: T | null = null;
      let bestAnywhereScore = Infinity;

      for (const marker of markers) {
        if (selectedId && getId(marker) === selectedId) continue;
        const point = getPoint(marker);
        const vectorX = point.x - origin.x;
        const vectorY = point.y - origin.y;
        const projected = vectorX * directionX + vectorY * directionY;
        if (projected <= 0) continue;
        const perpendicular = Math.abs(vectorX * directionY - vectorY * directionX);
        if (perpendicular > projected * CONE_TAN) continue;
        const distance = Math.hypot(vectorX, vectorY);
        const score = distance * (1 + ANGLE_PENALTY * (perpendicular / distance));
        if (score < bestAnywhereScore) {
          bestAnywhere = marker;
          bestAnywhereScore = score;
        }
        if (
          bounds &&
          point.x >= bounds.minX &&
          point.x <= bounds.maxX &&
          point.y >= bounds.minY &&
          point.y <= bounds.maxY &&
          score < bestOnScreenScore
        ) {
          bestOnScreen = marker;
          bestOnScreenScore = score;
        }
      }

      const best = bestOnScreen ?? bestAnywhere;
      if (best) {
        lastRepeatHopRef.current = performance.now();
        onSelect(getId(best));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};

export default useDirectionalMarkerNavigation;
