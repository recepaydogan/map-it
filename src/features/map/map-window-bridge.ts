import { revealMainWindowToFront } from "../../overwolf-utils/window-manager";
import type { MapFocusRequest } from "./map-focus-request";

export const MAP_FOCUS_REQUEST_KEY = "map-it:focus-request";

const requestMapFocus = (request: MapFocusRequest) => {
  localStorage.setItem(
    MAP_FOCUS_REQUEST_KEY,
    JSON.stringify({ ...request, requestedAt: Date.now() }),
  );
  window.dispatchEvent(new Event(MAP_FOCUS_REQUEST_KEY));
  if (typeof overwolf !== "undefined") void revealMainWindowToFront("main");
};

export const requestMapPointInMain = (pointId: string, mapId?: string, sourceContext?: MapFocusRequest["sourceContext"]) => requestMapFocus({ pointId, mapId, sourceContext });

export const requestMapSearchInMain = (searchQuery: string) => requestMapFocus({ searchQuery });

export const requestMapDestinationInMain = (mapId: string, destination?: MapFocusRequest["destination"]) =>
  requestMapFocus({ mapId, destination, regionOnly: !destination });
