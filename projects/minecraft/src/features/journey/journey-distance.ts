import type { WorldJourney } from "./journey-state.ts";
import { GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config.ts";
import { correctedJourneyRoute } from "./journey-route-cleanup.ts";

export const journeyDistance = (journey: WorldJourney): number => correctedJourneyRoute(journey,
  GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs).segments.reduce((total, segment) => total +
  segment.points.slice(1).reduce((sum, point, index) => {
    const previous = segment.points[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
  }, 0), 0);

export const isJourneyLongEnough = (journey: WorldJourney, minimumDistance = 200): boolean =>
  journeyDistance(journey) >= minimumDistance;
