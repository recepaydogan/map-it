export const MAP_MARKER_SIZE_PANEL_EVENT = "gm:open-marker-size-panel";

export const requestMapMarkerSizePanel = () => {
  window.dispatchEvent(new Event(MAP_MARKER_SIZE_PANEL_EVENT));
};
