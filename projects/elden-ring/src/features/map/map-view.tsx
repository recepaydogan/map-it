import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, useMap, useMapEvents } from "react-leaflet";
import * as L from "leaflet";
import { Compass } from "lucide-react";
import {
  mapImages,
  NOMINAL_SIZE,
  nrMapFor,
  TILE_SIZE,
  tileBaseName,
  tileZoomRange,
} from "../../data/maps";
import type { Game, MapImage } from "../../data/types";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import { useMapStore } from "../../store/map-store";
import MarkerPlacer from "../custom-markers/marker-placer";
import { useMapExperience } from "../map-experience/map-experience";
import EditControls from "./edit-controls";
import { frameMapBounds, phoneCoverZoom } from "./frame-map-bounds";
import FragmentLayer from "./fragment-layer";
import MapControls from "./map-controls";
import { moveMapToMarker } from "./map-marker-camera";
import MarkerLayer from "./marker-layer";
import RegionLabelsLayer from "./region-labels-layer";
import SingleTooltipController from "./single-tooltip-controller";

/**
 * Zoom is expressed to the user as a percentage (scale = 2^zoom, so zoom 0 =
 * 100%). The map opens at 21% and zooms in to a max of 337%.
 */
const zoomForPercent = (percent: number) => Math.log2(percent / 100);
const START_ZOOM = zoomForPercent(21); // ≈ -2.25 → 21%
const MAX_ZOOM = zoomForPercent(337); // ≈ 1.753 → 337%
const MIN_ZOOM = zoomForPercent(9); // ≈ -3.47 → 9% (furthest zoom-out, ER)
const NR_MIN_ZOOM = zoomForPercent(25); // -2 → 25% (NR can't zoom out as far)

const minZoomFor = (game: Game) => (game === "nightreign" ? NR_MIN_ZOOM : MIN_ZOOM);

/**
 * Live min-zoom sync. react-leaflet applies `minZoom` only at MOUNT and never on a
 * prop change — the exact trap that forced maxBounds out (see the MapContainer
 * comment). Since the map never remounts, the zoom floor would otherwise stay frozen
 * at whichever game was active on first mount: with the game persisted, booting on
 * Nightreign (25% floor) leaves ER wrongly stuck at 25% instead of its ~10%. Push the
 * current game's floor onto the live map on every game change; setMinZoom clamps the
 * current zoom up if it now sits below the new floor (NR), and lets ER drop to ~10%.
 */
const MinZoomSync = ({ game }: { game: Game }) => {
  const map = useMap();
  useEffect(() => {
    map.setMinZoom(minZoomFor(game));
  }, [map, game]);
  return null;
};

/**
 * The map canvas. Leaflet with CRS.Simple treats the map image as a flat pixel
 * plane (no geo projection) — the right model for a game map, and it consumes
 * the pipeline's pixel coordinates directly.
 */
