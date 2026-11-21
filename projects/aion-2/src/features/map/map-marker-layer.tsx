import { memo, useEffect, useMemo, useState } from "react";
import { getLocalizedMapPointDisplayName, getMapPointDisplayName } from "./map-point-display-name";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import MapCanvasMarkers from "./map-canvas-markers";
import { createMapPointClusters, type MapPointCluster } from "./map-clustering";
import { ACTIVE_EVENT_MARKER_PRIORITY, getCategoryConfig, getPointAppearance, getPointTooltipOffsetY } from "./map-config";
import {
  getMapMarkerZoomScale,
  getMapMarkerZoomTier,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "./map-marker-zoom";
import MapMarkerCluster from "./map-marker-cluster";
import MapPointMarker from "./map-point-marker";
import MapMarkerTooltip from "./map-marker-tooltip";
import MinimapNearbyLabels from "./minimap-nearby-labels";
import MapMarkerFan from "./map-marker-fan";
import { getMarkerScale, useMarkerSizes } from "./marker-size-settings";
import { createMapPointIndex } from "./map-point-index";
import { getVisibleWorldBounds, screenPointStyle, worldToScreen, type MapProjectionMode } from "./map-projection";
import type { MapMetadata, MapPoint, MapView } from "./types";
import type { ScheduledEvent } from "../events/event-schedule";
import { activeMapEventStatus } from "../events/active-map-events";

interface MapMarkerLayerProps {
  data: MapMetadata;
  minimapMode: boolean;
  points: MapPoint[];
  activeEventMarkers: ReadonlyMap<string, ScheduledEvent[]>;
  completedIds: string[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  selectedId: string | null;
  activeRegionId: string | null;
  showRegionPins: boolean;
  /** Settings › Map: collapse nearby pins of the same type into one icon. */
  clusterMarkers: boolean;
  expandedClusterPointIds: string[];
  dismissFanKey: number;
  onSelect: (point: MapPoint, options?: { preserveZoom?: boolean }) => void;
  onSelectRegion: (regionId: string) => void;
  onToggleCompleted: (point: MapPoint) => void;
  onCluster: (cluster: MapPointCluster) => void;
}

/** Markers stay mounted outside the viewport so dragging cannot reveal an
 *  empty strip before the next render. */
const CULL_MARGIN_PX = 160;
const CANVAS_MARKER_THRESHOLD = 400;
const FAN_TRIGGER_RADIUS = 14;

const isVisible = (left: number, top: number, width: number, height: number) =>
  left >= -CULL_MARGIN_PX && left <= width + CULL_MARGIN_PX
  && top >= -CULL_MARGIN_PX && top <= height + CULL_MARGIN_PX;

/** Every pin, cluster and region label, projected for the current view. */
const MapMarkerLayer = ({
  data,
  minimapMode,
  points,
  activeEventMarkers,
  completedIds,
  view,
  width,
  height,
  projection,
  selectedId,
  activeRegionId,
  showRegionPins,
  clusterMarkers,
  expandedClusterPointIds,
  dismissFanKey,
  onSelect,
  onSelectRegion,
  onToggleCompleted,
  onCluster,
}: MapMarkerLayerProps) => {
  const { t } = useTranslation();
  const markerSizes = useMarkerSizes();
  const gameText = useGameText();
  const completedIdSet = useMemo(() => new Set(completedIds), [completedIds]);
  const [fan, setFan] = useState<{ anchorId: string; memberIds: string[] } | null>(null);
  const [inspectedClusterKey, setInspectedClusterKey] = useState<string | null>(null);
  const zoomTier = getMapMarkerZoomTier(view.zoom, projection);
  const zoomScale = getMapMarkerZoomScale(view.zoom, projection) * (minimapMode ? 0.5 : 1);
  const clusteringZoom = getNormalizedMarkerZoom(view.zoom, projection);
  // Match the rounded percentage displayed by the zoom controls.
  const labelZoomPercent = Math.round(clusteringZoom * 100);
  // Keep region labels legible at 28% while scaling the whole pin at lower zooms.
  const regionLabelScale = Math.max(0.8, Math.min(1, clusteringZoom / 0.28));
  const useClusters = shouldClusterMapMarkers(clusterMarkers, clusteringZoom);
  const expandedPointIds = useMemo(
    () => new Set(expandedClusterPointIds),
    [expandedClusterPointIds],
  );
  const queryPoints = useMemo(() => createMapPointIndex(points), [points]);
  const visiblePoints = queryPoints(getVisibleWorldBounds(
    view, width + CULL_MARGIN_PX * 2, height + CULL_MARGIN_PX * 2, projection,
  ));
  // Anchors depend on zoom, not the camera centre. Rebase the layer with one
  // translation so a pan never rewrites every mounted marker's style.
  const origin = worldToScreen({ x: 0, y: 0 }, view, width, height, projection);
  const projectedPoints = useMemo(() => visiblePoints
    .filter((point) => !useClusters || point.id === selectedId || expandedPointIds.has(point.id) || activeEventMarkers.has(point.id))
    .map((point) => ({
      point,
      ...worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection),
    })), [activeEventMarkers, expandedPointIds, projection, selectedId, useClusters, view.zoom, visiblePoints]);
  const selectedProjection = projectedPoints.find(({ point }) => point.id === selectedId);
  // Cluster membership is independent from panning, so it is memoized against
  // zoom and data. Only each cluster's screen position changes while dragging.
  const clusterSourcePoints = useMemo(
    () => !useClusters ? [] : points.filter((point) => !expandedPointIds.has(point.id) && !activeEventMarkers.has(point.id)).map((point) => ({
      point,
      ...worldToScreen(
        point,
        { centerX: 0, centerY: 0, zoom: view.zoom },
        0,
        0,
        projection,
      ),
    })),
    [activeEventMarkers, expandedPointIds, points, projection, useClusters, view.zoom],
  );
  const clusteredPoints = useMemo(
    () => useClusters
      ? createMapPointClusters(clusterSourcePoints, selectedId, clusteringZoom)
      : [],
    [clusterSourcePoints, clusteringZoom, selectedId, useClusters],
  );
  const clusters = clusteredPoints
    .filter((cluster) => isVisible(
      cluster.left + cluster.offsetX + origin.left, cluster.top + cluster.offsetY + origin.top, width, height,
    ));
  const inspectedCluster = clusters.find((cluster) => cluster.key === inspectedClusterKey && cluster.items.length > 1);
  const looseProjections = projectedPoints.filter(
    ({ point, left, top }) =>
      point.id !== selectedId &&
      (!useClusters || expandedPointIds.has(point.id) || activeEventMarkers.has(point.id)) &&
      isVisible(left + origin.left, top + origin.top, width, height),
  );
  const projectedById = useMemo(
    () => new Map(projectedPoints.map((entry) => [entry.point.id, entry])),
    [projectedPoints],
  );
  const fanAnchor = fan ? projectedById.get(fan.anchorId) : undefined;
  const fanMembers = fan?.memberIds.flatMap((id) => {
    const entry = projectedById.get(id);
    return entry ? [entry] : [];
  });
  const activeFan = !useClusters && fanAnchor && fanMembers && fanMembers.length === fan?.memberIds.length
    ? { anchor: fanAnchor, members: fanMembers }
    : null;

  useEffect(() => setFan(null), [view.zoom, data.id, dismissFanKey]);
  useEffect(() => {
    const available = new Set(points.map((point) => point.id));
    setFan((current) => current && current.memberIds.every((id) => available.has(id)) ? current : null);
  }, [points]);

  const pointLabelFor = (point: MapPoint) =>
    "occurrences" in point && point.occurrences && point.occurrences > 1
      ? t("map.nearbyLocationCount", { name: getLocalizedMapPointDisplayName(point, gameText), count: point.occurrences })
      : getLocalizedMapPointDisplayName(point, gameText);
  const eventLabelFor = (events: ScheduledEvent[]) => activeMapEventStatus(events, gameText, t);
  const labelFor = (point: MapPoint) => {
    const events = activeEventMarkers.get(point.id);
    return events?.length ? `${pointLabelFor(point)} · ${eventLabelFor(events)}` : pointLabelFor(point);
  };
  const clusterLabelFor = (cluster: MapPointCluster) => {
    const category = getCategoryConfig(cluster.items[0]!.point.category);
    const label = t("map.clusterCategory", { category: t(category.labelKey), count: cluster.items.length });
    const events = [...new Map(cluster.items.flatMap(({ point }) => activeEventMarkers.get(point.id) ?? [])
      .map((event) => [event.id, event])).values()];
    return events.length ? `${label} · ${eventLabelFor(events)}` : label;
  };

  const selectOrFan = (point: MapPoint) => {
    if (fan?.anchorId === point.id) {
      setFan(null);
      return;
    }
    const anchor = projectedById.get(point.id);
    if (!anchor || useClusters) {
      setFan(null);
      onSelect(point);
      return;
    }
    const nearby = projectedPoints.filter((entry) =>
      Math.hypot(entry.left - anchor.left, entry.top - anchor.top) <= FAN_TRIGGER_RADIUS);
    if (nearby.length < 2) {
      setFan(null);
      onSelect(point);
      return;
    }
    nearby.sort((a, b) => a.point.category.localeCompare(b.point.category)
      || getMapPointDisplayName(a.point).localeCompare(getMapPointDisplayName(b.point))
      || a.point.id.localeCompare(b.point.id));
    setFan({ anchorId: point.id, memberIds: nearby.map((entry) => entry.point.id) });
  };
  // Keep names attached to their world coordinates, independent of markers
  // and viewport edges, so panning and filtering cannot displace them.
  const regionLabels = data.regions
    .filter((region) => !region.inset
      && (region.id === activeRegionId || (showRegionPins
        && labelZoomPercent > (region.labelMinZoomPercent ?? (region.importance === "major" ? 0 : 15)))))
    .map((region) => {
      const position = worldToScreen(region, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
      return {
        id: region.id,
        name: gameText(region.name),
        importance: region.importance,
        left: position.left + (region.labelOffset?.x ?? 0),
        top: position.top + (region.labelOffset?.y ?? 0),
      };
    })
    .filter(({ left, top }) => isVisible(left + origin.left, top + origin.top, width, height));

  const renderPoint = ({ point, left, top }: (typeof projectedPoints)[number]) => {
    return (
      <MapPointMarker
        key={point.id}
        point={point}
        label={labelFor(point)}
        left={left}
        top={top}
        selected={point.id === selectedId}
        activeEvent={activeEventMarkers.has(point.id)}
        found={completedIdSet.has(point.id)}
        markerScale={getMarkerScale(point, markerSizes, activeEventMarkers.has(point.id)) * zoomScale}
        hideTooltip={Boolean(activeFan)}
        onSelect={selectOrFan}
        onToggleCompleted={onToggleCompleted}
      />
    );
  };
  const useCanvasMarkers = !useClusters && points.length > CANVAS_MARKER_THRESHOLD;
  // Keep prominent boss artwork in the DOM so its normal and hover states use
  // the same image rendering path instead of switching from a scaled sprite.
  const domProjections = useCanvasMarkers
    ? looseProjections.filter(({ point }) => activeEventMarkers.has(point.id)
      || point.category === "boss" || point.category === "dungeon-boss") : [];
  const domPointIds = new Set(domProjections.map(({ point }) => point.id));
  const canvasProjections = domProjections.length
    ? looseProjections.filter(({ point }) => !domPointIds.has(point.id)) : looseProjections;
  const activeAnchors = looseProjections.filter(({ point }) => activeEventMarkers.has(point.id))
    .map(({ point, left, top }) => ({ key: point.id, left, top,
      markerScale: getMarkerScale(point, markerSizes, true),
      bossOnly: activeEventMarkers.get(point.id)!.every((event) => event.kind === "world-boss") }));
  if (selectedProjection && activeEventMarkers.has(selectedProjection.point.id)) {
    activeAnchors.push({ key: selectedProjection.point.id, left: selectedProjection.left, top: selectedProjection.top,
      markerScale: getMarkerScale(selectedProjection.point, markerSizes, true),
      bossOnly: activeEventMarkers.get(selectedProjection.point.id)!.every((event) => event.kind === "world-boss") });
  }

  return (
    <div
      className={cn(
        "map-marker-layer pointer-events-none absolute inset-0",
        minimapMode && "map-marker-layer-minimap",
        activeFan && "map-marker-fan-open",
        `map-marker-layer-${zoomTier}`,
        looseProjections.length + clusters.length > 1_500 && "map-marker-layer-dense",
      )}
      data-marker-zoom-tier={zoomTier}
      style={screenPointStyle(origin.left, origin.top, { centered: false })}
    >
      {useCanvasMarkers ? (
        <MapCanvasMarkers points={points} completedIds={completedIdSet} projections={canvasProjections} origin={origin}
          activeEventMarkers={activeEventMarkers}
          hideTooltip={Boolean(activeFan)}
          width={width} height={height} margin={CULL_MARGIN_PX} onSelect={selectOrFan}
          markerSizes={markerSizes} zoomScale={zoomScale}
          onToggleCompleted={onToggleCompleted} />
      ) : looseProjections.map(renderPoint)}
      {useCanvasMarkers && domProjections.map(renderPoint)}
      {minimapMode && !activeFan && <MinimapNearbyLabels mapId={data.id} projections={looseProjections}
        origin={origin} view={view} width={width} height={height} projection={projection}
        markerSizes={markerSizes} zoomScale={zoomScale} selectedId={selectedId} />}

      {clusters.map((cluster) => {
        if (cluster.items.length === 1) {
          const item = cluster.items[0]!;
          return renderPoint({
            point: item.point,
            left: cluster.left + cluster.offsetX,
            top: cluster.top + cluster.offsetY,
          });
        }
        const appearance = getPointAppearance(cluster.items[0]!.point);
        const clusterScale = getMarkerScale(cluster.items[0]!.point, markerSizes) * zoomScale;
        const clusterName = clusterLabelFor(cluster);
        return <MapMarkerCluster key={cluster.key} cluster={cluster} label={clusterName}
          left={cluster.left + cluster.offsetX} top={cluster.top + cluster.offsetY}
          priority={cluster.items.some(({ point }) => activeEventMarkers.has(point.id))
            ? ACTIVE_EVENT_MARKER_PRIORITY : appearance.markerPriority}
          scale={clusterScale} size={zoomTier === "overview" ? 38 : 35}
          found={cluster.items.every(({ point }) => completedIdSet.has(point.id))}
          onHover={(hovered) => setInspectedClusterKey(hovered ? cluster.key : null)}
          onSelect={() => onCluster(cluster)} />;
      })}
      {!activeFan && inspectedCluster && (
        <MapMarkerTooltip label={clusterLabelFor(inspectedCluster)}
          left={inspectedCluster.left + inspectedCluster.offsetX}
          top={inspectedCluster.top + inspectedCluster.offsetY}
          markerSize={(zoomTier === "overview" ? 38 : 35) * getMarkerScale(inspectedCluster.items[0]!.point, markerSizes) * zoomScale} />
      )}
      {selectedProjection && isVisible(selectedProjection.left + origin.left, selectedProjection.top + origin.top, width, height) && (
        <>
          {renderPoint(selectedProjection)}
          {!activeFan && <MapMarkerTooltip label={labelFor(selectedProjection.point)}
            left={selectedProjection.left} top={selectedProjection.top}
            markerSize={(getPointAppearance(selectedProjection.point).markerSize ?? 36) * getMarkerScale(selectedProjection.point, markerSizes, activeEventMarkers.has(selectedProjection.point.id)) * zoomScale}
            offsetY={getPointTooltipOffsetY(selectedProjection.point)} selected />}
        </>
      )}
      {!activeFan && activeAnchors.map(({ key, left, top, markerScale, bossOnly }) => (
        <div key={`event:${key}`} className="map-event-active-anchor pointer-events-none absolute"
          style={{ ...screenPointStyle(left, top), width: 42 * markerScale * zoomScale, height: 42 * markerScale * zoomScale }} aria-hidden="true">
          <span className="map-event-active-ring" />
          <span className="map-event-active-badge" style={{ transform: `scale(${zoomScale})`, transformOrigin: "bottom right" }}>{t(bossOnly ? "events.mapBossSpawnBadge" : "events.mapMarkerBadge")}</span>
        </div>
      ))}
      {activeFan && (
        <MapMarkerFan
          zoomScale={zoomScale}
          left={activeFan.anchor.left}
          top={activeFan.anchor.top}
          members={activeFan.members.map(({ point }) => ({ point, label: labelFor(point), activeEvent: activeEventMarkers.has(point.id) }))}
          selectedId={selectedId}
          completedIds={completedIdSet}
          onSelect={(point) => onSelect(point, { preserveZoom: true })}
          onToggleCompleted={onToggleCompleted}
          onClose={() => setFan(null)}
        />
      )}
      {regionLabels.map(({ id, name, importance, left, top }) => (
        <div
          key={id}
          className="map-region-label-anchor pointer-events-none absolute text-center"
          style={screenPointStyle(left, top)}
        >
          <button type="button" data-map-marker-control
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onClick={(event) => { event.stopPropagation(); onSelectRegion(id); }}
            aria-label={t("map.regions.focus", { name })}
            aria-current={id === activeRegionId ? "location" : undefined}
            style={{ transform: `scale(${id === activeRegionId ? 1 : regionLabelScale})` }}
            className={cn("map-region-label pointer-events-auto cursor-pointer",
              importance === "major" && "map-region-label-major",
              id === activeRegionId && "map-region-label-active")}
          >
            {name}
          </button>
        </div>
      ))}
    </div>
  );
};

/**
 * Memoised on purpose. The map re-renders for reasons that have nothing to do
 * with the world it is drawing — a cursor moving,
 * a panel opening — and this layer's work is proportional to the map, not to
 * what changed.
 */
export default memo(MapMarkerLayer);
