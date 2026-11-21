import { moveOverlayMapBy } from "../../overwolf-utils/window-manager";
import {
  getOverlayKeyboardMovementEnabled,
  OVERLAY_MOVE_HOTKEYS,
  subscribeOverlayKeyboardMovement,
  type OverlayMoveHotkeyName,
} from "./overlay-keyboard-movement-preference";

const MOVEMENT_TAP_STEP_PX = 12;
const MOVEMENT_HOLD_STEP_PX = 36;
const MOVEMENT_REPEAT_MS = 60;

const isOverlayMoveHotkey = (name: string): name is OverlayMoveHotkeyName =>
  name in OVERLAY_MOVE_HOTKEYS;

/**
 * Register the four hold hotkeys in the background window. The overlay itself
 * deliberately ignores keyboard input so Project Zomboid keeps focus.
 */
export const startOverlayKeyboardMovement = (): (() => void) => {
  if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.onHold) {
    return () => undefined;
  }

  const activeTimers = new Map<OverlayMoveHotkeyName, ReturnType<typeof setInterval>>();

  const stop = (name: OverlayMoveHotkeyName) => {
    const timer = activeTimers.get(name);
    if (timer !== undefined) clearInterval(timer);
    activeTimers.delete(name);
  };

  const move = (name: OverlayMoveHotkeyName, step: number) => {
    if (!getOverlayKeyboardMovementEnabled()) {
      stop(name);
      return;
    }
    const direction = OVERLAY_MOVE_HOTKEYS[name];
    void moveOverlayMapBy(
      direction.x * step,
      direction.y * step,
    ).then((available) => {
      if (!available) stop(name);
    });
  };

  const onHold = (event: overwolf.settings.hotkeys.OnHoldEvent) => {
    if (!isOverlayMoveHotkey(event.name)) return;
    const name = event.name;
    if (event.state === "up") {
      stop(name);
      return;
    }
    if (!getOverlayKeyboardMovementEnabled() || activeTimers.has(name)) return;

    move(name, MOVEMENT_TAP_STEP_PX);
    activeTimers.set(
      name,
      setInterval(() => move(name, MOVEMENT_HOLD_STEP_PX), MOVEMENT_REPEAT_MS),
    );
  };

  const stopAll = () => {
    for (const name of activeTimers.keys()) stop(name);
  };
  const onPreferenceChange = () => {
    if (!getOverlayKeyboardMovementEnabled()) stopAll();
  };
  const stopPreferenceSubscription = subscribeOverlayKeyboardMovement(onPreferenceChange);

  overwolf.settings.hotkeys.onHold.addListener(onHold);

  return () => {
    stopAll();
    stopPreferenceSubscription();
    overwolf.settings.hotkeys.onHold.removeListener(onHold);
  };
};