const MapView = () => {
  const { game, layer, currentPattern } = useMapExperience();
  // Reopen at the user's last zoom, falling back to the fixed start zoom.
  const initialZoom = useMapStore((s) => s.zoom) ?? START_ZOOM;
  const image =
    game === "nightreign"
      ? nrMapFor(currentPattern?.shiftingEarth)
      : mapImages[game][layer];

  if (!image) return null;

  // NEVER remount the map — one stable key for the whole app lifetime. Every map
  // change (NR↔ER, any ER layer switch, any Shifting Earth swap) is handled live:
  //   • TiledMap's effect (keyed on image.src) removes the old tile layer and adds
  //     the new one → Leaflet loads tiles immediately for the current view.
  //   • FitOnMount's effect (keyed on bounds) re-runs on a dimension change and
  //     resets the view, so the new-sized map opens at the saved center/zoom.
  //   • MarkerLayer recomputes positions from the new imageWidth/imageHeight props.
  //
  // This is the proven Nightreign hot-swap path, now used for ALL maps. DO NOT key
  // this on dimensions again: a key change forces a fresh MapContainer mount, and a
  // freshly-mounted Leaflet GridLayer doesn't reliably paint until a view reset —
  // that is the recurring "black map after switching maps" bug. Adding the map only
  // to a LIVE, already-sized map avoids the first-paint race entirely.
  const mapKey = "atlas-map";

  // Stable bounds ref: cursor-readout state updates re-render MapView on every
  // mousemove; without memo, a fresh bounds array would re-fire FitOnMount and
  // snap the view back, breaking zoom/pan.
  const bounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [0, 0],
      [image.height, image.width],
    ],
    [image.height, image.width],
  );

  return (
    // NO pan limit (no maxBounds): the user can drag the map freely in every
    // direction; the recenter control (and the empty-area background) snaps back
    // to the map. maxBounds was deliberately removed — react-leaflet only applies
    // it at mount and never updates it on a prop change, so after switching to a
    // differently-sized map (NR 1536² → ER 6016²) the STALE bounds clamped the new
    // map into the old map's tiny rectangle and the view jammed in a corner. Only
    // the zoom range is bounded; panning is unrestricted.
    <div className="relative h-full w-full">
      <MapContainer
        key={mapKey}
        crs={L.CRS.Simple}
        center={[image.height / 2, image.width / 2]}
        zoom={initialZoom}
        minZoom={minZoomFor(game)}
        maxZoom={MAX_ZOOM}
        zoomControl={false}
        attributionControl={false}
        zoomSnap={0.25}
        wheelPxPerZoomLevel={120}
        // Leaflet's own resize handling MUST stay off. It listens to window
        // `resize` and runs a rAF-deferred invalidateSize — which PANS the map by
        // half the size delta. During a minimize⇄restore storm (the app hotkey)
        // those deferred callbacks fire at arbitrary moments, including while the
        // container is 0-sized, shearing the view half a screen per bounce until
        // the camera sits entirely off the map (no tiles, no markers). Our own
        // ResizeHandler covers real resizes, gated on the LIVE container size.
        trackResize={false}
        className="h-full w-full bg-[#0a0b12]"
      >
        <TiledMap image={image} />
        <RegionLabelsLayer
          game={game}
          layer={layer}
          imageWidth={image.width}
          imageHeight={image.height}
        />
        <MinZoomSync game={game} />
        <ResizeHandler />
        <RecoverOnWindowRestore imageWidth={image.width} imageHeight={image.height} />
        <FitOnMount bounds={bounds} />
        <RecenterOnMapSwitch mapSrc={image.src} bounds={bounds} />
        <ViewSync imageWidth={image.width} imageHeight={image.height} />
        <FlyToSelected imageWidth={image.width} imageHeight={image.height} />
        {/* Under the pins: the fragment reveal rects as finer context — never something to
            click past. */}
        <FragmentLayer imageWidth={image.width} imageHeight={image.height} />
        <MarkerLayer imageWidth={image.width} imageHeight={image.height} />
        <MarkerPlacer imageWidth={image.width} imageHeight={image.height} />
        <SingleTooltipController />
        <MapControls bounds={bounds} />
        <OffMapWarning bounds={bounds} />
      </MapContainer>
      <EditControls />
    </div>
  );
};

/**
 * Force Leaflet to reload tiles for the CURRENT view without visibly moving the
 * camera — the reliable cure for the "black map on open / after a map switch"
 * bug. This is the user's "+1% then −1% zoom" idea, made to actually stick:
 *
 *   • A sub-step nudge (e.g. +1% ≈ +0.014 zoom) is killed by zoomSnap (0.25):
 *     Leaflet snaps it straight back to the same zoom, sees "no change", and
 *     skips the tile reload — so the screen stays black.
 *   • So we bump by a FULL snap step (0.25, away from whichever edge has room)
 *     and immediately set it back. Two synchronous setZoom() calls only paint
 *     the final state, so the bump is invisible — but it triggers a real
 *     viewreset, which unconditionally re-requests every tile in view.
 */
export const nudgeZoom = (map: L.Map) => {
  const z = map.getZoom();
  const delta = z + 0.25 <= map.getMaxZoom() ? 0.25 : -0.25;
  map.setZoom(z + delta, { animate: false });
  map.setZoom(z, { animate: false });
};

