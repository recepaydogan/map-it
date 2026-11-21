/**
 * One sample of where the player is. Produced by a game-specific reader (a
 * log tail, a memory bridge, a mod writing a file — whatever the game allows)
 * and handed to `publishLivePosition` in live-position-store; everything
 * downstream (the marker, the follow camera, the centre button) is generic.
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

export interface LivePositionState {
  position: LivePosition | null;
  status: LivePositionStatus;
}
