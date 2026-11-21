import { useSyncExternalStore } from "react";
import {
  getOverlayKeyboardMovementEnabled,
  setOverlayKeyboardMovementEnabled,
  subscribeOverlayKeyboardMovement,
} from "./overlay-keyboard-movement-preference";

export const useOverlayKeyboardMovement = () => {
  const enabled = useSyncExternalStore(
    subscribeOverlayKeyboardMovement,
    getOverlayKeyboardMovementEnabled,
    getOverlayKeyboardMovementEnabled,
  );

  return { enabled, setEnabled: setOverlayKeyboardMovementEnabled };
};
