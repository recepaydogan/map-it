export interface LivePosition {
  version: 1;
  sequence: number;
  x: number;
  y: number;
  z: number;
  /** Unit vector the character is facing, in world axes (+x east, +y south).
   *  Zero when the Bridge mod predates facing support — the marker then keeps
   *  the heading it already had rather than snapping north. */
  dx: number;
  dy: number;
  /**
   * The Bridge's own clock when the sample was written, in `Date.now()` epoch.
   *
   * This is the only even timeline there is. The mod writes every 50 ms, the
   * reader polls every 50 ms, and the two cadences beat against each other, so
   * a sample can arrive one poll late or share a poll with the sample before it
   * — arrival order is right but arrival spacing is not. Anything that has to
   * MOVE at a steady rate (the follow camera) has to place samples by this,
   * not by when it happened to see them.
   */
  updatedAt: number;
  receivedAt: number;
}

export type LivePositionStatus = "live" | "stale" | "disconnected";

export interface LivePositionState {
  position: LivePosition | null;
  status: LivePositionStatus;
}
