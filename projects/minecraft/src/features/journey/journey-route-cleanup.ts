import { journeyDimensionTransitions, type JourneyDimensionTransition } from "./journey-dimension-transitions.ts";
import type { JourneyPoint, WorldJourney } from "./journey-state.ts";

const distance = (left: JourneyPoint, right: JourneyPoint) =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

/** A destination position can arrive while telemetry still reports the source dimension. */
export const correctedTransitionSource = (journey: WorldJourney, transition: JourneyDimensionTransition,
  maxGapMs: number): JourneyPoint | null => {
  const points = journey.segments[transition.index - 1]?.points ?? [];
  const last = transition.from.point;
  if (distance(last, transition.to.point) > 4 || transition.to.point.at - last.at > 5_000) return last;
  return [...points].reverse().find(point => point.at < last.at
    && transition.to.point.at - point.at <= maxGapMs && distance(point, last) > 8) ?? null;
};

/** Remove a destination coordinate mistakenly appended to the preceding dimension's route. */
export const correctedJourneyRoute = (journey: WorldJourney, maxGapMs: number): WorldJourney => {
  let segments = journey.segments;
  for (const transition of journeyDimensionTransitions(journey)) {
    const source = correctedTransitionSource(journey, transition, maxGapMs);
    if (!source || source === transition.from.point) continue;
    const index = transition.index - 1;
    const sourceIndex = segments[index].points.indexOf(source);
    if (sourceIndex < 0) continue;
    if (segments === journey.segments) segments = [...journey.segments];
    segments[index] = { ...segments[index], points: segments[index].points.slice(0, sourceIndex + 1) };
  }
  return segments === journey.segments ? journey : { ...journey, segments };
};

/** Hide an in-flight destination sample while telemetry still labels it with the source dimension. */
export const correctedJourneyRouteForPortals = (journey: WorldJourney,
  portals: readonly { transition: JourneyDimensionTransition }[], maxGapMs: number): WorldJourney => {
  let segments = journey.segments;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index], last = segment.points.at(-1);
    if (!last || segment.points.length < 2) continue;
    for (const { transition } of portals) {
      const current = transition.from.dimension === segment.dimension ? transition.from
        : transition.to.dimension === segment.dimension ? transition.to : null;
      if (!current) continue;
      const opposite = current === transition.from ? transition.to : transition.from;
      if (distance(last, opposite.point) > 4) continue;
      let sourceIndex = -1;
      for (let pointIndex = segment.points.length - 2; pointIndex >= 0; pointIndex--) {
        const point = segment.points[pointIndex];
        if (last.at - point.at > maxGapMs) break;
        if (distance(point, current.point) <= 8) { sourceIndex = pointIndex; break; }
      }
      if (sourceIndex < 0) continue;
      if (segments === journey.segments) segments = [...journey.segments];
      segments[index] = { ...segment, points: segment.points.slice(0, sourceIndex + 1) };
      break;
    }
  }
  return segments === journey.segments ? journey : { ...journey, segments };
};

/** The recorder's pre-crossing position is authoritative even if queued samples were coalesced. */
export const anchorJourneyCrossing = (journey: WorldJourney, sourceDimension: string,
  destinationDimension: string, source: JourneyPoint, destination: JourneyPoint): WorldJourney => {
  const segments = journey.segments;
  const departure = segments.at(-2), arrival = segments.at(-1);
  if (!departure || !arrival || departure.dimension !== sourceDimension || arrival.dimension !== destinationDimension
    || arrival.points[0]?.at !== destination.at) return journey;
  const retained = departure.points.filter(point => point.at < source.at);
  const matching = departure.points.find(point => point.at === source.at && distance(point, source) <= 4);
  const points = [...retained, matching ?? source];
  if (points.length === departure.points.length && points.every((point, index) => point === departure.points[index]))
    return journey;
  return { ...journey, segments: [...segments.slice(0, -2), { ...departure, points }, arrival] };
};
