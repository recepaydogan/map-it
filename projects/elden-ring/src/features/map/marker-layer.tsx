import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { markerArtUrl, markerFallbackUrl } from "../../data/marker-art";
import { fallbackIconUrl } from "../../data/fallback-icons";
import { NOMINAL_SIZE } from "../../data/maps";
import type { Marker } from "../../data/types";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";
import { buildClusterIcon, buildMarkerIcon } from "./marker-icon";
import useDirectionalMarkerNavigation from "./use-directional-marker-navigation";

interface MarkerLayerProps {
  imageWidth: number;
  imageHeight: number;
}

/**
 * Clustering engages only once the user is zoomed out below a percentage they set
 * (store: clusterBelowPercent, default 26) — below it the whole map is on screen
 * and thousands of pins would freeze the view, so they collapse into bubbles;
 * at or above it the user is reading a region and wants the real individual icons.
 *
 * markercluster can't express this cutoff itself: it snaps the live zoom to an
 * integer level (Math.round), and our 0.25-step zooms for 25% and 30% both round
 * to the same level — so its disableClusteringAtZoom can't split them. We compare
 * the raw fractional zoom against log2(percent / 100) instead.
 */
const zoomForPercent = (percent: number) => Math.log2(percent / 100);
/** In flat mode, mount pins up to 40% beyond the viewport so a pan reveals them
 * already placed rather than popping in at the edge. */
const VIEW_PADDING = 0.4;
/** zIndexOffset for the selected pin so it always sits above its neighbours. */
const SELECTED_Z = 100000;
/** Cluster proximity radius in screen pixels — MUST match the markercluster group's
 * maxClusterRadius below. Used both to merge nearby same-type pins and to decide a
 * pin is "lone" (no same-type neighbour within this radius → it stays standalone). */
const CLUSTER_RADIUS_PX = 48;
/** Placement token: which container a marker currently lives in. */
type Place = "map" | "none" | `g:${string}`;

/**
 * Renders the visible markers, placing each one in exactly one of three spots
 * recomputed on every filter / move / zoom / setting change:
 *
 *  - `g:<category>` — inside that category's marker-cluster group. One group per
 *    category, so a bubble only ever merges markers of the *same type* and can
 *    show that type's icon. Used when clustering is on and the user is zoomed out
 *    past CLUSTER_BELOW_ZOOM.
 *  - `map` — drawn individually on the map. Used at/above the zoom cutoff (or with
 *    clustering off), and ALWAYS for the selected marker so a searched pin is
 *    never hidden inside a bubble. Off-screen individual pins are culled.
 *  - `none` — culled (individual mode, outside the padded viewport).
 *
 * Driven imperatively: react-leaflet has no cluster primitive, the community
 * wrapper trails react-leaflet v5, and the precise zoom cutoff / per-category
 * grouping need raw control anyway. Marker coords are authored in NOMINAL_SIZE
 * space and scaled to the real image; the y axis is flipped (Leaflet lat grows up).
 */