/**
 * The container's LIVE pixel size, straight from the DOM. `map.getSize()` serves
 * Leaflet's CACHED size (only refreshed by invalidateSize), so while the window
 * is minimizing it can still report the old full size when the real container is
 * already 0×0 — the exact blind spot that let resize logic run against a hidden
 * window. Every "is the map actually visible?" guard must use THIS, not getSize().
 */
export const getLiveMapSize = (map: L.Map) => {
  const el = map.getContainer();
  return { x: el.clientWidth, y: el.clientHeight };
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The last persisted view (zoom + normalised center), sanitised into a concrete
 * LatLng for a map of the given pixel dimensions. Non-finite or out-of-range
 * values — which the resize-while-hidden bug could write in older builds — fall
 * back to the map centre / start zoom, so a poisoned store can never open the
 * camera off the world again.
 */
const storedViewFor = (map: L.Map, imageWidth: number, imageHeight: number) => {
  const { zoom, center } = useMapStore.getState();
  const rawZoom = typeof zoom === "number" && Number.isFinite(zoom) ? zoom : START_ZOOM;
  const safeZoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), rawZoom));
  const cx = center && Number.isFinite(center.x) ? clamp01(center.x) : 0.5;
  const cy = center && Number.isFinite(center.y) ? clamp01(center.y) : 0.5;
  return { center: L.latLng(cy * imageHeight, cx * imageWidth), zoom: safeZoom };
};

/** 1×1 transparent PNG — shown for any tile that 404s instead of a broken-image box. */
const BLANK_TILE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Streams the map as a 256px tile pyramid (scripts/build-map-tiles.mjs) instead of
 * one giant <img>. Only the visible tiles decode, so panning at 100% no longer
 * thrashes a 36-megapixel bitmap. The pyramid is laid out for CRS.Simple (zoom 0 =
 * native pixels), so markers — placed in the same CRS — line up unchanged. Beyond
 * 100% Leaflet upscales the native (z=0) tiles, exactly as the single image did.
 */
const TiledMap = ({ image }: { image: MapImage }) => {
  const map = useMap();
  useEffect(() => {
    const name = tileBaseName(image.src);
    const { minNativeZoom, maxNativeZoom } = tileZoomRange(image.width, image.height);
    const layer = L.tileLayer(`/maps/tiles/${name}/{z}/{x}/{y}.webp`, {
      tileSize: TILE_SIZE,
      noWrap: true,
      bounds: L.latLngBounds([0, 0], [image.height, image.width]),
      // GridLayer's own minZoom defaults to 0; our CRS.Simple view lives in
      // negative zooms (opens at ≈ -2.25), so without a range the layer treats
      // every real zoom as out of range and drops all tiles → a black map.
      //
      // These MUST be the rounded-OUT integer bounds, not the map's fractional
      // min/max. GridLayer compares Math.round(mapZoom) against them and blanks the
      // layer when it falls outside: max zoom is 1.7527, round(≥1.5) = 2 > 1.7527,
      // so a fractional maxZoom dropped every tile above ~283% — that was the black
      // map on open (last zoom was 283%) and the "edges don't load at max zoom".
      //
      // And they MUST come from the app-wide constants, NOT the live map
      // (map.getMinZoom()): on a game switch this effect runs BEFORE the
      // later-sibling MinZoomSync pushes the new game's floor, so leaving
      // Nightreign (floor -2 = 25%) froze -2 into the fresh ER layer — then any
      // zoom that rounds below -2 (≲18%, where the whole-map fitBounds of a
      // switch lands) made GridLayer remove every tile: the "map flickers and
      // never finishes loading after coming back from Nightreign" bug. The
      // constants are game-independent and the MAP's own min/max still clamp
      // what the user can actually reach, so the widest range is always safe.
      minZoom: Math.floor(MIN_ZOOM),
      maxZoom: Math.ceil(MAX_ZOOM),
      minNativeZoom,
      maxNativeZoom,
      keepBuffer: 4, // hold a ring of off-screen tiles so a pan reveals them placed
      updateWhenZooming: false, // settle tiles on zoomend, not every animation frame
      errorTileUrl: BLANK_TILE,
      className: "er-map-tiles",
    });
    layer.addTo(map);
    // After a map swap the fresh GridLayer occasionally races the map's size/zoom
    // state and its first _update finds nothing to draw → black map until a manual
    // zoom. A deferred zoom-nudge forces a viewreset once the swap has settled, so
    // the new tiles paint on their own. (rAF, so it runs after this layer is wired
    // in; invisible because nudgeZoom returns to the exact same zoom.)
    const raf = requestAnimationFrame(() => nudgeZoom(map));
    return () => {
      cancelAnimationFrame(raf);
      map.removeLayer(layer);
    };
  }, [map, image.src, image.width, image.height]);
  return null;
};

