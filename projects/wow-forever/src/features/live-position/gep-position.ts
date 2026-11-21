import assignments from "../../../public/data/gep-map-projection.json";
import { projectPlayerPosition } from "./position-projection";

/** Project a coordinate event carrying UI-map percentages { x, y, map }. */
export function projectGepPosition(payload: unknown) {
  let value = payload;
  try { if (typeof value === "string") value = JSON.parse(value); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const { x, y, map } = value as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || typeof map !== "number" ||
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(map) || x < 0 || x > 100 || y < 0 || y > 100) return null;
  const u = x / 100, v = y / 100;
  const candidates = assignments.assignments.filter(entry => entry.uiMapId === map &&
    u >= entry.uiMin[0]! && u <= entry.uiMax[0]! && v >= entry.uiMin[1]! && v <= entry.uiMax[1]!);
  const points = candidates.map(entry => {
    const r = entry.worldRegion;
    return projectPlayerPosition(entry.worldMapId,
      r[3]! - (v - entry.uiMin[1]!) / (entry.uiMax[1]! - entry.uiMin[1]!) * (r[3]! - r[0]!),
      r[4]! - (u - entry.uiMin[0]!) / (entry.uiMax[0]! - entry.uiMin[0]!) * (r[4]! - r[1]!));
  }).filter(point => point !== null);
  const first = points[0];
  // Never guess a floor or continent when several assignments disagree.
  if (!first || points.some(p => Math.abs(p.x - first.x) > 0.01 || Math.abs(p.y - first.y) > 0.01)) return null;
  return first;
}
