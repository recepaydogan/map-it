import type { LivePosition } from "./live-position-types";

export function projectGepPosition(payload: unknown): Pick<LivePosition, "mapId" | "x" | "y"> | null {
  void payload;
  return null;
}
