import { requireNumericSeed } from "./seed-value.ts";
import { GAME_TELEMETRY } from "../../game-config.ts";
import { WORLD_MAP_SURFACES, type DimensionView, type WorldCoordinate, type WorldRecord, type WorldSelection } from "./world-types.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 512): value is string => typeof value === "string" && value.length <= max;
const id = (value: unknown): value is string => text(value) && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const timestamp = (value: unknown): value is number => number(value) && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value)
  && value.length <= 100_000 && value.every(entry => id(entry)) && new Set(value).size === value.length;
const nullableNumber = (value: unknown) => value === null || number(value);
const coordinate = (value: unknown): value is WorldCoordinate => record(value)
  && number(value.x) && number(value.z) && nullableNumber(value.y);
const camera2d = (value: unknown) => value === null
  || (record(value) && number(value.x) && number(value.z) && number(value.zoom) && value.zoom > 0);
const camera3d = (value: unknown) => value === null
  || (record(value) && coordinate(value) && number(value.y) && number(value.yaw)
    && number(value.pitch) && number(value.distance) && value.distance > 0 && nullableNumber(value.cutawayY));
const surfaceMap = (value: unknown, validate: (entry: unknown) => boolean) => value === undefined
  || (record(value) && Object.entries(value).every(([key, entry]) =>
    WORLD_MAP_SURFACES.includes(key as typeof WORLD_MAP_SURFACES[number]) && validate(entry)));

const dimensionView = (value: unknown): value is DimensionView => {
  if (!record(value) || !["2d", "3d"].includes(String(value.mode))
    || !(value.visibleCategories === null || strings(value.visibleCategories))
    || !(value.structureFilterRevision === undefined || Number.isSafeInteger(value.structureFilterRevision) && Number(value.structureFilterRevision) >= 0)
    || !(value.expandedGroup === null || id(value.expandedGroup))
    || !text(value.filterSearch) || typeof value.hideFound !== "boolean"
    || typeof value.favoritesOnly !== "boolean"
    || !(value.hiddenPinGroups === undefined || strings(value.hiddenPinGroups))) return false;
  return camera2d(value.camera2d) && camera3d(value.camera3d)
    && surfaceMap(value.modeBySurface, entry => ["2d", "3d"].includes(String(entry)))
    && surfaceMap(value.camera2dBySurface, camera2d)
    && surfaceMap(value.camera3dBySurface, camera3d);
};

const observedPortals = (value: unknown) => value === undefined || Array.isArray(value)
  && value.length <= 10_000 && value.every(portal => {
    if (!record(portal) || !id(portal.id) || !record(portal.transition)
      || !Number.isSafeInteger(portal.transition.index) || Number(portal.transition.index) < 0) return false;
    const sides = [portal.transition.from, portal.transition.to];
    return sides.every(side => record(side) && id(side.dimension) && record(side.point)
      && coordinate(side.point) && number(side.point.y) && timestamp(side.point.at))
      && (sides[0] as Record<string, unknown>).dimension !== (sides[1] as Record<string, unknown>).dimension;
  }) && new Set(value.map(portal => portal.id)).size === value.length;

/** Reject incompatible data rather than overwriting it with an empty library. */
export function assertWorldRecord(value: unknown): asserts value is WorldRecord {
  if (!record(value) || value.schemaVersion !== 1 || !id(value.id) || !id(value.name)
    || !id(value.edition) || !record(value.generation) || typeof value.favorite !== "boolean"
    || !timestamp(value.createdAt) || !timestamp(value.lastOpenedAt)
    || !(value.movedToBottomAt === null || timestamp(value.movedToBottomAt))) {
    throw new Error("Invalid world record.");
  }
  const g = value.generation;
  if (!id(g.version) || !id(g.preset) || !text(g.seed, 20) || requireNumericSeed(g.seed) !== g.seed
    || !record(g.settings) || !Object.entries(g.settings).every(([key, entry]) =>
      id(key) && (text(entry, 10_000) || number(entry) || typeof entry === "boolean"))) {
    throw new Error("Invalid world generation settings.");
  }
  const a = value.association;
  if (a !== null && !(record(a) && ["local", "server", "realm"].includes(String(a.kind))
    && id(a.identity) && timestamp(a.confirmedAt)
    && (a.sourceId === undefined || text(a.sourceId, 64) && /^[a-f0-9]{64}$/.test(a.sourceId))
    && (a.worldName === undefined || id(a.worldName)))) throw new Error("Invalid world association.");
  const p = value.personal;
  if (!record(p) || !Array.isArray(p.pins) || !Array.isArray(p.tracked)
    || !strings(p.favorites) || !strings(p.found) || !record(p.notes) || !record(p.views)
    || !Object.entries(p.notes).every(([key, entry]) => id(key) && text(entry, 10_000))
    || !Object.entries(p.views).every(([key, entry]) => id(key) && dimensionView(entry))) {
    throw new Error("Invalid world personal state.");
  }
  if (p.resume !== undefined) {
    const r = p.resume;
    if (!record(r) || !surfaceMap(r.dimensionBySurface, id)) throw new Error("Invalid world resume state.");
    const point = r.lastPosition;
    if (point !== undefined && !(record(point) && coordinate(point) && number(point.y)
      && [point.x, point.y, point.z].every(axis => Math.abs(Number(axis)) <= GAME_TELEMETRY.coordinateLimit)
      && id(point.dimension) && text(point.generationKey, 100_000) && timestamp(point.receivedAt)))
      throw new Error("Invalid last known world position.");
  }
  if (p.pins.length > 100_000 || !p.pins.every(pin => record(pin) && coordinate(pin)
    && [pin.id, pin.dimension, pin.name, pin.icon, pin.color, pin.group].every(entry => id(entry))
    && text(pin.note, 10_000)) || new Set(p.pins.map(pin => pin.id)).size !== p.pins.length) {
    throw new Error("Invalid world pins.");
  }
  if (!observedPortals(p.portals) || !observedPortals(p.removedPortals)) {
    throw new Error("Invalid observed portals.");
  }
  if (p.tracked.length > 100_000 || !p.tracked.every(target => record(target) && coordinate(target)
    && id(target.id) && id(target.dimension) && id(target.label)
    && (target.kind === undefined || ["destination", "portal-plan", "player-pin"].includes(String(target.kind)))
    && (target.pointId === null || id(target.pointId)))
    || new Set(p.tracked.map(target => target.id)).size !== p.tracked.length) {
    throw new Error("Invalid tracked destinations.");
  }
}

export function assertWorldSelection(value: unknown): asserts value is WorldSelection {
  if (!record(value) || value.id !== "selection" || !(value.worldId === null || id(value.worldId))
    || !timestamp(value.revision)) throw new Error("Invalid world selection.");
}
