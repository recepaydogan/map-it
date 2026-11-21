import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { useMapStore } from "../../store/map-store";
import { rawPositionFor } from "./raw-coordinate-system";
import type { RawErMapMarker, ErMapLayerDefinition } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Zoom reads out to the user as a percentage (scale = 2^zoom, so zoom 0 = 100%);
// this map's own ceiling is 400%. Selecting a marker pulls the camera in to the
// user's configured percentage (Settings → Map, 335% by default) so the pick lands
// close enough to read its surroundings — the user is free to zoom back out
// afterwards, nothing re-asserts this until the next selection. Settings can also
// turn the zoom off entirely, in which case a selection only pans.
const zoomForPercent = (percent: number) => Math.log2(percent / 100);

interface ErMapSelectionProps {
  layer: ErMapLayerDefinition;
  marker: RawErMapMarker | null;
  focusNonce?: number;
  native?: boolean;
  onCameraSettled?: (markerId: string) => void;
}

const ErMapSelection = ({
  layer,
  marker,
  focusNonce = 0,
  native = false,
  onCameraSettled,
}: ErMapSelectionProps) => {
  const map = useMap();
  const overrides = useMapStore((s) => s.editMode ? s.markerOverrides : s.committedMarkerOverrides);

  useEffect(() => {
    if (!marker) return;
    const over = overrides[marker.id];
    const target: [number, number] = over
      ? [over.y, over.x]
      : native
        ? [-marker.localZ, marker.localX]
        : (() => {
            const position = rawPositionFor(marker, layer);
            return [layer.imageHeight - position.y, position.x];
          })();

    // Land the marker just to the RIGHT of the open detail panel, vertically CENTERED
    // — identical framing to the Map tab (map-marker-camera.ts moveMapToMarker only
    // shifts X and leaves the marker at the viewport's vertical middle). We fire on
    // every selection, the same commit the panel mounts, so wait until it's actually in
    // the DOM before measuring its rect (capped, so a marker without a panel still
    // moves to a sane spot).
    //
    // Everything is computed at the zoom we're about to LAND at — projecting the target
    // and the new center at that same zoom. Anchoring both axes this way places the
    // marker at an exact container point regardless of how far in/out the map is; the
    // old shared helper clamped zoom to >= 0 while panTo kept the real (often negative)
    // zoom, so the horizontal offset never matched what was on screen.
    let frame = 0;
    let attempts = 0;
    let active = true;
    let finishMove: (() => void) | null = null;
    const move = () => {
      const panel = document.querySelector("[data-testid='er-map-detail-panel']");
      if (!panel && attempts < 8) {
        attempts += 1;
        frame = requestAnimationFrame(move);
        return;
      }

      // Close in on the selection, but never pull the camera back OUT: a user already
      // past the configured percentage keeps their zoom (same rule the Map tab applies
      // at its own floor). Read straight from the store rather than subscribing — a
      // settings change must not re-fly the camera at the current selection, it only
      // applies from the next one on.
      const { markerZoomEnabled, markerZoomPercent } = useMapStore.getState();
      const currentZoom = map.getZoom();
      // Snap the configured zoom to the map's zoomSnap grid. flyTo IGNORES
      // zoomSnap (long-standing Leaflet quirk) and lands off-grid — 335% is
      // zoom 1.7444 on a 0.25 grid. The NEXT short-hop panTo then re-enters
      // setView, whose _limitZoom snaps the same zoom to 1.75, concludes "zoom
      // changed" and tries a ZOOM animation instead of a pan; its zoom-origin
      // sanity check divides the pan offset by (1 - 1/scale) ≈ ×259 at that
      // sliver of zoom, always fails, and setView hard-jumps via _resetView.
      // That was THE "second click sometimes teleports" bug: every flight that
      // landed off-grid made the following short hop an instant cut.
      const snap = map.options.zoomSnap || 1;
      const configuredZoom = Math.round(zoomForPercent(markerZoomPercent) / snap) * snap;
      const zoom = markerZoomEnabled
        ? Math.max(currentZoom, configuredZoom)
        : currentZoom;
      const zoomIn = zoom > currentZoom;
      const size = map.getSize();
      const mapRect = map.getContainer().getBoundingClientRect();

      // Where on screen the marker should end up (container pixels). X sits just past
      // the panel's right edge (+72, matching the Map tab); Y stays at the viewport
      // center so the marker reads as vertically centred beside the panel.
      let desiredX = size.x * 0.42;
      const desiredY = size.y / 2;
      if (panel) {
        const rect = panel.getBoundingClientRect();
        desiredX = rect.right - mapRect.left + 72;
      }
      desiredX = clamp(desiredX, 80, size.x - 80);

      const targetPoint = map.project(target, zoom);
      const centerPoint = targetPoint.add(
        L.point(size.x / 2 - desiredX, size.y / 2 - desiredY),
      );
      const center = map.unproject(centerPoint, zoom);

      // Mirror the Map tab's marker→marker transition (see map-marker-camera.ts
      // moveMapToMarker): gauge the camera's screen travel to the new center and
      // branch exactly as it does — a short hop pans flat, a long jump keeps the
      // zoom-out-in flyTo arc. We can't call the shared helper directly because it
      // projects at max(zoom, 0) while this map lives at negative zoom, so the
      // offset above is computed at the target zoom instead; only the pan/fly
      // decision is shared. panTo holds the current zoom, so it's only an option
      // when we aren't zooming in.
      const travel = map
        .latLngToContainerPoint(map.getCenter())
        .distanceTo(map.latLngToContainerPoint(center));
      const zoomChanges = Math.abs(zoom - currentZoom) > 0.001;
      const settle = () => {
        map.off("moveend", settle);
        if (!active) return;
        onCameraSettled?.(marker.id);
      };
      const armSettle = () => {
        map.once("moveend", settle);
      };
      finishMove = () => {
        map.off("movestart", armSettle);
        map.off("moveend", settle);
      };

      // A marker already at its destination produces no movement events at all —
      // Leaflet truncates the pan offset to whole pixels and a zero offset emits a
      // lone moveend with no movestart — so settle those on the next frame. Mirrors
      // _tryAnimatedPan's trunc, not a distance threshold: a 0.9px diagonal has
      // travel > 1 yet still truncates to no movement.
      const startPoint = map.latLngToContainerPoint(map.getCenter());
      const endPoint = map.latLngToContainerPoint(center);
      const movesWholePixel =
        Math.trunc(endPoint.x - startPoint.x) !== 0 ||
        Math.trunc(endPoint.y - startPoint.y) !== 0;
      if (!movesWholePixel && !zoomChanges) {
        frame = requestAnimationFrame(settle);
        return;
      }
      // Arm the moveend listener from OUR movestart, never up front: panTo/flyTo
      // first _stop() a previous flight that is still animating, and Leaflet fires
      // that aborted flight's moveend SYNCHRONOUSLY inside this very call. A
      // listener armed before the call catches that echo and reports this flight
      // settled the moment it lifts off — which fired onCameraSettled early and
      // let the full-pool parse burst land mid-flight, swallowing the wall-clock
      // paced animation into a teleport. Our own movestart always fires after any
      // echo, inside the same call — including Leaflet's non-animated fallbacks,
      // which emit movestart then moveend synchronously, in order.
      map.once("movestart", armSettle);
      if (!zoomIn && travel <= size.x) {
        // panBy, NOT panTo: panTo re-enters setView, which re-snaps the current
        // zoom and can reject the animation outright when the camera sits
        // off-grid (see the zoomSnap note above). panBy never touches zoom —
        // it always just glides the pane by a pixel offset.
        map.panBy(endPoint.subtract(startPoint), { animate: true, duration: 0.4 });
      } else {
        map.flyTo(center, zoom, { duration: 0.6 });
      }
    };
    frame = requestAnimationFrame(move);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      finishMove?.();
    };
  }, [focusNonce, layer, map, marker, native, onCameraSettled, overrides]);

  return null;
};

export default ErMapSelection;
