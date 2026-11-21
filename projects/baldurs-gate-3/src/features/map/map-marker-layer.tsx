import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getClusterProximity, groupMapPoints, positionMapPointClusters, type MapPointCluster } from "./map-clustering";
import { getMapPointInstanceId } from "./map-atlas-projection";
import { getCategoryConfig } from "./map-config";
import {
  getMapMarkerZoomTier,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "./map-marker-zoom";
import MapClusterMarker from "./map-cluster-marker";
import MapPointMarker from "./map-point-marker";
import MapCanvasMarkers from "./map-canvas-markers";
import { createMapPointIndex } from "./map-point-index";
import {
  createMapMarkerFanLayout,
  MARKER_FAN_SCRIM_MARGIN,
  MARKER_FAN_TRIGGER_RADIUS,
} from "./map-marker-fan";
import { getVisibleWorldBounds, screenPointStyle, worldToScreen, type MapProjectionMode } from "./map-projection";
import { layoutRegionLabels, type RegionLabelObstacle } from "./map-region-label-layout";
import { getMapItemVisual, useMapItemVisuals } from "./use-map-item-visuals";
import type { MapMetadata, MapPoint, MapView } from "./types";

interface MapMarkerLayerProps {
  data: MapMetadata;
  points: MapPoint[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  selectedInstanceId: string | null;
  /** Settings › Map: collapse nearby pins of the same type into one icon. */
  clusterMarkers: boolean;
  /** Atlas overviews can merge categories until the user zooms into a map. */
  aggregateClusterCategories?: boolean;
  compactMarkers?: boolean;
  forceClusters?: boolean;
  clusterZoomScale?: number;
  expandedClusterPointIds: string[];
  markerFanAnchorId: string | null;
  onSelect: (point: MapPoint) => void;
  onCluster: (cluster: MapPointCluster) => void;
  onMarkerFanChange: (anchorId: string | null) => void;
}

/** Markers are kept mounted this far outside the viewport. It has to cover how
 *  far the follow camera can glide before the next render, or a marker just
 *  off screen would be missing from the strip the glide brings into view. */
const CULL_MARGIN_PX = 160;

const isVisible = (left: number, top: number, width: number, height: number) =>
  left >= -CULL_MARGIN_PX && left <= width + CULL_MARGIN_PX
  && top >= -CULL_MARGIN_PX && top <= height + CULL_MARGIN_PX;

/** Every pin, cluster and region label, projected for the current view. */
const MapMarkerLayer = ({
  data,
  points,
  view,
  width,
  height,
  projection,
  selectedInstanceId,
  clusterMarkers,
  aggregateClusterCategories = false,
  compactMarkers = false,
  forceClusters = false,
  clusterZoomScale = 1,
  expandedClusterPointIds,
  markerFanAnchorId,
  onSelect,
  onCluster,
  onMarkerFanChange,
}: MapMarkerLayerProps) => {
  const { t } = useTranslation();
  const itemVisuals = useMapItemVisuals();
  const zoomTier = getMapMarkerZoomTier(view.zoom, projection);
  const clusteringZoom = getNormalizedMarkerZoom(view.zoom, projection) * clusterZoomScale;
  const useClusters = forceClusters || shouldClusterMapMarkers(clusterMarkers, clusteringZoom);
  const expandedPointIds = useMemo(
    () => new Set(expandedClusterPointIds),
    [expandedClusterPointIds],
  );
  const individuallyDrawnPoints = useMemo(() => {
    if (!useClusters) return points;
    if (!selectedInstanceId && !expandedPointIds.size) return [];
    return points.filter((point) => {
      const id = getMapPointInstanceId(point);
      return id === selectedInstanceId || expandedPointIds.has(id);
    });
  }, [expandedPointIds, points, selectedInstanceId, useClusters]);
  const queryPoints = useMemo(() => createMapPointIndex(individuallyDrawnPoints), [individuallyDrawnPoints]);
  const visiblePoints = useMemo(() => queryPoints(getVisibleWorldBounds(
    view, width + CULL_MARGIN_PX * 2, height + CULL_MARGIN_PX * 2, projection,
  )), [height, projection, queryPoints, view, width]);
  // Only the parent translation changes during a pan. Individual anchors stay
  // in zoom-scaled world space, so mounted marker buttons can skip rendering.
  const origin = worldToScreen({ x: 0, y: 0 }, view, width, height, projection);
  const projectedPoints = useMemo(() => visiblePoints.map((point) => ({
    point,
    ...worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection),
  })), [projection, view.zoom, visiblePoints]);
  const projectedById = useMemo(() => new Map(projectedPoints.map((entry) =>
    [getMapPointInstanceId(entry.point), entry])), [projectedPoints]);
  const selectedProjection = projectedById.get(selectedInstanceId ?? "");
  const fanAnchorProjection = !useClusters && markerFanAnchorId
    ? projectedById.get(markerFanAnchorId)
    : undefined;
  const fanMembers = fanAnchorProjection
    ? projectedPoints
      .filter(({ left, top }) =>
        Math.hypot(left - fanAnchorProjection.left, top - fanAnchorProjection.top)
          <= MARKER_FAN_TRIGGER_RADIUS,
      )
      .sort(({ point: left }, { point: right }) =>
        left.category.localeCompare(right.category)
          || left.name.localeCompare(right.name)
          || left.id.localeCompare(right.id),
      )
    : [];
  const fanLayout = createMapMarkerFanLayout(fanMembers.length);
  const previousSelectedIdRef = useRef(selectedInstanceId);

  useEffect(() => {
    if (!markerFanAnchorId) return;
    if (!fanAnchorProjection || fanMembers.length < 2) onMarkerFanChange(null);
  }, [
    fanAnchorProjection,
    fanMembers.length,
    markerFanAnchorId,
    onMarkerFanChange,
  ]);

  useEffect(() => {
    const selectionChanged = previousSelectedIdRef.current !== selectedInstanceId;
    previousSelectedIdRef.current = selectedInstanceId;
    if (selectionChanged
      && markerFanAnchorId
      && selectedInstanceId
      && !fanMembers.some(({ point }) => getMapPointInstanceId(point) === selectedInstanceId)) {
      onMarkerFanChange(null);
    }
  });
  // Keep unit-scale projections and reuse membership within a zoom tier.
  // Continuous zoom only repositions the small set of resulting centroids.
  const proximity = getClusterProximity(clusteringZoom);
  const clusterSourcePoints = useMemo(
    () => !useClusters ? [] : points.filter((point) => !expandedPointIds.has(getMapPointInstanceId(point))).map((point) => ({
      point,
      ...worldToScreen(
        point,
        { centerX: 0, centerY: 0, zoom: 1 },
        0,
        0,
        projection,
      ),
    })),
    [expandedPointIds, points, projection, useClusters],
  );
  const clusterGroups = useMemo(
    () => useClusters
      ? groupMapPoints(
        clusterSourcePoints,
        selectedInstanceId,
        proximity,
        aggregateClusterCategories,
      )
      : [],
    [
      aggregateClusterCategories,
      clusterSourcePoints,
      proximity,
      selectedInstanceId,
      useClusters,
    ],
  );
  const clusteredPoints = useMemo(() => positionMapPointClusters(clusterGroups, view.zoom), [clusterGroups, view.zoom]);
  const clusters = useMemo(() => clusteredPoints.filter((cluster) =>
    isVisible(cluster.left + cluster.offsetX + origin.left, cluster.top + cluster.offsetY + origin.top, width, height),
  ), [clusteredPoints, height, origin.left, origin.top, width]);
  const looseProjections = useMemo(() => projectedPoints.filter(
    ({ point, left, top }) =>
      getMapPointInstanceId(point) !== selectedInstanceId &&
      (!useClusters || expandedPointIds.has(getMapPointInstanceId(point))) &&
      isVisible(left + origin.left, top + origin.top, width, height),
  ), [expandedPointIds, height, origin.left, origin.top, projectedPoints, selectedInstanceId, useClusters, width]);
  const useCanvas = points.length > 400 && looseProjections.length > 0;
  const markerObstacles: RegionLabelObstacle[] = [
    ...looseProjections.map(({ left, top }) => ({ left: left + origin.left, top: top + origin.top, radius: 22 })),
    ...clusters.map(({ left, top, offsetX, offsetY }) => ({
      left: left + offsetX + origin.left,
      top: top + offsetY + origin.top,
      radius: zoomTier === "overview" ? 26 : 24,
    })),
    ...(selectedProjection && isVisible(selectedProjection.left + origin.left, selectedProjection.top + origin.top, width, height)
      ? [{ left: selectedProjection.left + origin.left, top: selectedProjection.top + origin.top, radius: 24 }]
      : []),
  ];
  const regionLabels = layoutRegionLabels(
    data.regions
      .map((region) => ({
        id: region.id,
        name: region.name,
        ...worldToScreen(region, view, width, height, projection),
      }))
      .filter(({ left, top }) => isVisible(left, top, width, height)),
    markerObstacles,
    width,
    height,
  ).map((label) => ({ ...label, left: label.left - origin.left, top: label.top - origin.top,
    labelLeft: label.labelLeft - origin.left, labelTop: label.labelTop - origin.top }));

  const openPoint = (point: MapPoint) => {
    const entry = projectedById.get(getMapPointInstanceId(point)) ?? {
      point, ...worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection),
    };
    if (markerFanAnchorId === getMapPointInstanceId(entry.point)) {
      onMarkerFanChange(null);
      return;
    }
    if (!useClusters) {
      const stackSize = projectedPoints.reduce((count, candidate) =>
        count + (Math.hypot(candidate.left - entry.left, candidate.top - entry.top)
          <= MARKER_FAN_TRIGGER_RADIUS ? 1 : 0), 0);
      if (stackSize >= 2) {
        onMarkerFanChange(getMapPointInstanceId(entry.point));
        return;
      }
    }
    onMarkerFanChange(null);
    onSelect(entry.point);
  };

  const openPointRef = useRef(openPoint);
  useEffect(() => { openPointRef.current = openPoint; });
  const selectOrFan = useCallback((point: MapPoint) => openPointRef.current(point), []);
  const renderPoint = (
    { point, left, top }: (typeof projectedPoints)[number],
    options: { fanned?: boolean } = {},
  ) => <MapPointMarker key={getMapPointInstanceId(point)} point={point} left={left} top={top}
    sprite={getMapItemVisual(itemVisuals, "contentId" in point ? point.contentId : undefined)?.sprite}
    selected={getMapPointInstanceId(point) === selectedInstanceId} fanned={options.fanned}
    onSelect={options.fanned ? onSelect : selectOrFan} />;

  return (
    <div
      className={cn(
        "map-marker-layer pointer-events-none absolute inset-0",
        `map-marker-layer-${zoomTier}`,
        compactMarkers && "map-marker-layer-compact",
        fanAnchorProjection && fanMembers.length >= 2 && "map-marker-layer-fan-open",
      )}
      style={screenPointStyle(origin.left, origin.top, { centered: false })}
      data-marker-zoom-tier={zoomTier}
    >
      <svg className="map-region-label-connectors absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {regionLabels.map(({ id, left, top, labelLeft, labelTop }) => (
          <line key={id} x1={left} y1={top} x2={labelLeft} y2={labelTop} />
        ))}
      </svg>

      {useCanvas ? <MapCanvasMarkers points={points} projections={looseProjections} itemVisuals={itemVisuals}
        origin={origin} width={width} height={height} margin={CULL_MARGIN_PX} compact={compactMarkers}
        onSelect={selectOrFan} /> : looseProjections.map((projection) => renderPoint(projection))}

      {clusters.map((cluster) => {
        if (cluster.items.length === 1) {
          const item = cluster.items[0]!;
          return renderPoint({
            point: item.point,
            left: cluster.left + cluster.offsetX,
            top: cluster.top + cluster.offsetY,
          });
        }
        const leadPoint = cluster.items[0]!.point;
        const clusterSprite = getMapItemVisual(itemVisuals, "contentId" in leadPoint ? leadPoint.contentId : undefined)?.sprite;
        const category = getCategoryConfig(leadPoint.category);
        const clusterName = t("map.clusterCategory", {
          category: aggregateClusterCategories
            ? t("map.categoryGroups.locations")
            : t(category.labelKey),
          count: cluster.items.length,
        });
        return <MapClusterMarker key={cluster.key} cluster={cluster} label={clusterName}
          sprite={clusterSprite} overview={zoomTier === "overview"} compact={compactMarkers} onSelect={onCluster} />;
      })}
      {selectedProjection && isVisible(selectedProjection.left + origin.left, selectedProjection.top + origin.top, width, height) && renderPoint(selectedProjection)}
      {regionLabels.map(({ id, name, labelLeft, labelTop }) => (
        <div
          key={id}
          className="map-region-label-anchor pointer-events-none absolute text-center"
          style={screenPointStyle(labelLeft, labelTop)}
        >
          <span className="map-region-label">{name}</span>
        </div>
      ))}
      {fanAnchorProjection && fanMembers.length >= 2 && (
        <div className="map-marker-fan-overlay pointer-events-none absolute inset-0">
          <svg
            className="map-marker-fan-web pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <circle
              className="map-marker-fan-scrim pointer-events-auto"
              cx={fanAnchorProjection.left}
              cy={fanAnchorProjection.top}
              r={fanLayout.outerRadius + MARKER_FAN_SCRIM_MARGIN}
              data-map-marker-control
              onClick={(event) => {
                event.stopPropagation();
                onMarkerFanChange(null);
              }}
            />
            {fanLayout.offsets.map((offset, index) => (
              <line
              key={getMapPointInstanceId(fanMembers[index]!.point)}
                className="map-marker-fan-leg"
                x1={fanAnchorProjection.left}
                y1={fanAnchorProjection.top}
                x2={fanAnchorProjection.left + offset.x}
                y2={fanAnchorProjection.top + offset.y}
              />
            ))}
          </svg>
          {fanMembers.map((member, index) => renderPoint({
            ...member,
            left: fanAnchorProjection.left + fanLayout.offsets[index]!.x,
            top: fanAnchorProjection.top + fanLayout.offsets[index]!.y,
          }, { fanned: true }))}
        </div>
      )}
    </div>
  );
};

/**
 * Memoised on purpose. The map re-renders for reasons that have nothing to do
 * with the world it is drawing — a live-position status tick, a cursor moving,
 * a panel opening — and this layer's work is proportional to the map, not to
 * what changed.
 */
export default memo(MapMarkerLayer);
