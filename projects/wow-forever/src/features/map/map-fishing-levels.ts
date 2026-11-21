import catalog from "../../../public/data/gathering/fishing-levels.json";
import boundaries from "../../../public/data/gathering/fishing-boundaries.json";
import { worldToScreen, type MapProjectionMode } from "./map-projection";
import type { MapView } from "./types";

export const FISHING_LEVEL_MAP_ID = catalog.mapId;
export const FISHING_LEVEL_ZONES = catalog.zones;
const FISHING_SKILL_COLORS: Record<number, string> = {
  1: "#7dd3fc", 55: "#5eead4", 130: "#7ca8ff", 205: "#b7b5ff", 330: "#f0abfc",
};
export const fishingSkillColor = (skill: number | null) => skill === null ? "#b7c0cc" : FISHING_SKILL_COLORS[skill] ?? "#7dd3fc";
const anchors = new Map(boundaries.regions.map((region) => [region.id, region.label]));

export function fishingRegionPaths(projection: MapProjectionMode) {
  return boundaries.regions.map((region) => {
    const zone = catalog.zones.find((entry) => entry.id === region.id)!;
    const path = region.rings.map((ring) => ring.map(([x, y], i) => {
      const point = worldToScreen({ x: x!, y: y! }, { centerX: 0, centerY: 0, zoom: 1 }, 0, 0, projection);
      return `${i === 0 ? "M" : "L"}${point.left},${point.top}`;
    }).join("") + "Z").join("");
    return { id: region.id, minimumSkill: zone.minimumSkill, path };
  });
}

/** Resolve collisions in world space so panning never moves a label to another region. */
export function fishingLevelLabels(view: MapView, width: number, height: number, projection: MapProjectionMode) {
  const showNames = view.zoom >= 0.035;
  const halfWidth = showNames ? 66 : 23;
  const halfHeight = showNames ? 25 : 15;
  const accepted: { left: number; top: number }[] = [];
  return catalog.zones.filter((zone) => (zone.kind !== "city" || view.zoom >= 0.08)
    && (zone.kind !== "water" || view.zoom >= 0.12))
    .sort((a, b) => Number(b.kind === "water") - Number(a.kind === "water")).flatMap((zone) => {
    const position = anchors.get(zone.id) ?? zone;
    const anchor = worldToScreen(position, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
    if (accepted.some((other) => Math.abs(other.left - anchor.left) < halfWidth * 2
      && Math.abs(other.top - anchor.top) < halfHeight * 2)) return [];
    accepted.push(anchor);
    const screen = worldToScreen(position, view, width, height, projection);
    if (screen.left < -halfWidth || screen.left > width + halfWidth
      || screen.top < -halfHeight || screen.top > height + halfHeight) return [];
    return [{ ...zone, ...screen, showName: showNames }];
  });
}
