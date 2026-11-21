import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type * as L from "leaflet";
import { frameMapBounds } from "../map/frame-map-bounds";

interface ErMapViewCameraProps {
  viewKey: string;
  bounds: L.LatLngBounds;
  selectedId: string | null;
}

/**
 * Owns the camera when the map ARRIVES at a view — on mount and on every view
 * switch — now that the MapContainer no longer remounts per view (the remount made
 * every cross-view marker navigation an instant teleport, performance mode or not
 * — the whole map was torn down and rebuilt at the new view's fit). With the map
 * persistent, arrivals split two ways:
 *
 *   • Plain arrival (mount, or a toolbar switch, with no selection) — frame the
 *     whole map through the shared rule (frame-map-bounds: contain on desktop,
 *     cover on a phone). Not animated on purpose: two unrelated coordinate spaces
 *     have no meaningful path between them, and this mirrors the live map's
 *     RecenterOnMapSwitch.
 *   • Marker navigation (a selection landed in the same commit) — do NOTHING.
 *     ErMapSelection owns the camera there: it glides from wherever the camera was
 *     (and lands instantly only under performance mode, its existing rule).
 *
 * The mount pass matters even though MapContainer's own `bounds` prop already fits
 * on mount: that fit always CONTAINS, which on a phone leaves a square map
 * floating in a tall black viewport.
 *
 * `selectedId` is set synchronously by navigateToMarker in the very commit that
 * changes the view — even while the arrival's chunk is still fetching — so it is a
 * reliable same-commit signal for "this switch is a navigation".
 */
const ErMapViewCamera = ({ viewKey, bounds, selectedId }: ErMapViewCameraProps) => {
  const map = useMap();
  // The view this component last framed — `null` until the first run, which is
  // what makes the mount pass fall out of the same condition as a view switch.
  const framedView = useRef<string | null>(null);

  useEffect(() => {
    // Already framed for this view: a new `bounds` identity for the SAME view is
    // just a re-render, not a reason to yank the camera back to the world.
    if (framedView.current === viewKey) return;
    framedView.current = viewKey;
    if (selectedId) return;
    frameMapBounds(map, bounds);
  }, [map, viewKey, bounds, selectedId]);

  return null;
};

export default ErMapViewCamera;
