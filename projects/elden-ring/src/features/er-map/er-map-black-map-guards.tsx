import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type * as L from "leaflet";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import { frameMapBounds } from "../map/frame-map-bounds";
import { getLiveMapSize, nudgeZoom } from "../map/map-view";
import { BLANK_TILE } from "./er-map-tiles";

interface ErMapBlackMapGuardsProps {
  /** Current view's content bounds — the frame to restore when the mount-time
   * framing was computed against a hidden (0-sized) container. */
  bounds: L.LatLngBounds;
  selectedId: string | null;
}

const redrawTileLayers = (map: L.Map) => {
  map.eachLayer((l) => {
    if ("redraw" in l && typeof l.redraw === "function") l.redraw();
  });
};

/**
 * The ER map's port of the live map's black-map protections (map-view.tsx:
 * ResizeHandler + RecoverOnWindowRestore). Without these, any map that mounts
 * while its window is hidden / 0-sized — which the desktop window now does on
 * every game launch (auto-open), and the in-game overlay always did — comes up
 * with markers and region labels intact but ZERO tiles: Leaflet never retries a
 * tile that errored or loaded against an empty viewport, and the MapContainer's
 * mount-time `bounds` framing fit a 0×0 rectangle, so the camera opens wrong too.
 *
 *  • First-paint: a ResizeObserver waits for the container's first real layout
 *    size, then invalidateSize + redraw every tile layer + an invisible
 *    zoom-nudge (redraw alone no-ops when the layer's _tileZoom isn't set yet).
 *    If the map mounted blind, the current view is also re-framed — the mount
 *    framing was garbage and the user never saw it, so the re-fit is invisible.
 *  • Later resizes: guarded invalidateSize gated on the LIVE container size —
 *    this replaces trackResize (off on the MapContainer), whose unguarded
 *    invalidateSize could pan against a 0-sized container while minimizing and
 *    shear the camera off the world (the live map's old minimize⇄restore bug).
 *  • Restore: on visibilitychange / Overwolf window-state show, sync the size
 *    without the half-delta pan and re-request tiles that died while hidden
 *    (aborted → errorTileUrl, or never completed) — only when any actually did,
 *    so a plain restore stays free.
 */
const ErMapBlackMapGuards = ({ bounds, selectedId }: ErMapBlackMapGuardsProps) => {
  const map = useMap();
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const mountSize = getLiveMapSize(map);
    const mountedBlind = mountSize.x === 0 || mountSize.y === 0;
    let primed = false;
    const sync = () => {
      const size = getLiveMapSize(map);
      if (size.x === 0 || size.y === 0) return; // wait for a real layout size
      map.invalidateSize({ animate: false });
      if (!primed) {
        primed = true;
        // A selection landing via cross-window sync brings its own camera
        // flight — don't fight it; otherwise repair the garbage mount framing.
        if (mountedBlind && !selectedRef.current) {
          frameMapBounds(map, boundsRef.current);
        }
        redrawTileLayers(map);
        nudgeZoom(map);
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(map.getContainer());
    sync(); // also handle the already-sized case immediately

    let raf = 0;
    const recover = () => {
      // Defer a frame so the freshly-restored container has a real layout size.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const size = getLiveMapSize(map);
        if (size.x === 0 || size.y === 0 || document.hidden) return;
        // Kill animation state orphaned by the render freeze — a stuck
        // _animatingZoom makes GridLayer skip every subsequent tile update.
        map.stop();
        const m = map as L.Map & {
          _animatingZoom?: boolean;
          _onZoomTransitionEnd?: () => void;
        };
        if (m._animatingZoom) m._onZoomTransitionEnd?.();
        map.invalidateSize({ animate: false, pan: false });
        const tilePane = map.getPane("tilePane");
        const tiles = tilePane ? Array.from(tilePane.querySelectorAll("img")) : [];
        const damaged =
          tiles.length === 0 ||
          tiles.some(
            (img) => img.src === BLANK_TILE || !img.complete || img.naturalWidth === 0,
          );
        if (damaged) {
          redrawTileLayers(map);
          nudgeZoom(map);
        }
      });
    };
    const onVisibility = () => {
      if (!document.hidden) recover();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let prevHidden = false;
    const isHiddenState = (state: string) =>
      state === "minimized" || state === "hidden" || state === "closed";
    const unsubscribe = subscribeToCurrentWindowState((state) => {
      const hidden = isHiddenState(state);
      if (prevHidden && !hidden) recover();
      prevHidden = hidden;
    });

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [map]);

  return null;
};

export default ErMapBlackMapGuards;
