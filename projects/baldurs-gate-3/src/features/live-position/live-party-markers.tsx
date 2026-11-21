import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "../../lib/cn";
import { worldToMapCoordinate } from "../map/map-coordinate-reference";
import { worldToScreen, type MapProjectionMode } from "../map/map-projection";
import type { MapCoordinateReference, MapView } from "../map/types";
import {
  getLatestLivePartyMotionPositions,
  subscribeLivePartyMotion,
} from "./live-party-motion";
import { useLivePartyPosition } from "./live-party-position-store";
import type { LiveMotionPosition } from "./live-motion";

interface LivePartyMarkersProps {
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  coordinateReference?: MapCoordinateReference;
}

const CULL_MARGIN_PX = 40;

const LivePartyMarkers = ({
  view,
  width,
  height,
  projection,
  coordinateReference,
}: LivePartyMarkersProps) => {
  const party = useLivePartyPosition();
  const markerRefs = useRef(new Map<string, HTMLDivElement>());
  const viewRef = useRef(view);
  const sizeRef = useRef({ width, height });
  const projectionRef = useRef(projection);
  const coordinateReferenceRef = useRef(coordinateReference);

  const memberIds = useMemo(() => Object.keys(party.snapshot?.players ?? {})
    .filter((id) => id !== party.snapshot?.primaryPlayerId)
    .sort(), [party.snapshot?.players, party.snapshot?.primaryPlayerId]);
  const memberRosterKey = memberIds.join("\u0000");

  const place = useCallback((id: string, position: LiveMotionPosition) => {
    const marker = markerRefs.current.get(id);
    if (!marker) return;
    const mapPosition = coordinateReferenceRef.current
      ? worldToMapCoordinate(position, coordinateReferenceRef.current)
      : position;
    const { width: mapWidth, height: mapHeight } = sizeRef.current;
    const { left, top } = worldToScreen(
      mapPosition,
      viewRef.current,
      mapWidth,
      mapHeight,
      projectionRef.current,
    );
    const visible = left >= -CULL_MARGIN_PX
      && left <= mapWidth + CULL_MARGIN_PX
      && top >= -CULL_MARGIN_PX
      && top <= mapHeight + CULL_MARGIN_PX;
    marker.style.visibility = visible ? "visible" : "hidden";
    marker.style.transform = `translate3d(${left}px, ${top}px, 0) translate(-50%, -50%)`;
  }, []);

  const placeAll = useCallback((positions: Readonly<Record<string, LiveMotionPosition>>) => {
    for (const [id, position] of Object.entries(positions)) place(id, position);
  }, [place]);

  useLayoutEffect(() => {
    viewRef.current = view;
    sizeRef.current = { width, height };
    projectionRef.current = projection;
    coordinateReferenceRef.current = coordinateReference;
    placeAll(getLatestLivePartyMotionPositions());
  }, [coordinateReference, height, placeAll, projection, view, width]);

  useEffect(() => {
    placeAll(getLatestLivePartyMotionPositions());
    return subscribeLivePartyMotion(placeAll);
  }, [memberRosterKey, placeAll]);

  if (party.status === "disconnected") return null;

  return memberIds.map((id, index) => (
    <div
      key={id}
      ref={(element) => {
        if (element) markerRefs.current.set(id, element);
        else markerRefs.current.delete(id);
      }}
      className={cn(
        "map-live-party-member absolute",
        `map-live-party-member-${index % 4}`,
        party.status === "stale" && "map-live-party-member-stale",
      )}
      style={{ visibility: "hidden" }}
      aria-hidden="true"
    >
      <span className="map-live-party-member-dot">{index + 2}</span>
    </div>
  ));
};

export default LivePartyMarkers;