/**
 * Leaflet won't paint tiles until it knows the container's pixel size. In an
 * Overwolf window the map often mounts while the window is still hidden / 0-sized,
 * so the initial tile load finds an empty viewport and the map stays black until a
 * manual zoom forces a recompute (the reported bug).
 *
 * A ResizeObserver catches the moment the container first gets a real size. We
 * can't lean on invalidateSize() alone: it early-returns when the cached size
 * didn't actually change AND when the map isn't `_loaded` yet, so a hidden→shown
 * transition can slip through. So once a non-zero size appears we also force every
 * tile layer to redraw(), which unconditionally reloads tiles for the current view.
 */
const ResizeHandler = () => {
  const map = useMap();
  useEffect(() => {
    let primed = false;
    const sync = () => {
      // LIVE size, not map.getSize() — the cached size can still read full while
      // the window is minimizing, which would let invalidateSize run against a
      // 0-sized container and shear the view (see getLiveMapSize).
      const size = getLiveMapSize(map);
      if (size.x === 0 || size.y === 0) return; // wait for a real layout size
      map.invalidateSize({ animate: false });
      if (!primed) {
        primed = true;
        // invalidateSize no-ops on the 0→sized transition (and before _loaded),
        // so kick the tile layers directly to guarantee the first paint.
        map.eachLayer((l) => {
          if ("redraw" in l && typeof l.redraw === "function") l.redraw();
        });
        // redraw() can still no-op if the layer's _tileZoom isn't set yet (the
        // view hasn't finished resetting). A zoom-nudge forces a full viewreset,
        // which is the stronger guarantee that the first paint actually happens.
        nudgeZoom(map);
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(map.getContainer());
    sync(); // also handle the already-sized case immediately
    if (import.meta.env.DEV) (window as unknown as { _map: L.Map })._map = map;
    return () => ro.disconnect();
  }, [map]);
  return null;
};

/**
 * Full recovery after a minimize⇄restore (the Ctrl+Shift+D app hotkey) — the
 * "map breaks, tiles blank, even markers gone" bug, solved at its root.
 *
 * What actually breaks: while the window hides, deferred resize work could run
 * invalidateSize against a 0-sized container, and invalidateSize PANS the map by
 * half the size delta — shearing the camera off the world (markers and tiles are
 * both positioned relative to that camera, so everything vanishes together).
 * Rapid toggling compounds the shift. The trackResize={false} + live-size guards
 * close every entry point that could shear the view; this component repairs
 * whatever still went wrong while hidden, by construction rather than guesswork:
 *
 *  1. stop() any in-flight pan/fly animation and clear a zoom animation whose
 *     `transitionend` never fired because rendering froze mid-zoom (a stuck
 *     `_animatingZoom` makes GridLayer skip every subsequent tile update).
 *  2. invalidateSize with pan:false — sync the size WITHOUT the half-delta pan.
 *  3. setView to the last PERSISTED view (ViewSync only ever records views
 *     sampled from a visible, non-0-sized window, so it is always trustworthy).
 *     A healthy map no-ops here; a sheared one snaps back where the user left it.
 *  4. If any tile <img> died while hidden (aborted request → errorTileUrl, or a
 *     never-completed load), redraw() the tile layers — Leaflet never retries an
 *     errored tile on its own, and only redraw re-requests tiles already in its
 *     cache. Skipped when the tiles are healthy, so a plain restore stays free.
 *
 * Runs on BOTH signals — the Overwolf window-state event and the document's own
 * visibilitychange — because a rapid toggle storm can coalesce Overwolf state
 * events; the two paths funnel into one rAF so recovery executes once per show.
 * A no-op outside Overwolf.
 */
const RecoverOnWindowRestore = ({
  imageWidth,
  imageHeight,
}: {
  imageWidth: number;
  imageHeight: number;
}) => {
  const map = useMap();
  useEffect(() => {
    let raf = 0;
    const recover = () => {
      // Defer a frame so the freshly-restored container has a real layout size.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const size = getLiveMapSize(map);
        // Still hidden (mid-storm) — a later show signal will retry.
        if (size.x === 0 || size.y === 0 || document.hidden) return;

        // 1. Kill animation state orphaned by the render freeze.
        map.stop();
        const m = map as L.Map & {
          _animatingZoom?: boolean;
          _onZoomTransitionEnd?: () => void;
        };
        if (m._animatingZoom) m._onZoomTransitionEnd?.();

        // 2. Size sync without the view-shearing pan.
        map.invalidateSize({ animate: false, pan: false });

        // 3. Re-anchor the camera on the last trustworthy view.
        const v = storedViewFor(map, imageWidth, imageHeight);
        map.setView(v.center, v.zoom, { animate: false });

        // 4. Re-request tiles that died while hidden (only when any actually did).
        const tilePane = map.getPane("tilePane");
        const tiles = tilePane ? Array.from(tilePane.querySelectorAll("img")) : [];
        const damaged = tiles.some(
          (img) => img.src === BLANK_TILE || !img.complete || img.naturalWidth === 0,
        );
        if (damaged) {
          map.eachLayer((l) => {
            if ("redraw" in l && typeof l.redraw === "function") l.redraw();
          });
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
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [map, imageWidth, imageHeight]);
  return null;
};

const FitOnMount = ({ bounds }: { bounds: L.LatLngBoundsExpression }) => {
  const map = useMap();
  useEffect(() => {
    // Reopen at the user's last view (zoom + center) rather than fitting bounds,
    // so the opening view is exactly where they left off. The center is stored
    // normalised (0..1 of the image), so scale it back to this map's pixels; fall
    // back to the map centre on a first run. Read once from the store so later
    // view writes don't re-snap the camera.
    const b = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
    const ne = b.getNorthEast(); // (height, width) in CRS units
    // storedViewFor sanitises the persisted view — a store poisoned by the old
    // resize-while-hidden bug (off-world or non-finite center) opens at the map
    // centre instead of an empty void.
    const v = storedViewFor(map, ne.lng, ne.lat);
    // Re-measure before setting the view. The map never remounts, so the bounds
    // effect can fire while Leaflet still holds a stale container size (the header
    // tab bar can change height after the map first measured). A stale size makes
    // setView land off-center; invalidateSize syncs the true size first. There is no
    // maxBounds now, so an off view is always freely pannable — but measuring first
    // still keeps the opening view centered on the intended point.
    map.invalidateSize({ animate: false });
    // On a phone, clamp the restored zoom UP to whatever covers the map (see
    // phoneCoverZoom): the stored zoom was very likely sampled on the OTHER
    // game's map — an ER↔NR switch remounts this component, so the restore reads
    // whatever the previous map wrote — and applying it here opened Nightreign as
    // a small island in a field of void. Position is preserved; only the floor
    // moves, and only downward-zoomed views are affected.
    const floor = phoneCoverZoom(map, bounds);
    map.setView(v.center, floor === null ? v.zoom : Math.max(v.zoom, floor));
  }, [map, bounds]);
  return null;
};

/** Persist the map view (zoom + normalised center) so the next session reopens
 * where the user left off. moveend fires after both pans and zooms. */
const ViewSync = ({
  imageWidth,
  imageHeight,
}: {
  imageWidth: number;
  imageHeight: number;
}) => {
  const map = useMap();
  const setView = useMapStore((s) => s.setView);
  useMapEvents({
    moveend() {
      // Only persist views sampled from a VISIBLE, real-sized window. A moveend
      // fired while the window hides (deferred resize work, animation teardown)
      // reads a camera the user never saw — persisting it is how the old
      // minimize⇄restore bug leaked a sheared view into the store (and, via
      // cross-window sync, into the other window). The persisted view must stay
      // trustworthy: RecoverOnWindowRestore re-anchors on it after every show.
      const size = getLiveMapSize(map);
      if (size.x === 0 || size.y === 0 || document.hidden) return;
      const c = map.getCenter();
      const zoom = map.getZoom();
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng) || !Number.isFinite(zoom)) return;
      setView(zoom, { x: c.lng / imageWidth, y: c.lat / imageHeight });
    },
  });
  return null;
};

interface FlyProps {
  imageWidth: number;
  imageHeight: number;
}

const FlyToSelected = ({ imageWidth, imageHeight }: FlyProps) => {
  const map = useMap();
  const { selectedMarker, focusNonce } = useMapExperience();

  useEffect(() => {
    if (!selectedMarker) return;

    // Defer the camera move one frame. A cross-layer navigation switches the map
    // image in the SAME commit that bumps focusNonce, and TiledMap's swap schedules
    // a requestAnimationFrame nudgeZoom (the black-map cure). That nudge calls
    // setZoom, which would CANCEL an in-flight flyTo — so a first click on a
    // different-layer location only swapped the map and never travelled. Running the
    // fly inside our own rAF lets it land AFTER the (earlier-sibling) nudge, so the
    // camera survives. Same-layer focuses just wait a harmless extra frame.
    const raf = requestAnimationFrame(() => {
      const sx = imageWidth / NOMINAL_SIZE;
      const sy = imageHeight / NOMINAL_SIZE;
      const lat = imageHeight - selectedMarker.pixel.y * sy;
      const lng = selectedMarker.pixel.x * sx;
      const targetZoom = Math.max(map.getZoom(), 0);

      // The detail panel docks over the LEFT of the map. Centering the marker would
      // tuck it behind the panel; centering it in the clear area shoves it far across
      // the screen from the dialog. Instead, land it just to the dialog's right so
      // the marker and its panel read as one unit.
      const target: L.LatLngExpression = [lat, lng];

      // flyTo ALWAYS arcs out-and-back (zoom out to span the gap, then zoom in) even
      // when start/end zoom match — fine for a far jump, but jarring between two
      // near markers. Gauge the camera's screen travel: a short hop just pans flat
      // (no zoom change), only a long jump keeps the zoom-out-in fly.
      moveMapToMarker({ map, target, targetZoom, animate: true });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  return null;
};

/**
 * Land the user CENTERED on a map they just switched to. A "map switch" is a game swap
 * (ER↔NR), an Elden Ring layer change, or a Nightreign Shifting Earth swap — anything
 * that changes the underlying image. Without this the new map inherited whatever pan
 * offset the old one had (FitOnMount restores the saved normalised center on a
 * dimension change), so a switch could dump you in a corner of — or clean off — the new
 * map instead of on it.
 *
 * Keyed on image.src so it fires for every real map change, INCLUDING same-size NR
 * variant swaps that never change bounds (and so never re-run FitOnMount). The one image
 * change we must NOT hijack is a cross-layer MARKER navigation (opening an item whose pin
 * lives on another layer): there FlyToSelected must travel to the pin. That path always
 * bumps focusNonce in the same commit as the image swap, whereas a plain map switch never
 * does — so "src changed AND focusNonce unchanged" cleanly isolates user map switches.
 *
 * Rendered AFTER FitOnMount so that on the shared dimension-change commit our fitBounds is
 * the last camera write and wins; FitOnMount still owns the initial-mount restore, since
 * our very first run is a deliberate no-op.
 */
const RecenterOnMapSwitch = ({
  mapSrc,
  bounds,
}: {
  mapSrc: string;
  bounds: L.LatLngBoundsExpression;
}) => {
  const map = useMap();
  const { focusNonce } = useMapExperience();
  const prev = useRef<{ src: string; nonce: number } | null>(null);

  useEffect(() => {
    const last = prev.current;
    prev.current = { src: mapSrc, nonce: focusNonce };
    if (!last) return; // initial mount → FitOnMount restores the saved view
    // Same map, or a marker fly (focusNonce bumped) that owns its own camera move.
    if (mapSrc === last.src || focusNonce !== last.nonce) return;
    // A genuine map switch → frame the whole new map, centered (matches the recenter
    // control). Re-measure first: a stale container size would fit into the wrong rect.
    // animate:false is REQUIRED here: the same commit swaps the tile layer, and TiledMap
    // schedules a requestAnimationFrame zoom-nudge (its first-paint cure) that fires while
    // an animated fitBounds is still mid-flight — the nudge's synchronous setZoom cancels
    // the animation and strands the camera at an intermediate zoom with half-loaded tiles
    // (the "flicker / map doesn't finish loading after switching maps" report). A
    // synchronous fit lands the final zoom before the nudge runs, so the nudge reloads the
    // correct level cleanly.
    // frameMapBounds re-measures first (a stale container size would fit into the
    // wrong rect) and applies the app-wide framing rule — contain on desktop,
    // cover on a phone, where containing a square map in a portrait viewport
    // leaves most of the screen empty.
    frameMapBounds(map, bounds);
  }, [map, mapSrc, focusNonce, bounds]);

  return null;
};

/** Below this many on-screen pixels² of visible map, the user has drifted into the empty
 * margin and can barely see the map — surface the "back to center" nudge. */
const MIN_VISIBLE_MAP_AREA = 110 * 110;

/**
 * The map has NO pan limit (see MapContainer), so the world can be dragged entirely
 * off-screen, leaving the user staring at the empty background with no obvious way back.
 * This tracks how much of the map image actually overlaps the viewport — in SCREEN pixels,
 * so it's independent of zoom (a centered map reads as "fully visible" whether zoomed all
 * the way in or all the way out; only panning away shrinks the overlap) — and once almost
 * none is left, floats a one-click "back to center" pill at the bottom of the map.
 */
const OffMapWarning = ({ bounds }: { bounds: L.LatLngBoundsExpression }) => {
  const { t } = useTranslation();
  const map = useMap();
  const ref = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef(0);
  const [lost, setLost] = useState(false);

  const check = useCallback(() => {
    if (rafRef.current) return; // one measurement per frame while a gesture streams events
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) {
        setLost(false); // not laid out yet (e.g. a still-hidden Overwolf window)
        return;
      }
      const b = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
      // The map image's on-screen rectangle, clipped to the container.
      const p1 = map.latLngToContainerPoint(b.getSouthWest());
      const p2 = map.latLngToContainerPoint(b.getNorthEast());
      const left = Math.max(0, Math.min(p1.x, p2.x));
      const right = Math.min(size.x, Math.max(p1.x, p2.x));
      const top = Math.max(0, Math.min(p1.y, p2.y));
      const bottom = Math.min(size.y, Math.max(p1.y, p2.y));
      const visible = Math.max(0, right - left) * Math.max(0, bottom - top);
      setLost(visible < MIN_VISIBLE_MAP_AREA);
    });
  }, [map, bounds]);

  // Recompute as the view moves; the rAF gate + the boolean-only setState keep this from
  // re-rendering on every intermediate move frame (state flips only when lost/found does).
  useMapEvents({ move: check, zoom: check, resize: check });

  useEffect(() => {
    check(); // catch a view that is already off (e.g. a map switch that landed off-screen)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [check]);

  // Clicking the pill must not fall through to the map (which would deselect a marker, or
  // drop a pin while in placement mode). Re-armed whenever the button (re)mounts.
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, [lost]);

  if (!lost) return null;

  return (
    <button
      ref={ref}
      onClick={() => frameMapBounds(map, bounds, { animate: true })}
      className="absolute bottom-[calc(1.25rem+var(--anchor-ad-height))] left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] border border-accent/40 bg-surface/90 px-4 py-2 text-[13px] font-medium text-zinc-100 shadow-lg shadow-black/40 backdrop-blur-md transition-colors hover:bg-surface-hover cursor-pointer animate-in fade-in slide-in-from-bottom-2"
    >
      <Compass size={15} className="text-accent" aria-hidden="true" />
      {t("chrome.backToCenter")}
    </button>
  );
};

export default MapView;
