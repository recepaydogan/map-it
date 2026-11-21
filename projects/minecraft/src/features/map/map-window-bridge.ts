import { revealMainWindowToFront } from "../../overwolf-utils/window-manager";

export const MAP_FOCUS_REQUEST_KEY = "gm:focus-request";

export const requestMapPointInMain = (pointId: string) => {
  localStorage.setItem(
    MAP_FOCUS_REQUEST_KEY,
    JSON.stringify({ pointId, requestedAt: Date.now() }),
  );
  window.dispatchEvent(new Event(MAP_FOCUS_REQUEST_KEY));
  if (typeof overwolf !== "undefined") void revealMainWindowToFront("main");
};
