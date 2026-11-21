import { isUserMapMarker, type MapCoordinate, type MapPoint, type UserMapMarker } from "./types.ts";

const distance = (a: MapCoordinate, b: MapCoordinate) => Math.hypot(a.x - b.x, a.y - b.y);

/** A stable, short loop through the player's own resource markers. */
export const planGatheringRoute = (points: MapPoint[], start?: MapCoordinate): UserMapMarker[] => {
  const remaining = points.filter((point): point is UserMapMarker =>
    isUserMapMarker(point) && point.group === "resources" && Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (remaining.length < 2) return [];

  const ordered: UserMapMarker[] = [];
  let current = start ?? remaining[0]!;
  while (remaining.length) {
    let closest = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      if (distance(current, remaining[index]!) < distance(current, remaining[closest]!)) closest = index;
    }
    const [next] = remaining.splice(closest, 1);
    ordered.push(next!);
    current = next!;
  }

  // Swap crossing segments when that shortens the loop, keeping the chosen start fixed.
  let changed = true;
  while (changed) {
    changed = false;
    for (let first = 1; first < ordered.length - 1; first += 1) {
      for (let last = first + 1; last < ordered.length; last += 1) {
        const before = ordered[first - 1]!;
        const startOfSwap = ordered[first]!;
        const endOfSwap = ordered[last]!;
        const after = ordered[(last + 1) % ordered.length]!;
        if (distance(before, endOfSwap) + distance(startOfSwap, after) + 0.001
          < distance(before, startOfSwap) + distance(endOfSwap, after)) {
          ordered.splice(first, last - first + 1, ...ordered.slice(first, last + 1).reverse());
          changed = true;
        }
      }
    }
  }
  return ordered;
};
