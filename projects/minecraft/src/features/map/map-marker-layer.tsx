import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { createMapPointClusters, type MapPointCluster } from "./map-clustering";
import { getCategoryConfig, getPointAppearance } from "./map-config";
import {
  getMapMarkerZoomTier,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "./map-marker-zoom";
import MapPointIcon from "./map-point-icon";
import { screenPointStyle, worldToScreen, type MapProjectionMode } from "./map-projection";
import { layoutRegionLabels, type RegionLabelObstacle } from "./map-region-label-layout";
import type { MapMetadata, MapPoint, MapView } from "./types";

interface MapMarkerLayerProps {
  data: MapMetadata;
  points: MapPoint[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  selectedId: string | null;
  /** Settings › Map: collapse nearby pins of the same type into one icon. */
  clusterMarkers: boolean;
  expandedClusterPointIds: string[];
  onSelect: (point: MapPoint) => void;
  onCluster: (cluster: MapPointCluster) => void;
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
  selectedId,
  clusterMarkers,
  expandedClusterPointIds,
  onSelect,
  onCluster,
}: MapMarkerLayerProps) => {
  const { t } = useTranslation();
  const zoomTier = getMapMarkerZoomTier(view.zoom, projection);
  const clusteringZoom = getNormalizedMarkerZoom(view.zoom, projection);
  const useClusters = shouldClusterMapMarkers(clusterMarkers, clusteringZoom);
  const expandedPointIds = useMemo(
    () => new Set(expandedClusterPointIds),
    [expandedClusterPointIds],
  );
  const projectedPoints = points.map((point) => ({
    point,
    ...worldToScreen(point, view, width, height, projection),
  }));
  const selectedProjection = projectedPoints.find(({ point }) => point.id === selectedId);
  // Cluster membership is independent from panning, so it is memoized against
  // zoom and data. Only each cluster's screen position changes while dragging.
  const clusterSourcePoints = useMemo(
    () => points.filter((point) => !expandedPointIds.has(point.id)).map((point) => ({
      point,
      ...worldToScreen(
        point,
        { centerX: 0, centerY: 0, zoom: view.zoom },
        0,
        0,
        projection,
      ),
    })),
    [expandedPointIds, points, projection, view.zoom],
  );
  const clusteredPoints = useMemo(
    () => useClusters
      ? createMapPointClusters(clusterSourcePoints, selectedId, clusteringZoom)
      : [],
    [clusterSourcePoints, clusteringZoom, selectedId, useClusters],
  );
  const clusters = clusteredPoints
    .map((cluster) => ({
      ...cluster,
      ...worldToScreen(cluster, view, width, height, projection),
    }))
    .filter((cluster) =>
      cluster.left + cluster.offsetX >= -40 &&
      cluster.left + cluster.offsetX <= width + 40 &&
      cluster.top + cluster.offsetY >= -40 &&
      cluster.top + cluster.offsetY <= height + 40,
    );
  const looseProjections = projectedPoints.filter(
    ({ point, left, top }) =>
      point.id !== selectedId &&
      (!useClusters || expandedPointIds.has(point.id)) &&
      isVisible(left, top, width, height),
  );
  const markerObstacles: RegionLabelObstacle[] = [
    ...looseProjections.map(({ left, top }) => ({ left, top, radius: 22 })),
    ...clusters.map(({ left, top, offsetX, offsetY }) => ({
      left: left + offsetX,
      top: top + offsetY,
      radius: zoomTier === "overview" ? 26 : 24,
    })),
    ...(selectedProjection && isVisible(selectedProjection.left, selectedProjection.top, width, height)
      ? [{ left: selectedProjection.left, top: selectedProjection.top, radius: 24 }]
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
  );

  const renderPoint = ({ point, left, top }: (typeof projectedPoints)[number]) => {
    const appearance = getPointAppearance(point);
    const selected = point.id === selectedId;
    return (
      <div
        key={point.id}
        className="map-marker-anchor pointer-events-none absolute"
        style={screenPointStyle(left, top)}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(point);
          }}
          className={cn(
            "map-marker pointer-events-auto cursor-pointer",
            appearance.markerClass,
            selected && "map-marker-selected",
          )}
          aria-label={point.name}
          data-name={point.name}
          data-map-marker-control
        >
          <MapPointIcon
            fallback={appearance.icon}
            source={appearance.nativeIconPath}
            size={selected ? 21 : 18}
            strokeWidth={2.4}
          />
        </button>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "map-marker-layer pointer-events-none absolute inset-0",
        `map-marker-layer-${zoomTier}`,
      )}
      data-marker-zoom-tier={zoomTier}
    >
      <svg className="map-region-label-connectors absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {regionLabels.map(({ id, left, top, labelLeft, labelTop }) => (
          <line key={id} x1={left} y1={top} x2={labelLeft} y2={labelTop} />
        ))}
      </svg>

      {looseProjections.map(renderPoint)}

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
        const category = getCategoryConfig(cluster.items[0]!.point.category);
        const clusterName = t("map.clusterCategory", {
          category: t(category.labelKey),
          count: cluster.items.length,
        });
        return (
          <div
            key={cluster.key}
            className="map-marker-anchor pointer-events-none absolute"
            style={screenPointStyle(cluster.left + cluster.offsetX, cluster.top + cluster.offsetY)}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCluster(cluster);
              }}
              className={cn(
                "map-marker-cluster pointer-events-auto cursor-pointer",
                appearance.markerClass,
              )}
              data-cluster-key={cluster.key}
              data-cluster-size={cluster.items.length}
              data-map-marker-control
              aria-label={clusterName}
              data-name={clusterName}
            >
              <MapPointIcon
                fallback={appearance.icon}
                source={appearance.nativeIconPath}
                size={zoomTier === "overview" ? 20 : 19}
                strokeWidth={2.4}
              />
            </button>
          </div>
        );
      })}
      {selectedProjection && isVisible(selectedProjection.left, selectedProjection.top, width, height) && renderPoint(selectedProjection)}
      {regionLabels.map(({ id, name, labelLeft, labelTop }) => (
        <div
          key={id}
          className="map-region-label-anchor pointer-events-none absolute text-center"
          style={screenPointStyle(labelLeft, labelTop)}
        >
          <span className="map-region-label">{name}</span>
        </div>
      ))}
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
