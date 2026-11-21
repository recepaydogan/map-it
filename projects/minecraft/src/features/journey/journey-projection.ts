import type { WorldJourney } from "./journey-state.ts";
import { GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config.ts";
import { correctedJourneyRoute } from "./journey-route-cleanup.ts";
import { projectWorldDirectionArrows, projectWorldPoint, projectWorldPolyline,
  type WorldPolylineDirectionArrow } from "../worlds/world-polyline-projection.ts";

export interface JourneyProjectionView { x: number; z: number; width: number; height: number; zoom: number }
export interface ProjectedJourney { paths: readonly (readonly [number, number][])[];
  directionArrows: readonly WorldPolylineDirectionArrow[]; endpoint: { x: number; y: number } | null }

/** Projects and clips route lines in target-relative coordinates to avoid large-world float loss. */
export const projectJourney = (journey: WorldJourney | null, dimension: string,
  view: JourneyProjectionView | null, padding = 12): ProjectedJourney => {
  if (!journey || !dimension || !view || ![view.x, view.z, view.width, view.height, view.zoom, padding].every(Number.isFinite) ||
    view.width <= 0 || view.height <= 0 || view.zoom <= 0 || padding < 0) return { paths: [], directionArrows: [], endpoint: null };
  const corrected = correctedJourneyRoute(journey, GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs);
  const segments = corrected.segments.filter(segment => segment.dimension === dimension);
  const paths = segments
    .flatMap(segment => projectWorldPolyline(segment.points, view, padding));
  const directionArrows = segments.flatMap(segment => projectWorldDirectionArrows(segment.points, view));
  const finalSegment = corrected.segments.at(-1);
  const last = finalSegment?.dimension === dimension ? finalSegment.points.at(-1) : null;
  const endpoint = last ? projectWorldPoint(last, view) : null;
  return { paths, directionArrows, endpoint };
};
