import { revealMainWindowToFront } from "../../overwolf-utils/window-manager";
import type { MapFocusRequest } from "./map-focus-request";

export const MAP_FOCUS_REQUEST_KEY = "gm:focus-request";

const requestMapFocus = (request: MapFocusRequest) => {
  localStorage.setItem(
    MAP_FOCUS_REQUEST_KEY,
    JSON.stringify({ ...request, requestedAt: Date.now() }),
  );
  window.dispatchEvent(new Event(MAP_FOCUS_REQUEST_KEY));
  if (typeof overwolf !== "undefined") void revealMainWindowToFront("main");
};

export const requestMapPointInMain = (pointId: string, mapId?: string, sourceContext?: MapFocusRequest["sourceContext"], preserveZoom?: boolean, zoom?: number) =>
  requestMapFocus({ pointId, mapId, sourceContext, preserveZoom, zoom, centerOnPoint: true });

export const requestMapSearchInMain = (searchQuery: string) => requestMapFocus({ searchQuery });

export const requestMapItemInMain = (itemId: string, name: string, mapId: string, markerIds?: string[]) =>
  requestMapFocus({ searchItemId: itemId, searchMarkerIds: markerIds, searchQuery: name, mapId });

export const requestMapReferenceInMain = (referenceId: string, name: string, mapId?: string, region?: string, pointId?: string, allRegions?: boolean, zoom?: number) =>
  requestMapFocus({ referenceId, searchQuery: name, mapId, region, pointId, allRegions, zoom });

export const requestMapDestinationInMain = (mapId: string, destination?: MapFocusRequest["destination"]) =>
  requestMapFocus({ mapId, destination, regionOnly: !destination });
