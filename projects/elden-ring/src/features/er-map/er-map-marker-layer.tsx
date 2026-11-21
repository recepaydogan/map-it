import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { CategoryDef } from "../../data/types";
import { buildClusterIcon, buildMarkerIcon } from "../map/marker-icon";
import useDirectionalMarkerNavigation from "../map/use-directional-marker-navigation";
import { rawPositionFor } from "./raw-coordinate-system";
import { erMapMarkerArtUrl, erMapMarkerFallbackUrl } from "./er-map-marker-art";
import { erMapRewardPresentation } from "./er-map-reward-presentation";
import { MarkerFan } from "./er-map-marker-fan";
import { formatErMapMarkerName } from "./er-map-marker-name";
import type { BossRewardFilters, RawErMapMarker, ErMapLayerDefinition } from "./types";
import { useMapStore } from "../../store/map-store";
import { erItemByKey } from "../../data/er-items-data";

const SELECTED_Z_INDEX = 100000;

/**
 * Pins are 32px, so centres this close leave each disc MORE THAN HALF covered —
 * buried enough to be worth a web. It is deliberately not the full 32: pins grazing
 * each other's edges are still easy to hit one by one, and fanning those would only
 * turn a plain select into a two-step for no gain. On the ER overworld this trades
 * ~45% of pins into fan-on-click; at 26 it was 67%, at 8 it would miss the stacks
 * the user actually struggles with.
 */
const FAN_TRIGGER_RADIUS = 14;

/**
 * Both the cluster groups' cutoff and the fan's floor — they have to agree. Under
 * this zoom the map draws cluster bubbles instead of pins and a bubble click zooms
 * in, so there is nothing for a fan to do; worse, a screen-space stack out there
 * would sweep in pins that a neighbouring bubble represents and that aren't drawn
 * at all.
 */
const CLUSTERING_DISABLED_AT_ZOOM = 0;

interface ErMapMarkerLayerProps {
  layer: ErMapLayerDefinition;
  markers: RawErMapMarker[];
  categoryById: Map<string, CategoryDef>;
  categoryArt: Map<string, string>;
  activeCategories: Set<string>;
  bossRewardFilters?: BossRewardFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  favorites: Set<string>;
  foundMarkers: Set<string>;
  native?: boolean;
}

