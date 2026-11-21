import type { StructurePoint } from "../generation/structure-viewport-stream";
import {
  collapseOverlayMarkerDetails,
  expandOverlayMarkerDetails,
  getOpenWindow,
  OVERLAY_MAP_WINDOW,
  OVERLAY_MARKER_DETAILS_WINDOW,
} from "../../overwolf-utils/window-manager";

export const OVERLAY_MARKER_DETAILS_MESSAGE_ID = "overlay-marker-details";
export const OVERLAY_MARKER_DETAILS_STORAGE_KEY = "gm:overlay-marker-details";
export const OVERLAY_MARKER_DETAILS_EVENT = "gm:overlay-marker-details-changed";

export interface OverlayMarkerDetailsRequest {
  worldId: string;
  dimension: string;
  point: StructurePoint;
}

const parseRequest = (value: unknown): OverlayMarkerDetailsRequest | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OverlayMarkerDetailsRequest>;
  const point = candidate.point;
  if (typeof candidate.worldId !== "string" || typeof candidate.dimension !== "string" || !point
    || typeof point.id !== "string" || typeof point.type !== "string"
    || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return { worldId: candidate.worldId, dimension: candidate.dimension, point };
};

export const readOverlayMarkerDetails = (): OverlayMarkerDetailsRequest | null => {
  try {
    const raw = localStorage.getItem(OVERLAY_MARKER_DETAILS_STORAGE_KEY);
    return raw ? parseRequest(JSON.parse(raw)) : null;
  } catch (error) {
    console.error("[Overlay details] Unable to read marker selection", error);
    return null;
  }
};

const writeRequest = (request: OverlayMarkerDetailsRequest | null) => {
  try {
    if (request) localStorage.setItem(OVERLAY_MARKER_DETAILS_STORAGE_KEY, JSON.stringify(request));
    else localStorage.removeItem(OVERLAY_MARKER_DETAILS_STORAGE_KEY);
    window.dispatchEvent(new Event(OVERLAY_MARKER_DETAILS_EVENT));
  } catch (error) {
    console.error("[Overlay details] Unable to persist marker selection", error);
  }
};

const runningGameSize = () => new Promise<{ width: number; height: number } | null>(resolve => {
  overwolf.games.getRunningGameInfo(info => {
    if (!info?.isRunning) { resolve(null); return; }
    const width = Number(info.logicalWidth) > 0 ? Number(info.logicalWidth) : Number(info.width);
    const height = Number(info.logicalHeight) > 0 ? Number(info.logicalHeight) : Number(info.height);
    resolve(Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null);
  });
});

/** Dock the independent details surface directly below the minimap when space permits. */
const dockDetailsBelowMinimap = async () => {
  const [mapWindow, detailsWindow, game] = await Promise.all([
    getOpenWindow(OVERLAY_MAP_WINDOW), getOpenWindow(OVERLAY_MARKER_DETAILS_WINDOW), runningGameSize(),
  ]);
  if (!mapWindow || !detailsWindow || !game) return;
  const gap = 8, margin = 8;
  const width = Math.min(520, Math.max(260, Number(mapWindow.width) || 360));
  const availableBelow = game.height - (Number(mapWindow.top) + Number(mapWindow.height)) - gap - margin;
  const height = Math.min(420, Math.max(180, availableBelow));
  const left = Math.min(game.width - width - margin, Math.max(margin, Number(mapWindow.left) || margin));
  const preferredTop = Number(mapWindow.top) + Number(mapWindow.height) + gap;
  const top = Math.min(game.height - height - margin, Math.max(margin, preferredTop));
  await new Promise<void>(resolve => overwolf.windows.changeSize(
    { window_id: detailsWindow.id, width, height, auto_dpi_resize: true }, () => resolve(),
  ));
  await new Promise<void>(resolve => overwolf.windows.changePosition(detailsWindow.id, left, top, () => resolve()));
};

export const openOverlayMarkerDetails = async (request: OverlayMarkerDetailsRequest) => {
  writeRequest(request);
  if (typeof overwolf === "undefined") return;
  await expandOverlayMarkerDetails();
  await dockDetailsBelowMinimap();
  overwolf.windows.sendMessage(OVERLAY_MARKER_DETAILS_WINDOW, OVERLAY_MARKER_DETAILS_MESSAGE_ID, request, () => {});
};

export const closeOverlayMarkerDetails = async () => {
  writeRequest(null);
  if (typeof overwolf !== "undefined") await collapseOverlayMarkerDetails();
};

export const subscribeOverlayMarkerDetails = (listener: (request: OverlayMarkerDetailsRequest | null) => void) => {
  const refresh = () => listener(readOverlayMarkerDetails());
  const onStorage = (event: StorageEvent) => {
    if (event.key === OVERLAY_MARKER_DETAILS_STORAGE_KEY || event.key === null) refresh();
  };
  const onMessage = (message: { id: string; content?: unknown }) => {
    if (message.id === OVERLAY_MARKER_DETAILS_MESSAGE_ID) listener(parseRequest(message.content));
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(OVERLAY_MARKER_DETAILS_EVENT, refresh);
  if (typeof overwolf !== "undefined") overwolf.windows?.onMessageReceived?.addListener(onMessage);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(OVERLAY_MARKER_DETAILS_EVENT, refresh);
    if (typeof overwolf !== "undefined") overwolf.windows?.onMessageReceived?.removeListener(onMessage);
  };
};