const MarkerLayer = ({ imageWidth, imageHeight }: MarkerLayerProps) => {
  const { visibleMarkers, selectedMarker, categoryById, categoryArt, select } =
    useMapExperience();
  const clusterMarkers = useMapStore((s) => s.clusterMarkers);
  const clusterBelowPercent = useMapStore((s) => s.clusterBelowPercent);
  const foundMarkers = useMapStore((s) => s.foundMarkers);
  const bookmarks = useMapStore((s) => s.bookmarks);
  const editMode = useMapStore((s) => s.editMode);
  const markerOverrides = useMapStore((s) =>
    s.editMode ? s.markerOverrides : s.committedMarkerOverrides,
  );
  const setMarkerOverride = useMapStore((s) => s.setMarkerOverride);
  const moveCustomMarker = useMapStore((s) => s.moveCustomMarker);
  const toggleMarkerDeletion = useMapStore((s) => s.toggleMarkerDeletion);
  const map = useMap();

  const sx = imageWidth / NOMINAL_SIZE;
  const sy = imageHeight / NOMINAL_SIZE;
  const selectedId = selectedMarker?.id ?? null;

  // A pin's Leaflet icon from its category + selection state. Both the initial
  // build and the selection-highlight swap go through here so a selected pin
  // looks identical however it became selected. buildMarkerIcon caches by
  // signature, so repeated calls for the same look reuse one DivIcon instance.
  const foundRef = useRef(foundMarkers);
  foundRef.current = foundMarkers;
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const iconFor = useCallback(
    (m: Marker, selected: boolean) =>
      buildMarkerIcon({
        color: categoryById.get(m.category)?.color ?? "#a1a1aa",
        iconKey: categoryById.get(m.category)?.icon ?? "pin",
        selected,
        dashed: m.seeded === false,
        iconUrl: markerArtUrl(m),
        fallbackUrl: markerFallbackUrl(m),
        found: foundRef.current.has(m.id),
        bookmarked: bookmarksRef.current.has(m.id),
      }),
    [categoryById],
  );

  // In edit mode, a marker's live position is its draft override (if any) else its data
  // pixel. overridesRef/editModeRef so latLngFor & makeMarker read current values
  // without becoming reconcile deps.
  const overridesRef = useRef(markerOverrides);
  overridesRef.current = markerOverrides;
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;

  const latLngFor = useCallback(
    (m: Marker): L.LatLng => {
      const o = overridesRef.current[m.id];
      const x = o ? o.x : m.pixel.x;
      const y = o ? o.y : m.pixel.y;
      return L.latLng(imageHeight - y * sy, x * sx);
    },
    [imageHeight, sx, sy],
  );

  // Latest values via refs so the once-bound map listeners and the stable
  // reconcile() always read current state without rebinding / changing identity.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const clusterRef = useRef(clusterMarkers);
  clusterRef.current = clusterMarkers;
  const thresholdRef = useRef(clusterBelowPercent);
  thresholdRef.current = clusterBelowPercent;
  const catByIdRef = useRef(categoryById);
  catByIdRef.current = categoryById;
  const catArtRef = useRef(categoryArt);
  catArtRef.current = categoryArt;
  const visibleRef = useRef(visibleMarkers);

  const makeMarker = useCallback(
    (m: Marker): L.Marker => {
      const mk = L.marker(latLngFor(m), {
        icon: iconFor(m, m.id === selectedIdRef.current),
        // Selected pin floats above its neighbours instead of being buried by them.
        zIndexOffset: m.id === selectedIdRef.current ? SELECTED_Z : 0,
        // Custom (user) markers are always draggable so the user can fine-tune where
        // they dropped them; edit mode makes every marker draggable.
        draggable: editModeRef.current || m.custom === true,
      });
      mk.bindTooltip(m.name, {
        direction: "top",
        offset: [0, -4],
        className: "er-tooltip",
      });
      mk.on("click", () => select(m.id));
      // Dropping a marker writes its new NOMINAL pixel: custom markers persist to their
      // own store record; everything else writes a draft position override.
      mk.on("dragend", () => {
        const ll = mk.getLatLng();
        const pos = { x: ll.lng / sx, y: (imageHeight - ll.lat) / sy };
        if (m.custom && !editModeRef.current) moveCustomMarker(m.id, pos);
        else setMarkerOverride(m.id, pos);
      });
      // In edit mode, right-click stages a marker removal until the user saves.
      mk.on("contextmenu", (e: L.LeafletMouseEvent) => {
        if (!editModeRef.current) return;
        e.originalEvent.preventDefault();
        toggleMarkerDeletion(m.id);
      });
      return mk;
    },
    [
      iconFor,
      latLngFor,
      select,
      setMarkerOverride,
      moveCustomMarker,
      toggleMarkerDeletion,
      sx,
      sy,
      imageHeight,
    ],
  );

  // Per-category cluster groups + an id→marker index that is the single source of
  // truth. placeRef records where each marker currently sits so reconcile only
  // moves what actually changed; groupCountRef tracks each group's live child
  // count so an emptied group can be pulled off the map.
  const groupsRef = useRef(new Map<string, L.MarkerClusterGroup>());
  const groupCountRef = useRef(new Map<string, number>());
  const markersRef = useRef(new Map<string, L.Marker>());
  const dataRef = useRef(new Map<string, Marker>());
  const placeRef = useRef(new Map<string, Place>());

  // Individual (lone) pins added while clustering are time-sliced across frames.
  // Zooming out below the cluster cutoff can turn hundreds of pins into "lone" ones
  // (no same-type neighbour to merge with) — adding them all to the map in one
  // synchronous burst blocked the main thread long enough that the map TILES
  // flickered and never finished painting (the reported "below 25% flicker"). The
  // cluster GROUPS already spread their adds over frames (markercluster's
  // chunkedLoading); this queue closes the same gap for the lone pins we draw
  // straight onto the map. addQueueRef holds pins waiting to be added; pendingAddRef
  // is their id set (so a pin culled before its turn is skipped, and an interrupted
  // pass can treat still-queued pins as unplaced).
  const addQueueRef = useRef<{ id: string; mk: L.Marker }[]>([]);
  const pendingAddRef = useRef(new Set<string>());
  const flushRafRef = useRef(0);

  // Reconcile rendered markers to (current set, zoom, viewport, selection,
  // clustering setting). Stable identity: every input is read through a ref / the
  // map, so the once-bound listeners never need rebinding.
  const reconcile = useCallback(() => {
    const groups = groupsRef.current;
    const counts = groupCountRef.current;
    const markers = markersRef.current;
    const data = dataRef.current;
    const place = placeRef.current;
    const visible = visibleRef.current;
    const selId = selectedIdRef.current;

    // Abandon any in-flight chunked add: still-queued pins never reached the map,
    // so mark them unplaced and let this pass decide afresh where each one belongs.
    if (flushRafRef.current) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = 0;
    }
    for (const id of pendingAddRef.current) place.set(id, "none");
    pendingAddRef.current.clear();
    addQueueRef.current = [];

    const clusteringActive =
      !editModeRef.current && // Edit mode shows every pin individually so it stays draggable
      clusterRef.current && map.getZoom() < zoomForPercent(thresholdRef.current);
    const bounds = clusteringActive ? null : map.getBounds().pad(VIEW_PADDING);

    // When clustering, decide WHICH markers actually have a same-type neighbour close
    // enough to merge with. A pin with no neighbour within CLUSTER_RADIUS_PX must stay
    // a standalone pin — otherwise markercluster's screen-px radius (huge in world
    // terms when zoomed out) sweeps a genuinely-isolated pin into a distant bubble and
    // it vanishes from its real spot. We bucket projected pixel coords into a grid of
    // cell = radius and check each pin's own + 8 adjacent cells (O(n)).
    const clusterable = new Set<string>();
    if (clusteringActive) {
      const z = map.getZoom();
      const bucketKey = (cat: string, cx: number, cy: number) => `${cat}|${cx}|${cy}`;
      const grid = new Map<string, { id: string; x: number; y: number }[]>();
      const pts: { id: string; cat: string; x: number; y: number; cx: number; cy: number }[] = [];
      for (const m of visible) {
        if (m.id === selId) continue; // selected pin is drawn individually anyway
        const pt = map.project(latLngFor(m), z);
        const cx = Math.floor(pt.x / CLUSTER_RADIUS_PX);
        const cy = Math.floor(pt.y / CLUSTER_RADIUS_PX);
        const rec = { id: m.id, cat: m.category, x: pt.x, y: pt.y, cx, cy };
        pts.push(rec);
        const k = bucketKey(m.category, cx, cy);
        const b = grid.get(k);
        if (b) b.push(rec);
        else grid.set(k, [rec]);
      }
      for (const p of pts) {
        let has = false;
        for (let dx = -1; dx <= 1 && !has; dx++) {
          for (let dy = -1; dy <= 1 && !has; dy++) {
            const b = grid.get(bucketKey(p.cat, p.cx + dx, p.cy + dy));
            if (!b) continue;
            for (const q of b) {
              if (q.id === p.id) continue;
              if (Math.abs(q.x - p.x) <= CLUSTER_RADIUS_PX && Math.abs(q.y - p.y) <= CLUSTER_RADIUS_PX) {
                has = true;
                break;
              }
            }
          }
        }
        if (has) clusterable.add(p.id);
      }
    }

    const getGroup = (cat: string): L.MarkerClusterGroup => {
      let g = groups.get(cat);
      if (g) return g;
      g = L.markerClusterGroup({
        iconCreateFunction: () => {
          const def = catByIdRef.current.get(cat);
          return buildClusterIcon({
            color: def?.color ?? "#a1a1aa",
            iconKey: def?.icon ?? "pin",
            iconUrl: catArtRef.current.get(cat),
            fallbackUrl: fallbackIconUrl(cat),
          });
        },
        showCoverageOnHover: false, // no convex-hull polygon flashing on hover
        chunkedLoading: true, // time-slice big adds so a "show all" toggle never blocks a frame
        maxClusterRadius: CLUSTER_RADIUS_PX,
        removeOutsideVisibleBounds: true,
      });
      groups.set(cat, g);
      counts.set(cat, 0);
      return g;
    };

    // Detach a marker from wherever it currently is (its token), pulling an
    // emptied group off the map.
    const detach = (mk: L.Marker, tok: Place | undefined, id: string) => {
      if (!tok || tok === "none") return;
      if (tok === "map") {
        // Queued but not yet added: just drop it from the queue — it never hit the map.
        if (pendingAddRef.current.delete(id)) return;
        map.removeLayer(mk);
        return;
      }
      const cat = tok.slice(2);
      const g = groups.get(cat);
      if (!g) return;
      g.removeLayer(mk);
      const n = (counts.get(cat) ?? 1) - 1;
      counts.set(cat, n);
      if (n <= 0 && map.hasLayer(g)) map.removeLayer(g);
    };

    // 1) Drop markers that left the visible set.
    const next = new Set(visible.map((m) => m.id));
    for (const [id, mk] of markers) {
      if (next.has(id)) continue;
      detach(mk, place.get(id), id);
      place.delete(id);
      markers.delete(id);
      data.delete(id);
    }

    // 2) Re-place each visible marker; batch group adds for one addLayers/group.
    const groupAdds = new Map<string, L.Marker[]>();
    for (const m of visible) {
      let mk = markers.get(m.id);
      if (!mk) {
        mk = makeMarker(m);
        markers.set(m.id, mk);
        data.set(m.id, m);
      } else if (data.get(m.id) !== m) {
        // A custom marker was edited or moved (its Marker identity changed — see the
        // map-experience cache). Refresh the live pin in place: only re-init the icon
        // when the look actually changed (iconFor caches by signature, so an unchanged
        // look returns the same instance → no DOM flash on a pure drag), always sync
        // the tooltip text, and reposition unless it's already there.
        data.set(m.id, m);
        const nextIcon = iconFor(m, m.id === selId);
        if (mk.options.icon !== nextIcon) mk.setIcon(nextIcon);
        mk.setTooltipContent(m.name);
        const ll = latLngFor(m);
        if (!mk.getLatLng().equals(ll)) mk.setLatLng(ll);
      }
      const isSel = m.id === selId;
      let target: Place;
      if (clusteringActive && !isSel) {
        // Only pins that actually overlap a same-type neighbour join the cluster group;
        // a lone pin stays drawn individually so it never disappears below the cluster
        // zoom ("group what overlaps, leave a lone pin alone").
        target = clusterable.has(m.id) ? `g:${m.category}` : "map";
      } else {
        // Individual: selected always shows; others only inside the viewport.
        const inView = isSel || bounds!.contains(latLngFor(m));
        target = inView ? "map" : "none";
      }
      const cur = place.get(m.id) ?? "none";
      if (cur === target) continue;
      detach(mk, cur, m.id);
      place.set(m.id, target);
      if (target === "map") {
        // While clustering, queue lone-pin adds so they're time-sliced (see below);
        // the selected pin and all individual-mode pins add immediately (both are
        // few and must appear at once — the selection can't wait a frame).
        if (clusteringActive && !isSel) {
          addQueueRef.current.push({ id: m.id, mk });
          pendingAddRef.current.add(m.id);
        } else {
          map.addLayer(mk);
        }
      } else if (target !== "none") {
        const batch = groupAdds.get(target);
        if (batch) batch.push(mk);
        else groupAdds.set(target, [mk]);
      }
    }

    // 3) Apply batched group adds and make sure each touched group is on the map.
    for (const [tok, mks] of groupAdds) {
      const cat = tok.slice(2);
      const g = getGroup(cat);
      g.addLayers(mks);
      counts.set(cat, (counts.get(cat) ?? 0) + mks.length);
      if (!map.hasLayer(g)) map.addLayer(g);
    }

    // 4) Drain the lone-pin add queue in per-frame batches so the map tiles keep
    // painting between them instead of stalling behind one giant synchronous add.
    if (addQueueRef.current.length) {
      const BATCH = 150;
      const flush = () => {
        flushRafRef.current = 0;
        const q = addQueueRef.current;
        const slice = q.splice(0, BATCH);
        for (const { id, mk } of slice) {
          // Skip pins detached (culled / left the set) before their turn came up.
          if (!pendingAddRef.current.delete(id)) continue;
          map.addLayer(mk);
        }
        if (q.length) flushRafRef.current = requestAnimationFrame(flush);
      };
      flushRafRef.current = requestAnimationFrame(flush);
    }
  }, [map, makeMarker, latLngFor, iconFor]);

  // Coalesce reconcile triggers to one per frame. A map switch (game/layer/Shifting
  // Earth) fires a burst of camera writes back-to-back — FitOnMount's setView,
  // RecenterOnMapSwitch's fitBounds, and TiledMap's nudgeZoom each emit a zoomend, on
  // top of the visible-set change — so a synchronous reconcile per trigger meant 3-4
  // full-set walks that each tore down and rebuilt the chunked add queue mid-flight.
  // At the whole-map zoom a switch lands on, that thrash left the map flickering and
  // never settling. Collapsing the burst into a single deferred reconcile also lets
  // the tile swap paint its frame first.
  const reconcileRafRef = useRef(0);
  const scheduleReconcile = useCallback(() => {
    if (reconcileRafRef.current) return;
    reconcileRafRef.current = requestAnimationFrame(() => {
      reconcileRafRef.current = 0;
      reconcile();
    });
  }, [reconcile]);

  // Create nothing up front; reconcile builds groups/markers lazily. Reconcile on
  // every settle (moveend/zoomend, not during the gesture) so the rendered set is
  // only trimmed once the camera stops.
  useEffect(() => {
    // A pure pan only matters when pins are drawn individually (clustering off /
    // zoomed in): then reconcile re-culls to the viewport. While clustering is
    // active the per-category cluster groups handle viewport culling themselves
    // (removeOutsideVisibleBounds), so skip the full visible-set walk on every
    // pan — that walk is what made panning a 13k-marker Nightreign pattern stutter.
    const onMoveEnd = () => {
      const clustering =
        !editModeRef.current &&
        clusterRef.current &&
        map.getZoom() < zoomForPercent(thresholdRef.current);
      if (!clustering) scheduleReconcile();
    };
    reconcile(); // initial placement (start zoom is 21% → cluster mode)
    map.on("moveend", onMoveEnd);
    map.on("zoomend", scheduleReconcile);
    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", scheduleReconcile);
      if (reconcileRafRef.current) cancelAnimationFrame(reconcileRafRef.current);
      reconcileRafRef.current = 0;
      if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = 0;
      addQueueRef.current = [];
      pendingAddRef.current.clear();
      for (const mk of markersRef.current.values()) mk.remove();
      for (const g of groupsRef.current.values()) {
        g.clearLayers();
        if (map.hasLayer(g)) map.removeLayer(g);
      }
      groupsRef.current.clear();
      groupCountRef.current.clear();
      markersRef.current.clear();
      dataRef.current.clear();
      placeRef.current.clear();
    };
  }, [map, reconcile, scheduleReconcile]);

  // Re-reconcile when the visible set (filter / search / selection) or the
  // clustering preference changes. Set the ref synchronously so the coalesced
  // reconcile (next frame) reads the latest set even if several changes batch.
  useEffect(() => {
    visibleRef.current = visibleMarkers;
    scheduleReconcile();
  }, [visibleMarkers, clusterMarkers, clusterBelowPercent, scheduleReconcile]);

  // Full rebuild on settings that are baked in at creation time: a marker's
  // `draggable` is fixed when it's made, so toggling edit mode tears everything
  // down and reconciles from scratch. Skip the first run (markers are built
  // fresh on mount).
  const rebuildFirst = useRef(true);
  useEffect(() => {
    if (rebuildFirst.current) {
      rebuildFirst.current = false;
      return;
    }
    if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
    flushRafRef.current = 0;
    addQueueRef.current = [];
    pendingAddRef.current.clear();
    for (const mk of markersRef.current.values()) map.removeLayer(mk);
    for (const g of groupsRef.current.values()) {
      g.clearLayers();
      if (map.hasLayer(g)) map.removeLayer(g);
    }
    groupsRef.current.clear();
    groupCountRef.current.clear();
    markersRef.current.clear();
    dataRef.current.clear();
    placeRef.current.clear();
    reconcile();
  }, [editMode, map, reconcile]);

  // Highlight the selection by swapping just the two affected pins (previous →
  // unselected, current → selected) instead of rebuilding the set. Placement
  // (pulling the selected pin out of its cluster) is handled by the reconcile
  // above, which re-runs because selecting changes visibleMarkers.
  //
  // The selected and unselected icons differ ONLY by the `er-pin--sel` class
  // (same art/colour/glyph), so toggle that class on the live DOM rather than
  // calling setIcon. setIcon → Leaflet `_initIcon` resets the element's innerHTML
  // (reloading the pin's <img> → a 1-frame flash) AND re-appends the node to the
  // end of the marker pane (a DOM reorder that repaints every overlapping pin —
  // the flicker seen when switching between two near-coincident markers). The
  // class toggle avoids both; options.icon is kept in sync so a later cull/re-add
  // (which does rebuild from options.icon) still renders the correct state.
  const applySelected = useCallback(
    (mk: L.Marker, m: Marker, selected: boolean) => {
      mk.options.icon = iconFor(m, selected); // keep correct for a future re-init; no DOM work
      const pin = mk.getElement()?.firstElementChild as HTMLElement | null;
      if (pin) pin.classList.toggle("er-pin--sel", selected); // live: no re-append, no img reload
      else mk.setIcon(iconFor(m, selected)); // not in the DOM → safe to fully (re)build
      mk.setZIndexOffset(selected ? SELECTED_Z : 0);
    },
    [iconFor],
  );
  // Completion / favorites: when either set changes, re-badge the affected live pins
  // without a full rebuild — toggle the wrap classes on the DOM (mirrors applySelected)
  // and keep options.icon in sync so a later cull/re-add renders the correct state.
  // The classes live on the wrap (getElement), not the inner disc, so the badges
  // aren't clipped by the disc and the found dim doesn't reach them.
  useEffect(() => {
    foundRef.current = foundMarkers;
    bookmarksRef.current = bookmarks;
    const markers = markersRef.current;
    const data = dataRef.current;
    for (const [id, mk] of markers) {
      const m = data.get(id);
      if (!m) continue;
      mk.options.icon = iconFor(m, id === selectedIdRef.current);
      const wrap = mk.getElement();
      if (wrap) {
        wrap.classList.toggle("er-pin-wrap--found", foundMarkers.has(id));
        wrap.classList.toggle("er-pin-wrap--fav", bookmarks.has(id));
      }
    }
  }, [foundMarkers, bookmarks, iconFor]);

  // When a draft override changes, snap the affected live pin to its new
  // position. A DRAG already moved its own pin (Leaflet does it during the gesture,
  // and latLngFor round-trips to the same spot → equals() short-circuits), so this
  // is really for UNDO / clear / restore: those only mutate the store, with no
  // Leaflet move of their own, so without this the pin stays stuck where it was
  // dragged. overridesRef is refreshed on render (above), so latLngFor already
  // reads the post-change positions by the time this effect runs.
  useEffect(() => {
    const markers = markersRef.current;
    const data = dataRef.current;
    for (const [id, mk] of markers) {
      const m = data.get(id);
      if (!m) continue;
      const ll = latLngFor(m);
      if (!mk.getLatLng().equals(ll)) mk.setLatLng(ll);
    }
  }, [markerOverrides, latLngFor]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const markers = markersRef.current;
    const data = dataRef.current;
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedId) {
      const m = data.get(prev);
      const mk = markers.get(prev);
      if (m && mk) applySelected(mk, m, false);
    }
    if (selectedId) {
      const m = data.get(selectedId);
      const mk = markers.get(selectedId);
      if (m && mk) applySelected(mk, m, true);
    }
    prevSelectedRef.current = selectedId;
  }, [selectedId, applySelected]);

  // While panning/zooming, the cursor can slide off a hovered pin without ever
  // firing a `mouseout`, leaving its name label stuck open (and stacking up as
  // the drag passes more pins). Close every managed tooltip when the camera moves.
  useEffect(() => {
    const closeTooltips = () => {
      for (const mk of markersRef.current.values()) mk.closeTooltip();
    };
    map.on("movestart", closeTooltips);
    map.on("zoomstart", closeTooltips);
    return () => {
      map.off("movestart", closeTooltips);
      map.off("zoomstart", closeTooltips);
    };
  }, [map]);

  useDirectionalMarkerNavigation({
    markers: visibleMarkers,
    selectedId,
    getId: (marker) => marker.id,
    getPoint: (marker) => marker.pixel,
    getViewportCenter: () => {
      const center = map.getCenter();
      return { x: center.lng / sx, y: (imageHeight - center.lat) / sy };
    },
    // Same lat flip + sx/sy scaling as getViewportCenter, so the rectangle lives
    // in marker.pixel space: north (max lat) becomes minY.
    getViewportBounds: () => {
      const bounds = map.getBounds();
      return {
        minX: bounds.getWest() / sx,
        maxX: bounds.getEast() / sx,
        minY: (imageHeight - bounds.getNorth()) / sy,
        maxY: (imageHeight - bounds.getSouth()) / sy,
      };
    },
    onSelect: select,
  });

  // Pins live on the imperatively-managed groups / map, not in the React tree.
  return null;
};

export default MarkerLayer;
