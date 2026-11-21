import { journeyDimensionTransitions, type JourneyDimensionTransition } from "./journey-dimension-transitions.ts";
import { correctedTransitionSource } from "./journey-route-cleanup.ts";
import type { WorldJourney } from "./journey-state.ts";

export interface PortalProjectionRule {
  sourceDimension: string;
  targetDimension: string;
  horizontalScale: number;
}

export interface ObservedJourneyPortal {
  id: string;
  transition: JourneyDimensionTransition;
}

const horizontalDistance = (left: { x: number; z: number }, right: { x: number; z: number }) =>
  Math.hypot(left.x - right.x, left.z - right.z);
const spatialDistance = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const samePortal = (left: JourneyDimensionTransition, right: JourneyDimensionTransition, distance: number) => {
  const matchingSide = (dimension: string) => left.from.dimension === dimension ? left.from.point : left.to.point;
  return new Set([left.from.dimension, left.to.dimension]).has(right.from.dimension)
    && new Set([left.from.dimension, left.to.dimension]).has(right.to.dimension)
    && horizontalDistance(matchingSide(right.from.dimension), right.from.point) <= distance
    && horizontalDistance(matchingSide(right.to.dimension), right.to.point) <= distance;
};

const staleMirroredEndpoint = (old: JourneyDimensionTransition, fresh: JourneyDimensionTransition,
  distance: number) => [old.from, old.to].some(shared => {
    const oldOther = shared === old.from ? old.to : old.from;
    const freshShared = fresh.from.dimension === shared.dimension ? fresh.from : fresh.to;
    const freshOther = freshShared === fresh.from ? fresh.to : fresh.from;
    return freshShared.dimension === shared.dimension && freshOther.dimension === oldOther.dimension
      && horizontalDistance(shared.point, freshShared.point) <= distance
      && horizontalDistance(oldOther.point, shared.point) <= 4
      && spatialDistance(freshOther.point, oldOther.point) > distance;
  });

export const mergeObservedPortals = (existing: readonly ObservedJourneyPortal[], incoming: readonly ObservedJourneyPortal[],
  mergeDistance: number, removed: readonly ObservedJourneyPortal[] = []): ObservedJourneyPortal[] => {
  let next: ObservedJourneyPortal[] = [];
  for (const portal of [...existing, ...incoming]) {
    if (removed.some(item => item.id === portal.id || samePortal(item.transition, portal.transition, mergeDistance))) continue;
    if (next.some(item => samePortal(item.transition, portal.transition, mergeDistance))) continue;
    if (next.some(item => staleMirroredEndpoint(portal.transition, item.transition, mergeDistance))) continue;
    const staleIndex = next.findIndex(item => staleMirroredEndpoint(item.transition, portal.transition, mergeDistance));
    if (staleIndex >= 0) next = next.map((item, index) => index === staleIndex ? portal : item);
    else next = [...next, portal];
  }
  return next;
};

/** Keep only timely, coordinate-compatible crossings; route samples alone cannot prove a portal block's position. */
export const observedJourneyPortals = (journeys: readonly WorldJourney[], rules: readonly PortalProjectionRule[],
  maxGapMs: number, maxTargetOffset: number, mergeDistance: number): ObservedJourneyPortal[] => {
  const links: ObservedJourneyPortal[] = [];
  for (const journey of journeys) for (const rawTransition of journeyDimensionTransitions(journey)) {
    const source = correctedTransitionSource(journey, rawTransition, maxGapMs);
    if (!source) continue;
    const transition = source === rawTransition.from.point ? rawTransition
      : { ...rawTransition, from: { ...rawTransition.from, point: source } };
    const projection = rules.find(rule => rule.sourceDimension === transition.from.dimension
      && rule.targetDimension === transition.to.dimension);
    if (!projection) continue;
    const gap = transition.to.point.at - transition.from.point.at;
    if (gap <= 0 || transition.to.point.at - source.at > maxGapMs || source === rawTransition.from.point && horizontalDistance({
      x: transition.from.point.x * projection.horizontalScale,
      z: transition.from.point.z * projection.horizontalScale,
    }, transition.to.point) > maxTargetOffset) continue;
    const candidate = { id: `${journey.id}:${transition.index}`, transition };
    if (!links.some(link => samePortal(link.transition, candidate.transition, mergeDistance))) links.push(candidate);
  }
  return links;
};
