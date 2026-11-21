import { useEffect, useMemo, useState } from "react";
import { useGameText } from "../../i18n/game-text";
import { getLivePosition, subscribeLivePosition } from "../live-position/live-position-store";
import type { LivePositionSnapshot } from "../live-position/live-position-store";
import type { ProjectedMapPoint } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import { worldToScreen, type MapProjectionMode, type MapScreenPoint } from "./map-projection";
import { getMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";
import type { MapView } from "./types";

interface MinimapNearbyLabelsProps {
  mapId: string;
  projections: ProjectedMapPoint[];
  origin: MapScreenPoint;
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  markerSizes: MarkerSizeSettings;
  zoomScale: number;
  selectedId: string | null;
}

interface Box { left: number; top: number; width: number; height: number }
type LabelSide = "top" | "bottom" | "right" | "left";
interface LabelPlacement { side: LabelSide; box: Box }
interface PlacedLabel {
  id: string;
  name: string;
  box: Box;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const NEARBY_RADIUS_PX = 140;
const POSITION_REFRESH_MS = 250;
const LABEL_HEIGHT_PX = 22;
const LABEL_GAP_PX = 5;
const LABEL_MARGIN_PX = 6;

const overlaps = (first: Box, second: Box) =>
  first.left < second.left + second.width + LABEL_GAP_PX
  && first.left + first.width + LABEL_GAP_PX > second.left
  && first.top < second.top + second.height + LABEL_GAP_PX
  && first.top + first.height + LABEL_GAP_PX > second.top;

const labelBoxes = (left: number, top: number, width: number, clearance: number): LabelPlacement[] => [
  { side: "top", box: { left: left - width / 2, top: top - clearance - LABEL_HEIGHT_PX, width, height: LABEL_HEIGHT_PX } },
  { side: "bottom", box: { left: left - width / 2, top: top + clearance, width, height: LABEL_HEIGHT_PX } },
  { side: "right", box: { left: left + clearance, top: top - LABEL_HEIGHT_PX / 2, width, height: LABEL_HEIGHT_PX } },
  { side: "left", box: { left: left - clearance - width, top: top - LABEL_HEIGHT_PX / 2, width, height: LABEL_HEIGHT_PX } },
];

const connector = (side: LabelSide, box: Box, x: number, y: number, halfSize: number) => {
  switch (side) {
    case "top": return { start: { x, y: box.top + box.height }, end: { x, y: y - halfSize - 2 } };
    case "bottom": return { start: { x, y: box.top }, end: { x, y: y + halfSize + 2 } };
    case "right": return { start: { x: box.left, y }, end: { x: x + halfSize + 2, y } };
    case "left": return { start: { x: box.left + box.width, y }, end: { x: x - halfSize - 2, y } };
  }
};

const arrowPoints = ({ start, end }: Pick<PlacedLabel, "start" | "end">) => {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const alongX = (end.x - start.x) / length;
  const alongY = (end.y - start.y) / length;
  const baseX = end.x - alongX * 5;
  const baseY = end.y - alongY * 5;
  return `${end.x},${end.y} ${baseX - alongY * 3},${baseY + alongX * 3} ${baseX + alongY * 3},${baseY - alongX * 3}`;
};

const usePlayerPosition = () => {
  const [position, setPosition] = useState<LivePositionSnapshot | null>(getLivePosition);
  useEffect(() => {
    let last = 0;
    let timer: number | undefined;
    const update = (next: LivePositionSnapshot) => {
      const now = performance.now();
      if (now - last >= POSITION_REFRESH_MS) {
        last = now;
        setPosition(next);
      } else if (timer === undefined) {
        timer = window.setTimeout(() => {
          timer = undefined;
          last = performance.now();
          setPosition(getLivePosition());
        }, POSITION_REFRESH_MS - (now - last));
      }
    };
    const unsubscribe = subscribeLivePosition(() => update(getLivePosition()));
    const expiry = window.setInterval(() => {
      setPosition((current) => current && Date.now() - current.timestamp >= 3000 ? null : current);
    }, 500);
    return () => { unsubscribe(); window.clearInterval(expiry); if (timer !== undefined) window.clearTimeout(timer); };
  }, []);
  return position;
};

/** Short, noninteractive hover-style labels for distinct nearby map pins. */
export default function MinimapNearbyLabels({ mapId, projections, origin, view, width, height, projection, markerSizes, zoomScale, selectedId }: MinimapNearbyLabelsProps) {
  const gameText = useGameText();
  const player = usePlayerPosition();
  const placed = useMemo(() => {
    if (!player || player.state !== "tracking" || player.mapId !== mapId || !player.point
      || width <= 0 || height <= 0) return [];

    const playerScreen = worldToScreen(player.point, view, width, height, projection);
    const visible = projections.map(({ point, left, top }) => {
      const x = left + origin.left;
      const y = top + origin.top;
      const halfSize = (getPointAppearance(point).markerSize ?? 32) * getMarkerScale(point, markerSizes) * zoomScale / 2;
      return { point, x, y, halfSize, distance: Math.hypot(x - playerScreen.left, y - playerScreen.top) };
    }).filter(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height);
    const badges: Box[] = visible.map(({ x, y, halfSize }) => ({
      left: x - halfSize, top: y - halfSize, width: halfSize * 2, height: halfSize * 2,
    }));
    badges.push({ left: playerScreen.left - 16, top: playerScreen.top - 16, width: 32, height: 49 });

    const context = document.createElement("canvas").getContext("2d");
    if (context) context.font = "600 11px Inter, sans-serif";
    const limit = Math.min(10, Math.max(4, Math.round(6 * width * height / (360 * 325))));
    const distinctCreatures = new Set<string>();
    const occupied: Box[] = [];
    const labels: PlacedLabel[] = [];
    for (const { point, x, y, halfSize, distance } of visible.sort((first, second) => first.distance - second.distance)) {
      if (labels.length >= limit || distance > NEARBY_RADIUS_PX) break;
      if (point.id === selectedId) continue;
      const creature = point.category === "enemy" || point.category === "boss" || point.category === "dungeon-boss";
      const creatureKey = creature ? `${point.category}:${"nameKey" in point ? point.nameKey ?? point.name : point.name}` : "";
      if (creature && distinctCreatures.has(creatureKey)) continue;
      const name = getLocalizedMapPointDisplayName(point, gameText);
      if (!name) continue;
      const labelWidth = Math.min(150, Math.ceil((context?.measureText(name).width ?? name.length * 6) + 14));
      const clearance = Math.max(halfSize + 12, 18);
      const placement = labelBoxes(x, y, labelWidth, clearance).find(({ box }) =>
        box.left >= LABEL_MARGIN_PX && box.top >= LABEL_MARGIN_PX
        && box.left + box.width <= width - LABEL_MARGIN_PX
        && box.top + box.height <= height - LABEL_MARGIN_PX
        && !badges.some((badge) => overlaps(box, badge))
        && !occupied.some((other) => overlaps(box, other)));
      if (!placement) continue;
      occupied.push(placement.box);
      labels.push({ id: point.id, name, box: placement.box,
        ...connector(placement.side, placement.box, x, y, halfSize) });
      if (creature) distinctCreatures.add(creatureKey);
    }
    return labels;
  }, [gameText, height, mapId, markerSizes, origin.left, origin.top, player, projection, projections, selectedId, view, width, zoomScale]);

  return <div className="pointer-events-none absolute inset-0" aria-hidden="true">
    <svg className="pointer-events-none absolute overflow-visible" width={width} height={height}
      style={{ left: -origin.left, top: -origin.top }}>
      {placed.map((label) => <g key={label.id}>
        <line x1={label.start.x} y1={label.start.y} x2={label.end.x} y2={label.end.y}
          stroke="#171717" strokeWidth="3.5" strokeLinecap="round" />
        <line x1={label.start.x} y1={label.start.y} x2={label.end.x} y2={label.end.y}
          stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        <polygon points={arrowPoints(label)} fill="#fff" stroke="#171717" strokeWidth="0.75" />
      </g>)}
    </svg>
    {placed.map(({ id, name, box }) => <span key={id} className="map-minimap-nearby-tooltip"
      style={{ left: box.left - origin.left, top: box.top - origin.top, width: box.width,
        height: box.height }} title={name}>{name}</span>)}
  </div>;
}
