import { GAME_JOURNEY, GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config.ts";
import type { Point3 } from "../terrain/orbit-camera.ts";
import type { JourneyRead } from "./journey-storage.ts";
import { correctedJourneyRoute } from "./journey-route-cleanup.ts";

const interpolateCutaway = (start: Point3, end: Point3, cutawayY: number): Point3 => {
  const amount = (cutawayY - start[1]) / (end[1] - start[1]);
  return [start[0] + (end[0] - start[0]) * amount, cutawayY, start[2] + (end[2] - start[2]) * amount];
};

const clipPathToCutaway = (points: readonly Point3[], cutawayY: number | null): Point3[][] => {
  if (cutawayY === null) return points.length >= 2 ? [points.map(point => [...point])] : [];
  const paths: Point3[][] = [];
  let current: Point3[] = [];
  const flush = () => { if (current.length >= 2) paths.push(current); current = []; };
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    const startVisible = start[1] <= cutawayY, endVisible = end[1] <= cutawayY;
    if (startVisible && !current.length) current.push([...start]);
    if (startVisible && endVisible) current.push([...end]);
    else if (startVisible) { current.push(interpolateCutaway(start, end, cutawayY)); flush(); }
    else if (endVisible) current = [interpolateCutaway(start, end, cutawayY), [...end]];
    else flush();
  }
  flush();
  return paths;
};

/** Exact sampled Y is retained; dimensions and cutaway gaps can never be bridged. */
export const journeyTerrainPaths = (read: JourneyRead, dimension: string, cutawayY: number | null): readonly (readonly Point3[])[] => {
  if (!read.preferences.visible || !dimension || (cutawayY !== null && !Number.isSafeInteger(cutawayY))) return [];
  const journey = read.preferences.enabled && read.data.active ? read.data.active : read.data.journeys[0] ?? read.data.active;
  if (!journey) return [];
  const corrected = correctedJourneyRoute(journey, GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs);
  const clipped = corrected.segments.filter(segment => segment.dimension === dimension).flatMap(segment =>
    clipPathToCutaway(segment.points.map(point => [point.x, point.y, point.z]), cutawayY));
  let remaining = GAME_JOURNEY.maxPoints;
  const retained: Point3[][] = [];
  for (let index = clipped.length - 1; index >= 0 && remaining >= 2; index--) {
    const path = clipped[index];
    const count = Math.min(path.length, remaining);
    if (count >= 2) { retained.push(path.slice(path.length - count)); remaining -= count; }
  }
  return retained.reverse();
};
