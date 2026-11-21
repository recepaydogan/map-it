import type { JourneyPoint, WorldJourney } from "./journey-state.ts";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { projectWorldPoint } from "../worlds/world-polyline-projection.ts";

export interface JourneyDimensionTransition {
  index: number;
  from: { dimension: string; point: JourneyPoint };
  to: { dimension: string; point: JourneyPoint };
}

export type JourneyTransitionSide = "departure" | "arrival";

export const otherSideOfJourneyTransition = (transition: JourneyDimensionTransition, side: JourneyTransitionSide) =>
  side === "departure" ? transition.to : transition.from;

/** Pair the last recorded source position with the first destination position. */
export const journeyDimensionTransitions = (journey: Pick<WorldJourney, "segments">): JourneyDimensionTransition[] => {
  const transitions: JourneyDimensionTransition[] = [];
  for (let index = 1; index < journey.segments.length; index++) {
    const source = journey.segments[index - 1], destination = journey.segments[index];
    if (source.dimension === destination.dimension) continue;
    const from = source.points.at(-1), to = destination.points[0];
    if (!from || !to) continue;
    transitions.push({ index, from: { dimension: source.dimension, point: from },
      to: { dimension: destination.dimension, point: to } });
  }
  return transitions;
};

export const visibleJourneyTransitions = (journey: WorldJourney | null | undefined, dimension: string,
  view: BiomeCanvasState | null) => {
  if (!journey || !view) return [];
  return journeyDimensionTransitions(journey).flatMap(transition => {
    const side: JourneyTransitionSide | null = transition.from.dimension === dimension ? "departure"
      : transition.to.dimension === dimension ? "arrival" : null;
    if (!side) return [];
    const position = projectWorldPoint(side === "departure" ? transition.from.point : transition.to.point, view);
    return position ? [{ transition, side, position }] : [];
  });
};
