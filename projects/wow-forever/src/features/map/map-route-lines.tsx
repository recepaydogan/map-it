import { getCategoryConfig } from "./map-config";
import { getFlightRouteColors } from "./map-flight-route-colors";
import { worldToScreen, type MapProjectionMode } from "./map-projection";
import { isUserMapMarker, type MapPoint, type MapView } from "./types";

interface MapRouteLinesProps {
  mapId: string;
  points: MapPoint[];
  selectedPoint: MapPoint | null;
  hiddenFlightRouteIds: string[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
}

const MapRouteLines = ({
  mapId, points, selectedPoint, hiddenFlightRouteIds, view, width, height, projection,
}: MapRouteLinesProps) => {
  if (!selectedPoint || isUserMapMarker(selectedPoint) || width <= 0 || height <= 0) return null;

  const category = getCategoryConfig(selectedPoint.category);
  if (!category.routeLinksTitleKey && !category.routeLinkGroupKey) return null;
  const flightLinks = category.routeLinksTitleKey && category.routeLinksTitleKey === selectedPoint.linkedMarkersTitleKey
    ? selectedPoint.linkedMarkers : undefined;
  const links = flightLinks ?? selectedPoint.linkedMarkerGroups?.find((group) =>
    group.titleKey === category.routeLinkGroupKey)?.links;
  if (!links?.length) return null;

  const flightColors = flightLinks ? getFlightRouteColors(flightLinks) : null;
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const destinations = links
    .filter((link) => link.mapId === mapId && link.markerId !== selectedPoint.id
      && (!flightColors || !hiddenFlightRouteIds.includes(link.markerId)))
    .map((link) => pointsById.get(link.markerId))
    .filter((point): point is MapPoint => point?.category === selectedPoint.category);
  if (!destinations.length) return null;

  const start = worldToScreen(selectedPoint, view, width, height, projection);
  const routes = destinations.flatMap((destination) => {
    const end = worldToScreen(destination, view, width, height, projection);
    const dx = end.left - start.left;
    const dy = end.top - start.top;
    const length = Math.hypot(dx, dy);
    if (length < 1) return [];
    const inset = Math.min(18, length / 3);
    const insetX = dx / length * inset;
    const insetY = dy / length * inset;
    return [{
      id: destination.id, end,
      color: flightColors?.get(destination.id) ?? "rgba(244, 228, 190, 0.92)",
      line: {
        x1: start.left + insetX,
        y1: start.top + insetY,
        x2: end.left - insetX,
        y2: end.top - insetY,
      },
    }];
  });
  if (!routes.length) return null;

  return <>
    {/* Endpoints stay under the pins so their dots don't cover the icons. */}
    <svg className="pointer-events-none absolute inset-0 overflow-hidden"
      width={width} height={height} aria-hidden="true">
      {routes.map(({ id, end, color }) => <circle key={id} cx={end.left} cy={end.top} r="7"
        fill="#25231f" stroke={flightColors ? color : "var(--color-accent)"} strokeWidth="2" />)}
    </svg>
    <svg className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      width={width} height={height} aria-hidden="true" data-map-route-lines
      data-route-category={selectedPoint.category}
      data-route-count={routes.length}>
      {routes.map(({ id, color, line }) => <g key={id}>
        <line {...line} stroke="rgba(10, 14, 17, 0.9)" strokeWidth="5" strokeLinecap="round" />
        <line {...line} stroke={color} strokeWidth="2" strokeLinecap="round" />
      </g>)}
    </svg>
  </>;
};

export default MapRouteLines;
