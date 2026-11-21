import type * as L from "leaflet";

interface MoveMapToMarkerOptions {
  map: L.Map;
  target: L.LatLngExpression;
  targetZoom: number;
  animate: boolean;
}

export const moveMapToMarker = ({
  map,
  target,
  targetZoom,
  animate,
}: MoveMapToMarkerOptions) => {
  // flyTo ignores zoomSnap and lands off-grid; a later panTo would then re-snap
  // inside setView, mistake the sliver for a zoom change, fail its zoom-origin
  // check and hard-jump via _resetView (the "second click teleports" bug the ER
  // map hit). Aim only at on-grid zooms so the camera never sits off-grid.
  const snap = map.options.zoomSnap || 1;
  const zoom = Math.round(targetZoom / snap) * snap;
  const mapRect = map.getContainer().getBoundingClientRect();
  const overlay = document.querySelector<HTMLElement>("[data-left-overlay]");
  const projected = map.project(target, zoom);

  if (overlay) {
    const desiredX = overlay.getBoundingClientRect().right - mapRect.left + 72;
    projected.x += mapRect.width / 2 - desiredX;
  }

  const targetLatLng = map.unproject(projected, zoom);
  const travel = map
    .latLngToContainerPoint(map.getCenter())
    .distanceTo(map.latLngToContainerPoint(targetLatLng));

  if (travel <= mapRect.width) {
    // panBy, not panTo — panTo goes through setView's zoom re-snap and can
    // reject the animation entirely when the current zoom is off-grid.
    const offset = map
      .latLngToContainerPoint(targetLatLng)
      .subtract(map.latLngToContainerPoint(map.getCenter()));
    map.panBy(offset, { animate, duration: 0.4 });
  } else if (!animate) {
    map.setView(targetLatLng, zoom, { animate: false });
  } else {
    map.flyTo(targetLatLng, zoom, { duration: 0.6 });
  }
};
