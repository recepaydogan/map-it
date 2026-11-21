import { clearLivePosition } from "./live-position-store";
import { setTrackingStatus } from "./tracking-status";

/** Replace this adapter after the new game's position integration is verified.
 * Window management, live marker rendering and cross-window transport stay intact.
 */
export const startGamePositionReader = (): (() => void) => {
  clearLivePosition();
  setTrackingStatus("waiting-game");
  return () => { clearLivePosition(); setTrackingStatus("waiting-game"); };
};
