import { projectOrbitPoint, type OrbitCamera, type Point3 } from "../terrain/orbit-camera.ts";
import type { TrackedDestination } from "./world-types.ts";
import type { WorldMapPlayer } from "./world-map-player.ts";
import { TRACKED_DESTINATION_LIMIT } from "./world-personal-actions.ts";

export interface TerrainMarker {
  id: string;
  sourceId: string;
  kind: "player" | "destination" | "pin" | "structure";
  structureType: string | null;
  structureEvidence: "predicted" | "saved" | null;
  label: string;
  point: Point3;
  headingAngle: number | null;
  left: number;
  top: number;
  depth: number;
}

export interface TerrainStructureAnchor {
  id: string;
  type: string;
  label: string;
  point: Point3;
  evidence: "predicted" | "saved";
}

/** Only exact-Y, same-dimension points can become projected 3D markers. */
export const layoutTerrainMarkers = ({ camera, width, height, cutawayY, dimension, player, destinations, structures = [], isOccluded }: {
  camera: OrbitCamera; width: number; height: number; cutawayY: number | null; dimension: string;
  player: WorldMapPlayer | null; destinations: readonly TrackedDestination[]; structures?: readonly TerrainStructureAnchor[];
  isOccluded?: (point: Point3) => boolean;
}): TerrainMarker[] => {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
  const candidates: { id: string; sourceId: string; kind: TerrainMarker["kind"]; structureType: string | null;
    structureEvidence: TerrainMarker["structureEvidence"];
    label: string; point: Point3; yaw: number | null }[] = [];
  if (player?.dimension === dimension && (cutawayY === null || player.y <= cutawayY))
    candidates.push({ id: "player", sourceId: "player", kind: "player", structureType: null, structureEvidence: null,
      label: "", point: [player.x, player.y, player.z], yaw: player.yaw });
  for (const destination of destinations.slice(0, TRACKED_DESTINATION_LIMIT))
    if (destination.dimension === dimension && destination.y !== null && (cutawayY === null || destination.y <= cutawayY))
      candidates.push({ id: destination.id, sourceId: destination.id,
        kind: destination.kind === "player-pin" ? "pin" : "destination", structureType: null,
        structureEvidence: null, label: destination.label,
        point: [destination.x, destination.y, destination.z], yaw: null });
  for (const structure of structures.slice(0, 128))
    if (structure && typeof structure.id === "string" && structure.id && typeof structure.type === "string" && structure.type &&
      structure.point.length === 3 && structure.point.every(Number.isFinite) && (cutawayY === null || structure.point[1] <= cutawayY))
      candidates.push({ id: `structure:${structure.evidence}:${structure.id}`, sourceId: structure.id, kind: "structure",
        structureType: structure.type, structureEvidence: structure.evidence,
        label: structure.label, point: structure.point, yaw: null });
  return candidates.flatMap(candidate => {
    const projected = projectOrbitPoint(camera, candidate.point, width, height);
    if (!projected?.visible || projected.left < 18 || projected.left > width - 18 || projected.top < 18 || projected.top > height - 18) return [];
    if (isOccluded?.(candidate.point)) return [];
    let headingAngle: number | null = null;
    if (candidate.kind === "player" && candidate.yaw !== null && Number.isFinite(candidate.yaw)) {
      const radians = candidate.yaw * Math.PI / 180;
      const heading = projectOrbitPoint(camera, [candidate.point[0] - Math.sin(radians) * 8,
        candidate.point[1], candidate.point[2] + Math.cos(radians) * 8], width, height);
      if (heading) {
        const dx = heading.left - projected.left, dy = heading.top - projected.top;
        if (Math.hypot(dx, dy) > 0.25) headingAngle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      }
    }
    return [{ ...candidate, ...projected, headingAngle }];
  }).sort((left, right) => right.depth - left.depth || left.id.localeCompare(right.id));
};
