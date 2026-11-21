import type { LivePosition } from "./live-position-types";

const MAX_PAYLOAD_AGE_MS = 3_000;

interface BridgePayload {
  version?: unknown;
  sequence?: unknown;
  updatedAt?: unknown;
  x?: unknown;
  y?: unknown;
  z?: unknown;
  dx?: unknown;
  dy?: unknown;
}

/** Facing arrives only from Bridge builds that report it; anything else means
 *  "unknown", which the marker reads as "keep the heading you have". */
const readFacingComponent = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1.001
    ? value
    : 0;

export interface ParsedLivePositionPayload extends Omit<LivePosition, "receivedAt"> {
  updatedAt: number;
}

export const parseLivePositionBridgePayload = (content: string): ParsedLivePositionPayload | null => {
  try {
    const payload = JSON.parse(content) as BridgePayload;
    const validCoordinate = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
    if (payload.version !== 1
      || typeof payload.sequence !== "number"
      || !Number.isFinite(payload.sequence)
      || typeof payload.updatedAt !== "number"
      || !Number.isFinite(payload.updatedAt)
      || !validCoordinate(payload.x)
      || !validCoordinate(payload.y)
      || typeof payload.z !== "number"
      || !Number.isFinite(payload.z)
      || Math.abs(payload.z) > 32) return null;

    return {
      version: 1,
      sequence: payload.sequence,
      updatedAt: payload.updatedAt,
      x: Number(payload.x),
      y: Number(payload.y),
      z: payload.z,
      dx: readFacingComponent(payload.dx),
      dy: readFacingComponent(payload.dy),
    };
  } catch {
    return null;
  }
};

/** Accept only a sibling file name from a stream handover line. */
export const parseLivePositionStreamHandover = (line: string): string | null => {
  try {
    const payload = JSON.parse(line) as { rotate?: unknown };
    return typeof payload.rotate === "string" && /^[\w.-]{1,64}$/.test(payload.rotate)
      ? payload.rotate
      : null;
  } catch {
    return null;
  }
};

export const isFreshLivePositionBridgePayload = (
  payload: ParsedLivePositionPayload,
  now = Date.now(),
) => Math.abs(now - payload.updatedAt) <= MAX_PAYLOAD_AGE_MS;
