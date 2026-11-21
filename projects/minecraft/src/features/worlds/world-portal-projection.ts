import { GAME_PORTAL_PLAN_APPEARANCE, GAME_PORTAL_PROJECTIONS } from "../../game-config.ts";
import type { TrackedDestination, WorldPin, WorldRecord } from "./world-types.ts";

export interface PortalProjection {
  source: TrackedDestination;
  sourceDimension: string;
  targetDimension: string;
  horizontalScale: number;
  exactX: number;
  exactZ: number;
  blockX: number;
  blockZ: number;
}

type WorldIdentity = Pick<WorldRecord, "edition" | "generation">;

/**
 * Project only configured dimension pairs for an exact edition/version identity.
 * Y and portal search/linking rules are deliberately not inferred here.
 */
export const projectPortalDestination = (
  world: WorldIdentity, source: TrackedDestination, targetDimension: string,
): PortalProjection | null => {
  const transform = GAME_PORTAL_PROJECTIONS.find(candidate => candidate.edition === world.edition
    && (candidate.versions as readonly string[]).includes(world.generation.version)
    && candidate.sourceDimension === source.dimension && candidate.targetDimension === targetDimension);
  if (!transform || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return null;
  const exactX = source.x * transform.horizontalScale, exactZ = source.z * transform.horizontalScale;
  if (![exactX, exactZ].every(Number.isFinite)
    || Math.abs(exactX) > GAME_PORTAL_PLAN_APPEARANCE.coordinateLimit
    || Math.abs(exactZ) > GAME_PORTAL_PLAN_APPEARANCE.coordinateLimit) return null;
  return { source, sourceDimension: source.dimension, targetDimension,
    horizontalScale: transform.horizontalScale, exactX, exactZ,
    // Floor identifies the block containing a fractional coordinate, including in negative quadrants.
    blockX: Math.floor(exactX), blockZ: Math.floor(exactZ) };
};

export const portalProjectionDestination = (
  projection: PortalProjection, label: string,
): TrackedDestination => ({ id: `portal-ghost:${projection.source.id}:${projection.targetDimension}`,
  dimension: projection.targetDimension, label, x: projection.exactX, y: null, z: projection.exactZ, pointId: null });

export const createPortalPlanRecords = (
  projection: PortalProjection, id: string, label: string,
): { pin: WorldPin; destination: TrackedDestination } => {
  if (!id.trim()) throw new Error("A portal plan id is required.");
  const pin: WorldPin = { id, dimension: projection.targetDimension, name: label,
    x: projection.blockX, y: null, z: projection.blockZ, icon: GAME_PORTAL_PLAN_APPEARANCE.icon,
    color: GAME_PORTAL_PLAN_APPEARANCE.color, group: GAME_PORTAL_PLAN_APPEARANCE.group, note: "" };
  return { pin, destination: { id: JSON.stringify(["pin", id]), dimension: pin.dimension,
    label, x: pin.x, y: null, z: pin.z, pointId: pin.id, kind: "portal-plan" } };
};

export const samePortalPlan = (
  destination: TrackedDestination, projection: PortalProjection,
): boolean => destination.kind === "portal-plan" && destination.dimension === projection.targetDimension
  && destination.x === projection.blockX && destination.z === projection.blockZ;
