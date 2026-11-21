export interface RegionLabelAnchor {
  id: string;
  name: string;
  left: number;
  top: number;
}

export interface RegionLabelObstacle {
  left: number;
  top: number;
  radius: number;
}

export interface RegionLabelPlacement extends RegionLabelAnchor {
  labelLeft: number;
  labelTop: number;
  labelWidth: number;
  labelHeight: number;
}

interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const LABEL_HEIGHT = 24;
const VIEWPORT_PADDING = 8;
const LABEL_GAP = 5;
const MARKER_CLEARANCE = 6;
const SEARCH_STEPS = [0, 30, 60, 90, 120];
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

const estimateLabelWidth = (name: string) => {
  const textWidth = [...name].reduce((width, character) =>
    width + (character.codePointAt(0)! > 0xff ? 12 : 7.6), 0);
  return Math.min(220, Math.max(68, Math.ceil(textWidth + 18)));
};

const getRectangle = (left: number, top: number, width: number, height: number): Rectangle => ({
  left: left - width / 2,
  top: top - height / 2,
  right: left + width / 2,
  bottom: top + height / 2,
});

const rectanglesOverlap = (left: Rectangle, right: Rectangle, gap = 0) =>
  left.left < right.right + gap
  && left.right > right.left - gap
  && left.top < right.bottom + gap
  && left.bottom > right.top - gap;

const rectangleHitsMarker = (rectangle: Rectangle, obstacle: RegionLabelObstacle) => {
  const closestX = Math.max(rectangle.left, Math.min(obstacle.left, rectangle.right));
  const closestY = Math.max(rectangle.top, Math.min(obstacle.top, rectangle.bottom));
  const radius = obstacle.radius + MARKER_CLEARANCE;
  return (closestX - obstacle.left) ** 2 + (closestY - obstacle.top) ** 2 < radius ** 2;
};

const getCandidate = (
  anchor: RegionLabelAnchor,
  labelWidth: number,
  width: number,
  height: number,
  direction: (typeof DIRECTIONS)[number],
  extraDistance: number,
) => {
  const [directionX, directionY] = direction;
  const markerRadius = 22;
  const left = anchor.left + directionX * (markerRadius + labelWidth / 2 + LABEL_GAP + extraDistance);
  const top = anchor.top + directionY * (markerRadius + LABEL_HEIGHT / 2 + LABEL_GAP + extraDistance);
  return {
    left: Math.max(
      VIEWPORT_PADDING + labelWidth / 2,
      Math.min(width - VIEWPORT_PADDING - labelWidth / 2, left),
    ),
    top: Math.max(
      VIEWPORT_PADDING + LABEL_HEIGHT / 2,
      Math.min(height - VIEWPORT_PADDING - LABEL_HEIGHT / 2, top),
    ),
  };
};

export const layoutRegionLabels = (
  anchors: RegionLabelAnchor[],
  obstacles: RegionLabelObstacle[],
  width: number,
  height: number,
): RegionLabelPlacement[] => {
  if (width <= 0 || height <= 0) return [];
  const occupiedLabels: Rectangle[] = [];

  return anchors.map((anchor) => {
    const labelWidth = estimateLabelWidth(anchor.name);
    const nearbyObstacles = obstacles.filter((obstacle) =>
      Math.abs(obstacle.left - anchor.left) <= 330
      && Math.abs(obstacle.top - anchor.top) <= 260);
    let best: { left: number; top: number; rectangle: Rectangle; score: number } | null = null;

    for (const extraDistance of SEARCH_STEPS) {
      for (const direction of DIRECTIONS) {
        const candidate = getCandidate(anchor, labelWidth, width, height, direction, extraDistance);
        const rectangle = getRectangle(candidate.left, candidate.top, labelWidth, LABEL_HEIGHT);
        const markerCollisions = nearbyObstacles.filter((obstacle) =>
          rectangleHitsMarker(rectangle, obstacle)).length;
        const labelCollisions = occupiedLabels.filter((occupied) =>
          rectanglesOverlap(rectangle, occupied, LABEL_GAP)).length;
        const score = markerCollisions * 10_000
          + labelCollisions * 20_000
          + Math.hypot(candidate.left - anchor.left, candidate.top - anchor.top);
        if (!best || score < best.score) best = { ...candidate, rectangle, score };
        if (markerCollisions === 0 && labelCollisions === 0) break;
      }
      if (best && best.score < 10_000) break;
    }

    const placement = best ?? {
      left: anchor.left,
      top: anchor.top,
      rectangle: getRectangle(anchor.left, anchor.top, labelWidth, LABEL_HEIGHT),
      score: 0,
    };
    occupiedLabels.push(placement.rectangle);
    return {
      ...anchor,
      labelLeft: placement.left,
      labelTop: placement.top,
      labelWidth,
      labelHeight: LABEL_HEIGHT,
    };
  });
};

export const regionLabelOverlapsMarker = (
  placement: RegionLabelPlacement,
  obstacle: RegionLabelObstacle,
) => rectangleHitsMarker(
  getRectangle(placement.labelLeft, placement.labelTop, placement.labelWidth, placement.labelHeight),
  obstacle,
);
