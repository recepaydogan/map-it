import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMapPointDisplayName, getMapPointTooltipLabel } from "./map-point-display-name";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCanvasMarkers from "./map-canvas-markers";
import MapClusterMarker from "./map-cluster-marker";
import MapQuestGroupMarker from "./map-quest-group-marker";
import { createMapPointClusters, type MapPointCluster } from "./map-clustering";
import { getCategoryConfig, getMapMarkerPriority } from "./map-config";
import {
  CANVAS_MARKER_THRESHOLD,
  getMapMarkerZoomScale,
  getMapMarkerZoomTier,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "./map-marker-zoom";
import MapPointMarker from "./map-point-marker";
import { TRACKED_QUEST_MARKER_SCALE } from "./character-quest-navigation";
import MapMarkerFan from "./map-marker-fan";
import { isQuestPoint } from "./map-faction-filter";
import { getMapPointMarkerScale, getMarkerScale, useMarkerSizes } from "./marker-size-settings";
import { createLinkedQuestGroups, createNearQuestGroups, spreadCoincidentMapPoints, type MapQuestGroup } from "./map-marker-overlap";
import { createMapPointIndex } from "./map-point-index";
import { thinGatheringPoints } from "./map-gathering-density";
import { getVisibleWorldBounds, screenPointStyle, worldToScreen, type MapProjectionMode } from "./map-projection";
import { isUserMapMarker, type MapMetadata, type MapPoint, type MapView } from "./types";

interface MapMarkerLayerProps {
  data: MapMetadata;
  points: MapPoint[];
  trackedQuestMarkerIds?: ReadonlySet<string>;
  poiLabelPoints: MapPoint[];
  completedIds: string[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  selectedPoint: MapPoint | null;
  groupQuestMarkers: boolean;
  /** Settings › Map: collapse nearby pins of the same type into one icon. */
  clusterMarkers: boolean;
  expandedClusterPointIds: string[];
  dismissFanKey: number;
  onSelect: (point: MapPoint, options?: { preserveZoom?: boolean }) => void;
  /** Returns false once the fixed inspection zoom is reached, allowing the fan. */
  onZoomToOverlap: (point: MapPoint) => boolean;
  onCluster: (cluster: MapPointCluster) => void;
  onQuestGroup: (group: MapQuestGroup) => void;
}

/** Markers are kept mounted this far outside the viewport. It has to cover how
 *  far the follow camera can glide before the next render, or a marker just
 *  off screen would be missing from the strip the glide brings into view. */
const EMPTY_TRACKED_QUEST_IDS: ReadonlySet<string> = new Set();
const CULL_MARGIN_PX = 160;
const OVERLAP_TRIGGER_RADIUS = 14;
const OVERLAP_CELL_PX = 128;
const LINKED_QUEST_EXPAND_ZOOM = 0.65;
const LINKED_QUEST_GROUP_OFFSET_PX = 32;

const isVisible = (left: number, top: number, width: number, height: number) =>
  left >= -CULL_MARGIN_PX && left <= width + CULL_MARGIN_PX
  && top >= -CULL_MARGIN_PX && top <= height + CULL_MARGIN_PX;

/** Every pin, cluster and region label, projected for the current view. */
const MapMarkerLayer = ({
  data,
  points: incomingPoints,
  trackedQuestMarkerIds = EMPTY_TRACKED_QUEST_IDS,
  poiLabelPoints,
  completedIds,
  view,
  width,
  height,
  projection,
  selectedPoint,
  groupQuestMarkers,
  clusterMarkers,
  expandedClusterPointIds,
  dismissFanKey,
  onSelect,
  onZoomToOverlap,
  onCluster,
  onQuestGroup,
}: MapMarkerLayerProps) => {
  const { t } = useTranslation();
  const markerSizes = useMarkerSizes();
  // Tracked pins bypass thinning, clustering, overlap fans and canvas rasterization.
  const filteredPoints = useMemo(() => incomingPoints.filter(point => !trackedQuestMarkerIds.has(point.id)), [incomingPoints, trackedQuestMarkerIds]);
  const trackedQuestPoints = useMemo(() => incomingPoints.filter(point => trackedQuestMarkerIds.has(point.id)), [incomingPoints, trackedQuestMarkerIds]);
  const selectedId = selectedPoint?.id ?? null;
  const completedPointIds = useMemo(() => new Set(completedIds), [completedIds]);
  const connectedFlightPoints = useMemo(() => {
    if (!selectedPoint || isUserMapMarker(selectedPoint)) return [];
    const category = getCategoryConfig(selectedPoint.category);
    if (!category.routeLinksTitleKey || category.routeLinksTitleKey !== selectedPoint.linkedMarkersTitleKey) {
      return [];
    }
    const linkedIds = new Set(selectedPoint.linkedMarkers
      ?.filter((link) => link.mapId === data.id && link.markerId !== selectedId)
      .map((link) => link.markerId));
    return data.locations.filter((point) => point.category === selectedPoint.category && linkedIds.has(point.id));
  }, [data.id, data.locations, selectedId, selectedPoint]);
  const connectedFlightPointIds = useMemo(() => new Set(connectedFlightPoints.map((point) => point.id)),
    [connectedFlightPoints]);
  // A selected flight point's destinations remain available even when normal
  // category, found, favorite or search filters hide their pins.
  const points = useMemo(() => {
    if (!connectedFlightPoints.length) return filteredPoints;
    const visibleIds = new Set(filteredPoints.map((point) => point.id));
    const missingDestinations = connectedFlightPoints.filter((point) => !visibleIds.has(point.id));
    return missingDestinations.length ? [...filteredPoints, ...missingDestinations] : filteredPoints;
  }, [connectedFlightPoints, filteredPoints]);
  const [fanState, setFan] = useState<{ anchorId: string; memberIds: string[]; zoom: number; mapId: string; dismissKey: number } | null>(null);
  const fan = fanState?.zoom === view.zoom && fanState.mapId === data.id && fanState.dismissKey === dismissFanKey
    && fanState.memberIds.every((id) => points.some((point) => point.id === id)) ? fanState : null;
  const zoomTier = getMapMarkerZoomTier(view.zoom, projection);
  const zoomScale = getMapMarkerZoomScale(view.zoom, projection);
  const clusteringZoom = getNormalizedMarkerZoom(view.zoom, projection);
  // Match the rounded percentage displayed by the zoom controls.
  const showMinorRegionLabels = Math.round(clusteringZoom * 100) > 15;
  const useClusters = shouldClusterMapMarkers(clusterMarkers, clusteringZoom);
  const expandedPointIds = useMemo(
    () => new Set(expandedClusterPointIds),
    [expandedClusterPointIds],
  );
  // Selection is drawn separately, so it must not rebuild the normal pin list.
  const displayPoints = useMemo(() => useClusters ? points
    : thinGatheringPoints(points, clusteringZoom, null),
  [clusteringZoom, points, useClusters]);
  const queryPoints = useMemo(() => createMapPointIndex(displayPoints), [displayPoints]);
  // At overview zoom, normal clustering must absorb every quest. Rendering
  // fixed quest groups there stacks many unrelated group buttons on one pixel.
  const questGroups = useMemo(() => useClusters ? [] : [
    ...(groupQuestMarkers ? createNearQuestGroups(points) : []),
    ...(clusteringZoom < LINKED_QUEST_EXPAND_ZOOM ? createLinkedQuestGroups(points) : []),
  ], [clusteringZoom, groupQuestMarkers, points, useClusters]);
  const questGroupByPointId = useMemo(() => new Map(questGroups.flatMap((group) =>
    group.members.map((point) => [point.id, group] as const))), [questGroups]);
  const linkedQuestOffsets = useMemo(() => {
    const byGiver = new Map<string, MapPoint[]>();
    const pointById = new Map(points.map((point) => [point.id, point]));
    for (const point of points) {
      const giverId = "questGiverMarkerId" in point ? point.questGiverMarkerId : undefined;
      if (!giverId) continue;
      const quests = byGiver.get(giverId) ?? [];
      quests.push(point);
      byGiver.set(giverId, quests);
    }
    const offsets = new Map<string, { x: number; y: number }>();
    for (const [giverId, quests] of byGiver) {
      quests.sort((left, right) => left.id.localeCompare(right.id));
      const giver = pointById.get(giverId);
      const giverScale = giver ? getMapPointMarkerScale(giver, markerSizes) : 1;
      const questScale = Math.max(...quests.map((quest) => getMapPointMarkerScale(quest, markerSizes)));
      const radius = Math.min(64, Math.max(32, quests.length * 4.2,
        16 * giverScale + 13.5 * questScale + 6));
      quests.forEach((quest, index) => {
        const angle = quests.length === 1 ? 0 : -Math.PI / 2 + index * 2 * Math.PI / quests.length;
        offsets.set(quest.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
    }
    return offsets;
  }, [markerSizes, points]);
  const visibleWorldBounds = useMemo(() => getVisibleWorldBounds(
    view, width + CULL_MARGIN_PX * 2, height + CULL_MARGIN_PX * 2, projection,
  ), [height, projection, view, width]);
  const visiblePoints = useMemo(() => queryPoints(visibleWorldBounds), [queryPoints, visibleWorldBounds]);
  // Anchors depend on zoom, not the camera centre. Rebase the layer with one
  // translation so a pan never rewrites every mounted marker's style.
  const origin = useMemo(() => worldToScreen({ x: 0, y: 0 }, view, width, height, projection),
    [height, projection, view, width]);
  const projectedPoints = useMemo(() => visiblePoints
    .filter((point) => !questGroupByPointId.has(point.id)
      && (!useClusters || connectedFlightPointIds.has(point.id)
      || expandedPointIds.has(point.id)))
    .map((point) => {
      const position = worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
      const group = questGroupByPointId.get(point.id);
      const offset = !useClusters && group?.key.startsWith("linked-quest-group:")
        ? { x: LINKED_QUEST_GROUP_OFFSET_PX, y: -24 }
        : !useClusters ? linkedQuestOffsets.get(point.id) : undefined;
      return { point, ...position,
        left: position.left + (offset?.x ?? 0) * zoomScale,
        top: position.top + (offset?.y ?? 0) * zoomScale };
    }), [connectedFlightPointIds, expandedPointIds, linkedQuestOffsets, projection, questGroupByPointId, useClusters, view.zoom, visiblePoints, zoomScale]);
  const projectedQuestGroups = useMemo(() => questGroups.map((group) => {
    const position = worldToScreen(group, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
    const linkedOffset = group.key.startsWith("linked-quest-group:")
      ? LINKED_QUEST_GROUP_OFFSET_PX * zoomScale : 0;
    return {
      group,
      priority: group.members.reduce((highest, point) => Math.max(highest, getMapMarkerPriority(point.category)), 0),
      ...position,
      left: position.left + linkedOffset,
    };
  }), [projection, questGroups, view.zoom, zoomScale]);
  const visualProjections = useMemo(() => zoomTier === "detail"
    ? spreadCoincidentMapPoints(projectedPoints) : projectedPoints, [projectedPoints, zoomTier]);
  const selectedProjection = selectedPoint && !trackedQuestMarkerIds.has(selectedPoint.id) && selectedPoint.category !== "point-of-interest"
    ? visualProjections.find(({ point }) => point.id === selectedId) ?? (() => {
      const position = worldToScreen(selectedPoint, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
      const group = questGroupByPointId.get(selectedPoint.id);
      const offset = !useClusters && group?.key.startsWith("linked-quest-group:")
        ? { x: LINKED_QUEST_GROUP_OFFSET_PX, y: -24 }
        : !useClusters ? linkedQuestOffsets.get(selectedPoint.id) : undefined;
      return { point: selectedPoint, left: position.left + (offset?.x ?? 0) * zoomScale,
        top: position.top + (offset?.y ?? 0) * zoomScale };
    })()
    : undefined;
  const visibleSelectedProjection = selectedProjection && isVisible(
    selectedProjection.left + origin.left, selectedProjection.top + origin.top, width, height,
  ) ? selectedProjection : null;
  const selectedMarkerSize = visibleSelectedProjection
    ? (isQuestPoint(visibleSelectedProjection.point) ? 27 : 36)
      * getMapPointMarkerScale(visibleSelectedProjection.point, markerSizes) * zoomScale
    : 0;
  // Cluster membership is independent from panning, so it is memoized against
  // zoom and data. Only each cluster's screen position changes while dragging.
  const clusterSourcePoints = useMemo(
    () => !useClusters ? [] : points.filter((point) => !questGroupByPointId.has(point.id)
      && !expandedPointIds.has(point.id)
      && !connectedFlightPointIds.has(point.id)).map((point) => ({
      point,
      ...worldToScreen(
        point,
        { centerX: 0, centerY: 0, zoom: view.zoom },
        0,
        0,
        projection,
      ),
    })),
    [connectedFlightPointIds, expandedPointIds, points, projection, questGroupByPointId, useClusters, view.zoom],
  );
  const clusteredPoints = useMemo(
    () => useClusters
      ? createMapPointClusters(clusterSourcePoints, null, clusteringZoom)
      : [],
    [clusterSourcePoints, clusteringZoom, useClusters],
  );
  const clusters = useMemo(() => clusteredPoints.filter((cluster) => isVisible(
      cluster.left + cluster.offsetX + origin.left, cluster.top + cluster.offsetY + origin.top, width, height,
    )), [clusteredPoints, height, origin.left, origin.top, width]);
  const looseProjections = useMemo(() => visualProjections.filter(
    ({ point, left, top }) =>
      !connectedFlightPointIds.has(point.id) && !questGroupByPointId.has(point.id) &&
      (!useClusters || expandedPointIds.has(point.id)) &&
      isVisible(left + origin.left, top + origin.top, width, height),
  ), [connectedFlightPointIds, expandedPointIds, height, origin.left, origin.top, questGroupByPointId,
    useClusters, visualProjections, width]);
  const connectedProjections = useMemo(() => visualProjections.filter(({ point, left, top }) =>
    connectedFlightPointIds.has(point.id)
    && isVisible(left + origin.left, top + origin.top, width, height)),
  [connectedFlightPointIds, height, origin.left, origin.top, visualProjections, width]);
  const visibleQuestGroups = useMemo(() => projectedQuestGroups.filter(({ left, top }) =>
    isVisible(left + origin.left, top + origin.top, width, height)),
  [height, origin.left, origin.top, projectedQuestGroups, width]);
  // A canvas has one stacking level. Only pins that can physically overlap a
  // lower-priority DOM marker need their own DOM layer above it.
  const useCanvas = points.length > CANVAS_MARKER_THRESHOLD && !useClusters;
  const { domLooseProjections, canvasProjections, canvasPriority } = useMemo(() => {
  const overlapTargets = useCanvas ? [
    ...visibleQuestGroups.map(({ group, left, top, priority }) => ({
      left, top, priority,
      radius: 18 * group.members.reduce((scale, point) => Math.max(scale, getMapPointMarkerScale(point, markerSizes)), 0) * zoomScale,
    })),
    ...connectedProjections.map(({ point, left, top }) => ({
      left, top, priority: getMapMarkerPriority(point.category),
      radius: 18 * getMarkerScale(point, markerSizes) * zoomScale,
    })),
  ] : [];
  const overlapCells = new Map<string, typeof overlapTargets>();
  let largestTargetRadius = 0;
  const addOverlapTarget = (target: (typeof overlapTargets)[number]) => {
    largestTargetRadius = Math.max(largestTargetRadius, target.radius);
    const key = `${Math.floor(target.left / OVERLAP_CELL_PX)}:${Math.floor(target.top / OVERLAP_CELL_PX)}`;
    const cell = overlapCells.get(key) ?? [];
    cell.push(target);
    overlapCells.set(key, cell);
  };
  for (const target of overlapTargets) addOverlapTarget(target);
  const needsDomLayer = ({ point, left, top }: (typeof looseProjections)[number]) => {
    if (!overlapTargets.length) return false;
    const priority = getMapMarkerPriority(point.category);
    const radius = (isQuestPoint(point) || point.category === "point-of-interest" ? 13.5 : 18)
      * getMarkerScale(point, markerSizes) * zoomScale;
    const cellX = Math.floor(left / OVERLAP_CELL_PX);
    const cellY = Math.floor(top / OVERLAP_CELL_PX);
    const reach = Math.ceil((radius + largestTargetRadius) / OVERLAP_CELL_PX);
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (const target of overlapCells.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          const combinedRadius = radius + target.radius;
          if (priority > target.priority && Math.abs(left - target.left) <= combinedRadius
            && Math.abs(top - target.top) <= combinedRadius) return true;
        }
      }
    }
    return false;
  };
  const promotedIds = new Set<string>();
  const sortedLooseProjections = [...looseProjections].sort((a, b) =>
    getMapMarkerPriority(a.point.category) - getMapMarkerPriority(b.point.category)
    || a.point.id.localeCompare(b.point.id));
  if (useCanvas) {
    // Grow the overlap set in priority order: a marker promoted above a quest
    // group may itself have another, higher-priority marker over it.
    for (const entry of sortedLooseProjections) {
      if (!needsDomLayer(entry)) continue;
      promotedIds.add(entry.point.id);
      const radius = (isQuestPoint(entry.point) || entry.point.category === "point-of-interest" ? 13.5 : 18)
        * getMarkerScale(entry.point, markerSizes) * zoomScale;
      const target = { left: entry.left, top: entry.top, priority: getMapMarkerPriority(entry.point.category), radius };
      overlapTargets.push(target);
      addOverlapTarget(target);
    }
  }
  const domLooseProjections = useCanvas
    ? sortedLooseProjections.filter(({ point }) => promotedIds.has(point.id)) : sortedLooseProjections;
  const canvasProjections = useCanvas
    ? sortedLooseProjections.filter(({ point }) => !promotedIds.has(point.id)) : [];
  const canvasPriority = Math.min(
    canvasProjections.reduce((highest, { point }) => Math.max(highest, getMapMarkerPriority(point.category)), 0),
    overlapTargets.reduce((lowest, target) => Math.min(lowest, target.priority), Infinity),
  );
  return { domLooseProjections, canvasProjections, canvasPriority };
  }, [connectedProjections, looseProjections, markerSizes, useCanvas, visibleQuestGroups, zoomScale]);
  const projectedById = useMemo(
    () => new Map(projectedPoints.map((entry) => [entry.point.id, entry])),
    [projectedPoints],
  );
  const fanAnchor = fan ? projectedById.get(fan.anchorId) : undefined;
  const fanMembers = fan?.memberIds.flatMap((id) => {
    const entry = projectedById.get(id);
    return entry ? [entry] : [];
  });
  const activeFan = !useClusters && fanAnchor && fanMembers?.length === fan?.memberIds.length
    ? { anchor: fanAnchor, members: fanMembers }
    : null;

  const labelFor = (point: MapPoint) =>
    "occurrences" in point && point.occurrences && point.occurrences > 1
      ? t("map.nearbyLocationCount", { name: getMapPointDisplayName(point), count: point.occurrences })
      : getMapPointDisplayName(point);

  const selectOrFan = (point: MapPoint) => {
    const questGroup = questGroupByPointId.get(point.id);
    if (questGroup) {
      setFan(null);
      onQuestGroup(questGroup);
      return;
    }
    if (fan?.anchorId === point.id) {
      setFan(null);
      return;
    }
    const anchor = projectedById.get(point.id);
    if (!anchor || useClusters) {
      setFan(null);
      onSelect(point, { preserveZoom: true });
      return;
    }
    const nearby = projectedPoints.filter((entry) =>
      Math.hypot(entry.left - anchor.left, entry.top - anchor.top) <= OVERLAP_TRIGGER_RADIUS);
    if (nearby.length < 2) {
      setFan(null);
      onSelect(point, { preserveZoom: true });
      return;
    }
    // Inspect a crowded area once at 450%, then retain the fan for pins
    // that still overlap without increasing the zoom on further clicks.
    if (onZoomToOverlap(point)) {
      setFan(null);
      return;
    }
    nearby.sort((a, b) => getMapMarkerPriority(b.point.category) - getMapMarkerPriority(a.point.category)
      || getMapPointDisplayName(a.point).localeCompare(getMapPointDisplayName(b.point))
      || a.point.id.localeCompare(b.point.id));
    setFan({ anchorId: point.id, memberIds: nearby.map((entry) => entry.point.id), zoom: view.zoom, mapId: data.id, dismissKey: dismissFanKey });
  };
  const selectOrFanRef = useRef(selectOrFan);
  useEffect(() => { selectOrFanRef.current = selectOrFan; });
  const stableSelectOrFan = useCallback((point: MapPoint) => selectOrFanRef.current(point), []);
  const onQuestGroupRef = useRef(onQuestGroup);
  useEffect(() => { onQuestGroupRef.current = onQuestGroup; }, [onQuestGroup]);
  const selectQuestGroup = useCallback((group: MapQuestGroup) => {
    setFan(null);
    onQuestGroupRef.current(group);
  }, []);
  // Keep names attached to their world coordinates, independent of markers
  // and viewport edges, so panning and filtering cannot displace them.
  const regionLabels = data.regions
    .filter((region) => !region.inset && (region.importance === "major" || showMinorRegionLabels))
    .map((region) => ({
      id: region.id,
      name: region.name,
      importance: region.importance,
      ...worldToScreen(region, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection),
    }))
    .filter(({ left, top }) => isVisible(left + origin.left, top + origin.top, width, height));
  const poiLabels = showMinorRegionLabels ? poiLabelPoints
    .map((point) => ({
      id: point.id,
      name: getMapPointDisplayName(point),
      ...worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection),
    }))
    .filter(({ left, top }) => isVisible(left + origin.left, top + origin.top, width, height)) : [];

  const renderPoint = ({ point, left, top }: (typeof projectedPoints)[number], selected: boolean) => {
    return (
      <MapPointMarker
        key={point.id}
        point={point}
        label={labelFor(point)}
        tooltipLabel={getMapPointTooltipLabel(point, labelFor(point), t)}
        left={left}
        top={top}
        selected={selected}
        showSelectedTooltip={false}
        completed={completedPointIds.has(point.id)}
        markerScale={getMapPointMarkerScale(point, markerSizes) * zoomScale}
        onSelect={stableSelectOrFan}
      />
    );
  };

  return (
    <div
      className={cn(
        "map-marker-layer pointer-events-none absolute inset-0",
        trackedQuestMarkerIds.size > 0 && "map-quest-tracking-active",
        activeFan && "map-marker-fan-open",
        `map-marker-layer-${zoomTier}`,
        looseProjections.length + clusters.length + projectedQuestGroups.length > 1_500 && "map-marker-layer-dense",
      )}
      data-marker-zoom-tier={zoomTier}
      style={screenPointStyle(origin.left, origin.top, { centered: false })}
    >
      {trackedQuestPoints.map(point => {
        const position = worldToScreen(point, { centerX: 0, centerY: 0, zoom: view.zoom }, 0, 0, projection);
        if (!isVisible(position.left + origin.left, position.top + origin.top, width, height)) return null;
        return <MapPointMarker key={`tracked:${point.id}`} point={point} label={labelFor(point)}
          tooltipLabel={getMapPointTooltipLabel(point, labelFor(point), t)} left={position.left} top={position.top}
          selected={point.id === selectedId} showSelectedTooltip={false} trackedQuest
          completed={completedPointIds.has(point.id)} markerScale={getMapPointMarkerScale(point, markerSizes) * zoomScale * TRACKED_QUEST_MARKER_SCALE}
          onSelect={point => onSelect(point, { preserveZoom: true })} />;
      })}
      {canvasProjections.length > 0 && <MapCanvasMarkers points={points} projections={canvasProjections} completedPointIds={completedPointIds} origin={origin}
        width={width} height={height} margin={CULL_MARGIN_PX} priority={canvasPriority} markerSizes={markerSizes} zoomScale={zoomScale} onSelect={stableSelectOrFan} />}
      {domLooseProjections.map((entry) => renderPoint(entry, false))}

      {visibleQuestGroups.map(({ group, left, top, priority }) => {
          const label = t("map.questGroup.markerLabel", { count: group.members.length });
          const markerScale = group.members.reduce((scale, point) => Math.max(scale, getMapPointMarkerScale(point, markerSizes)), 0) * zoomScale;
          return <MapQuestGroupMarker key={group.key} group={group} left={left} top={top} priority={priority}
            scale={markerScale} label={label} tooltipSide={left + origin.left + 266 > width ? "left" : "right"}
            onSelect={selectQuestGroup} />;
        })}

      {clusters.map((cluster) => {
        if (cluster.items.length === 1) {
          const item = cluster.items[0]!;
          return renderPoint({
            point: item.point,
            left: cluster.left + cluster.offsetX,
            top: cluster.top + cluster.offsetY,
          }, false);
        }
        const category = getCategoryConfig(cluster.items[0]!.point.category);
        const clusterScale = getMarkerScale(cluster.items[0]!.point, markerSizes) * zoomScale;
        const clusterName = t("map.clusterCategory", {
          category: t(category.labelKey),
          count: cluster.items.length,
        });
        return <MapClusterMarker key={cluster.key} cluster={cluster} scale={clusterScale}
          overview={zoomTier === "overview"} label={clusterName} onSelect={onCluster} />;
      })}
      {connectedProjections.map((entry) => renderPoint(entry, false))}
      {visibleSelectedProjection && renderPoint(visibleSelectedProjection, true)}
      {visibleSelectedProjection && <div className="map-marker-selected-tooltip-anchor pointer-events-none absolute"
        style={{ ...screenPointStyle(visibleSelectedProjection.left, visibleSelectedProjection.top),
          width: selectedMarkerSize, height: selectedMarkerSize }}
        aria-hidden="true">
        <span className="map-marker-selected-tooltip" data-map-selected-tooltip>
          {getMapPointTooltipLabel(visibleSelectedProjection.point, labelFor(visibleSelectedProjection.point), t)}
        </span>
      </div>}
      {activeFan && (
        <MapMarkerFan
          left={activeFan.anchor.left}
          top={activeFan.anchor.top}
          members={(activeFan.members ?? []).map(({ point }) => ({ point, label: labelFor(point),
            tooltipLabel: getMapPointTooltipLabel(point, labelFor(point), t) }))}
          selectedId={selectedId}
          completedPointIds={completedPointIds}
          onSelect={(point) => {
            setFan(null);
            onSelect(point, { preserveZoom: true });
          }}
          onClose={() => setFan(null)}
        />
      )}
      {regionLabels.map(({ id, name, importance, left, top }) => (
        <div
          key={id}
          className="map-region-label-anchor pointer-events-none absolute text-center"
          style={screenPointStyle(left, top)}
        >
          <span className={cn("map-region-label", importance === "major" && "map-region-label-major")}>{name}</span>
        </div>
      ))}
      {poiLabels.map(({ id, name, left, top }) => (
        <div
          key={id}
          className="map-poi-label-anchor pointer-events-none absolute text-center"
          style={screenPointStyle(left, top)}
          aria-hidden="true"
        >
          <span className="map-poi-label">{name}</span>
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
