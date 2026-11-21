/**
 * Screen-space geometry for the colocated-marker "spider web".
 *
 * These values intentionally match the Elden Ring map. Keeping the layout in a
 * map-library-free module makes the same interaction usable by every game built
 * from this base.
 */
export const MARKER_FAN_TRIGGER_RADIUS = 14;
export const MARKER_FAN_SCRIM_MARGIN = 28;

const FOOT_SEPARATION = 44;
const MIN_LEG_LENGTH = 48;

export interface MapMarkerFanOffset {
  x: number;
  y: number;
}

export interface MapMarkerFanLayout {
  offsets: MapMarkerFanOffset[];
  outerRadius: number;
}

const radiusOf = (ring: number) => MIN_LEG_LENGTH + (ring - 1) * FOOT_SEPARATION;

const capacityOf = (ring: number) =>
  Math.max(1, Math.floor((2 * Math.PI * radiusOf(ring)) / FOOT_SEPARATION));

/**
 * Places feet over concentric rings. Unlike a single ever-growing circle, the
 * web's diameter grows roughly with the square root of the marker count, so a
 * very large exact-coordinate stack remains usable inside the map window.
 */
export const createMapMarkerFanLayout = (count: number): MapMarkerFanLayout => {
  if (count <= 0) return { offsets: [], outerRadius: 0 };

  let rings = 1;
  for (let total = capacityOf(1); total < count; total += capacityOf(rings)) rings += 1;

  const weights = Array.from({ length: rings }, (_, index) => capacityOf(index + 1));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const perRing = weights.map((weight) => Math.floor((count * weight) / weightSum));
  const placed = () => perRing.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; placed() < count; index = (index + 1) % rings) {
    perRing[index] = (perRing[index] ?? 0) + 1;
  }

  const offsets: MapMarkerFanOffset[] = [];
  perRing.forEach((amount, index) => {
    if (amount <= 0) return;
    const ring = index + 1;
    const radius = radiusOf(ring);
    const step = (2 * Math.PI) / amount;
    const start = -Math.PI / 2 + (ring % 2 === 0 ? step / 2 : 0);
    for (let markerIndex = 0; markerIndex < amount; markerIndex += 1) {
      const angle = start + markerIndex * step;
      offsets.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }
  });

  return { offsets, outerRadius: radiusOf(rings) };
};