const ErMapMarkerLayer = ({
  layer,
  markers,
  categoryById,
  categoryArt,
  activeCategories,
  bossRewardFilters,
  selectedId,
  onSelect,
  favorites,
  foundMarkers,
  native = false,
}: ErMapMarkerLayerProps) => {
  const map = useMap();
  const editMode = useMapStore((s) => s.editMode);
  const overrides = useMapStore((s) => s.editMode ? s.markerOverrides : s.committedMarkerOverrides);
  const setMarkerOverride = useMapStore((s) => s.setMarkerOverride);

  const markerLayers = useRef(new Map<string, L.Marker>());
  const markerData = useRef(new Map<string, RawErMapMarker>());
  const selectedRef = useRef<string | null>(null);
  const favoritesRef = useRef(favorites);
  const foundRef = useRef(foundMarkers);
  const fanRef = useRef<MarkerFan | null>(null);
  const onSelectRef = useRef(onSelect);
  // The catalog maps get a fresh identity on every chunk arrival (they derive
  // from the view's marker pool), but a category's visuals never change within a
  // session. Reading them through refs keeps the icon builders identity-stable,
  // so a data load can never cascade into an every-pin rebuild.
  const categoryByIdRef = useRef(categoryById);
  const categoryArtRef = useRef(categoryArt);

  useEffect(() => {
    favoritesRef.current = favorites;
    foundRef.current = foundMarkers;
    onSelectRef.current = onSelect;
  }, [favorites, foundMarkers, onSelect]);

  // One fan for the life of the map. It reads onSelect through a ref so a new
  // callback identity can never tear an open web down mid-interaction.
  useEffect(() => {
    const fan = new MarkerFan(map, (id) => onSelectRef.current(id));
    fanRef.current = fan;
    return () => {
      fan.destroy();
      fanRef.current = null;
    };
  }, [map]);

  const positionFor = useCallback((marker: RawErMapMarker) => {
    const over = overrides[marker.id];
    if (over) return L.latLng(over.y, over.x);
    if (native) return L.latLng(-marker.localZ, marker.localX);
    const position = rawPositionFor(marker, layer);
    return L.latLng(layer.imageHeight - position.y, position.x);
  }, [layer, native, overrides]);

  const presentationFor = useCallback((marker: RawErMapMarker) => erMapRewardPresentation(
    marker, activeCategories, bossRewardFilters, categoryByIdRef.current, categoryArtRef.current,
    erItemByKey,
  ), [activeCategories, bossRewardFilters]);

  const labelFor = useCallback((marker: RawErMapMarker) => {
    const name = formatErMapMarkerName(marker.name, marker.placementCount);
    const { labels } = presentationFor(marker);
    return labels.length ? `${name} - ${labels.join(", ")}` : name;
  }, [presentationFor]);

  const iconFor = useCallback((marker: RawErMapMarker, selected: boolean, fanned = false) => {
    const category = categoryByIdRef.current.get(marker.category);
    const reward = presentationFor(marker);
    const outsideCanvas = native ? false : rawPositionFor(marker, layer).outsideCanvas;
    return buildMarkerIcon({
      color: reward.iconUrl ? (categoryByIdRef.current.get("boss")?.color ?? "#e05040") : (category?.color ?? "#a1a1aa"),
      iconKey: category?.icon ?? "pin",
      iconUrl: reward.iconUrl ?? erMapMarkerArtUrl(marker),
      fallbackUrl: reward.iconUrl ? undefined : erMapMarkerFallbackUrl(marker),
      selected,
      dashed: outsideCanvas,
      bookmarked: favoritesRef.current.has(marker.id),
      found: foundRef.current.has(marker.id),
      fanned,
    });
  }, [layer, native, presentationFor]);

  // Every pin whose disc overlaps the clicked one, whatever its category — this is
  // what the user sees as a single blob, so it is exactly what the web should hold.
  // Sorted so a stack always fans in the same order however it was entered.
  const stackAround = useCallback((marker: RawErMapMarker) => {
    const origin = map.latLngToLayerPoint(positionFor(marker));
    const stack: RawErMapMarker[] = [];
    for (const other of markerData.current.values()) {
      if (map.latLngToLayerPoint(positionFor(other)).distanceTo(origin) <= FAN_TRIGGER_RADIUS) {
        stack.push(other);
      }
    }
    return stack.sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }, [map, positionFor]);

  const handleClick = useCallback((marker: RawErMapMarker) => {
    const fan = fanRef.current;
    // Edit mode drags pins to author overrides; a fan would hand back the fanned
    // position as the marker's new home, so it stays out of the way there. Below the
    // clustering cutoff the bubbles own the crowding story (click = zoom in).
    // Math.round matches how markercluster reads the map's (0.25-snapped) zoom.
    if (!fan || editMode || Math.round(map.getZoom()) < CLUSTERING_DISABLED_AT_ZOOM) {
      onSelect(marker.id);
      return;
    }
    if (fan.anchor === marker.id) {
      fan.close();
      return;
    }
    const stack = stackAround(marker);
    if (stack.length < 2) {
      fan.close();
      onSelect(marker.id);
      return;
    }
    fan.open(
      marker.id,
      positionFor(marker),
      stack.map((member) => ({
        id: member.id,
        icon: iconFor(member, member.id === selectedRef.current, true),
        label: labelFor(member),
      })),
    );
  }, [editMode, iconFor, labelFor, map, onSelect, positionFor, stackAround]);

  // Latest builders for pins created after the initial build (diff additions,
  // cluster icons). positionFor/handleClick change identity with overrides and
  // catalog churn, and the build effect below deliberately does not re-run then.
  const buildRef = useRef({ positionFor, iconFor, handleClick, labelFor, presentationFor });
  const markersRef = useRef(markers);
  const syncRef = useRef<((next: RawErMapMarker[]) => void) | null>(null);
  const refreshClustersRef = useRef<(() => void) | null>(null);

  // Refreshed every render, and declared ABOVE the build/diff effects on purpose:
  // effects fire in declaration order, so same-commit reads below always see this
  // render's values (a chunk arrival changes catalog + markers in one commit).
  useEffect(() => {
    categoryByIdRef.current = categoryById;
    categoryArtRef.current = categoryArt;
    buildRef.current = { positionFor, iconFor, handleClick, labelFor, presentationFor };
    markersRef.current = markers;
  });

  // Build/teardown runs only on STRUCTURAL changes: the map instance, the view's
  // layer/projection, edit mode. Marker-set changes flow through the diff effect
  // below instead. The old shape tore down and recreated every pin whenever the
  // array's identity changed — and `visibleMarkers` mints a fresh array for every
  // selection that force-keeps a filtered-out pin (any boss with dungeon
  // entrances), so marker→marker navigation burned a ~2000-pin rebuild in the
  // very commit that starts the camera flight. Leaflet paces flights by wall
  // clock, so that synchronous burst ate the opening frames — and a full-pool
  // load landing mid-flight swallowed the whole glide into a teleport.
  useEffect(() => {
    const groups = new Map<string, L.MarkerClusterGroup>();
    const liveMarkers = new Map<string, L.Marker>();
    const liveData = new Map<string, RawErMapMarker>();
    const dataByPin = new WeakMap<L.Marker, RawErMapMarker>();
    refreshClustersRef.current = () => {
      for (const group of groups.values()) group.refreshClusters();
    };
    markerLayers.current = liveMarkers;
    markerData.current = liveData;

    const groupFor = (categoryKey: string) => {
      let group = groups.get(categoryKey);
      if (group) return group;
      group = L.markerClusterGroup({
        chunkedLoading: true,
        disableClusteringAtZoom: CLUSTERING_DISABLED_AT_ZOOM,
        maxClusterRadius: 48,
        removeOutsideVisibleBounds: true,
        showCoverageOnHover: false,
        // No split/merge animation. markercluster picks its animated path at group
        // CONSTRUCTION (`_withAnimation`), and that path calls `_forceLayout` — a
        // read of `document.body.offsetWidth` that forces a full-document reflow —
        // several times per zoom. Crossing the clustering cutoff with a dense view
        // materialises ~2000 pins at once, so those reflows measured ~44% of a
        // ~370ms freeze. The animation being skipped is the same 200ms the freeze
        // was eating, so there is nothing to miss.
        animate: false,
        // Cluster click ZOOMS IN, exactly like the Map tab — it never spreads pins to
        // the sides. Pins that stay stacked once zooming stops helping are handled by
        // the colocated fan instead (er-map-marker-fan.ts). markercluster's own
        // spiderfy could never do that job: these groups are per-category, so a boss
        // and an item sharing one spot live in different groups and would never fan
        // together — and merging the groups would cost the zoomed-out map its
        // per-category bubbles.
        spiderfyOnMaxZoom: false,
        zoomToBoundsOnClick: true,
        // Groups now outlive catalog identity churn, so cluster icons read the
        // CURRENT catalog at draw time instead of capturing one build's copy.
        iconCreateFunction: (cluster) => {
          const category = categoryByIdRef.current.get(categoryKey);
          const rewardIcons = cluster.getAllChildMarkers().map((pin) => {
            const marker = dataByPin.get(pin);
            return marker ? buildRef.current.presentationFor(marker).iconUrl : undefined;
          });
          const rewardIcon = rewardIcons[0] && rewardIcons.every((icon) => icon === rewardIcons[0])
            ? rewardIcons[0] : undefined;
          return buildClusterIcon({
            color: rewardIcon ? (categoryByIdRef.current.get("boss")?.color ?? "#e5342a") : (category?.color ?? "#a1a1aa"),
            iconKey: category?.icon ?? "pin",
            iconUrl: rewardIcon ?? categoryArtRef.current.get(categoryKey),
            fallbackUrl: rewardIcon ?? categoryArtRef.current.get(categoryKey),
          });
        },
      });
      groups.set(categoryKey, group);
      return group;
    };

    const createMarker = (marker: RawErMapMarker) => {
      const build = buildRef.current;
      const markerName = build.labelFor(marker);
      // No `title` option: it lands in the DOM as the HTML title attribute and the
      // browser pops its own native tooltip on top of the bound Leaflet one.
      const leafletMarker = L.marker(build.positionFor(marker), {
        icon: build.iconFor(marker, marker.id === selectedRef.current),
        zIndexOffset: marker.id === selectedRef.current ? SELECTED_Z_INDEX : 0,
        alt: markerName,
        draggable: editMode,
      });
      dataByPin.set(leafletMarker, marker);
      leafletMarker.bindTooltip(markerName, {
        direction: "top",
        offset: [0, -4],
        className: "er-tooltip",
      });
      // Resolve the data object at click time: a kept pin's object can be swapped
      // in place (re-localization, a pool handing over its copy) without a rebuild.
      leafletMarker.on("click", () =>
        buildRef.current.handleClick(liveData.get(marker.id) ?? marker));
      if (editMode) {
        leafletMarker.on("dragend", (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          setMarkerOverride(marker.id, { x: newPos.lng, y: newPos.lat });
        });
      }
      return leafletMarker;
    };

    const sync = (next: RawErMapMarker[]) => {
      const nextById = new Map(next.map((marker) => [marker.id, marker] as const));
      for (const [id, existing] of liveMarkers) {
        if (nextById.has(id)) continue;
        const data = liveData.get(id);
        if (data) groups.get(data.category)?.removeLayer(existing);
        liveMarkers.delete(id);
        liveData.delete(id);
      }
      const additions = new Map<string, L.Marker[]>();
      const add = (marker: RawErMapMarker) => {
        const created = createMarker(marker);
        liveMarkers.set(marker.id, created);
        liveData.set(marker.id, marker);
        const list = additions.get(marker.category) ?? [];
        list.push(created);
        additions.set(marker.category, list);
      };
      for (const marker of next) {
        const existing = liveMarkers.get(marker.id);
        const previous = liveData.get(marker.id);
        if (!existing || !previous) {
          add(marker);
          continue;
        }
        if (previous === marker) continue;
        // Same pin, fresh object (language swap, a pool handing over its copy):
        // refresh in place. Art is id-keyed and category visuals are fixed, so
        // only the position and the display name can actually differ.
        liveData.set(marker.id, marker);
        dataByPin.set(existing, marker);
        if (previous.category !== marker.category) {
          groups.get(previous.category)?.removeLayer(existing);
          liveMarkers.delete(marker.id);
          add(marker);
          continue;
        }
        const position = buildRef.current.positionFor(marker);
        if (!existing.getLatLng().equals(position)) existing.setLatLng(position);
        if (previous.name !== marker.name || previous.placementCount !== marker.placementCount) {
          existing.setTooltipContent(buildRef.current.labelFor(marker));
        }
      }
      for (const [category, list] of additions) {
        const group = groupFor(category);
        group.addLayers(list);
        if (!map.hasLayer(group)) map.addLayer(group);
      }
    };

    syncRef.current = sync;
    sync(markersRef.current);

    return () => {
      syncRef.current = null;
      refreshClustersRef.current = null;
      // The web's clones point at pins that are about to be destroyed.
      fanRef.current?.close();
      for (const group of groups.values()) {
        group.clearLayers();
        if (map.hasLayer(group)) map.removeLayer(group);
      }
      liveMarkers.clear();
      liveData.clear();
    };
  }, [editMode, map, setMarkerOverride]);

  // Marker-set changes diff against the live pins: a selection that force-keeps
  // one extra pin costs one addLayer, not a rebuild of the whole field.
  useEffect(() => {
    syncRef.current?.(markers);
  }, [markers]);

  // Committed override edits move existing pins in place. Cluster membership is
  // only recomputed on the next structural rebuild — override editing happens at
  // leaf zoom where clustering is off, so that staleness is invisible.
  const overridesRef = useRef(overrides);
  useEffect(() => {
    if (overridesRef.current === overrides) return;
    const previous = overridesRef.current;
    overridesRef.current = overrides;
    const touched = new Set([...Object.keys(previous), ...Object.keys(overrides)]);
    for (const id of touched) {
      if (previous[id] === overrides[id]) continue;
      const pin = markerLayers.current.get(id);
      const data = markerData.current.get(id);
      if (pin && data) pin.setLatLng(buildRef.current.positionFor(data));
    }
  }, [overrides]);

  // A web is a lens on one stack; moving the selection to a pin beyond it — a WASD
  // hop, a search jump, a connection click-through — makes that pin the new focus,
  // not a member, so the web is dismissed. Selecting another foot keeps it open.
  useEffect(() => {
    const fan = fanRef.current;
    if (fan?.anchor && selectedId && !fan.hasMember(selectedId)) fan.close();
  }, [selectedId]);

  useEffect(() => {
    const previous = selectedRef.current;
    if (previous && previous !== selectedId) {
      const marker = markerLayers.current.get(previous);
      const data = markerData.current.get(previous);
      if (marker && data) {
        marker.setIcon(iconFor(data, false));
        marker.setZIndexOffset(0);
        fanRef.current?.refreshIcon(previous, iconFor(data, false, true));
      }
    }
    if (selectedId) {
      const marker = markerLayers.current.get(selectedId);
      const data = markerData.current.get(selectedId);
      if (marker && data) {
        marker.setIcon(iconFor(data, true));
        marker.setZIndexOffset(SELECTED_Z_INDEX);
        fanRef.current?.refreshIcon(selectedId, iconFor(data, true, true));
      }
    }
    selectedRef.current = selectedId;
  }, [iconFor, selectedId]);

  useEffect(() => {
    for (const [id, marker] of markerLayers.current) {
      const data = markerData.current.get(id);
      if (!data) continue;
      const label = labelFor(data);
      marker.setIcon(iconFor(data, id === selectedRef.current));
      marker.setTooltipContent(label);
      marker.getElement()?.setAttribute("aria-label", label);
      fanRef.current?.refreshIcon(id, iconFor(data, id === selectedRef.current, true), label);
    }
    refreshClustersRef.current?.();
  }, [favorites, foundMarkers, iconFor, labelFor]);

  useDirectionalMarkerNavigation({
    markers,
    selectedId,
    getId: (marker) => marker.id,
    getPoint: (marker) => {
      const position = positionFor(marker);
      return { x: position.lng, y: -position.lat };
    },
    getViewportCenter: () => {
      const center = map.getCenter();
      return { x: center.lng, y: -center.lat };
    },
    // Same y = -lat flip as getPoint: north (max lat) becomes minY.
    getViewportBounds: () => {
      const bounds = map.getBounds();
      return {
        minX: bounds.getWest(),
        maxX: bounds.getEast(),
        minY: -bounds.getNorth(),
        maxY: -bounds.getSouth(),
      };
    },
    onSelect,
  });

  return null;
};

export default ErMapMarkerLayer;
