/**
 * One sample of where the player is. Produced by a game-specific reader (a
 * log tail, a memory bridge, a mod writing a file — whatever the game allows)
 * and handed to `publishLivePosition` in live-position-store; everything
 * downstream projects that source-world plane through the current map's
 * coordinate reference; the marker, follow camera and centre button stay generic.
 */
export interface LivePosition {
  version: 1;
  /** Monotonic per game session; out-of-order samples are dropped. */
  sequence: number;
  x: number;
  y: number;
  /** Optional height/floor, for games that have one. */
  z?: number;
  /** Unit vector the character is facing, in world axes (+x east, +y south).
   *  Zero when the source has no heading — the marker then keeps the heading
   *  it already had rather than snapping north. */
  dx: number;
  dy: number;
  /** The source's own clock when the sample was written (`Date.now()` epoch). */
  updatedAt: number;
  /** When this window received it. Staleness is measured from here. */
  receivedAt: number;
}

export type LivePositionStatus = "live" | "stale" | "disconnected";

/** Keep the last trustworthy position fully visible through short GEP gaps. */
export const LIVE_POSITION_STALE_AFTER_MS = 60_000;

export interface LivePositionState {
  position: LivePosition | null;
  status: LivePositionStatus;
}

/** One atomic GEP sample for the local player and the visible party. */
export interface LivePartyPositionSnapshot {
  version: 1;
  /** Monotonic per game session; shared by every member in this snapshot. */
  sequence: number;
  primaryPlayerId: string | null;
  players: Record<string, LivePosition>;
  receivedAt: number;
}

export interface LivePartyPositionState {
  snapshot: LivePartyPositionSnapshot | null;
  status: LivePositionStatus;
}
